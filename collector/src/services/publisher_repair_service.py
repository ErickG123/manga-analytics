"""Repair missing publisher links from WordPress catalog pages in bulk."""

from __future__ import annotations

import logging
import math
import time
import uuid
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from collector.src.clients.bbm_client import (
    BBMClient,
    SourceAccessBlocked,
    SourceRateLimited,
    SourceRetryDeferred,
)
from collector.src.parsers.bbm_parser import parse_bbm_publisher
from collector.src.repositories.collector_repository import CollectorRepository

logger = logging.getLogger("manga_atlas_collector")
UNKNOWN_PUBLISHER = "Não informada"


class PublisherRepairService:
    """Update only publisher assignments using content included in paginated listing."""

    def __init__(
        self,
        client: BBMClient | None = None,
        repository: CollectorRepository | None = None,
    ):
        self.client = client or BBMClient()
        self.repository = repository or CollectorRepository()

    def run(self, *, limit: int = 2000, dry_run: bool = False) -> dict[str, Any]:
        if limit < 1 or limit > 5000:
            raise ValueError("limit deve estar entre 1 e 5000")

        started = time.perf_counter()
        now = datetime.now(UTC)
        run_id = str(uuid.uuid4())
        result: dict[str, Any] = {
            "run_id": run_id,
            "dry_run": dry_run,
            "catalog_items": 0,
            "matched_existing": 0,
            "updated": 0,
            "would_update": 0,
            "already_assigned": 0,
            "unknown_publisher": 0,
            "already_assigned_or_missing": 0,
            "failed": 0,
            "termination_status": None,
            "publishers_detected_count": 0,
            "top_publishers": {},
            "errors": [],
        }

        config = getattr(self.client, "config", None)
        previous_repair_window = self.repository.get_last_publisher_repair_window()
        source_state = self.repository.get_source_state("bbm")
        if source_state and source_state.get("status") == "suspended":
            until = source_state.get("suspended_until")
            if until and until <= datetime.now(UTC):
                self.repository.clear_expired_suspension("bbm")
                source_state = self.repository.get_source_state("bbm")
        if source_state and source_state.get("status") in {"suspended", "blocked"}:
            result["failed"] = 1
            result["termination_status"] = source_state["status"]
            result["errors"].append(
                f"Origem BBM {source_state['status']}: "
                f"{source_state.get('reason') or 'consulte source-status'}"
            )
            return self._finish(result, started, run_id, dry_run, job_started=False)

        job_started = False
        if not dry_run:
            self.repository.create_import_job(
                job_id=run_id,
                run_type="publisher_repair",
                started_at=now,
            )
            job_started = True

        publishers: Counter[str] = Counter()
        pages = math.ceil(limit / 100)
        try:
            entries = self.client.iter_catalog_metadata(
                limit=limit,
                per_page=100,
                max_pages=pages,
                orderby="id",
                order="asc",
                include_content=True,
                respect_run_limits=False,
            )
            for entry in entries:
                result["catalog_items"] += 1
                external_id = str(entry.get("id") or "")
                content = entry.get("content", {})
                html = content.get("rendered", "") if isinstance(content, dict) else ""
                publisher = parse_bbm_publisher(html)
                if not external_id or publisher.casefold() in {
                    UNKNOWN_PUBLISHER.casefold(),
                    "nao informada",
                }:
                    result["unknown_publisher"] += 1
                    continue

                publishers[publisher] += 1
                if dry_run:
                    needs_repair = self.repository.has_unassigned_publisher(
                        external_id, previous_repair_window
                    )
                    if needs_repair:
                        result["matched_existing"] += 1
                        result["would_update"] += 1
                    else:
                        result["already_assigned_or_missing"] += 1
                    continue

                try:
                    updated = self.repository.repair_publisher(
                        external_id, publisher, previous_repair_window
                    )
                except Exception as exc:
                    result["failed"] += 1
                    message = (
                        f"{entry.get('title', {}).get('rendered', external_id)}: {exc}"
                    )
                    result["errors"].append(message)
                    logger.exception(
                        "Falha ao corrigir editora da ficha %s", external_id
                    )
                    continue

                if updated:
                    result["matched_existing"] += 1
                    result["updated"] += 1
                else:
                    result["already_assigned_or_missing"] += 1

            metrics = self.client.metrics_snapshot()
            result["http_metrics"] = metrics
            result["publishers_detected_count"] = len(publishers)
            result["top_publishers"] = dict(publishers.most_common(20))
            discovery_errors = getattr(self.client, "discovery_errors", [])
            blocking_error = getattr(self.client, "last_blocking_error", None)
            if discovery_errors:
                result["failed"] += len(discovery_errors)
                result["errors"].extend(discovery_errors)
            if isinstance(
                blocking_error,
                (SourceRateLimited, SourceRetryDeferred, SourceAccessBlocked),
            ):
                result["termination_status"] = (
                    "rate_limited"
                    if isinstance(blocking_error, SourceRateLimited)
                    else "blocked"
                    if isinstance(blocking_error, SourceAccessBlocked)
                    else "failed"
                )
                delay = getattr(blocking_error, "retry_after_seconds", None)
                status = (
                    "suspended"
                    if result["termination_status"] == "rate_limited"
                    else "blocked"
                )
                self.repository.suspend_source(
                    status=status,
                    reason=str(blocking_error),
                    http_status=blocking_error.status_code,
                    seconds=delay or getattr(config, "rate_limit_fallback_seconds", 900)
                    if status == "suspended"
                    else None,
                )
            total = int(metrics.get("catalog_total_items", 0))
            if total and result["catalog_items"] < total and result["failed"] == 0:
                result["termination_status"] = "limit_reached"
                result["errors"].append(
                    f"Limite {limit} atingido antes do total informado pela origem ({total})."
                )
        except Exception as exc:
            result["failed"] += 1
            result["termination_status"] = "failed"
            result["errors"].append(str(exc))
            logger.exception("Falha durante a correção em lote das editoras")

        return self._finish(result, started, run_id, dry_run, job_started)

    def _finish(
        self,
        result: dict[str, Any],
        started: float,
        run_id: str,
        dry_run: bool,
        job_started: bool,
    ) -> dict[str, Any]:
        result["duration_ms"] = round((time.perf_counter() - started) * 1000, 1)
        result.setdefault("http_metrics", self.client.metrics_snapshot())
        if job_started:
            status = result.get("termination_status") or (
                "completed_with_errors" if result["failed"] else "completed"
            )
            self.repository.finish_import_job(
                job_id=run_id,
                status=status,
                reason="; ".join(result["errors"])[:2000] or None,
                metrics=result["http_metrics"],
                processed=result["catalog_items"],
                created=0,
                updated=result["updated"],
                failed=result["failed"],
            )
        return result

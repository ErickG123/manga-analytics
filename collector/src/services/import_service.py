"""Orquestra a descoberta, sincronização incremental e persistência de obras BBM."""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx
import psycopg

from collector.src.clients.bbm_client import (
    BBMClient,
    CircuitBreakerOpenException,
    SourceAccessBlocked,
    SourceRateLimited,
    SourceRetryDeferred,
)
from collector.src.models.entities import (
    ImportResult,
    MangaCollected,
    PersistenceResult,
    VolumeCollected,
    VolumeVariantCollected,
)
from collector.src.normalizers.quality_validator import (
    validate_price,
    validate_release_date,
)
from collector.src.parsers.bbm_parser import parse_bbm_page
from collector.src.repositories.collector_repository import CollectorRepository

logger = logging.getLogger("manga_atlas_collector")


class ImportService:
    def __init__(
        self,
        client: BBMClient | None = None,
        repository: CollectorRepository | None = None,
    ):
        self.client = client or BBMClient()
        self.repository = repository or CollectorRepository()
        self.active_run_id: str | None = None

    def run_import(
        self,
        limit: int | None = 10,
        dry_run: bool = False,
        force_refresh: bool = False,
        force_reparse: bool = False,
        run_type: str = "import",
        start_page: int = 1,
        orderby: str = "modified",
        order: str = "desc",
        max_pages: int | None = None,
        start_offset: int = 0,
        item_checkpoint: Callable[[int, str], None] | None = None,
        retry_failed: bool = False,
        modified_after: datetime | None = None,
        modified_before: datetime | None = None,
        resumed: bool = False,
    ) -> ImportResult:
        result = ImportResult(run_id=str(uuid.uuid4()), started_at=datetime.now(UTC))
        self.active_run_id = result.run_id
        run_started = time.perf_counter()
        if hasattr(self.client, "reset_metrics"):
            self.client.reset_metrics()
        config = getattr(self.client, "config", None)
        if config:
            result.config = {
                "base_url_host": urlparse(getattr(config, "base_url", "")).hostname
                or "",
                "min_request_interval_seconds": config.min_request_interval_seconds,
                "max_concurrency": config.max_concurrency,
                "connect_timeout_seconds": config.connect_timeout_seconds,
                "read_timeout_seconds": config.read_timeout_seconds,
                "http_max_attempts": config.max_retries,
                "max_pages_per_run": config.max_pages_per_run,
                "max_items_per_run": config.max_items_per_run,
                "max_run_duration_seconds": config.max_run_duration_seconds,
                "dry_run": dry_run,
                "force_refresh": force_refresh,
                "force_reparse": force_reparse,
                "run_type": run_type,
            }
            if not config.enabled:
                result.failed = 1
                result.errors.append("Collector desabilitado por COLLECTOR_ENABLED.")
                result.finished_at = datetime.now(UTC)
                result.duration_ms = (time.perf_counter() - run_started) * 1000
                logger.error(result.errors[0])
                return result
        logger.info(
            "Iniciando execução %s (id=%s, limit=%s, dry_run=%s, force_refresh=%s)",
            run_type,
            result.run_id,
            limit,
            dry_run,
            force_refresh,
        )

        job_started = False
        source_check = getattr(self.repository, "get_source_state", None)
        if source_check:
            state = source_check("bbm")
            if state and state["status"] == "suspended":
                if state.get("suspended_until") and state[
                    "suspended_until"
                ] <= datetime.now(UTC):
                    self.repository.clear_expired_suspension("bbm")
                    state = source_check("bbm")
                if state and state["status"] == "suspended":
                    result.failed = 1
                    result.termination_status = "rate_limited"
                    until = state.get("suspended_until")
                    message = f"Origem BBM suspensa até {until.isoformat() if until else 'revisão manual'}: {state.get('reason') or 'suspensão operacional'}"
                    result.errors.append(message)
                    logger.error(message)
                    result.finished_at = datetime.now(UTC)
                    result.duration_ms = (time.perf_counter() - run_started) * 1000
                    return result
            if state and state["status"] == "blocked":
                message = f"Origem BBM bloqueada para revisão manual: {state.get('reason') or 'HTTP 403'}"
                result.failed = 1
                result.termination_status = "blocked"
                result.errors.append(message)
                logger.error(message)
                result.finished_at = datetime.now(UTC)
                result.duration_ms = (time.perf_counter() - run_started) * 1000
                return result
            create_job = getattr(self.repository, "create_import_job", None)
            if create_job and not dry_run:
                create_job(
                    job_id=result.run_id,
                    run_type=run_type,
                    started_at=result.started_at,
                    resumed=resumed
                    or (
                        run_type == "backfill" and (start_page > 1 or start_offset > 0)
                    ),
                )
                job_started = True

        discovery_started = time.perf_counter()
        if retry_failed:
            list_retryable = getattr(self.repository, "list_retryable_failures", None)
            metadata = list_retryable(limit or 10) if list_retryable else []
            if limit is not None:
                metadata = metadata[:limit]
        elif run_type == "sync":
            metadata = list(
                self.client.iter_catalog_metadata(
                    limit=limit,
                    start_page=start_page,
                    start_offset=start_offset,
                    per_page=100,
                    max_pages=1,
                    orderby="id",
                    order="asc",
                    modified_after=modified_after,
                    modified_before=modified_before,
                )
            )
        elif (
            start_page == 1
            and orderby == "modified"
            and order == "desc"
            and max_pages is None
        ):
            metadata = list(self.client.iter_catalog_metadata(limit=limit))
        else:
            metadata = list(
                self.client.iter_catalog_metadata(
                    limit=limit,
                    start_page=start_page,
                    start_offset=start_offset,
                    per_page=limit,
                    orderby=orderby,
                    order=order,
                    max_pages=max_pages,
                )
            )
        result.timings_ms["discovery_duration_ms"] = (
            time.perf_counter() - discovery_started
        ) * 1000
        result.discovered = len(metadata)
        result.selected = len(metadata)
        discovery_errors = getattr(self.client, "discovery_errors", [])
        if discovery_errors:
            result.failed += len(discovery_errors)
            result.errors.extend(
                f"Falha na descoberta: {message}" for message in discovery_errors
            )
        blocking_error = getattr(self.client, "last_blocking_error", None)
        if isinstance(blocking_error, (SourceRateLimited, SourceRetryDeferred)):
            fallback = getattr(config, "rate_limit_fallback_seconds", 900)
            delay = blocking_error.retry_after_seconds
            manual_review = (
                isinstance(blocking_error, SourceRateLimited)
                and delay is not None
                and delay > 30 * 24 * 60 * 60
            )
            if isinstance(blocking_error, SourceRateLimited) and (
                delay is None or delay <= 0
            ):
                delay = fallback
            persist_state = getattr(self.repository, "suspend_source", None)
            if persist_state:
                persist_state(
                    status="blocked" if manual_review else "suspended",
                    reason=f"HTTP {blocking_error.status_code}; Retry-After={blocking_error.retry_after_seconds}",
                    http_status=blocking_error.status_code,
                    seconds=None if manual_review else delay,
                )
                if not manual_review:
                    metrics = getattr(self.client, "metrics", None)
                    if metrics is not None:
                        metrics["suspension_seconds"] = (
                            metrics.get("suspension_seconds", 0) + delay
                        )
                logger.warning(
                    "HTTP %s: suspensão %s persistida; checkpoint preservado",
                    blocking_error.status_code,
                    "manual" if manual_review else f"até {delay}s",
                )
            result.termination_status = (
                "blocked"
                if manual_review
                else "rate_limited"
                if isinstance(blocking_error, SourceRateLimited)
                else "failed"
            )
        elif isinstance(blocking_error, SourceAccessBlocked):
            persist_state = getattr(self.repository, "suspend_source", None)
            if persist_state:
                persist_state(
                    status="blocked", reason=str(blocking_error), http_status=403
                )
            result.termination_status = "blocked"
        external_ids = [str(item["id"]) for item in metadata if item.get("id")]
        comparison_started = time.perf_counter()
        get_states = getattr(self.repository, "get_sync_states", None)
        states = get_states(external_ids) if get_states else {}
        result.timings_ms["comparison_duration_ms"] = (
            time.perf_counter() - comparison_started
        ) * 1000

        for metadata_offset, meta in enumerate(metadata, start=start_offset):
            if (
                config
                and time.perf_counter() - run_started >= config.max_run_duration_seconds
            ):
                result.skipped += (
                    len(metadata) - result.processed - result.unchanged - result.skipped
                )
                logger.warning(
                    "Limite máximo da execução atingido; itens restantes foram ignorados."
                )
                break
            page_id = meta.get("id")
            raw_title = meta.get("title", {}).get("rendered", "")
            if not page_id:
                result.skipped += 1
                logger.warning(
                    "Ficha ignorada: listagem sem id ou título (id=%s)", page_id
                )
                if item_checkpoint:
                    item_checkpoint(metadata_offset + 1, str(page_id or ""))
                continue

            prior = states.get(str(page_id))
            modified = meta.get("modified")
            if (
                not force_refresh
                and modified
                and prior
                and prior.get("sync_status") == "complete"
                and prior.get("source_modified_at") == modified
                and not prior.get("needs_edition_reconciliation", False)
            ):
                result.unchanged += 1
                logger.info(
                    "[INALTERADO] %s (id=%s, modified=%s; detalhe não consultado)",
                    raw_title,
                    page_id,
                    modified,
                )
                if item_checkpoint:
                    item_checkpoint(metadata_offset + 1, str(page_id))
                continue

            result.processed += 1
            page_started = time.perf_counter()
            request_metrics_before = getattr(self.client, "metrics_snapshot", dict)()
            fetch_started = time.perf_counter()
            try:
                page_data = self.client.fetch_page(page_id)
                raw_title = (
                    page_data.get("title", {}).get("rendered")
                    or raw_title
                    or str(page_id)
                )
                fetch_total_ms = (time.perf_counter() - fetch_started) * 1000
                result.timings_ms["fetch_total_duration_ms"] = (
                    result.timings_ms.get("fetch_total_duration_ms", 0) + fetch_total_ms
                )
                request_metrics_after = getattr(self.client, "metrics_snapshot", dict)()
                html_content = page_data.get("content", {}).get("rendered", "")
                content_hash = hashlib.sha256(html_content.encode("utf-8")).hexdigest()

                if (
                    not force_reparse
                    and force_refresh
                    and prior
                    and prior.get("sync_status") == "complete"
                    and prior.get("source_modified_at") == modified
                    and prior.get("content_hash") == content_hash
                    and not prior.get("needs_edition_reconciliation", False)
                ):
                    result.unchanged += 1
                    logger.info(
                        "[INALTERADO] %s (hash de conteúdo igual após revalidação)",
                        raw_title,
                    )
                    if item_checkpoint:
                        item_checkpoint(metadata_offset + 1, str(page_id))
                    continue

                parse_started = time.perf_counter()
                parsed = parse_bbm_page(html_content, raw_title)
                parse_ms = (time.perf_counter() - parse_started) * 1000
                result.timings_ms["parse_duration_ms"] = (
                    result.timings_ms.get("parse_duration_ms", 0) + parse_ms
                )
                if not parsed.get("volume_parse_complete", False):
                    conflicts = parsed.get("conflicting_volume_numbers", [])
                    reason = (
                        f"números de volume com linhas conflitantes: {conflicts}"
                        if conflicts
                        else "tabela de volumes ausente ou incompleta"
                    )
                    message = (
                        f"Ficha {page_id} ({raw_title}) não persistida: {reason}; "
                        f"volume_table_found={parsed.get('volume_table_found', False)}, "
                        f"volume_rows_skipped={parsed.get('volume_rows_skipped', 0)}, "
                        f"conflicting_volume_numbers={conflicts}"
                    )
                    result.failed += 1
                    result.errors.append(message)
                    logger.error(message)
                    record_failure = getattr(
                        self.repository, "record_collector_failure", None
                    )
                    failure_recorded = False
                    if record_failure and not dry_run:
                        record_failure(
                            external_id=str(page_id),
                            external_url=meta.get("link"),
                            category="data_quality",
                            status="failed_retryable",
                            message=message,
                            last_http_status=None,
                            job_id=result.run_id,
                        )
                        failure_recorded = True
                    if item_checkpoint and (dry_run or failure_recorded):
                        item_checkpoint(metadata_offset + 1, str(page_id))
                    elif item_checkpoint and not dry_run:
                        result.termination_status = "failed"
                        logger.error(
                            "Falha não foi persistida; checkpoint preservado para replay."
                        )
                        break
                    continue
                manga = MangaCollected(
                    title=parsed["title"],
                    original_title=parsed.get("original_title"),
                    author=parsed.get("author"),
                    publisher=parsed["publisher"],
                    cover_url=parsed.get("cover_url"),
                    external_id=str(page_id),
                    external_url=meta.get("link"),
                    source_modified_at=modified,
                    source_content_hash=content_hash,
                    sync_complete=parsed.get("volume_parse_complete", False),
                    volumes=[
                        VolumeCollected(
                            number=volume["number"],
                            title=volume["title"],
                            release_date=volume["release_date"],
                            release_date_precision=volume["release_date_precision"],
                            release_year=volume.get("release_year"),
                            release_month=volume.get("release_month"),
                            release_day=volume.get("release_day"),
                            release_status=volume["release_status"],
                            price_amount=volume["price_amount"],
                            cover_url=volume["cover_url"],
                            variants=[
                                VolumeVariantCollected(
                                    name=variant["name"],
                                    release_date=variant["release_date"],
                                    release_date_precision=variant[
                                        "release_date_precision"
                                    ],
                                    release_year=variant.get("release_year"),
                                    release_month=variant.get("release_month"),
                                    release_day=variant.get("release_day"),
                                    release_status=variant["release_status"],
                                    price_amount=variant["price_amount"],
                                    cover_url=variant["cover_url"],
                                )
                                for variant in volume.get("variants", [])
                            ],
                        )
                        for volume in parsed.get("volumes", [])
                    ],
                )
                validation_started = time.perf_counter()
                for volume in manga.volumes:
                    records = [
                        ("volume", volume),
                        *[(variant.name, variant) for variant in volume.variants],
                    ]
                    for record_name, record in records:
                        if record.release_date:
                            validation = validate_release_date(record.release_date)
                            if not validation["valid"]:
                                logger.warning(
                                    "Data ignorada para %s volume %s (%s): %s",
                                    manga.title,
                                    volume.number,
                                    record_name,
                                    validation["reason"],
                                )
                                record.release_date = None
                                record.release_date_precision = "unknown"
                                record.release_year = record.release_month = (
                                    record.release_day
                                ) = None
                                record.release_status = "unknown"
                        if record.price_amount is not None:
                            valid_price, reason = validate_price(record.price_amount)
                            if not valid_price:
                                logger.warning(
                                    "Preço ignorado para %s volume %s (%s): %s",
                                    manga.title,
                                    volume.number,
                                    record_name,
                                    reason,
                                )
                                record.price_amount = None
                validation_ms = (time.perf_counter() - validation_started) * 1000
                result.timings_ms["validation_duration_ms"] = (
                    result.timings_ms.get("validation_duration_ms", 0) + validation_ms
                )
                priced_count = sum(
                    volume.price_amount is not None for volume in manga.volumes
                )
                result.volumes_found += len(manga.volumes)
                result.volumes_with_price += priced_count
                result.variants_found += sum(
                    len(volume.variants) for volume in manga.volumes
                )
                result.variants_with_price += sum(
                    variant.price_amount is not None
                    for volume in manga.volumes
                    for variant in volume.variants
                )
                result.works_with_cover += int(bool(manga.cover_url))
                result.works_without_cover += int(not manga.cover_url)

                if dry_run:
                    if prior:
                        result.would_update += 1
                    else:
                        result.would_create += 1
                    logger.info(
                        "[DRY-RUN] %s: %s volumes, %s com preço%s",
                        manga.title,
                        len(manga.volumes),
                        priced_count,
                        "; persistência não executada",
                    )
                    if item_checkpoint:
                        item_checkpoint(metadata_offset + 1, str(page_id))
                else:
                    database_started = time.perf_counter()
                    outcome = self.repository.save_manga(manga)
                    result.timings_ms["db_duration_ms"] = (
                        result.timings_ms.get("db_duration_ms", 0)
                        + (time.perf_counter() - database_started) * 1000
                    )
                    if isinstance(outcome, PersistenceResult):
                        status = outcome.status
                        result.volumes_created += outcome.volumes_created
                        result.volumes_updated += outcome.volumes_updated
                        result.volumes_unchanged += outcome.volumes_unchanged
                        result.variants_created += outcome.variants_created
                        result.variants_updated += outcome.variants_updated
                        result.variants_unchanged += outcome.variants_unchanged
                    elif isinstance(outcome, tuple) and isinstance(outcome[0], str):
                        status = outcome[0]
                    elif isinstance(outcome, tuple):
                        status = "created" if outcome[0] else "updated"
                    else:
                        status = "updated" if prior else "created"
                    setattr(result, status, getattr(result, status) + 1)
                    if retry_failed:
                        resolve_failure = getattr(
                            self.repository, "resolve_collector_failure", None
                        )
                        if resolve_failure:
                            resolve_failure(str(page_id))
                    logger.info(
                        "[%s] %s: %s volumes, %s com preço",
                        status.upper(),
                        manga.title,
                        len(manga.volumes),
                        sum(
                            volume.price_amount is not None for volume in manga.volumes
                        ),
                    )
                    if item_checkpoint:
                        item_checkpoint(metadata_offset + 1, str(page_id))

                request_ms = float(
                    request_metrics_after.get("http_duration_ms", 0)
                ) - float(request_metrics_before.get("http_duration_ms", 0))
                logger.info(
                    "Duração da ficha %s: fetch_total_duration_ms=%.1f, http_duration_ms=%.1f, parse_duration_ms=%.1f, validation_duration_ms=%.1f, total_ms=%.1f",
                    page_id,
                    fetch_total_ms,
                    request_ms,
                    parse_ms,
                    validation_ms,
                    (time.perf_counter() - page_started) * 1000,
                )
            except (SourceRateLimited, SourceAccessBlocked, SourceRetryDeferred) as exc:
                blocking_error = exc
                result.termination_status = (
                    "rate_limited"
                    if isinstance(exc, SourceRateLimited)
                    else "blocked"
                    if isinstance(exc, SourceAccessBlocked)
                    else "failed"
                )
                if isinstance(exc, SourceRateLimited):
                    delay = exc.retry_after_seconds
                    fallback = getattr(config, "rate_limit_fallback_seconds", 900)
                    manual_review = delay is not None and delay > 30 * 24 * 60 * 60
                    if delay is None or delay <= 0:
                        delay = fallback
                    getattr(self.repository, "suspend_source", lambda **_kwargs: None)(
                        status="blocked" if manual_review else "suspended",
                        reason=f"HTTP 429; Retry-After={exc.retry_after_seconds}"
                        + (
                            " excede 30 dias; revisão manual exigida"
                            if manual_review
                            else ""
                        ),
                        http_status=429,
                        seconds=None if manual_review else delay,
                    )
                    if not manual_review:
                        metrics = getattr(self.client, "metrics", None)
                        if metrics is not None:
                            metrics["suspension_seconds"] = (
                                metrics.get("suspension_seconds", 0) + delay
                            )
                    logger.warning(
                        "HTTP 429: suspensão %s persistida; checkpoint preservado",
                        "manual" if manual_review else f"até {delay}s",
                    )
                    if manual_review:
                        result.termination_status = "blocked"
                else:
                    if isinstance(exc, SourceRetryDeferred):
                        getattr(
                            self.repository, "suspend_source", lambda **_kwargs: None
                        )(
                            status="suspended",
                            reason=str(exc),
                            http_status=503,
                            seconds=exc.retry_after_seconds,
                        )
                        metrics = getattr(self.client, "metrics", None)
                        if metrics is not None:
                            metrics["suspension_seconds"] = (
                                metrics.get("suspension_seconds", 0)
                                + exc.retry_after_seconds
                            )
                        result.retryable_failures += 1
                        result.failed += 1
                        result.errors.append(str(exc))
                        logger.warning(
                            "HTTP 503 adiado; suspensão persistida e checkpoint preservado."
                        )
                        break
                    getattr(self.repository, "suspend_source", lambda **_kwargs: None)(
                        status="blocked", reason=str(exc), http_status=403
                    )
                result.failed += 1
                result.errors.append(str(exc))
                logger.error("Origem interrompida; checkpoint preservado: %s", exc)
                break
            except Exception as exc:  # noqa: BLE001 - persist individual failures before checkpointing
                message = f"Falha na página {page_id} ({raw_title}): {exc}"
                logger.error(message)
                result.failed += 1
                result.errors.append(message)
                response = getattr(exc, "response", None)
                is_database_error = isinstance(exc, psycopg.Error)
                is_transport_error = isinstance(
                    exc, (httpx.TimeoutException, httpx.ConnectError)
                )
                is_transient_http = response is not None and response.status_code in (
                    500,
                    502,
                    503,
                    504,
                )
                is_permanent_http = response is not None and response.status_code in (
                    400,
                    404,
                )
                category = (
                    "failed_retryable"
                    if is_transport_error
                    or is_transient_http
                    or isinstance(exc, psycopg.OperationalError)
                    else "failed_permanent"
                    if is_permanent_http
                    else "needs_review"
                )
                record_failure = getattr(
                    self.repository, "record_collector_failure", None
                )
                if record_failure and not dry_run and not is_database_error:
                    record_failure(
                        external_id=str(page_id or "unknown"),
                        external_url=meta.get("link"),
                        category=category,
                        status=category,
                        message=message,
                        last_http_status=getattr(response, "status_code", None),
                        job_id=result.run_id,
                    )
                transient = category == "failed_retryable"
                if transient:
                    result.retryable_failures += 1
                if is_database_error:
                    result.termination_status = "failed"
                    logger.error(
                        "Falha no PostgreSQL; checkpoint não avançado para permitir replay seguro."
                    )
                    break
                if item_checkpoint and not transient:
                    item_checkpoint(metadata_offset + 1, str(page_id or ""))
                if isinstance(exc, CircuitBreakerOpenException):
                    logger.error("Circuit breaker aberto; execução interrompida.")
                    break

        result.http_metrics = getattr(self.client, "metrics_snapshot", dict)()
        result.finished_at = datetime.now(UTC)
        result.duration_ms = (time.perf_counter() - run_started) * 1000
        if job_started:
            status = result.termination_status or (
                "failed"
                if result.retryable_failures
                else "completed_with_errors"
                if result.failed
                else "completed"
            )
            self.repository.finish_import_job(
                job_id=result.run_id,
                status=status,
                reason=(
                    result.errors[-1]
                    if status in ("rate_limited", "blocked", "completed_with_errors")
                    and result.errors
                    else None
                ),
                metrics={
                    "http": result.http_metrics,
                    "timings_ms": result.timings_ms,
                    "selected": result.selected,
                },
                processed=result.processed,
                created=result.created,
                updated=result.updated,
                failed=result.failed,
                page=start_page,
                offset=start_offset,
            )
        logger.info(
            "Resumo execução id=%s type=%s discovered=%s selected=%s processed=%s created=%s updated=%s unchanged=%s skipped=%s failed=%s volumes=%s priced_volumes=%s variants=%s priced_variants=%s http_requests=%s http_duration_ms=%.1f rate_limit_wait_ms=%.1f fetch_total_duration_ms=%.1f parse_duration_ms=%.1f validation_duration_ms=%.1f db_duration_ms=%.1f run_total_duration_ms=%.1f",
            result.run_id,
            run_type,
            result.discovered,
            result.selected,
            result.processed,
            result.created,
            result.updated,
            result.unchanged,
            result.skipped,
            result.failed,
            result.volumes_found,
            result.volumes_with_price,
            result.variants_found,
            result.variants_with_price,
            result.http_metrics.get("http_request_count", 0),
            result.http_metrics.get("http_duration_ms", 0),
            result.http_metrics.get("rate_limit_wait_ms", 0),
            result.timings_ms.get("fetch_total_duration_ms", 0),
            result.timings_ms.get("parse_duration_ms", 0),
            result.timings_ms.get("validation_duration_ms", 0),
            result.timings_ms.get("db_duration_ms", 0),
            result.duration_ms,
        )
        return result

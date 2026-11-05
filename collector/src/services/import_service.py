"""Orquestra a descoberta, sincronização incremental e persistência de obras BBM."""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from urllib.parse import urlparse

from collector.src.clients.bbm_client import BBMClient, CircuitBreakerOpenException
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

    def run_import(
        self,
        limit: int | None = 10,
        dry_run: bool = False,
        force_refresh: bool = False,
        run_type: str = "import",
        start_page: int = 1,
        orderby: str = "modified",
        order: str = "desc",
        max_pages: int | None = None,
        start_offset: int = 0,
        item_checkpoint: Callable[[int, str], None] | None = None,
    ) -> ImportResult:
        result = ImportResult(run_id=str(uuid.uuid4()), started_at=datetime.now(UTC))
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
                "max_retries": config.max_retries,
                "max_pages_per_run": config.max_pages_per_run,
                "max_items_per_run": config.max_items_per_run,
                "max_run_duration_seconds": config.max_run_duration_seconds,
                "dry_run": dry_run,
                "force_refresh": force_refresh,
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

        discovery_started = time.perf_counter()
        if (
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
            if not page_id or not raw_title:
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
                fetch_total_ms = (time.perf_counter() - fetch_started) * 1000
                result.timings_ms["fetch_total_duration_ms"] = (
                    result.timings_ms.get("fetch_total_duration_ms", 0) + fetch_total_ms
                )
                request_metrics_after = getattr(self.client, "metrics_snapshot", dict)()
                html_content = page_data.get("content", {}).get("rendered", "")
                content_hash = hashlib.sha256(html_content.encode("utf-8")).hexdigest()

                if (
                    force_refresh
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
                    message = f"Ficha {page_id} ({raw_title}) não persistida: {reason}"
                    result.failed += 1
                    result.errors.append(message)
                    logger.error(message)
                    if item_checkpoint:
                        item_checkpoint(metadata_offset + 1, str(page_id))
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
            except Exception as exc:  # noqa: BLE001 - isolate one malformed source record and continue safely
                message = f"Falha na página {page_id} ({raw_title}): {exc}"
                logger.error(message)
                result.failed += 1
                result.errors.append(message)
                response = getattr(exc, "response", None)
                blocked = isinstance(exc, CircuitBreakerOpenException) or (
                    response is not None and response.status_code in (403, 429)
                )
                if item_checkpoint and not blocked:
                    item_checkpoint(metadata_offset + 1, str(page_id or ""))
                response = getattr(exc, "response", None)
                if isinstance(exc, CircuitBreakerOpenException) or (
                    response is not None and response.status_code in (403, 429)
                ):
                    logger.error(
                        "Execução interrompida após bloqueio HTTP/circuit breaker."
                    )
                    break

        result.http_metrics = getattr(self.client, "metrics_snapshot", dict)()
        result.finished_at = datetime.now(UTC)
        result.duration_ms = (time.perf_counter() - run_started) * 1000
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

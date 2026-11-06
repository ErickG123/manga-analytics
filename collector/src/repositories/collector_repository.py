"""PostgreSQL persistence with per-work locking and idempotent updates."""

from __future__ import annotations

import os
import re
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg

from collector.src.models.entities import (
    MangaCollected,
    PersistenceResult,
    PublicationCollected,
    VolumeVariantCollected,
)


def slugify(text: str) -> str:
    value = text.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_-]+", "-", value)
    return value.strip("-")


class CollectorRepository:
    def __init__(self, db_url: str | None = None):
        configured_url = db_url or os.getenv(
            "DATABASE_URL",
            "postgresql://manga_atlas:manga_atlas_secret@localhost:5432/manga_atlas",
        )
        self.db_url = self._normalize_database_url(
            configured_url, windows_ipv4=sys.platform == "win32"
        )

    @staticmethod
    def _normalize_database_url(
        database_url: str, *, windows_ipv4: bool = False
    ) -> str:
        """Adapt TypeORM URLs to psycopg and Docker's IPv4-only Windows binding."""
        parsed = urlsplit(database_url)
        if parsed.scheme not in ("postgres", "postgresql"):
            return database_url
        normalized = parsed
        if windows_ipv4 and parsed.hostname and parsed.hostname.lower() == "localhost":
            user_info, separator, host_port = parsed.netloc.rpartition("@")
            if host_port.lower().startswith("localhost"):
                host_port = "127.0.0.1" + host_port[len("localhost") :]
                normalized = normalized._replace(
                    netloc=f"{user_info}{separator}{host_port}"
                )
        if parsed.query:
            query = urlencode(
                [
                    (key, value)
                    for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                    if key.lower() != "schema"
                ]
            )
            normalized = normalized._replace(query=query)
        return urlunsplit(normalized)

    def get_source_state(self, source_id: str = "bbm") -> dict[str, Any] | None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                'SELECT status, "suspendedUntil", "suspensionReason", "lastHttpStatus" FROM collector_source_states WHERE "sourceId" = %s',
                (source_id,),
            )
            row = cursor.fetchone()
            if row is None:
                return None
            return {
                "status": row[0],
                "suspended_until": row[1],
                "reason": row[2],
                "last_http_status": row[3],
            }

    def clear_expired_suspension(self, source_id: str = "bbm") -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """UPDATE collector_source_states SET status = 'active', "suspensionReason" = NULL,
                   "suspendedUntil" = NULL, "updatedAt" = NOW()
                   WHERE "sourceId" = %s AND status = 'suspended' AND "suspendedUntil" <= NOW()""",
                (source_id,),
            )

    def suspend_source(
        self,
        *,
        status: str,
        reason: str,
        http_status: int,
        seconds: int | None = None,
        source_id: str = "bbm",
    ) -> None:
        suspended_until = (
            datetime.now(UTC) + timedelta(seconds=seconds)
            if seconds is not None
            else None
        )
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO collector_source_states ("sourceId", status, "suspendedUntil", "suspensionReason", "lastHttpStatus", "lastFailureAt", "updatedAt")
                   VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                   ON CONFLICT ("sourceId") DO UPDATE SET status = EXCLUDED.status,
                   "suspendedUntil" = EXCLUDED."suspendedUntil", "suspensionReason" = EXCLUDED."suspensionReason",
                   "lastHttpStatus" = EXCLUDED."lastHttpStatus", "lastFailureAt" = NOW(), "updatedAt" = NOW()""",
                (source_id, status, suspended_until, reason[:1000], http_status),
            )

    def acknowledge_source_block(self, reason: str, source_id: str = "bbm") -> bool:
        if not reason.strip():
            raise ValueError("Informe o motivo da revisão para desbloquear a fonte.")
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                '''UPDATE collector_source_states SET status = 'active', "suspendedUntil" = NULL,
                   "suspensionReason" = %s, "updatedAt" = NOW()
                   WHERE "sourceId" = %s AND status = 'blocked'
                     AND "lastHttpStatus" IN (403, 429) RETURNING "sourceId"''',
                (f"Bloqueio revisado: {reason.strip()[:700]}", source_id),
            )
            return cursor.fetchone() is not None

    def create_import_job(
        self,
        *,
        job_id: str,
        run_type: str,
        started_at: datetime,
        resumed: bool = False,
    ) -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """UPDATE import_jobs SET status = 'interrupted', "finishedAt" = NOW(),
                   "terminationReason" = 'Recovered stale Collector job'
                   WHERE "sourceId" = 'bbm' AND status = 'running' AND "startedAt" < NOW() - INTERVAL '45 minutes' """
            )
            cursor.execute(
                'SELECT COALESCE(MAX("resumeCount"), 0) FROM import_jobs WHERE "sourceId" = %s AND "runType" = %s',
                ("bbm", run_type),
            )
            prior_resumes = int(cursor.fetchone()[0])
            resume_count = prior_resumes + 1 if resumed else 0
            try:
                cursor.execute(
                    """INSERT INTO import_jobs (id, "sourceId", status, "runType", "startedAt", "resumeCount", "createdAt")
                       VALUES (%s, 'bbm', 'running', %s, %s, %s, NOW())""",
                    (job_id, run_type, started_at, resume_count),
                )
            except psycopg.errors.UniqueViolation as exc:
                raise RuntimeError(
                    "Já existe um job Collector ativo para a fonte BBM."
                ) from exc

    def finish_import_job(
        self,
        *,
        job_id: str,
        status: str,
        reason: str | None,
        metrics: dict[str, Any],
        processed: int,
        created: int,
        updated: int,
        failed: int,
        page: int | None = None,
        offset: int | None = None,
    ) -> None:
        import json

        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """UPDATE import_jobs SET status = %s, "finishedAt" = NOW(), "terminationReason" = %s,
                   "recordsProcessed" = %s, "recordsCreated" = %s, "recordsUpdated" = %s,
                   "recordsFailed" = %s, metrics = %s::jsonb, "checkpointPage" = %s, "checkpointOffset" = %s,
                   "errorMessage" = %s WHERE id = %s""",
                (
                    status,
                    reason,
                    processed,
                    created,
                    updated,
                    failed,
                    json.dumps(metrics, default=str),
                    page,
                    offset,
                    reason,
                    job_id,
                ),
            )

    def record_collector_failure(
        self,
        *,
        external_id: str,
        external_url: str | None,
        category: str,
        status: str,
        message: str,
        last_http_status: int | None,
        job_id: str | None,
    ) -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO collector_failures ("sourceId", "externalId", "externalUrl", category, status, message, "lastHttpStatus", attempts, "jobId")
                   VALUES ('bbm', %s, %s, %s, %s, %s, %s, 1, %s)
                   ON CONFLICT ("sourceId", "externalId", category) DO UPDATE SET
                     status = EXCLUDED.status, message = EXCLUDED.message, "lastHttpStatus" = EXCLUDED."lastHttpStatus",
                     attempts = collector_failures.attempts + 1, "jobId" = EXCLUDED."jobId", "updatedAt" = NOW(), "resolvedAt" = NULL""",
                (
                    external_id,
                    external_url,
                    category,
                    status,
                    message[:2000],
                    last_http_status,
                    job_id,
                ),
            )

    def list_open_failures(self, limit: int = 20) -> list[dict[str, Any]]:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """SELECT "externalId", "externalUrl", category, status, message, attempts
                   FROM collector_failures WHERE "sourceId" = 'bbm' AND status <> 'resolved'
                   ORDER BY "updatedAt" ASC LIMIT %s""",
                (limit,),
            )
            return [
                dict(
                    zip(
                        (
                            "external_id",
                            "external_url",
                            "category",
                            "status",
                            "message",
                            "attempts",
                        ),
                        row,
                        strict=True,
                    )
                )
                for row in cursor.fetchall()
            ]

    def list_retryable_failures(self, limit: int = 20) -> list[dict[str, Any]]:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """SELECT "externalId", "externalUrl" FROM collector_failures
                   WHERE "sourceId" = 'bbm'
                     AND (status = 'failed_retryable'
                          OR (category = 'data_quality' AND status = 'needs_review'))
                   ORDER BY "updatedAt" ASC LIMIT %s""",
                (limit,),
            )
            return [
                {"id": row[0], "link": row[1], "title": {"rendered": ""}}
                for row in cursor.fetchall()
            ]

    def resolve_collector_failure(self, external_id: str) -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """UPDATE collector_failures SET status = 'resolved', "resolvedAt" = NOW(), "updatedAt" = NOW()
                   WHERE "sourceId" = 'bbm' AND "externalId" = %s
                     AND (status = 'failed_retryable'
                          OR (category = 'data_quality' AND status = 'needs_review'))""",
                (external_id,),
            )

    def set_checkpoint_status(self, status: str, scope: str = "catalog") -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                'UPDATE collector_checkpoints SET status = %s, "updatedAt" = NOW() WHERE "sourceId" = %s AND scope = %s',
                (status, "bbm", scope),
            )

    def get_checkpoint(self, scope: str = "catalog") -> dict[str, Any] | None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                'SELECT "currentPage", "currentOffset", "lastExternalId", "processedCount", status, "syncCursorAt", "syncTargetAt", "completedAt", "syncOverlapSeconds" FROM collector_checkpoints WHERE "sourceId" = %s AND scope = %s',
                ("bbm", scope),
            )
            row = cursor.fetchone()
            if row is None:
                return None
            return {
                "current_page": row[0],
                "current_offset": row[1],
                "last_external_id": row[2],
                "processed_count": row[3],
                "status": row[4],
                "sync_cursor_at": row[5],
                "sync_target_at": row[6],
                "completed_at": row[7],
                "sync_overlap_seconds": row[8],
            }

    def get_sync_initial_cursor(self) -> datetime | None:
        """Return a conservative start point for the first change window."""
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """SELECT COALESCE(
                     (SELECT MAX(job."startedAt") FROM import_jobs job
                      WHERE job."sourceId" = checkpoint."sourceId"
                        AND job."runType" = 'backfill'
                        AND job."checkpointPage" = 1
                        AND job."startedAt" <= checkpoint."completedAt"),
                     checkpoint."completedAt")
                   FROM collector_checkpoints checkpoint
                   WHERE checkpoint."sourceId" = 'bbm' AND checkpoint.scope = 'catalog'
                     AND checkpoint.status = 'completed' AND checkpoint."completedAt" IS NOT NULL"""
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def ensure_sync_window(
        self, *, initial_cursor: datetime | None, target_at: datetime
    ) -> dict[str, Any]:
        """Create a bounded sync window or return the active window for resume."""
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """SELECT "currentPage", "currentOffset", "lastExternalId", "processedCount",
                          status, "syncCursorAt", "syncTargetAt", "completedAt", "syncOverlapSeconds"
                   FROM collector_checkpoints
                   WHERE "sourceId" = 'bbm' AND scope = 'sync' FOR UPDATE"""
            )
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError("Não foi possível adquirir o checkpoint de sync.")

            current_cursor = row[5]
            target = row[6]
            if target is None:
                if current_cursor is None:
                    if initial_cursor is None:
                        raise RuntimeError(
                            "Conclua o backfill do catálogo antes da primeira sincronização incremental."
                        )
                    current_cursor = initial_cursor
                target = target_at
                cursor.execute(
                    '''UPDATE collector_checkpoints
                       SET mode = 'sync', status = 'running', "currentPage" = 1,
                           "currentOffset" = 0, "lastExternalId" = NULL,
                           "syncCursorAt" = %s, "syncTargetAt" = %s,
                           "completedAt" = NULL, "updatedAt" = NOW()
                       WHERE "sourceId" = 'bbm' AND scope = 'sync'
                       RETURNING "currentPage", "currentOffset", "lastExternalId", "processedCount",
                                 status, "syncCursorAt", "syncTargetAt", "completedAt", "syncOverlapSeconds"''',
                    (current_cursor, target),
                )
                row = cursor.fetchone()
            return {
                "current_page": row[0],
                "current_offset": row[1],
                "last_external_id": row[2],
                "processed_count": row[3],
                "status": row[4],
                "sync_cursor_at": row[5],
                "sync_target_at": row[6],
                "completed_at": row[7],
                "sync_overlap_seconds": row[8],
            }

    def complete_sync_window(self, *, processed_count: int) -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """UPDATE collector_checkpoints
                   SET status = 'completed', "currentPage" = 1, "currentOffset" = 0,
                       "lastExternalId" = NULL, "processedCount" = %s,
                       "syncCursorAt" = "syncTargetAt", "syncTargetAt" = NULL,
                       "syncOverlapSeconds" = GREATEST(
                         300, EXTRACT(EPOCH FROM ("syncTargetAt" - "syncCursorAt"))::integer
                       ),
                       "completedAt" = NOW(), "updatedAt" = NOW()
                   WHERE "sourceId" = 'bbm' AND scope = 'sync' AND "syncTargetAt" IS NOT NULL""",
                (processed_count,),
            )

    def save_checkpoint(
        self,
        *,
        scope: str = "catalog",
        page: int,
        offset: int = 0,
        last_external_id: str | None,
        processed_count: int,
        status: str,
        mode: str = "backfill",
    ) -> None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                '''INSERT INTO collector_checkpoints
                  ("sourceId", scope, mode, status, "currentPage", "currentOffset", "lastExternalId", "processedCount", "updatedAt", "completedAt")
                  VALUES ('bbm', %s, %s, %s, %s, %s, %s, %s, NOW(), CASE WHEN %s = 'completed' THEN NOW() ELSE NULL END)
                  ON CONFLICT ("sourceId", scope) DO UPDATE SET
                    mode = EXCLUDED.mode, status = EXCLUDED.status, "currentPage" = EXCLUDED."currentPage", "currentOffset" = EXCLUDED."currentOffset",
                    "lastExternalId" = EXCLUDED."lastExternalId", "processedCount" = EXCLUDED."processedCount",
                    "updatedAt" = NOW(), "completedAt" = EXCLUDED."completedAt"''',
                (
                    scope,
                    mode,
                    status,
                    page,
                    offset,
                    last_external_id,
                    processed_count,
                    status,
                ),
            )

    def acquire_checkpoint(
        self, scope: str = "catalog", page: int = 1, mode: str = "backfill"
    ) -> bool:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                '''INSERT INTO collector_checkpoints ("sourceId", scope, mode, status, "currentPage", "updatedAt")
                   VALUES ('bbm', %s, %s, 'running', %s, NOW())
                   ON CONFLICT ("sourceId", scope) DO UPDATE SET status = 'running', "updatedAt" = NOW()
                   WHERE collector_checkpoints.status <> 'running'
                      OR collector_checkpoints."updatedAt" < NOW() - INTERVAL '45 minutes'
                   RETURNING "currentPage"''',
                (scope, mode, page),
            )
            return cursor.fetchone() is not None

    def reset_checkpoint(self, scope: str = "catalog") -> bool:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                '''INSERT INTO collector_checkpoints
                   ("sourceId", scope, mode, status, "currentPage", "processedCount", "updatedAt")
                   VALUES ('bbm', %s, 'backfill', 'pending', 1, 0, NOW())
                   ON CONFLICT ("sourceId", scope) DO UPDATE SET
                     status = 'pending', "currentPage" = 1, "currentOffset" = 0, "lastExternalId" = NULL,
                     "processedCount" = 0, "completedAt" = NULL, "updatedAt" = NOW()
                   WHERE collector_checkpoints.status <> 'running'
                   RETURNING "currentPage"''',
                (scope,),
            )
            return cursor.fetchone() is not None

    def get_sync_states(
        self, external_ids: list[str], source_id: str = "bbm"
    ) -> dict[str, dict[str, Any]]:
        if not external_ids:
            return {}
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT r."externalId", r."sourceModifiedAt", r."sourceContentHash", r."syncStatus",
                  EXISTS (
                    SELECT 1 FROM editions e JOIN publishers p ON p.id = e."publisherId"
                    WHERE e."mangaId" = r."entityId" AND p.name = 'Não informada'
                  ) AND EXISTS (
                    SELECT 1 FROM editions e JOIN publishers p ON p.id = e."publisherId"
                    WHERE e."mangaId" = r."entityId" AND p.name <> 'Não informada'
                  ) AS needs_edition_reconciliation
                FROM external_references r
                WHERE r."sourceId" = %s AND r."entityType" = 'manga' AND r."externalId" = ANY(%s)
                """,
                (source_id, external_ids),
            )
            return {
                external_id: {
                    "source_modified_at": modified_at,
                    "content_hash": content_hash,
                    "sync_status": status,
                    "needs_edition_reconciliation": needs_reconciliation,
                }
                for external_id, modified_at, content_hash, status, needs_reconciliation in cursor.fetchall()
            }

    @staticmethod
    def _merge_edition(cursor, target_edition_id: str, source_edition_id: str) -> None:
        """Merge a less reliable edition into its canonical edition without losing observations."""
        cursor.execute(
            'SELECT id, number FROM volumes WHERE "editionId" = %s ORDER BY number',
            (source_edition_id,),
        )
        for source_volume_id, number in cursor.fetchall():
            cursor.execute(
                'SELECT id FROM volumes WHERE "editionId" = %s AND number = %s',
                (target_edition_id, number),
            )
            target = cursor.fetchone()
            if target is None:
                cursor.execute(
                    'UPDATE volumes SET "editionId" = %s WHERE id = %s',
                    (target_edition_id, source_volume_id),
                )
                continue

            target_volume_id = target[0]
            cursor.execute(
                'SELECT id, "variantKey" FROM volume_variants WHERE "volumeId" = %s',
                (source_volume_id,),
            )
            for source_variant_id, variant_key in cursor.fetchall():
                cursor.execute(
                    'SELECT id FROM volume_variants WHERE "volumeId" = %s AND "variantKey" = %s',
                    (target_volume_id, variant_key),
                )
                target_variant = cursor.fetchone()
                if target_variant is None:
                    cursor.execute(
                        'UPDATE volume_variants SET "volumeId" = %s WHERE id = %s',
                        (target_volume_id, source_variant_id),
                    )
                else:
                    target_variant_id = target_variant[0]
                    cursor.execute(
                        'UPDATE volume_prices SET "variantId" = %s, "volumeId" = %s WHERE "variantId" = %s',
                        (target_variant_id, target_volume_id, source_variant_id),
                    )
                    cursor.execute(
                        'UPDATE price_observations SET "variantId" = %s, "volumeId" = %s WHERE "variantId" = %s',
                        (target_variant_id, target_volume_id, source_variant_id),
                    )
                    cursor.execute(
                        "DELETE FROM volume_variants WHERE id = %s",
                        (source_variant_id,),
                    )

            cursor.execute(
                """
                UPDATE volumes AS target SET
                  title = CASE WHEN target.title = 'Volume ' || target.number THEN source.title ELSE target.title END,
                  "releaseDate" = COALESCE(target."releaseDate", source."releaseDate"),
                  "releaseDatePrecision" = CASE WHEN target."releaseDatePrecision" = 'unknown' THEN source."releaseDatePrecision" ELSE target."releaseDatePrecision" END,
                  "releaseStatus" = CASE WHEN target."releaseStatus" = 'unknown' THEN source."releaseStatus" ELSE target."releaseStatus" END,
                  "releaseYear" = COALESCE(target."releaseYear", source."releaseYear"),
                  "releaseMonth" = COALESCE(target."releaseMonth", source."releaseMonth"),
                  "releaseDay" = COALESCE(target."releaseDay", source."releaseDay"),
                  isbn13 = COALESCE(target.isbn13, source.isbn13),
                  "pageCount" = COALESCE(target."pageCount", source."pageCount"),
                  "coverUrl" = COALESCE(target."coverUrl", source."coverUrl")
                FROM volumes AS source
                WHERE target.id = %s AND source.id = %s
                """,
                (target_volume_id, source_volume_id),
            )
            cursor.execute(
                'UPDATE volume_prices SET "volumeId" = %s WHERE "volumeId" = %s',
                (target_volume_id, source_volume_id),
            )
            cursor.execute(
                'UPDATE price_observations SET "volumeId" = %s WHERE "volumeId" = %s',
                (target_volume_id, source_volume_id),
            )
            cursor.execute("DELETE FROM volumes WHERE id = %s", (source_volume_id,))

        cursor.execute("DELETE FROM editions WHERE id = %s", (source_edition_id,))

    def get_last_publisher_repair_window(
        self, source_id: str = "bbm"
    ) -> tuple[datetime, datetime] | None:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT "startedAt", "finishedAt" FROM import_jobs
                WHERE "sourceId" = %s AND "runType" = 'publisher_repair'
                  AND status IN ('completed', 'completed_with_errors')
                  AND "finishedAt" IS NOT NULL
                ORDER BY "startedAt" DESC LIMIT 1
                """,
                (source_id,),
            )
            return cursor.fetchone()

    def has_unassigned_publisher(
        self,
        external_id: str,
        previous_repair_window: tuple[datetime, datetime] | None = None,
        source_id: str = "bbm",
    ) -> bool:
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT EXISTS (
                  SELECT 1 FROM external_references r
                  JOIN editions e ON e."mangaId" = r."entityId"
                  JOIN publishers p ON p.id = e."publisherId"
                  WHERE r."sourceId" = %s AND r."entityType" = 'manga'
                    AND r."externalId" = %s AND (
                      LOWER(p.name) IN ('não informada', 'nao informada')
                      OR (%s::timestamptz IS NOT NULL AND e."updatedAt" BETWEEN %s AND %s)
                    )
                )
                """,
                (
                    source_id,
                    external_id,
                    previous_repair_window[0] if previous_repair_window else None,
                    previous_repair_window[0] if previous_repair_window else None,
                    previous_repair_window[1] if previous_repair_window else None,
                ),
            )
            return bool(cursor.fetchone()[0])

    def repair_publisher(
        self,
        external_id: str,
        publisher_name: str,
        previous_repair_window: tuple[datetime, datetime] | None = None,
        source_id: str = "bbm",
    ) -> bool:
        """Update only a work's publisher link; leave its volumes and prices untouched."""
        publisher_name = publisher_name.strip() or "Não informada"
        publisher_slug = slugify(publisher_name)
        target_is_unknown = publisher_name.casefold() in {
            "não informada",
            "nao informada",
        }
        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT r."entityId" FROM external_references r
                WHERE r."sourceId" = %s AND r."entityType" = 'manga'
                  AND r."externalId" = %s
                """,
                (source_id, external_id),
            )
            manga = cursor.fetchone()
            if manga is None:
                return False
            manga_id = manga[0]

            cursor.execute(
                """
                SELECT e.id, p.id, p.name, e."updatedAt" FROM editions e
                JOIN publishers p ON p.id = e."publisherId"
                WHERE e."mangaId" = %s
                ORDER BY e."createdAt"
                """,
                (manga_id,),
            )
            editions = cursor.fetchall()
            if not editions:
                return False

            window_start, window_end = previous_repair_window or (None, None)
            candidates = [
                edition
                for edition in editions
                if (
                    edition[2].casefold() in {"não informada", "nao informada"}
                    and not target_is_unknown
                )
                or (
                    window_start is not None
                    and window_start <= edition[3] <= window_end
                    and edition[2].casefold() != publisher_name.casefold()
                )
            ]
            if not candidates:
                return False

            cursor.execute(
                """
                INSERT INTO publishers (id, name, slug, "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), %s, %s, NOW(), NOW())
                ON CONFLICT (slug) DO NOTHING
                """,
                (publisher_name.strip(), publisher_slug),
            )
            cursor.execute(
                "SELECT id FROM publishers WHERE slug = %s", (publisher_slug,)
            )
            publisher_id = cursor.fetchone()[0]
            canonical = next(
                (edition[0] for edition in editions if edition[1] == publisher_id),
                None,
            )
            if canonical:
                target_edition_id = canonical
                for edition in candidates:
                    if edition[0] != canonical:
                        self._merge_edition(cursor, target_edition_id, edition[0])
            else:
                target_edition_id = candidates[0][0]
                for edition in candidates[1:]:
                    self._merge_edition(cursor, target_edition_id, edition[0])
                cursor.execute(
                    'UPDATE editions SET "publisherId" = %s, "updatedAt" = NOW() WHERE id = %s',
                    (publisher_id, target_edition_id),
                )
            return True

    @staticmethod
    def _save_volume_variant(
        cursor, volume_id: str, variant: VolumeVariantCollected, source_id: str
    ) -> tuple[str, bool]:
        variant_key = slugify(variant.name)
        cursor.execute(
            'SELECT id FROM volume_variants WHERE "volumeId" = %s AND "variantKey" = %s',
            (volume_id, variant_key),
        )
        existing = cursor.fetchone()
        if existing is None:
            cursor.execute(
                """
                INSERT INTO volume_variants (
                  id, "volumeId", name, "variantKey", "releaseDate", "releaseDatePrecision",
                  "releaseStatus", "releaseYear", "releaseMonth", "releaseDay", isbn13,
                  "pageCount", "coverUrl", "createdAt", "updatedAt"
                ) VALUES (
                  gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
                ) RETURNING id
                """,
                (
                    volume_id,
                    variant.name,
                    variant_key,
                    variant.release_date,
                    variant.release_date_precision,
                    variant.release_status,
                    variant.release_year,
                    variant.release_month,
                    variant.release_day,
                    variant.isbn13,
                    variant.page_count,
                    variant.cover_url,
                ),
            )
            variant_id = cursor.fetchone()[0]
            variant_status = "created"
        else:
            variant_id = existing[0]
            cursor.execute(
                """
                UPDATE volume_variants SET
                  name = %s,
                  "releaseDate" = COALESCE(%s, "releaseDate"),
                  "releaseDatePrecision" = CASE WHEN %s <> 'unknown' THEN %s ELSE "releaseDatePrecision" END,
                  "releaseStatus" = CASE WHEN %s <> 'unknown' THEN %s ELSE "releaseStatus" END,
                  "releaseYear" = COALESCE(%s, "releaseYear"),
                  "releaseMonth" = COALESCE(%s, "releaseMonth"),
                  "releaseDay" = COALESCE(%s, "releaseDay"),
                  isbn13 = COALESCE(%s, isbn13),
                  "pageCount" = COALESCE(%s, "pageCount"),
                  "coverUrl" = COALESCE(%s, "coverUrl"),
                  "updatedAt" = NOW()
                WHERE id = %s AND (
                  name IS DISTINCT FROM %s OR
                  "releaseDate" IS DISTINCT FROM COALESCE(%s, "releaseDate") OR
                  (%s <> 'unknown' AND "releaseDatePrecision" IS DISTINCT FROM %s) OR
                  (%s <> 'unknown' AND "releaseStatus" IS DISTINCT FROM %s) OR
                  "releaseYear" IS DISTINCT FROM COALESCE(%s, "releaseYear") OR
                  "releaseMonth" IS DISTINCT FROM COALESCE(%s, "releaseMonth") OR
                  "releaseDay" IS DISTINCT FROM COALESCE(%s, "releaseDay") OR
                  isbn13 IS DISTINCT FROM COALESCE(%s, isbn13) OR
                  "pageCount" IS DISTINCT FROM COALESCE(%s, "pageCount") OR
                  "coverUrl" IS DISTINCT FROM COALESCE(%s, "coverUrl")
                ) RETURNING id
                """,
                (
                    variant.name,
                    variant.release_date,
                    variant.release_date_precision,
                    variant.release_date_precision,
                    variant.release_status,
                    variant.release_status,
                    variant.release_year,
                    variant.release_month,
                    variant.release_day,
                    variant.isbn13,
                    variant.page_count,
                    variant.cover_url,
                    variant_id,
                    variant.name,
                    variant.release_date,
                    variant.release_date_precision,
                    variant.release_date_precision,
                    variant.release_status,
                    variant.release_status,
                    variant.release_year,
                    variant.release_month,
                    variant.release_day,
                    variant.isbn13,
                    variant.page_count,
                    variant.cover_url,
                ),
            )
            variant_status = "updated" if cursor.fetchone() else "unchanged"

        price_changed = False
        if variant.price_amount is not None:
            cursor.execute(
                """
                SELECT amount FROM volume_prices
                WHERE "volumeId" = %s AND "variantId" = %s AND "sourceId" = %s
                ORDER BY "observedAt" DESC NULLS LAST, "createdAt" DESC LIMIT 1
                """,
                (volume_id, variant_id, source_id),
            )
            latest = cursor.fetchone()
            if latest is None or Decimal(latest[0]) != variant.price_amount:
                cursor.execute(
                    """
                    INSERT INTO volume_prices (
                      id, "volumeId", "variantId", amount, currency, "sourceId", "observedAt", "createdAt", "updatedAt"
                    ) VALUES (gen_random_uuid(), %s, %s, %s, 'BRL', %s, NOW(), NOW(), NOW())
                    """,
                    (volume_id, variant_id, variant.price_amount, source_id),
                )
                cursor.execute(
                    """
                    INSERT INTO price_observations (
                      id, "volumeId", "variantId", amount, currency, "priceType", "sourceId", "observedAt", "createdAt"
                    ) VALUES (gen_random_uuid(), %s, %s, %s, 'BRL', 'cover', %s, NOW(), NOW())
                    """,
                    (volume_id, variant_id, variant.price_amount, source_id),
                )
                price_changed = True
        return variant_status, price_changed

    def save_manga(
        self, data: MangaCollected, source_id: str = "bbm"
    ) -> PersistenceResult:
        publications = data.publications or [
            PublicationCollected(
                source_key="default", name="Edição Brasileira", volumes=data.volumes
            )
        ]
        outcomes = [
            self._save_manga_publication(
                data,
                source_id,
                publication,
                migrate_legacy_default=index == 0,
            )
            for index, publication in enumerate(publications)
        ]
        status = (
            "created"
            if any(outcome.status == "created" for outcome in outcomes)
            else "updated"
            if any(outcome.status == "updated" for outcome in outcomes)
            else "unchanged"
        )
        return PersistenceResult(
            status=status,
            manga_id=outcomes[0].manga_id,
            volumes_created=sum(outcome.volumes_created for outcome in outcomes),
            volumes_updated=sum(outcome.volumes_updated for outcome in outcomes),
            volumes_unchanged=sum(outcome.volumes_unchanged for outcome in outcomes),
            price_changes=sum(outcome.price_changes for outcome in outcomes),
            variants_created=sum(outcome.variants_created for outcome in outcomes),
            variants_updated=sum(outcome.variants_updated for outcome in outcomes),
            variants_unchanged=sum(outcome.variants_unchanged for outcome in outcomes),
        )

    def _save_manga_publication(
        self,
        data: MangaCollected,
        source_id: str,
        publication: PublicationCollected,
        *,
        migrate_legacy_default: bool,
    ) -> PersistenceResult:
        """Persist domain changes only; returns created, updated or unchanged."""
        manga_slug = slugify(data.title)
        publisher_slug = slugify(data.publisher)
        lock_key = f"{source_id}:{data.external_id or manga_slug}"

        with psycopg.connect(self.db_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (lock_key,)
            )

            cursor.execute(
                """
                INSERT INTO publishers (id, name, slug, "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), %s, %s, NOW(), NOW())
                ON CONFLICT (slug) DO NOTHING
                RETURNING id
                """,
                (data.publisher, publisher_slug),
            )
            publisher = cursor.fetchone()
            if publisher:
                publisher_id = publisher[0]
            else:
                cursor.execute(
                    "SELECT id FROM publishers WHERE slug = %s", (publisher_slug,)
                )
                publisher_id = cursor.fetchone()[0]

            existing_id = None
            if data.external_id:
                cursor.execute(
                    """
                    SELECT "entityId" FROM external_references
                    WHERE "sourceId" = %s AND "entityType" = 'manga' AND "externalId" = %s
                    """,
                    (source_id, data.external_id),
                )
                existing = cursor.fetchone()
                if existing:
                    existing_id = existing[0]
            if existing_id is None:
                cursor.execute("SELECT id FROM mangas WHERE slug = %s", (manga_slug,))
                existing = cursor.fetchone()
                if existing:
                    existing_id = existing[0]

            manga_changed = False
            was_created = existing_id is None
            if was_created:
                cursor.execute(
                    """
                    INSERT INTO mangas
                      (id, title, "originalTitle", slug, synopsis, author, category, accent, initials, "coverUrl", "createdAt", "updatedAt")
                    VALUES
                      (gen_random_uuid(), %s, %s, %s, %s, %s, %s, '#dc2626', UPPER(LEFT(%s, 2)), %s, NOW(), NOW())
                    ON CONFLICT (slug) DO NOTHING
                    RETURNING id
                    """,
                    (
                        data.title,
                        data.original_title,
                        manga_slug,
                        data.synopsis,
                        data.author,
                        data.category or "Geral",
                        data.title,
                        data.cover_url,
                    ),
                )
                inserted = cursor.fetchone()
                if inserted:
                    manga_id = inserted[0]
                else:
                    cursor.execute(
                        "SELECT id FROM mangas WHERE slug = %s", (manga_slug,)
                    )
                    manga_id = cursor.fetchone()[0]
                    was_created = False

            if not was_created:
                manga_id = existing_id if existing_id is not None else manga_id
                cursor.execute(
                    """
                    UPDATE mangas SET
                      title = %s,
                      "originalTitle" = COALESCE(%s, "originalTitle"),
                      synopsis = COALESCE(%s, synopsis),
                      author = COALESCE(%s, author),
                      category = COALESCE(%s, category),
                      "coverUrl" = COALESCE(%s, "coverUrl"),
                      "updatedAt" = NOW()
                    WHERE id = %s AND (
                      title IS DISTINCT FROM %s OR
                      (COALESCE(%s, "originalTitle")) IS DISTINCT FROM "originalTitle" OR
                      (COALESCE(%s, synopsis)) IS DISTINCT FROM synopsis OR
                      (COALESCE(%s, author)) IS DISTINCT FROM author OR
                      (COALESCE(%s, category)) IS DISTINCT FROM category OR
                      (COALESCE(%s, "coverUrl")) IS DISTINCT FROM "coverUrl"
                    )
                    RETURNING id
                    """,
                    (
                        data.title,
                        data.original_title,
                        data.synopsis,
                        data.author,
                        data.category,
                        data.cover_url,
                        manga_id,
                        data.title,
                        data.original_title,
                        data.synopsis,
                        data.author,
                        data.category,
                        data.cover_url,
                    ),
                )
                manga_changed = cursor.fetchone() is not None

            if data.external_id:
                cursor.execute(
                    """
                    INSERT INTO external_references
                      (id, "sourceId", "entityType", "entityId", "externalId", "externalUrl", "sourceModifiedAt", "sourceContentHash", "lastSyncedAt", "syncStatus", "createdAt")
                    VALUES (gen_random_uuid(), %s, 'manga', %s, %s, %s, %s, %s, NOW(), 'complete', NOW())
                    ON CONFLICT ("sourceId", "entityType", "externalId") DO UPDATE SET
                      "entityId" = EXCLUDED."entityId",
                      "externalUrl" = COALESCE(EXCLUDED."externalUrl", external_references."externalUrl"),
                      "sourceModifiedAt" = COALESCE(EXCLUDED."sourceModifiedAt", external_references."sourceModifiedAt"),
                      "sourceContentHash" = COALESCE(EXCLUDED."sourceContentHash", external_references."sourceContentHash"),
                      "lastSyncedAt" = NOW(),
                      "syncStatus" = %s
                    """,
                    (
                        source_id,
                        manga_id,
                        data.external_id,
                        data.external_url,
                        data.source_modified_at,
                        data.source_content_hash,
                        "complete" if data.sync_complete else "pending",
                    ),
                )

            edition_reconciled = False
            publisher_is_known = data.publisher.strip().casefold() != "não informada"
            publication_key = publication.source_key or "default"
            edition_name = publication.name or "Edição Brasileira"
            if (
                migrate_legacy_default
                and publication_key != "default"
                and publisher_is_known
            ):
                cursor.execute(
                    """SELECT e.id FROM editions e
                       WHERE e."mangaId" = %s AND e."sourceEditionKey" = 'default'
                       ORDER BY (e."publisherId" = %s) DESC, e."createdAt" LIMIT 1""",
                    (manga_id, publisher_id),
                )
                legacy_edition = cursor.fetchone()
                if legacy_edition:
                    legacy_edition_id = legacy_edition[0]
                    cursor.execute(
                        """SELECT id FROM editions
                           WHERE "mangaId" = %s AND "publisherId" = %s
                             AND "sourceEditionKey" = %s""",
                        (manga_id, publisher_id, publication_key),
                    )
                    existing_publication = cursor.fetchone()
                    if (
                        existing_publication
                        and existing_publication[0] != legacy_edition_id
                    ):
                        self._merge_edition(
                            cursor, existing_publication[0], legacy_edition_id
                        )
                    else:
                        cursor.execute(
                            """UPDATE editions SET "publisherId" = %s, "sourceEditionKey" = %s,
                                 name = %s, format = COALESCE(%s, 'Não informado'),
                                 "formatType" = %s, "formatDetails" = %s,
                                 "volumesPerBook" = %s, "formatEvidence" = %s,
                                 "updatedAt" = NOW()
                               WHERE id = %s""",
                            (
                                publisher_id,
                                publication_key,
                                edition_name,
                                publication.format_label,
                                publication.format_type,
                                publication.format_details,
                                publication.volumes_per_book,
                                publication.format_evidence,
                                legacy_edition_id,
                            ),
                        )
                    edition_reconciled = True
            cursor.execute(
                'SELECT e.id FROM editions e WHERE e."mangaId" = %s AND e."publisherId" = %s AND e."sourceEditionKey" = %s',
                (manga_id, publisher_id, publication_key),
            )
            canonical_edition = cursor.fetchone()
            cursor.execute(
                """
                SELECT e.id FROM editions e
                JOIN publishers p ON p.id = e."publisherId"
                WHERE e."mangaId" = %s AND e."sourceEditionKey" = %s AND p.name = 'Não informada'
                ORDER BY e."createdAt"
                """,
                (manga_id, publication_key),
            )
            unspecified_editions = [row[0] for row in cursor.fetchall()]

            if publisher_is_known and unspecified_editions:
                edition_id = unspecified_editions[0]
                if canonical_edition and canonical_edition[0] != edition_id:
                    self._merge_edition(cursor, edition_id, canonical_edition[0])
                    edition_reconciled = True
                for duplicate_id in unspecified_editions[1:]:
                    self._merge_edition(cursor, edition_id, duplicate_id)
                    edition_reconciled = True
                cursor.execute(
                    'UPDATE editions SET "publisherId" = %s, "updatedAt" = NOW() WHERE id = %s',
                    (publisher_id, edition_id),
                )
                edition_reconciled = True
            elif canonical_edition:
                edition_id = canonical_edition[0]
            elif unspecified_editions:
                edition_id = unspecified_editions[0]
            else:
                cursor.execute(
                    """
                    INSERT INTO editions (
                      id, "mangaId", "publisherId", name, format, "sourceEditionKey",
                      "formatType", "formatDetails", "volumesPerBook", "formatEvidence",
                      status, "createdAt", "updatedAt"
                    ) VALUES (
                      gen_random_uuid(), %s, %s, %s, COALESCE(%s, 'Não informado'), %s,
                      %s, %s, %s, %s, 'ongoing', NOW(), NOW()
                    ) RETURNING id
                    """,
                    (
                        manga_id,
                        publisher_id,
                        edition_name,
                        publication.format_label,
                        publication_key,
                        publication.format_type,
                        publication.format_details,
                        publication.volumes_per_book,
                        publication.format_evidence,
                    ),
                )
                edition_id = cursor.fetchone()[0]

            cursor.execute(
                """UPDATE editions SET name = %s, format = COALESCE(%s, 'Não informado'),
                     "formatType" = %s, "formatDetails" = %s,
                     "volumesPerBook" = %s, "formatEvidence" = %s, "updatedAt" = NOW()
                   WHERE id = %s AND (
                     name IS DISTINCT FROM %s OR format IS DISTINCT FROM COALESCE(%s, 'Não informado') OR
                     "formatType" IS DISTINCT FROM %s OR "formatDetails" IS DISTINCT FROM %s OR
                     "volumesPerBook" IS DISTINCT FROM %s OR "formatEvidence" IS DISTINCT FROM %s
                   ) RETURNING id""",
                (
                    edition_name,
                    publication.format_label,
                    publication.format_type,
                    publication.format_details,
                    publication.volumes_per_book,
                    publication.format_evidence,
                    edition_id,
                    edition_name,
                    publication.format_label,
                    publication.format_type,
                    publication.format_details,
                    publication.volumes_per_book,
                    publication.format_evidence,
                ),
            )
            edition_reconciled = edition_reconciled or cursor.fetchone() is not None

            publication_volumes = publication.volumes
            existing_numbers: set[int] = set()
            volume_ids: dict[int, str] = {}
            changed_prices = 0
            variant_counts = {"created": 0, "updated": 0, "unchanged": 0}
            changed_volumes: list[tuple[str, int]] = []
            if publication_volumes:
                numbers = [volume.number for volume in publication_volumes]
                cursor.execute(
                    'SELECT number FROM volumes WHERE "editionId" = %s AND number = ANY(%s)',
                    (edition_id, numbers),
                )
                existing_numbers = {row[0] for row in cursor.fetchall()}
                cursor.execute(
                    """
                    INSERT INTO volumes (id, "editionId", number, title, "releaseDate", "releaseDatePrecision", "releaseStatus", "releaseYear", "releaseMonth", "releaseDay", isbn13, "pageCount", "coverUrl", "createdAt", "updatedAt")
                    SELECT gen_random_uuid(), %s, item.number, COALESCE(item.title, 'Volume ' || item.number), item.release_date, item.release_precision, item.release_status, item.release_year, item.release_month, item.release_day, item.isbn13, item.page_count, item.cover_url, NOW(), NOW()
                    FROM unnest(%s::int[], %s::text[], %s::text[], %s::text[], %s::text[], %s::int[], %s::int[], %s::int[], %s::text[], %s::int[], %s::text[])
                      AS item(number, title, release_date, release_precision, release_status, release_year, release_month, release_day, isbn13, page_count, cover_url)
                    ON CONFLICT ("editionId", number) DO UPDATE SET
                      title = CASE WHEN EXCLUDED.title = 'Volume ' || EXCLUDED.number THEN volumes.title ELSE EXCLUDED.title END,
                      "releaseDate" = COALESCE(EXCLUDED."releaseDate", volumes."releaseDate"),
                      "releaseDatePrecision" = CASE WHEN EXCLUDED."releaseDatePrecision" <> 'unknown' THEN EXCLUDED."releaseDatePrecision" ELSE volumes."releaseDatePrecision" END,
                      "releaseStatus" = CASE WHEN EXCLUDED."releaseStatus" <> 'unknown' THEN EXCLUDED."releaseStatus" ELSE volumes."releaseStatus" END,
                      "releaseYear" = COALESCE(EXCLUDED."releaseYear", volumes."releaseYear"),
                      "releaseMonth" = COALESCE(EXCLUDED."releaseMonth", volumes."releaseMonth"),
                      "releaseDay" = COALESCE(EXCLUDED."releaseDay", volumes."releaseDay"),
                      isbn13 = COALESCE(EXCLUDED.isbn13, volumes.isbn13),
                      "pageCount" = COALESCE(EXCLUDED."pageCount", volumes."pageCount"),
                      "coverUrl" = COALESCE(EXCLUDED."coverUrl", volumes."coverUrl"),
                      "updatedAt" = NOW()
                    WHERE volumes.title IS DISTINCT FROM CASE WHEN EXCLUDED.title = 'Volume ' || EXCLUDED.number THEN volumes.title ELSE EXCLUDED.title END
                       OR volumes."releaseDate" IS DISTINCT FROM COALESCE(EXCLUDED."releaseDate", volumes."releaseDate")
                       OR volumes."releaseDatePrecision" IS DISTINCT FROM CASE WHEN EXCLUDED."releaseDatePrecision" <> 'unknown' THEN EXCLUDED."releaseDatePrecision" ELSE volumes."releaseDatePrecision" END
                       OR volumes."releaseStatus" IS DISTINCT FROM CASE WHEN EXCLUDED."releaseStatus" <> 'unknown' THEN EXCLUDED."releaseStatus" ELSE volumes."releaseStatus" END
                       OR volumes."releaseYear" IS DISTINCT FROM COALESCE(EXCLUDED."releaseYear", volumes."releaseYear")
                       OR volumes."releaseMonth" IS DISTINCT FROM COALESCE(EXCLUDED."releaseMonth", volumes."releaseMonth")
                       OR volumes."releaseDay" IS DISTINCT FROM COALESCE(EXCLUDED."releaseDay", volumes."releaseDay")
                       OR volumes.isbn13 IS DISTINCT FROM COALESCE(EXCLUDED.isbn13, volumes.isbn13)
                       OR volumes."pageCount" IS DISTINCT FROM COALESCE(EXCLUDED."pageCount", volumes."pageCount")
                       OR volumes."coverUrl" IS DISTINCT FROM COALESCE(EXCLUDED."coverUrl", volumes."coverUrl")
                    RETURNING id, number
                    """,
                    (
                        edition_id,
                        numbers,
                        [volume.title for volume in publication_volumes],
                        [volume.release_date for volume in publication_volumes],
                        [
                            volume.release_date_precision
                            for volume in publication_volumes
                        ],
                        [volume.release_status for volume in publication_volumes],
                        [volume.release_year for volume in publication_volumes],
                        [volume.release_month for volume in publication_volumes],
                        [volume.release_day for volume in publication_volumes],
                        [volume.isbn13 for volume in publication_volumes],
                        [volume.page_count for volume in publication_volumes],
                        [volume.cover_url for volume in publication_volumes],
                    ),
                )
                changed_volumes = cursor.fetchall()
                for volume_id, number in changed_volumes:
                    volume_ids[number] = volume_id
                cursor.execute(
                    'SELECT id, number FROM volumes WHERE "editionId" = %s AND number = ANY(%s)',
                    (edition_id, numbers),
                )
                volume_ids.update(
                    {number: volume_id for volume_id, number in cursor.fetchall()}
                )

                priced = [
                    volume
                    for volume in publication_volumes
                    if volume.price_amount is not None
                ]
                if priced:
                    ids = [volume_ids[volume.number] for volume in priced]
                    cursor.execute(
                        """
                        SELECT DISTINCT ON ("volumeId") "volumeId", amount
                        FROM volume_prices
                        WHERE "sourceId" = %s AND "volumeId" = ANY(%s) AND "variantId" IS NULL
                        ORDER BY "volumeId", "observedAt" DESC NULLS LAST, "createdAt" DESC
                        """,
                        (source_id, ids),
                    )
                    latest_prices = {
                        volume_id: Decimal(amount)
                        for volume_id, amount in cursor.fetchall()
                    }
                    new_prices = [
                        volume
                        for volume in priced
                        if latest_prices.get(volume_ids[volume.number])
                        != volume.price_amount
                    ]
                    if new_prices:
                        changed_prices = len(new_prices)
                        price_ids = [volume_ids[volume.number] for volume in new_prices]
                        amounts = [volume.price_amount for volume in new_prices]
                        cursor.execute(
                            """
                            INSERT INTO volume_prices (id, "volumeId", amount, currency, "sourceId", "observedAt", "createdAt", "updatedAt")
                            SELECT gen_random_uuid(), item.volume_id, item.amount, 'BRL', %s, NOW(), NOW(), NOW()
                            FROM unnest(%s::uuid[], %s::numeric[]) AS item(volume_id, amount)
                            """,
                            (source_id, price_ids, amounts),
                        )
                        cursor.execute(
                            """
                            INSERT INTO price_observations (id, "volumeId", amount, currency, "priceType", "sourceId", "observedAt", "createdAt")
                            SELECT gen_random_uuid(), item.volume_id, item.amount, 'BRL', 'cover', %s, NOW(), NOW()
                            FROM unnest(%s::uuid[], %s::numeric[]) AS item(volume_id, amount)
                            """,
                            (source_id, price_ids, amounts),
                        )

                for volume in publication_volumes:
                    volume_id = volume_ids[volume.number]
                    for variant in volume.variants:
                        variant_status, variant_price_changed = (
                            self._save_volume_variant(
                                cursor, volume_id, variant, source_id
                            )
                        )
                        variant_counts[variant_status] += 1
                        changed_prices += int(variant_price_changed)

            connection.commit()
            updated = (
                manga_changed
                or edition_reconciled
                or bool(changed_volumes)
                or bool(changed_prices)
                or variant_counts["created"] > 0
                or variant_counts["updated"] > 0
            )
            created_volume_count = len(
                {volume.number for volume in publication_volumes} - existing_numbers
            )
            updated_volume_count = sum(
                number in existing_numbers for _volume_id, number in changed_volumes
            )
            unchanged_volume_count = len(existing_numbers) - updated_volume_count
            if was_created:
                status = "created"
            else:
                status = "updated" if updated else "unchanged"
            return PersistenceResult(
                status=status,
                manga_id=str(manga_id),
                volumes_created=created_volume_count,
                volumes_updated=updated_volume_count,
                volumes_unchanged=unchanged_volume_count,
                price_changes=changed_prices,
                variants_created=variant_counts["created"],
                variants_updated=variant_counts["updated"],
                variants_unchanged=variant_counts["unchanged"],
            )

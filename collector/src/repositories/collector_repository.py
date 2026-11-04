"""PostgreSQL persistence with per-work locking and idempotent updates."""

from __future__ import annotations

import os
import re
from decimal import Decimal
from typing import Any

import psycopg

from collector.src.models.entities import (
    MangaCollected,
    PersistenceResult,
    VolumeVariantCollected,
)


def slugify(text: str) -> str:
    value = text.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_-]+", "-", value)
    return value.strip("-")


class CollectorRepository:
    def __init__(self, db_url: str | None = None):
        self.db_url = db_url or os.getenv(
            "DATABASE_URL",
            "postgresql://manga_atlas:manga_atlas_secret@localhost:5432/manga_atlas",
        )

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
                        "DELETE FROM volume_variants WHERE id = %s", (source_variant_id,)
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
            cursor.execute(
                'SELECT e.id FROM editions e WHERE e."mangaId" = %s AND e."publisherId" = %s',
                (manga_id, publisher_id),
            )
            canonical_edition = cursor.fetchone()
            cursor.execute(
                """
                SELECT e.id FROM editions e
                JOIN publishers p ON p.id = e."publisherId"
                WHERE e."mangaId" = %s AND p.name = 'Não informada'
                ORDER BY e."createdAt"
                """,
                (manga_id,),
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
            else:
                cursor.execute(
                    'SELECT id FROM editions WHERE "mangaId" = %s ORDER BY "createdAt" LIMIT 1',
                    (manga_id,),
                )
                existing_edition = cursor.fetchone()
                if existing_edition and not publisher_is_known:
                    edition_id = existing_edition[0]
                else:
                    cursor.execute(
                        """
                        INSERT INTO editions (id, "mangaId", "publisherId", name, format, status, "createdAt", "updatedAt")
                        VALUES (gen_random_uuid(), %s, %s, 'Edição Brasileira', 'Tankobon', 'ongoing', NOW(), NOW())
                        RETURNING id
                        """,
                        (manga_id, publisher_id),
                    )
                    edition_id = cursor.fetchone()[0]

            existing_numbers: set[int] = set()
            volume_ids: dict[int, str] = {}
            changed_prices = 0
            variant_counts = {"created": 0, "updated": 0, "unchanged": 0}
            changed_volumes: list[tuple[str, int]] = []
            if data.volumes:
                numbers = [volume.number for volume in data.volumes]
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
                        [volume.title for volume in data.volumes],
                        [volume.release_date for volume in data.volumes],
                        [volume.release_date_precision for volume in data.volumes],
                        [volume.release_status for volume in data.volumes],
                        [volume.release_year for volume in data.volumes],
                        [volume.release_month for volume in data.volumes],
                        [volume.release_day for volume in data.volumes],
                        [volume.isbn13 for volume in data.volumes],
                        [volume.page_count for volume in data.volumes],
                        [volume.cover_url for volume in data.volumes],
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
                    volume for volume in data.volumes if volume.price_amount is not None
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

                for volume in data.volumes:
                    volume_id = volume_ids[volume.number]
                    for variant in volume.variants:
                        variant_status, variant_price_changed = self._save_volume_variant(
                            cursor, volume_id, variant, source_id
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
                {volume.number for volume in data.volumes} - existing_numbers
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

"""Repositório PostgreSQL para persistência do Coletor usando psycopg."""
from __future__ import annotations

import os
import re

import psycopg

from collector.src.models.entities import MangaCollected


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_-]+', '-', s)
    return s.strip('-')

class CollectorRepository:
    def __init__(self, db_url: str | None = None):
        self.db_url = db_url or os.getenv('DATABASE_URL', 'postgresql://manga_atlas:manga_atlas_secret@localhost:5432/manga_atlas')

    def save_manga(self, data: MangaCollected, source_id: str = 'bbm') -> tuple[bool, str]:
        """Salva ou atualiza a obra e seus volumes de forma idempotente."""
        slug = slugify(data.title)

        with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
            # 1. Editora
                pub_slug = slugify(data.publisher)
                cur.execute(
                    """
                    INSERT INTO publishers (id, name, slug, "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), %s, %s, NOW(), NOW())
                    ON CONFLICT (slug) DO UPDATE SET "updatedAt" = NOW()
                    RETURNING id
                    """,
                    (data.publisher, pub_slug)
                )
                pub_id = cur.fetchone()[0]

                # 2. Manga
                cur.execute(
                    """
                    INSERT INTO mangas (id, title, "originalTitle", slug, synopsis, author, category, accent, initials, "coverUrl", "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, '#dc2626', UPPER(LEFT(%s, 2)), %s, NOW(), NOW())
                    ON CONFLICT (slug) DO UPDATE
                    SET "coverUrl" = COALESCE(mangas."coverUrl", EXCLUDED."coverUrl"),
                        "author" = COALESCE(EXCLUDED."author", mangas."author"),
                        "updatedAt" = NOW()
                    RETURNING id
                    """,
                    (data.title, data.original_title, slug, data.synopsis, data.author, data.category, data.title, data.cover_url)
                )
                manga_id = cur.fetchone()[0]

                # 3. Edição padrão
                cur.execute(
                    """
                    INSERT INTO editions (id, "mangaId", "publisherId", name, format, status, "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), %s, %s, 'Edição Brasileira', 'Tankobon', 'ongoing', NOW(), NOW())
                    ON CONFLICT DO NOTHING
                    RETURNING id
                    """,
                    (manga_id, pub_id)
                )
                row = cur.fetchone()
                if row:
                    edition_id = row[0]
                else:
                    cur.execute('SELECT id FROM editions WHERE "mangaId" = %s AND "publisherId" = %s', (manga_id, pub_id))
                    edition_id = cur.fetchone()[0]

                # 4. Volumes
                for v in data.volumes:
                    cur.execute(
                        """
                        INSERT INTO volumes (id, "editionId", number, title, "releaseDate", "releaseDatePrecision", "releaseStatus", "releaseYear", "releaseMonth", "releaseDay", "coverUrl", "createdAt", "updatedAt")
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                        RETURNING id
                        """,
                        (edition_id, v.number, v.title or f"Volume {v.number}", v.release_date, v.release_date_precision, v.release_status, v.release_year, v.release_month, v.release_day, v.cover_url)
                    )
                    vol_id = cur.fetchone()[0]

                    # 5. Preço
                    if v.price_amount is not None:
                        cur.execute(
                            """
                            INSERT INTO volume_prices (id, "volumeId", amount, currency, "sourceId", "observedAt", "createdAt", "updatedAt")
                            VALUES (gen_random_uuid(), %s, %s, 'BRL', %s, NOW(), NOW(), NOW())
                            """,
                            (vol_id, v.price_amount, source_id)
                        )
                        cur.execute(
                            """
                            INSERT INTO price_observations (id, "volumeId", amount, currency, "priceType", "sourceId", "observedAt", "createdAt")
                            VALUES (gen_random_uuid(), %s, %s, 'BRL', 'cover', %s, NOW(), NOW())
                            """,
                            (vol_id, v.price_amount, source_id)
                        )

                conn.commit()
                return True, str(manga_id)

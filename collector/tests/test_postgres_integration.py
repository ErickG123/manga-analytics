"""Integration checks run only against an explicitly configured test database."""

from __future__ import annotations

import os
import uuid
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from collector.src.models.entities import (
    MangaCollected,
    VolumeCollected,
    VolumeVariantCollected,
)
from collector.src.repositories.collector_repository import CollectorRepository
from collector.src.services.import_service import ImportService


@pytest.mark.skipif(
    not os.getenv("COLLECTOR_TEST_DATABASE_URL"),
    reason="Set COLLECTOR_TEST_DATABASE_URL to an isolated PostgreSQL test database.",
)
def test_postgres_reimport_is_idempotent_and_only_observes_price_changes():
    database_url = os.environ["COLLECTOR_TEST_DATABASE_URL"]
    test_token = uuid.uuid4().hex
    repository = CollectorRepository(database_url)
    manga = MangaCollected(
        title=f"Collector Integration Fixture {test_token}",
        publisher="Collector Integration Publisher",
        external_id=f"collector-integration-{test_token}",
        external_url="https://fixture.invalid/integration",
        source_modified_at="2026-11-04T12:00:00",
        source_content_hash="a" * 64,
        volumes=[
            VolumeCollected(
                number=1,
                title="Volume 1",
                release_date="01/02/2025",
                release_date_precision="day",
                release_year=2025,
                release_month=2,
                release_day=1,
                release_status="released",
                price_amount=Decimal("19.90"),
            )
        ],
    )

    first = repository.save_manga(manga)
    with psycopg.connect(database_url) as connection:
        before_noop = connection.execute(
            """
            SELECT m."updatedAt", v."updatedAt"
            FROM mangas m
            JOIN external_references r ON r."entityId" = m.id
            JOIN editions e ON e."mangaId" = m.id
            JOIN volumes v ON v."editionId" = e.id
            WHERE r."sourceId" = 'bbm' AND r."externalId" = %s
            """,
            (manga.external_id,),
        ).fetchone()
        assert before_noop is not None
    second = repository.save_manga(manga)
    assert first.status == "created"
    assert second.status == "unchanged"
    assert second.volumes_unchanged == 1

    with psycopg.connect(database_url) as connection:
        baseline = connection.execute(
            """
            SELECT m.id, m."updatedAt", v."releaseDate",
              (SELECT count(*) FROM editions e WHERE e."mangaId" = m.id),
              (SELECT count(*) FROM volumes v2 JOIN editions e2 ON e2.id = v2."editionId" WHERE e2."mangaId" = m.id),
              (SELECT count(*) FROM price_observations po JOIN volumes v3 ON v3.id = po."volumeId" JOIN editions e3 ON e3.id = v3."editionId" WHERE e3."mangaId" = m.id)
            FROM mangas m
            JOIN external_references r ON r."entityId" = m.id
            JOIN editions e ON e."mangaId" = m.id
            JOIN volumes v ON v."editionId" = e.id
            WHERE r."sourceId" = 'bbm' AND r."externalId" = %s
            """,
            (manga.external_id,),
        ).fetchone()
        assert baseline is not None
        assert (
            baseline[1],
            connection.execute(
                """
            SELECT v."updatedAt" FROM volumes v JOIN editions e ON e.id=v."editionId"
            WHERE e."mangaId"=%s
            """,
                (baseline[0],),
            ).fetchone()[0],
        ) == before_noop
        assert baseline[2] == "01/02/2025"
        assert baseline[3:] == (1, 1, 1)

    changed = MangaCollected(
        **{
            **manga.__dict__,
            "volumes": [
                VolumeCollected(
                    **{**manga.volumes[0].__dict__, "price_amount": Decimal("21.90")}
                )
            ],
        }
    )
    third = repository.save_manga(changed)
    assert third.status == "updated"
    assert third.price_changes == 1
    fourth = repository.save_manga(changed)
    assert fourth.status == "unchanged"

    with psycopg.connect(database_url) as connection:
        after = connection.execute(
            """
            SELECT m."updatedAt",
              (SELECT count(*) FROM editions e WHERE e."mangaId" = m.id),
              (SELECT count(*) FROM volumes v JOIN editions e2 ON e2.id = v."editionId" WHERE e2."mangaId" = m.id),
              (SELECT count(*) FROM price_observations po JOIN volumes v2 ON v2.id = po."volumeId" JOIN editions e3 ON e3.id = v2."editionId" WHERE e3."mangaId" = m.id),
              (SELECT amount FROM volume_prices vp JOIN volumes v3 ON v3.id = vp."volumeId" JOIN editions e4 ON e4.id = v3."editionId" WHERE e4."mangaId" = m.id ORDER BY vp."observedAt" DESC LIMIT 1)
            FROM mangas m JOIN external_references r ON r."entityId" = m.id
            WHERE r."sourceId" = 'bbm' AND r."externalId" = %s
            """,
            (manga.external_id,),
        ).fetchone()
        assert after is not None
        assert after[0] == baseline[1]
        assert after[1:4] == (1, 1, 2)
        assert Decimal(after[4]) == Decimal("21.90")
        assert (
            connection.execute(
                """
            SELECT count(*) FROM external_references
            WHERE "sourceId"='bbm' AND "entityType"='manga' AND "externalId"=%s
            """,
                (manga.external_id,),
            ).fetchone()[0]
            == 1
        )


@pytest.mark.skipif(
    not os.getenv("COLLECTOR_TEST_DATABASE_URL"),
    reason="Set COLLECTOR_TEST_DATABASE_URL to an isolated PostgreSQL test database.",
)
def test_known_publisher_reconciles_existing_unspecified_edition_without_losing_history():
    database_url = os.environ["COLLECTOR_TEST_DATABASE_URL"]
    token = uuid.uuid4().hex
    repository = CollectorRepository(database_url)
    manga = MangaCollected(
        title=f"Publisher Reconciliation Fixture {token}",
        publisher="Não informada",
        external_id=f"publisher-reconciliation-{token}",
        external_url="https://fixture.invalid/publisher-reconciliation",
        volumes=[
            VolumeCollected(number=1, price_amount=Decimal("29.90")),
        ],
    )

    initial = repository.save_manga(manga)
    corrected = repository.save_manga(
        MangaCollected(**{**manga.__dict__, "publisher": "Panini"})
    )

    assert initial.status == "created"
    assert corrected.status == "updated"
    with psycopg.connect(database_url) as connection:
        state = connection.execute(
            """
            SELECT p.name,
              (SELECT count(*) FROM editions e WHERE e."mangaId" = m.id),
              (SELECT count(*) FROM volumes v JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id),
              (SELECT count(*) FROM price_observations po JOIN volumes v ON v.id = po."volumeId" JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id)
            FROM mangas m
            JOIN external_references r ON r."entityId" = m.id
            JOIN editions e ON e."mangaId" = m.id
            JOIN publishers p ON p.id = e."publisherId"
            WHERE r."sourceId"='bbm' AND r."externalId"=%s
            """,
            (manga.external_id,),
        ).fetchone()

    assert state == ("Panini", 1, 1, 1)
    checkpoint = repository.get_sync_states([manga.external_id])[manga.external_id]
    assert checkpoint["needs_edition_reconciliation"] is False


@pytest.mark.skipif(
    not os.getenv("COLLECTOR_TEST_DATABASE_URL"),
    reason="Set COLLECTOR_TEST_DATABASE_URL to an isolated PostgreSQL test database.",
)
def test_same_number_variants_keep_separate_identity_and_price_history():
    database_url = os.environ["COLLECTOR_TEST_DATABASE_URL"]
    token = uuid.uuid4().hex
    repository = CollectorRepository(database_url)
    work = MangaCollected(
        title=f"Volume Variant Fixture {token}",
        publisher="Variant Test Publisher",
        external_id=f"volume-variant-{token}",
        external_url="https://fixture.invalid/volume-variant",
        volumes=[
            VolumeCollected(
                number=27,
                price_amount=Decimal("40.90"),
                variants=[
                    VolumeVariantCollected(
                        name="Capa variante",
                        release_date="02/12/2023",
                        release_date_precision="day",
                        release_year=2023,
                        release_month=12,
                        release_day=2,
                        release_status="released",
                        price_amount=Decimal("36.90"),
                    ),
                    VolumeVariantCollected(
                        name="Blind Pack",
                        release_date="18/01/2025",
                        release_date_precision="day",
                        release_year=2025,
                        release_month=1,
                        release_day=18,
                        release_status="released",
                        price_amount=Decimal("49.90"),
                    ),
                ],
            )
        ],
    )

    first = repository.save_manga(work)
    second = repository.save_manga(work)
    changed_blind_pack = MangaCollected(
        **{
            **work.__dict__,
            "volumes": [
                VolumeCollected(
                    **{
                        **work.volumes[0].__dict__,
                        "variants": [
                            work.volumes[0].variants[0],
                            VolumeVariantCollected(
                                **{
                                    **work.volumes[0].variants[1].__dict__,
                                    "price_amount": Decimal("52.90"),
                                }
                            ),
                        ],
                    }
                )
            ],
        }
    )
    third = repository.save_manga(changed_blind_pack)

    assert first.status == "created"
    assert first.variants_created == 2
    assert second.status == "unchanged"
    assert second.variants_unchanged == 2
    assert second.price_changes == 0
    assert third.status == "updated"
    assert third.price_changes == 1
    with psycopg.connect(database_url) as connection:
        state = connection.execute(
            """
            SELECT
              (SELECT count(*) FROM volumes v JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id),
              (SELECT count(*) FROM volume_variants vv JOIN volumes v ON v.id = vv."volumeId" JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id),
              (SELECT count(*) FROM price_observations po JOIN volumes v ON v.id = po."volumeId" JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id),
              (SELECT amount FROM volume_prices vp JOIN volumes v ON v.id = vp."volumeId" JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id AND vp."variantId" IS NULL ORDER BY vp."observedAt" DESC LIMIT 1),
              (SELECT vp.amount FROM volume_prices vp JOIN volume_variants vv ON vv.id = vp."variantId" JOIN volumes v ON v.id = vv."volumeId" JOIN editions e ON e.id = v."editionId" WHERE e."mangaId" = m.id AND vv.name = 'Blind Pack' ORDER BY vp."observedAt" DESC LIMIT 1)
            FROM mangas m JOIN external_references r ON r."entityId" = m.id
            WHERE r."sourceId"='bbm' AND r."externalId"=%s
            """,
            (work.external_id,),
        ).fetchone()

    assert state == (1, 2, 4, Decimal("40.90"), Decimal("52.90"))


@pytest.mark.skipif(
    not os.getenv("COLLECTOR_TEST_DATABASE_URL"),
    reason="Set COLLECTOR_TEST_DATABASE_URL to an isolated PostgreSQL test database.",
)
def test_fixture_imports_of_five_then_ten_works_use_incremental_checkpoint():
    database_url = os.environ["COLLECTOR_TEST_DATABASE_URL"]
    run_token = uuid.uuid4().hex
    sizes = [1, 10, 20, 20, 40, 2, 2, 2, 2, 2]
    priced_counts = [0, 5, 14, 1, 0, 0, 0, 0, 0, 0]
    template_path = Path(__file__).parent / "fixtures" / "benchmark_work_page.html"

    class LocalFixtureClient:
        def __init__(self):
            self.fetch_calls: list[int] = []
            self.catalog = [
                {
                    "id": f"local-{run_token}-{index}",
                    "title": {"rendered": f"Local Benchmark Work {run_token} {index}"},
                    "link": "https://fixture.invalid/local",
                    "modified": "2026-11-04T12:00:00",
                }
                for index in range(10)
            ]

        def iter_catalog_metadata(self, limit=None):
            yield from self.catalog[:limit]

        def fetch_page(self, page_id):
            index = int(str(page_id).rsplit("-", 1)[1])
            rows = "".join(
                f"<tr><td>{volume}</td><td>01/01/2025</td><td>"
                f"{'R$ 39,90' if volume <= priced_counts[index] else '—'}</td></tr>"
                for volume in range(1, sizes[index] + 1)
            )
            self.fetch_calls.append(index)
            html = template_path.read_text(encoding="utf-8").replace(
                "<!-- VOLUME_ROWS -->", rows
            )
            return {"content": {"rendered": html}}

    client = LocalFixtureClient()
    service = ImportService(client=client, repository=CollectorRepository(database_url))

    first = service.run_import(limit=5)
    assert first.discovered == first.selected == 5
    assert first.processed == first.created == 5
    assert first.volumes_found == 91
    assert first.volumes_with_price == 20
    assert len(client.fetch_calls) == 5

    client.fetch_calls.clear()
    second = service.run_import(limit=10, run_type="sync")
    assert second.discovered == second.selected == 10
    assert second.processed == second.created == 5
    assert second.unchanged == 5
    assert len(client.fetch_calls) == 5

    client.fetch_calls.clear()
    third = service.run_import(limit=10, run_type="sync")
    assert third.unchanged == 10
    assert third.processed == 0
    assert client.fetch_calls == []

    external_ids = [item["id"] for item in client.catalog]
    with psycopg.connect(database_url) as connection:
        counts = connection.execute(
            """
            SELECT count(DISTINCT r."entityId"), count(DISTINCT e.id), count(DISTINCT v.id),
              count(DISTINCT po.id)
            FROM external_references r
            LEFT JOIN editions e ON e."mangaId" = r."entityId"
            LEFT JOIN volumes v ON v."editionId" = e.id
            LEFT JOIN price_observations po ON po."volumeId" = v.id
            WHERE r."sourceId"='bbm' AND r."entityType"='manga' AND r."externalId" = ANY(%s)
            """,
            (external_ids,),
        ).fetchone()
        duplicates = connection.execute(
            """
            SELECT count(*) FROM (
              SELECT e."mangaId", e."publisherId" FROM editions e
              JOIN external_references r ON r."entityId" = e."mangaId"
              WHERE r."externalId" = ANY(%s)
              GROUP BY e."mangaId", e."publisherId" HAVING count(*) > 1
            ) d
            """,
            (external_ids,),
        ).fetchone()[0]
        duplicate_volumes = connection.execute(
            """
            SELECT count(*) FROM (
              SELECT v."editionId", v.number FROM volumes v
              JOIN editions e ON e.id = v."editionId"
              JOIN external_references r ON r."entityId" = e."mangaId"
              WHERE r."externalId" = ANY(%s)
              GROUP BY v."editionId", v.number HAVING count(*) > 1
            ) d
            """,
            (external_ids,),
        ).fetchone()[0]
        assert counts == (10, 10, 101, 20)
        assert duplicates == duplicate_volumes == 0


@pytest.mark.skipif(
    not os.getenv("COLLECTOR_TEST_DATABASE_URL"),
    reason="Set COLLECTOR_TEST_DATABASE_URL to an isolated PostgreSQL test database.",
)
def test_postgres_backfill_checkpoint_can_resume_and_reset_without_deleting_data():
    database_url = os.environ["COLLECTOR_TEST_DATABASE_URL"]
    scope = f"checkpoint-test-{uuid.uuid4().hex}"
    repository = CollectorRepository(database_url)
    repository.save_checkpoint(
        scope=scope,
        page=4,
        offset=2,
        last_external_id="1234",
        processed_count=15,
        status="pending",
    )

    checkpoint = repository.get_checkpoint(scope)
    assert checkpoint == {
        "current_page": 4,
        "current_offset": 2,
        "last_external_id": "1234",
        "processed_count": 15,
        "status": "pending",
    }
    assert repository.acquire_checkpoint(scope, page=4) is True
    assert repository.acquire_checkpoint(scope, page=4) is False
    assert repository.reset_checkpoint(scope) is False

    repository.save_checkpoint(
        scope=scope,
        page=4,
        last_external_id="1234",
        processed_count=15,
        status="failed",
    )
    assert repository.reset_checkpoint(scope) is True
    reset = repository.get_checkpoint(scope)
    assert reset["current_page"] == 1
    assert reset["current_offset"] == 0

    with psycopg.connect(database_url) as connection:
        connection.execute(
            'DELETE FROM collector_checkpoints WHERE "sourceId" = %s AND scope = %s',
            ("bbm", scope),
        )

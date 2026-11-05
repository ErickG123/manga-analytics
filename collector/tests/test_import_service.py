import hashlib
import logging
from decimal import Decimal
from pathlib import Path

from collector.src.clients.bbm_client import SourceRateLimited
from collector.src.models.entities import ImportResult, MangaCollected, VolumeCollected
from collector.src.repositories.collector_repository import CollectorRepository
from collector.src.services.import_service import ImportService

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bbm_page.html"


class FixtureClient:
    def __init__(self, metadata=None):
        self.metadata = metadata or [
            {
                "id": 123,
                "title": {"rendered": "One Piece Aventura Escolar"},
                "link": "https://blogbbm.com/obra/123",
                "modified": "2026-11-04T12:00:00",
            }
        ]
        self.fetch_calls = []

    def iter_catalog_metadata(self, limit=None):
        yield from self.metadata[:limit]

    def fetch_page(self, page_id):
        self.fetch_calls.append(page_id)
        return {"content": {"rendered": FIXTURE.read_text(encoding="utf-8")}}


class RecordingRepository:
    def __init__(self):
        self.saved = []

    def save_manga(self, manga):
        self.saved.append(manga)
        return "created", "local-fixture"

    def get_sync_states(self, _external_ids):
        return {}


def test_dry_run_uses_local_fixture_and_logs_pipeline_durations(caplog):
    caplog.set_level(logging.INFO, logger="manga_atlas_collector")
    repository = RecordingRepository()
    service = ImportService(client=FixtureClient(), repository=repository)

    result = service.run_import(limit=1, dry_run=True)

    assert isinstance(result, ImportResult)
    assert result.processed == 1
    assert result.created == 0
    assert result.would_create == 1
    assert repository.saved == []
    assert "fetch_total_duration_ms=" in caplog.text
    assert "parse_duration_ms=" in caplog.text
    assert "validation_duration_ms=" in caplog.text


def test_persist_mode_times_repository_call_without_network():
    repository = RecordingRepository()
    service = ImportService(client=FixtureClient(), repository=repository)

    result = service.run_import(limit=1, dry_run=False)

    assert result.created == 1
    assert len(repository.saved) == 1
    assert len(repository.saved[0].volumes) == 3


def test_repository_upserts_work_volumes_and_price_observations_idempotently(
    monkeypatch,
):
    import collector.src.repositories.collector_repository as repository_module

    class FakeCursor:
        def __init__(self):
            self.executed = []
            self.last_query = ""

        def execute(self, query, params=()):
            self.executed.append((query, params))
            self.last_query = query.lower()

        def fetchone(self):
            if "insert into publishers" in self.last_query:
                return ("publisher-id",)
            if "insert into mangas" in self.last_query:
                return ("entity-id",)
            if "insert into editions" in self.last_query:
                return ("edition-id",)
            return None

        def fetchall(self):
            if (
                "insert into volumes" in self.last_query
                or "select id, number from volumes" in self.last_query
            ):
                return [("volume-1", 1)]
            return []

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConnection:
        def __init__(self, cursor):
            self.cursor_value = cursor
            self.committed = False

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return self.cursor_value

        def commit(self):
            self.committed = True

    cursor = FakeCursor()
    connection = FakeConnection(cursor)

    class ConnectContext:
        def __enter__(self):
            return connection

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(
        repository_module.psycopg, "connect", lambda _url: ConnectContext()
    )
    repo = CollectorRepository("postgresql://fixture.invalid/test")
    manga = MangaCollected(
        title="Mangá de Fixture",
        publisher="Editora Fixture",
        external_id="fixture-1",
        external_url="https://fixture.invalid/obra/1",
        volumes=[VolumeCollected(number=1, price_amount=Decimal("19.90"))],
    )

    outcome = repo.save_manga(manga)
    assert outcome.status == "created"
    assert outcome.manga_id == "entity-id"
    assert outcome.volumes_created == 1
    assert outcome.price_changes == 1
    queries = [query.lower() for query, _params in cursor.executed]
    assert any("insert into external_references" in query for query in queries)
    assert any(
        'on conflict ("editionid", number)' in query and "insert into volumes" in query
        for query in queries
    )
    assert sum("insert into volume_prices" in query for query in queries) == 1
    assert sum("insert into price_observations" in query for query in queries) == 1
    assert connection.committed


def test_incremental_sync_skips_detail_fetch_when_modified_is_current():
    metadata = [
        {
            "id": 123,
            "title": {"rendered": "Existing work"},
            "modified": "2026-11-04T12:00:00",
        }
    ]
    client = FixtureClient(metadata)

    class ExistingRepository(RecordingRepository):
        def get_sync_states(self, _external_ids):
            return {
                "123": {
                    "source_modified_at": "2026-11-04T12:00:00",
                    "sync_status": "complete",
                }
            }

    result = ImportService(client=client, repository=ExistingRepository()).run_import(
        limit=1
    )

    assert result.selected == 1
    assert result.processed == 0
    assert result.unchanged == 1
    assert client.fetch_calls == []


def test_force_refresh_downloads_details_but_skips_unchanged_content():
    metadata = [
        {
            "id": 123,
            "title": {"rendered": "One Piece Aventura Escolar"},
            "modified": "2026-11-04T12:00:00",
        }
    ]
    client = FixtureClient(metadata)
    html = FIXTURE.read_text(encoding="utf-8")
    digest = hashlib.sha256(html.encode("utf-8")).hexdigest()

    class ExistingRepository(RecordingRepository):
        def get_sync_states(self, _external_ids):
            return {
                "123": {
                    "source_modified_at": "2026-11-04T12:00:00",
                    "content_hash": digest,
                    "sync_status": "complete",
                }
            }

    repository = ExistingRepository()
    result = ImportService(client=client, repository=repository).run_import(
        limit=1, force_refresh=True
    )

    assert client.fetch_calls == [123]
    assert result.unchanged == 1
    assert repository.saved == []


def test_incomplete_or_conflicting_volume_table_is_not_persisted():
    html = """<table><tr><th>Volume</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>27</td><td>15/01/2025</td><td>R$ 40,90</td></tr>
    <tr><td>27</td><td>18/01/2025</td><td>R$ 49,90</td></tr></table>"""
    repository = RecordingRepository()

    class ConflictingFixtureClient(FixtureClient):
        def fetch_page(self, page_id):
            self.fetch_calls.append(page_id)
            return {"content": {"rendered": html}}

    result = ImportService(
        client=ConflictingFixtureClient(), repository=repository
    ).run_import(limit=1)

    assert result.failed == 1
    assert "27" in result.errors[0]
    assert repository.saved == []


def test_rate_limit_persists_source_suspension_and_preserves_checkpoint():
    class RateLimitClient(FixtureClient):
        def fetch_page(self, page_id):
            self.fetch_calls.append(page_id)
            raise SourceRateLimited(30)

    class RecoveryRepository(RecordingRepository):
        def __init__(self):
            super().__init__()
            self.suspensions = []
            self.states = []

        def suspend_source(self, **kwargs):
            self.suspensions.append(kwargs)

        def get_source_state(self, _source_id):
            return None

        def create_import_job(self, **_kwargs):
            pass

        def finish_import_job(self, **kwargs):
            self.states.append(kwargs)

    client = RateLimitClient()
    repository = RecoveryRepository()
    checkpoints = []
    result = ImportService(client=client, repository=repository).run_import(
        limit=1,
        item_checkpoint=lambda offset, external_id: checkpoints.append(
            (offset, external_id)
        ),
    )

    assert client.fetch_calls == [123]
    assert repository.suspensions[0]["status"] == "suspended"
    assert repository.suspensions[0]["seconds"] == 30
    assert checkpoints == []
    assert result.termination_status == "rate_limited"
    assert repository.states[0]["status"] == "rate_limited"


def test_excessive_rate_limit_header_requires_manual_review():
    class RateLimitClient(FixtureClient):
        def fetch_page(self, page_id):
            self.fetch_calls.append(page_id)
            raise SourceRateLimited(31 * 24 * 60 * 60)

    class RecoveryRepository(RecordingRepository):
        def __init__(self):
            super().__init__()
            self.suspensions = []

        def get_source_state(self, _source_id):
            return None

        def suspend_source(self, **kwargs):
            self.suspensions.append(kwargs)

        def create_import_job(self, **_kwargs):
            pass

        def finish_import_job(self, **_kwargs):
            pass

    repository = RecoveryRepository()
    result = ImportService(client=RateLimitClient(), repository=repository).run_import(
        limit=1
    )

    assert repository.suspensions[0]["status"] == "blocked"
    assert repository.suspensions[0]["seconds"] is None
    assert result.termination_status == "blocked"


def test_active_source_suspension_blocks_run_before_remote_discovery():
    class BlockedRepository(RecordingRepository):
        def get_source_state(self, _source_id):
            from datetime import UTC, datetime, timedelta

            return {
                "status": "suspended",
                "suspended_until": datetime.now(UTC) + timedelta(minutes=5),
                "reason": "HTTP 429",
            }

    client = FixtureClient()
    result = ImportService(client=client, repository=BlockedRepository()).run_import(
        limit=1
    )

    assert client.fetch_calls == []
    assert result.termination_status == "rate_limited"
    assert result.discovered == 0


def test_retry_failed_processes_only_retryable_records_and_resolves_success():
    class RetryRepository(RecordingRepository):
        def __init__(self):
            super().__init__()
            self.resolved = []

        def list_retryable_failures(self, limit):
            return [
                {
                    "id": 9123,
                    "link": "https://blogbbm.com/obra/9123",
                    "title": {"rendered": ""},
                }
            ][:limit]

        def resolve_collector_failure(self, external_id):
            self.resolved.append(external_id)

    class RetryingClient(FixtureClient):
        def iter_catalog_metadata(self, limit=None, **_kwargs):
            raise AssertionError("retry-failed must not rediscover the whole catalog")

        def fetch_page(self, page_id):
            self.fetch_calls.append(page_id)
            return {
                "title": {"rendered": "Recovered work"},
                "content": {"rendered": FIXTURE.read_text(encoding="utf-8")},
            }

    repository = RetryRepository()
    client = RetryingClient()
    result = ImportService(client=client, repository=repository).run_import(
        limit=1, force_refresh=True, run_type="retry_failed", retry_failed=True
    )

    assert client.fetch_calls == [9123]
    assert result.processed == 1
    assert result.created == 1
    assert repository.resolved == ["9123"]

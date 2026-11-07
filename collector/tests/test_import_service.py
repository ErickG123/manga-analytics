import hashlib
import logging
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from collector.src.cli import _backfill_exit_code
from collector.src.clients.bbm_client import SourceRateLimited
from collector.src.models.entities import ImportResult, MangaCollected, VolumeCollected
from collector.src.repositories.collector_repository import CollectorRepository
from collector.src.services.import_service import ImportService

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bbm_page.html"


def test_repository_strips_typeorm_schema_parameter_and_preserves_other_options():
    repository = CollectorRepository(
        "postgresql://user:secret@db.example:5432/manga_atlas?schema=public&sslmode=require"
    )

    assert repository.db_url == (
        "postgresql://user:secret@db.example:5432/manga_atlas?sslmode=require"
    )


def test_repository_uses_ipv4_for_localhost_on_windows():
    url = CollectorRepository._normalize_database_url(
        "postgresql://user:secret@localhost:5432/manga_atlas?schema=public",
        windows_ipv4=True,
    )

    assert url == "postgresql://user:secret@127.0.0.1:5432/manga_atlas"


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
        self.discovery_kwargs = None

    def iter_catalog_metadata(self, limit=None, **kwargs):
        self.discovery_kwargs = kwargs
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


def test_successful_backfill_resolves_a_previously_queued_failure():
    class FailureAwareRepository(RecordingRepository):
        def __init__(self):
            super().__init__()
            self.resolved_failures = []

        def resolve_collector_failure(self, external_id):
            self.resolved_failures.append(external_id)

    metadata = [
        {
            "id": 123,
            "title": {"rendered": "Recovered work"},
            "link": "https://blogbbm.com/obra/123",
            "modified": "2026-11-04T12:00:00",
            "content": {"rendered": FIXTURE.read_text(encoding="utf-8")},
        }
    ]
    repository = FailureAwareRepository()
    client = FixtureClient(metadata)
    result = ImportService(client=client, repository=repository).run_import(
        limit=100, run_type="backfill", force_refresh=True, force_reparse=True
    )

    assert result.created == 1
    assert repository.resolved_failures == ["123"]
    assert client.fetch_calls == []
    assert client.discovery_kwargs == {
        "start_page": 1,
        "start_offset": 0,
        "per_page": 100,
        "max_pages": 1,
        "orderby": "modified",
        "order": "desc",
        "include_content": True,
        "respect_run_limits": False,
    }


def test_backfill_falls_back_to_detail_when_list_entry_has_no_html():
    client = FixtureClient()
    service = ImportService(client=client, repository=RecordingRepository())

    result = service.run_import(
        limit=1,
        run_type="backfill",
        force_refresh=True,
        force_reparse=True,
    )

    assert result.created == 1
    assert client.fetch_calls == [123]


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


def test_sync_uses_bounded_modified_window_and_imports_only_changed_fichas():
    after = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
    before = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
    metadata = [
        {
            "id": 123,
            "title": {"rendered": "Already current"},
            "link": "https://blogbbm.com/obra/123",
            "modified": "2026-11-05T12:30:00",
        },
        {
            "id": 456,
            "title": {"rendered": "Changed work"},
            "link": "https://blogbbm.com/obra/456",
            "modified": "2026-11-06T10:30:00",
        },
    ]

    class SyncFixtureClient(FixtureClient):
        def __init__(self):
            super().__init__(metadata)
            self.query = None

        def iter_catalog_metadata(self, limit=None, **kwargs):
            self.query = kwargs
            yield from self.metadata[:limit]

    class SyncRepository(RecordingRepository):
        def get_sync_states(self, _external_ids):
            return {
                "123": {
                    "source_modified_at": "2026-11-05T12:30:00",
                    "sync_status": "complete",
                },
                "456": {
                    "source_modified_at": "2026-11-04T09:00:00",
                    "sync_status": "complete",
                },
            }

    client = SyncFixtureClient()
    repository = SyncRepository()
    checkpoints = []

    result = ImportService(client=client, repository=repository).run_import(
        limit=2,
        run_type="sync",
        start_page=3,
        orderby="id",
        order="asc",
        max_pages=1,
        start_offset=0,
        modified_after=after,
        modified_before=before,
        item_checkpoint=lambda offset, external_id: checkpoints.append(
            (offset, external_id)
        ),
    )

    assert client.query == {
        "start_page": 3,
        "start_offset": 0,
        "per_page": 100,
        "max_pages": 1,
        "orderby": "id",
        "order": "asc",
        "modified_after": after,
        "modified_before": before,
        "include_content": True,
    }
    assert client.fetch_calls == [456]
    assert result.unchanged == 1
    assert result.created == 1
    assert checkpoints == [(1, "123"), (2, "456")]


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


def test_force_reparse_persists_even_when_source_content_hash_is_unchanged():
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
        limit=1, force_refresh=True, force_reparse=True
    )

    assert client.fetch_calls == [123]
    assert result.processed == 1
    assert result.unchanged == 0
    assert len(repository.saved) == 1


def test_conflicting_volume_rows_are_saved_as_variants_and_queued_for_review():
    html = """<table><tr><th>Volume</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>27</td><td>15/01/2025</td><td>R$ 40,90</td></tr>
    <tr><td>27</td><td>18/01/2025</td><td>R$ 49,90</td></tr></table>"""

    class FailureRecordingRepository(RecordingRepository):
        def __init__(self):
            super().__init__()
            self.failures = []

        def record_collector_failure(self, **failure):
            self.failures.append(failure)

    repository = FailureRecordingRepository()

    class ConflictingFixtureClient(FixtureClient):
        def fetch_page(self, page_id):
            self.fetch_calls.append(page_id)
            return {"content": {"rendered": html}}

    result = ImportService(
        client=ConflictingFixtureClient(), repository=repository
    ).run_import(limit=1)

    assert result.failed == 1
    assert "27" in result.errors[0]
    assert len(repository.saved) == 1
    assert repository.saved[0].volumes[0].number == 27
    assert repository.saved[0].volumes[0].price_amount == Decimal("40.90")
    assert repository.saved[0].volumes[0].variants[0].price_amount == Decimal("49.90")
    assert repository.failures[0]["status"] == "needs_review"


def test_incomplete_table_is_queued_for_retry_and_does_not_stop_batch():
    incomplete_html = "<p>Editora: Editora Fixture</p>"
    metadata = [
        {
            "id": 456,
            "title": {"rendered": "Ficha sem tabela"},
            "link": "https://blogbbm.com/obra/456",
        },
        {
            "id": 457,
            "title": {"rendered": "Ficha válida"},
            "link": "https://blogbbm.com/obra/457",
        },
    ]

    class MultiPageFixtureClient(FixtureClient):
        def fetch_page(self, page_id):
            self.fetch_calls.append(page_id)
            html = (
                incomplete_html
                if page_id == 456
                else FIXTURE.read_text(encoding="utf-8")
            )
            return {"content": {"rendered": html}}

    class FailureRecordingRepository(RecordingRepository):
        def __init__(self):
            super().__init__()
            self.failures = []

        def record_collector_failure(self, **failure):
            self.failures.append(failure)

    repository = FailureRecordingRepository()
    client = MultiPageFixtureClient(metadata)
    checkpoints = []
    result = ImportService(client=client, repository=repository).run_import(
        limit=2,
        item_checkpoint=lambda offset, external_id: checkpoints.append(
            (offset, external_id)
        ),
    )

    assert client.fetch_calls == [456, 457]
    assert result.failed == 1
    assert result.created == 2
    assert len(repository.saved) == 2
    assert repository.saved[0].external_id == "456"
    assert repository.saved[0].volumes == []
    assert repository.saved[0].sync_complete is False
    assert repository.saved[1].external_id == "457"
    assert repository.failures[0]["external_id"] == "456"
    assert repository.failures[0]["external_url"] == "https://blogbbm.com/obra/456"
    assert repository.failures[0]["category"] == "data_quality"
    assert repository.failures[0]["status"] == "needs_review"
    assert checkpoints == [(1, "456"), (2, "457")]


def test_backfill_exit_code_keeps_queued_item_errors_nonfatal():
    result = ImportResult(failed=1)

    assert _backfill_exit_code(result, []) == 0
    assert _backfill_exit_code(ImportResult(termination_status="rate_limited"), []) == 1
    assert _backfill_exit_code(ImportResult(retryable_failures=1), []) == 1
    assert _backfill_exit_code(ImportResult(), ["discovery failed"]) == 1


def test_retry_failed_includes_legacy_data_quality_records(monkeypatch):
    import collector.src.repositories.collector_repository as repository_module

    class FakeCursor:
        def __init__(self):
            self.query = ""

        def execute(self, query, params=()):
            self.query = query
            self.params = params

        def fetchall(self):
            return [("105580", "https://blogbbm.com/obra/105580")]

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConnection:
        def __init__(self, cursor):
            self.cursor_value = cursor

        def cursor(self):
            return self.cursor_value

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

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
    repository = CollectorRepository("postgresql://fixture.invalid/test")

    failures = repository.list_retryable_failures(5)

    assert failures == [
        {
            "id": "105580",
            "link": "https://blogbbm.com/obra/105580",
            "title": {"rendered": ""},
        }
    ]
    assert "category = 'data_quality' AND status = 'needs_review'" in cursor.query

    repository.resolve_collector_failure("105580")
    assert "category = 'data_quality' AND status = 'needs_review'" in cursor.query


def test_sync_window_initialization_and_resume(monkeypatch):
    import collector.src.repositories.collector_repository as repository_module

    cursor_at = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
    target_at = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
    existing_row = (1, 0, None, 0, "running", None, None, None, 300)
    created_row = (1, 0, None, 0, "running", cursor_at, target_at, None, 300)

    class FakeCursor:
        def __init__(self, rows):
            self.rows = iter(rows)
            self.queries = []

        def execute(self, query, params=()):
            self.queries.append((query, params))

        def fetchone(self):
            return next(self.rows)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConnection:
        def __init__(self, cursor):
            self.cursor_value = cursor

        def cursor(self):
            return self.cursor_value

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    cursor = FakeCursor([existing_row, created_row])
    connection = FakeConnection(cursor)

    class ConnectContext:
        def __enter__(self):
            return connection

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(
        repository_module.psycopg, "connect", lambda _url: ConnectContext()
    )
    repository = CollectorRepository("postgresql://fixture.invalid/test")

    initialized = repository.ensure_sync_window(
        initial_cursor=cursor_at, target_at=target_at
    )

    assert initialized["sync_cursor_at"] == cursor_at
    assert initialized["sync_target_at"] == target_at
    assert len(cursor.queries) == 2
    assert "FOR UPDATE" in cursor.queries[0][0]
    assert "syncTargetAt" in cursor.queries[1][0]
    assert cursor.queries[1][1] == (cursor_at, target_at)


def test_sync_window_resume_keeps_saved_page_and_target(monkeypatch):
    cursor_at = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
    target_at = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
    active_row = (
        4,
        35,
        "external-35",
        135,
        "running",
        cursor_at,
        target_at,
        None,
        3600,
    )

    class FakeCursor:
        def __init__(self):
            self.queries = []

        def execute(self, query, _params=()):
            self.queries.append(query)

        def fetchone(self):
            return active_row

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConnection:
        def __init__(self, cursor):
            self.cursor_value = cursor

        def cursor(self):
            return self.cursor_value

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    cursor = FakeCursor()
    connection = FakeConnection(cursor)

    class ConnectContext:
        def __enter__(self):
            return connection

        def __exit__(self, *_args):
            return False

    import collector.src.repositories.collector_repository as repository_module

    monkeypatch.setattr(
        repository_module.psycopg, "connect", lambda _url: ConnectContext()
    )
    checkpoint = CollectorRepository(
        "postgresql://fixture.invalid/test"
    ).ensure_sync_window(
        initial_cursor=None, target_at=datetime(2026, 11, 7, tzinfo=UTC)
    )

    assert checkpoint["current_page"] == 4
    assert checkpoint["current_offset"] == 35
    assert checkpoint["sync_cursor_at"] == cursor_at
    assert checkpoint["sync_target_at"] == target_at
    assert checkpoint["sync_overlap_seconds"] == 3600
    assert len(cursor.queries) == 1


def test_completing_sync_window_advances_cursor_and_keeps_overlap(monkeypatch):
    import collector.src.repositories.collector_repository as repository_module

    class FakeCursor:
        def __init__(self):
            self.query = ""
            self.params = ()

        def execute(self, query, params=()):
            self.query = query
            self.params = params

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConnection:
        def __init__(self, cursor):
            self.cursor_value = cursor

        def cursor(self):
            return self.cursor_value

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

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

    CollectorRepository("postgresql://fixture.invalid/test").complete_sync_window(
        processed_count=55
    )

    assert cursor.params == (55,)
    assert '"syncCursorAt" = "syncTargetAt"' in cursor.query
    assert '"syncTargetAt" = NULL' in cursor.query
    assert '"syncOverlapSeconds" = GREATEST' in cursor.query


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

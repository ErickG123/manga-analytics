from argparse import ArgumentParser, Namespace
from datetime import UTC, datetime

from collector.src import cli
from collector.src.models.entities import ImportResult

CURSOR_AT = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
TARGET_AT = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


class FakeRepository:
    def __init__(self, checkpoint=None):
        self.checkpoint = checkpoint
        self.saved = []
        self.completed = []
        self.statuses = []
        self.lock_calls = []

    def get_checkpoint(self, _scope):
        return self.checkpoint

    def get_sync_initial_cursor(self):
        return CURSOR_AT

    def acquire_checkpoint(self, **kwargs):
        self.lock_calls.append(kwargs)
        return True

    def ensure_sync_window(self, **_kwargs):
        self.checkpoint = {
            "current_page": 1,
            "current_offset": 0,
            "last_external_id": None,
            "processed_count": 0,
            "status": "running",
            "sync_cursor_at": CURSOR_AT,
            "sync_target_at": TARGET_AT,
            "sync_overlap_seconds": 300,
        }
        return self.checkpoint

    def save_checkpoint(self, **kwargs):
        self.saved.append(kwargs)
        self.checkpoint = {
            **self.checkpoint,
            "current_page": kwargs["page"],
            "current_offset": kwargs["offset"],
            "processed_count": kwargs["processed_count"],
            "status": kwargs["status"],
        }

    def complete_sync_window(self, **kwargs):
        self.completed.append(kwargs)
        self.checkpoint = {**self.checkpoint, "status": "completed", "current_page": 1}

    def set_checkpoint_status(self, status, scope):
        self.statuses.append((status, scope))
        if self.checkpoint:
            self.checkpoint = {**self.checkpoint, "status": status}


class FakeService:
    def __init__(self, repository):
        self.repository = repository
        self.client = self
        self.active_run_id = None
        self.result = ImportResult()
        self.discovery_errors = []

    def run_import(self, **kwargs):
        callback = kwargs["item_checkpoint"]
        if callback is not None and self.result.http_metrics.get("last_offset"):
            callback(
                int(self.result.http_metrics["last_offset"]),
                str(self.result.http_metrics.get("last_external_id", "")),
            )
        return self.result

    def metrics_snapshot(self):
        return {}


def sync_args(*, dry_run=False):
    return Namespace(
        limit=50,
        dry_run=dry_run,
        force_refresh=False,
        metrics_json=None,
    )


def test_sync_cli_completes_window_and_advances_cursor(monkeypatch):
    repository = FakeRepository()
    result = ImportResult(
        selected=2,
        processed=2,
        http_metrics={"catalog_end_reached": True, "last_page": 1},
    )
    monkeypatch.setattr(
        cli, "ImportService", lambda repository: _service(repository, result)
    )
    monkeypatch.setattr(cli, "_write_metrics", lambda _path, _result: None)

    monkeypatch.setattr(
        "collector.src.repositories.collector_repository.CollectorRepository",
        lambda: repository,
    )

    exit_code = cli._run_sync(sync_args(), ArgumentParser())

    assert exit_code == 0
    assert repository.lock_calls == [{"scope": "sync", "page": 1, "mode": "sync"}]
    assert repository.completed == [{"processed_count": 0}]
    assert repository.saved == []
    assert repository.checkpoint["status"] == "completed"


def test_sync_cli_saves_partial_page_and_resumes_offset(monkeypatch):
    repository = FakeRepository()
    result = ImportResult(
        selected=50,
        processed=50,
        http_metrics={
            "catalog_end_reached": False,
            "last_page": 1,
            "last_offset": 50,
            "last_external_id": "external-50",
        },
    )
    monkeypatch.setattr(
        cli, "ImportService", lambda repository: _service(repository, result)
    )
    monkeypatch.setattr(cli, "_write_metrics", lambda _path, _result: None)
    monkeypatch.setattr(
        "collector.src.repositories.collector_repository.CollectorRepository",
        lambda: repository,
    )

    exit_code = cli._run_sync(sync_args(), ArgumentParser())

    assert exit_code == 0
    assert repository.completed == []
    assert repository.saved == [
        {
            "scope": "sync",
            "mode": "sync",
            "page": 1,
            "offset": 50,
            "last_external_id": "external-50",
            "processed_count": 1,
            "status": "running",
        },
        {
            "scope": "sync",
            "mode": "sync",
            "page": 1,
            "offset": 50,
            "last_external_id": "external-50",
            "processed_count": 1,
            "status": "pending",
        },
    ]
    assert repository.checkpoint["status"] == "pending"


def test_sync_cli_does_not_advance_cursor_when_discovery_fails(monkeypatch):
    repository = FakeRepository()
    result = ImportResult(http_metrics={"catalog_end_reached": False})
    service = _service(repository, result)
    service.discovery_errors = ["timeout"]
    monkeypatch.setattr(cli, "ImportService", lambda repository: service)
    monkeypatch.setattr(cli, "_write_metrics", lambda _path, _result: None)
    monkeypatch.setattr(
        "collector.src.repositories.collector_repository.CollectorRepository",
        lambda: repository,
    )

    exit_code = cli._run_sync(sync_args(), ArgumentParser())

    assert exit_code == 1
    assert repository.completed == []
    assert repository.saved == []
    assert repository.statuses == [("failed", "sync")]


def test_sync_dry_run_does_not_acquire_or_write_checkpoint(monkeypatch):
    repository = FakeRepository()
    result = ImportResult(http_metrics={"catalog_end_reached": True})
    monkeypatch.setattr(
        cli, "ImportService", lambda repository: _service(repository, result)
    )
    monkeypatch.setattr(cli, "_write_metrics", lambda _path, _result: None)
    monkeypatch.setattr(
        "collector.src.repositories.collector_repository.CollectorRepository",
        lambda: repository,
    )

    exit_code = cli._run_sync(sync_args(dry_run=True), ArgumentParser())

    assert exit_code == 0
    assert repository.lock_calls == []
    assert repository.saved == []
    assert repository.completed == []


def _service(repository, result):
    service = FakeService(repository)
    service.result = result
    return service

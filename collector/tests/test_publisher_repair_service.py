from types import SimpleNamespace

from collector.src.services.publisher_repair_service import PublisherRepairService


class FakeClient:
    def __init__(self):
        self.config = SimpleNamespace(rate_limit_fallback_seconds=900)
        self.discovery_errors = []
        self.last_blocking_error = None
        self.calls = []
        self.entries = [
            {
                "id": 101,
                "title": {"rendered": "Obra JBC"},
                "content": {"rendered": "<p>Editora brasileira<br />: JBC</p>"},
            },
            {
                "id": 102,
                "title": {"rendered": "Sem editora"},
                "content": {"rendered": "<p>Sem informação da editora</p>"},
            },
        ]

    def iter_catalog_metadata(self, **kwargs):
        self.calls.append(kwargs)
        yield from self.entries

    def metrics_snapshot(self):
        return {"list_request_count": 1, "catalog_total_items": 2}


class FakeRepository:
    def __init__(self):
        self.updated = []
        self.job = None
        self.finished = None

    def get_source_state(self, _source):
        return None

    def get_last_publisher_repair_window(self):
        return None

    def has_unassigned_publisher(self, external_id, _previous_window=None):
        return external_id == "101"

    def repair_publisher(self, external_id, publisher, _previous_window=None):
        self.updated.append((external_id, publisher))
        return True

    def create_import_job(self, **kwargs):
        self.job = kwargs

    def finish_import_job(self, **kwargs):
        self.finished = kwargs


def test_publisher_repair_uses_batched_content_and_only_changes_publisher_links():
    client = FakeClient()
    repository = FakeRepository()

    result = PublisherRepairService(client, repository).run(limit=1000)

    assert result["catalog_items"] == 2
    assert result["updated"] == 1
    assert result["unknown_publisher"] == 1
    assert repository.updated == [("101", "JBC")]
    assert client.calls == [
        {
            "limit": 1000,
            "per_page": 100,
            "max_pages": 10,
            "orderby": "id",
            "order": "asc",
            "include_content": True,
            "respect_run_limits": False,
        }
    ]
    assert repository.finished["status"] == "completed"


def test_publisher_repair_dry_run_reports_matches_without_writing():
    client = FakeClient()
    repository = FakeRepository()

    result = PublisherRepairService(client, repository).run(limit=1000, dry_run=True)

    assert result["would_update"] == 1
    assert result["updated"] == 0
    assert result["unknown_publisher"] == 1
    assert repository.updated == []
    assert repository.job is None

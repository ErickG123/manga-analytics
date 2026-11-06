from datetime import UTC, datetime
from unittest.mock import MagicMock

import httpx
import pytest

from collector.src.clients.bbm_client import (
    BBMClient,
    CircuitBreakerOpenException,
    SourceAccessBlocked,
    SourceRateLimited,
    SourceRetryDeferred,
)
from collector.src.config import CollectorConfig


@pytest.fixture
def test_config():
    return CollectorConfig(
        enabled=True,
        base_url="https://blogbbm.com/wp-json/wp/v2/pages",
        parent_catalog_id=82066,
        user_agent="MangaAtlasCollectorTest/1.0",
        max_concurrency=1,
        min_request_interval_seconds=0.01,
        connect_timeout_seconds=2.0,
        read_timeout_seconds=2.0,
        max_retries=2,
        max_pages_per_run=2,
        max_items_per_run=5,
        max_run_duration_seconds=60,
        dry_run=True,
    )


def test_bbm_client_rate_limiting(test_config, monkeypatch):
    client = BBMClient(config=test_config)
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": 123}
    mock_resp.raise_for_status = MagicMock()

    client.client.get = MagicMock(return_value=mock_resp)

    import collector.src.clients.bbm_client as client_module

    clock = {"now": 0.0}
    sleeps = []

    def fake_sleep(duration):
        sleeps.append(duration)
        clock["now"] += duration

    monkeypatch.setattr(client_module.time, "monotonic", lambda: clock["now"])
    monkeypatch.setattr(client_module.time, "sleep", fake_sleep)
    client._last_request_time = 0.0
    client.fetch_page(1)
    client.fetch_page(2)

    assert sum(sleeps) >= test_config.min_request_interval_seconds
    assert client.metrics["rate_limit_wait_ms"] == pytest.approx(sum(sleeps) * 1000)
    assert client.client.get.call_count == 2


def test_bbm_client_circuit_breaker_on_429(test_config):
    client = BBMClient(config=test_config)
    resp_429 = MagicMock(spec=httpx.Response)
    resp_429.status_code = 429
    resp_429.headers = {"Retry-After": "1"}
    resp_429.raise_for_status.side_effect = httpx.HTTPStatusError(
        "too many requests",
        request=httpx.Request("GET", "https://blogbbm.com/"),
        response=resp_429,
    )

    client.client.get = MagicMock(return_value=resp_429)

    # A chamada falhará e abrirá o circuit breaker
    with pytest.raises(SourceRateLimited) as error:
        client.fetch_page(1)

    assert error.value.retry_after_seconds == 1
    assert client.client.get.call_count == 1
    assert client.metrics["status_429"] == 1
    assert client.metrics["circuit_breaker_openings"] == 1

    # Próxima chamada deve ser bloqueada imediatamente pelo circuit breaker
    with pytest.raises(CircuitBreakerOpenException):
        client.fetch_page(2)


def test_bbm_client_403_is_not_retried(test_config):
    client = BBMClient(config=test_config)
    response = MagicMock(spec=httpx.Response)
    response.status_code = 403
    response.headers = {}
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "forbidden",
        request=httpx.Request("GET", "https://blogbbm.com/"),
        response=response,
    )
    client.client.get = MagicMock(return_value=response)

    with pytest.raises(SourceAccessBlocked):
        client.fetch_page(1)

    assert client.client.get.call_count == 1
    assert client.metrics["status_403"] == 1
    assert client.metrics["circuit_breaker_openings"] == 1


@pytest.mark.parametrize(
    ("value", "expected"), [("45", 45), ("invalid", None), ("-5", 0), (None, None)]
)
def test_retry_after_seconds_parsing(value, expected):
    assert BBMClient._retry_after_seconds(value) == expected


def test_retry_after_http_date_parses_in_utc(monkeypatch, test_config):
    import collector.src.clients.bbm_client as client_module

    monkeypatch.setattr(client_module, "datetime", MagicMock())
    client_module.datetime.now.return_value = __import__("datetime").datetime(
        2026, 11, 4, tzinfo=__import__("datetime").UTC
    )
    result = BBMClient._retry_after_seconds("Wed, 04 Nov 2026 00:00:45 GMT")
    assert result == 45


def test_retry_5xx_is_limited_and_uses_exponential_backoff(monkeypatch, test_config):
    import collector.src.clients.bbm_client as client_module

    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response_500 = MagicMock(spec=httpx.Response)
    response_500.status_code = 500
    response_500.headers = {}
    response_200 = MagicMock(spec=httpx.Response)
    response_200.status_code = 200
    response_200.headers = {}
    response_200.raise_for_status = MagicMock()
    sleeps = []
    monkeypatch.setattr(client_module.random, "uniform", lambda low, high: 1.0)
    monkeypatch.setattr(client_module.time, "sleep", sleeps.append)
    client.client.get = MagicMock(side_effect=[response_500, response_200])

    client.fetch_page(5)

    assert client.client.get.call_count == 2
    assert sleeps == [5.0]
    assert client.metrics["retries"] == 1
    assert client.metrics["retries_successful"] == 1


def test_503_retry_after_above_wait_budget_is_not_retried_early(test_config):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 503
    response.headers = {"Retry-After": "120"}
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "unavailable",
        request=httpx.Request("GET", "https://blogbbm.com/"),
        response=response,
    )
    client.client.get = MagicMock(return_value=response)

    with pytest.raises(SourceRetryDeferred) as error:
        client.fetch_page(5)

    assert client.client.get.call_count == 1
    assert error.value.retry_after_seconds == 120


@pytest.mark.parametrize(
    "error", [httpx.TimeoutException("timeout"), httpx.ConnectError("connect")]
)
def test_transport_failure_retries_then_succeeds(monkeypatch, test_config, error):
    import collector.src.clients.bbm_client as client_module

    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.headers = {}
    response.raise_for_status = MagicMock()
    client.client.get = MagicMock(side_effect=[error, response])
    sleeps = []
    monkeypatch.setattr(client_module.time, "sleep", sleeps.append)
    monkeypatch.setattr(client_module.random, "uniform", lambda low, high: 1.0)

    client.fetch_page(5)

    assert client.client.get.call_count == 2
    assert sleeps == [5.0]
    assert client.metrics["retries_successful"] == 1


@pytest.mark.parametrize("status_code", [500, 502, 504])
def test_transient_server_statuses_retry(monkeypatch, test_config, status_code):
    import collector.src.clients.bbm_client as client_module

    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    transient = MagicMock(spec=httpx.Response)
    transient.status_code = status_code
    transient.headers = {}
    success = MagicMock(spec=httpx.Response)
    success.status_code = 200
    success.headers = {}
    success.raise_for_status = MagicMock()
    client.client.get = MagicMock(side_effect=[transient, success])
    monkeypatch.setattr(client_module.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(client_module.random, "uniform", lambda low, high: 1.0)

    client.fetch_page(5)

    assert client.client.get.call_count == 2


def test_exhausted_timeout_stops_at_total_attempt_limit(monkeypatch, test_config):
    import collector.src.clients.bbm_client as client_module

    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    client.client.get = MagicMock(side_effect=httpx.TimeoutException("timeout"))
    monkeypatch.setattr(client_module.time, "sleep", lambda _seconds: None)

    with pytest.raises(httpx.TimeoutException):
        client.fetch_page(5)

    assert client.client.get.call_count == test_config.max_retries
    assert client.metrics["retries_exhausted"] == 1


def test_permanent_404_is_not_retried(test_config):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 404
    response.headers = {}
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "not found",
        request=httpx.Request("GET", "https://blogbbm.com/pages/5"),
        response=response,
    )
    client.client.get = MagicMock(return_value=response)

    with pytest.raises(httpx.HTTPStatusError):
        client.fetch_page(5)

    assert client.client.get.call_count == 1


def test_bbm_client_ssrf_protection(test_config):
    client = BBMClient(config=test_config)

    # Requisição para host não autorizado deve ser rejeitada
    with pytest.raises(ValueError, match="não autorizado"):
        client._get_with_retry("https://evil-site.com/pages/1")


def test_catalog_metadata_advances_pages_and_uses_stable_order(test_config):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    first = MagicMock(spec=httpx.Response)
    first.status_code = 200
    first.json.return_value = [{"id": 11}, {"id": 12}]
    first.headers = {"x-wp-totalpages": "2"}
    first.raise_for_status = MagicMock()
    second = MagicMock(spec=httpx.Response)
    second.status_code = 200
    second.json.return_value = [{"id": 13}]
    second.headers = {"x-wp-totalpages": "2"}
    second.raise_for_status = MagicMock()
    client.client.get = MagicMock(side_effect=[first, second])

    entries = list(
        client.iter_catalog_metadata(
            limit=3, per_page=2, orderby="id", order="asc", max_pages=2
        )
    )

    assert [entry["id"] for entry in entries] == [11, 12, 13]
    assert [
        call.kwargs["params"]["page"] for call in client.client.get.call_args_list
    ] == [1, 2]
    assert all(
        call.kwargs["params"]["orderby"] == "id"
        for call in client.client.get.call_args_list
    )


def test_catalog_metadata_falls_back_to_short_page_without_pagination_headers(
    test_config,
):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = [{"id": 11}]
    response.headers = {}
    response.raise_for_status = MagicMock()
    client.client.get = MagicMock(return_value=response)

    assert list(client.iter_catalog_metadata(limit=3, per_page=3)) == [{"id": 11}]
    assert client.client.get.call_count == 1
    assert client.metrics["catalog_end_reached"] is True


def test_catalog_metadata_can_resume_at_an_offset_within_a_page(test_config):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = [{"id": 11}, {"id": 12}, {"id": 13}]
    response.headers = {"x-wp-totalpages": "1"}
    response.raise_for_status = MagicMock()
    client.client.get = MagicMock(return_value=response)

    entries = list(client.iter_catalog_metadata(limit=2, per_page=3, start_offset=1))

    assert entries == [{"id": 12}, {"id": 13}]
    assert client.metrics["last_offset"] == 3


def test_catalog_metadata_applies_modified_window_as_utc(test_config):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = []
    response.headers = {"x-wp-totalpages": "0"}
    response.raise_for_status = MagicMock()
    client.client.get = MagicMock(return_value=response)

    list(
        client.iter_catalog_metadata(
            limit=10,
            modified_after=datetime(2026, 11, 5, 12, 0, tzinfo=UTC),
            modified_before=datetime(2026, 11, 6, 12, 0, tzinfo=UTC),
        )
    )

    params = client.client.get.call_args.kwargs["params"]
    assert params["modified_after"] == "2026-11-05T12:00:00Z"
    assert params["modified_before"] == "2026-11-06T12:00:00Z"
    assert client.metrics["catalog_end_reached"] is True


def test_catalog_metadata_rejects_invalid_payload(test_config):
    client = BBMClient(config=test_config)
    client._wait_for_rate_limit = MagicMock()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {"id": 11}
    response.headers = {}
    response.raise_for_status = MagicMock()
    client.client.get = MagicMock(return_value=response)

    assert list(client.iter_catalog_metadata(limit=3)) == []
    assert client.discovery_errors

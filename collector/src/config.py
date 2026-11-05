"""Configurações centralizadas, seguras e validadas para o Collector Python."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


def _load_project_env() -> None:
    """Load simple KEY=VALUE settings from the repository .env without overriding process env."""
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if not separator or not key.strip() or key.lstrip().startswith("#"):
            continue
        value = value.strip().strip("\"'")
        os.environ.setdefault(key.strip(), value)


@dataclass(frozen=True)
class CollectorConfig:
    enabled: bool
    base_url: str
    parent_catalog_id: int
    user_agent: str
    max_concurrency: int
    min_request_interval_seconds: float
    connect_timeout_seconds: float
    read_timeout_seconds: float
    max_retries: int
    max_pages_per_run: int
    max_items_per_run: int
    max_run_duration_seconds: int
    dry_run: bool
    http_retry_base_delay_seconds: float = 5.0
    http_retry_max_delay_seconds: float = 60.0
    rate_limit_fallback_seconds: int = 900

    @classmethod
    def from_env(cls) -> CollectorConfig:
        _load_project_env()
        base_url = os.getenv(
            "COLLECTOR_BASE_URL", "https://blogbbm.com/wp-json/wp/v2/pages"
        )
        parsed = urlparse(base_url)
        # Proteção SSRF: Apenas HTTP/HTTPS e hosts estritamente validados
        allowed_hosts = ("blogbbm.com", "localhost", "127.0.0.1")
        if parsed.scheme not in ("http", "https") or (
            parsed.hostname and parsed.hostname not in allowed_hosts
        ):
            raise ValueError(f"Host não autorizado para coleta: {parsed.hostname}")

        return cls(
            enabled=os.getenv("COLLECTOR_ENABLED", "true").lower()
            in ("true", "1", "yes"),
            base_url=base_url,
            parent_catalog_id=int(os.getenv("COLLECTOR_PARENT_CATALOG_ID", "82066")),
            user_agent=os.getenv(
                "COLLECTOR_USER_AGENT",
                "MangaAtlasCollector/1.1 (+https://github.com/ErickG123/manga-analytics; research@manga-atlas.local)",
            ),
            max_concurrency=max(1, int(os.getenv("COLLECTOR_MAX_CONCURRENCY", "1"))),
            min_request_interval_seconds=max(
                5.0, float(os.getenv("COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS", "5.0"))
            ),
            connect_timeout_seconds=float(
                os.getenv("COLLECTOR_CONNECT_TIMEOUT_SECONDS", "10.0")
            ),
            read_timeout_seconds=float(
                os.getenv("COLLECTOR_READ_TIMEOUT_SECONDS", "30.0")
            ),
            max_retries=max(1, min(5, int(os.getenv("COLLECTOR_MAX_RETRIES", "3")))),
            http_retry_base_delay_seconds=max(
                1.0, float(os.getenv("COLLECTOR_HTTP_RETRY_BASE_DELAY_SECONDS", "5"))
            ),
            http_retry_max_delay_seconds=max(
                1.0,
                min(
                    60.0,
                    float(os.getenv("COLLECTOR_HTTP_RETRY_MAX_DELAY_SECONDS", "60")),
                ),
            ),
            rate_limit_fallback_seconds=max(
                60, int(os.getenv("COLLECTOR_RATE_LIMIT_FALLBACK_SECONDS", "900"))
            ),
            max_pages_per_run=int(os.getenv("COLLECTOR_MAX_PAGES_PER_RUN", "5")),
            max_items_per_run=int(os.getenv("COLLECTOR_MAX_ITEMS_PER_RUN", "50")),
            max_run_duration_seconds=int(
                os.getenv("COLLECTOR_MAX_RUN_DURATION_SECONDS", "1800")
            ),
            dry_run=os.getenv("COLLECTOR_DRY_RUN", "false").lower()
            in ("true", "1", "yes"),
        )

"""Cliente HTTP robusto para a BBM com Rate Limiting, Retry-After, Backoff e Circuit Breaker."""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from collector.src.config import CollectorConfig

logger = logging.getLogger("manga_atlas_collector.client")


class CircuitBreakerOpenException(Exception):
    """Exceção levantada quando o circuito de requisições foi aberto para proteger a fonte."""


class BBMClient:
    def __init__(self, config: CollectorConfig | None = None):
        self.config = config or CollectorConfig.from_env()
        self._last_request_time: float = 0.0
        self._consecutive_failures: int = 0
        self._circuit_open_until: float = 0.0
        self._failure_threshold: int = 5
        self._cooldown_seconds: float = 60.0
        self.reset_metrics()

        # Validação estrita do host de destino (SSRF)
        parsed = urlparse(self.config.base_url)
        self.allowed_host = parsed.hostname

        self.client = httpx.Client(
            headers={"User-Agent": self.config.user_agent},
            timeout=httpx.Timeout(
                self.config.read_timeout_seconds,
                connect=self.config.connect_timeout_seconds,
            ),
            follow_redirects=False,  # Não segue redirects cegamente para prevenir redirecionamentos SSRF
        )

    def _wait_for_rate_limit(self) -> None:
        """Garante o intervalo mínimo obrigatório entre requisições consecutivas."""
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self.config.min_request_interval_seconds:
            sleep_duration = self.config.min_request_interval_seconds - elapsed
            time.sleep(sleep_duration)
            self.metrics["rate_limit_wait_ms"] += sleep_duration * 1000
        self._last_request_time = time.monotonic()

    def _check_circuit(self) -> None:
        """Verifica se o circuito está aberto devido a falhas consecutivas ou bloqueios."""
        now = time.monotonic()
        if now < self._circuit_open_until:
            wait_remaining = int(self._circuit_open_until - now)
            raise CircuitBreakerOpenException(
                f"Circuito aberto preventivamente devido a restrições/erros da fonte. Aguardando {wait_remaining}s."
            )

    def _record_success(self) -> None:
        self._consecutive_failures = 0

    def _record_failure(self, status_code: int | None = None) -> None:
        self._consecutive_failures += 1
        # Se receber 429 ou 403, suspende imediatamente
        if (
            status_code in (429, 403)
            or self._consecutive_failures >= self._failure_threshold
        ):
            self._circuit_open_until = time.monotonic() + self._cooldown_seconds
            self.metrics["circuit_breaker_openings"] += 1
            logger.warning(
                f"Abrindo circuit breaker por {self._cooldown_seconds}s após status={status_code} "
                f"(falhas consecutivas={self._consecutive_failures})."
            )

    def _get_with_retry(
        self, url: str, params: dict[str, Any] | None = None
    ) -> httpx.Response:
        self._check_circuit()

        # Validação de segurança da URL
        parsed = urlparse(url)
        if parsed.hostname != self.allowed_host:
            raise ValueError(
                f"Requisição bloqueada para destino não autorizado: {parsed.hostname}"
            )

        retries = self.config.max_retries
        request_kind = (
            "detail" if params and "content" in params.get("_fields", "") else "list"
        )
        for attempt in range(retries):
            self._wait_for_rate_limit()
            if attempt:
                self.metrics["retries"] += 1
            request_started = time.perf_counter()
            try:
                response = self.client.get(url, params=params)
                self.metrics["status_403"] += int(response.status_code == 403)
                self.metrics["status_429"] += int(response.status_code == 429)
                self.metrics["status_5xx"] += int(500 <= response.status_code <= 599)
                logger.info(
                    "HTTP %s %s completed in %.3fs",
                    response.status_code,
                    parsed.path,
                    time.perf_counter() - request_started,
                )

                # HTTP 429 Too Many Requests -> Respeita Retry-After
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    delay = 30
                    if retry_after:
                        if retry_after.isdigit():
                            delay = int(retry_after)
                        else:
                            try:
                                retry_at = parsedate_to_datetime(retry_after)
                                delay = max(
                                    0,
                                    int((retry_at - datetime.now(UTC)).total_seconds()),
                                )
                            except (TypeError, ValueError, OverflowError):
                                pass
                    logger.warning(
                        f"HTTP 429 recebido! Respeitando Retry-After de {delay}s..."
                    )
                    self._record_failure(429)
                    time.sleep(delay)
                    self.metrics["rate_limit_wait_ms"] += delay * 1000
                    response.raise_for_status()

                # HTTP 403 Forbidden -> Interrupção imediata e não contorno
                if response.status_code == 403:
                    logger.error(
                        "HTTP 403 Forbidden: Acesso rejeitado pela fonte. Interrompendo sem retry."
                    )
                    self._record_failure(403)
                    response.raise_for_status()

                # Erros Transitórios 5xx -> Exponential backoff com jitter
                if response.status_code in (500, 502, 503, 504):
                    self._record_failure(response.status_code)
                    jitter = random.uniform(0.5, 1.5)
                    backoff = (
                        (2**attempt) * self.config.min_request_interval_seconds * jitter
                    )
                    logger.warning(
                        f"Erro {response.status_code} na tentativa {attempt + 1}. Backoff de {backoff:.2f}s..."
                    )
                    time.sleep(backoff)
                    continue

                response.raise_for_status()
                self._record_success()
                return response

            except httpx.HTTPError as exc:
                self.metrics["timeouts"] += int(isinstance(exc, httpx.TimeoutException))
                logger.warning(
                    "HTTP request %s failed after %.3fs: %s",
                    parsed.path,
                    time.perf_counter() - request_started,
                    exc,
                )
                if exc.response is not None and exc.response.status_code == 403:
                    raise
                if exc.response is not None and exc.response.status_code == 429:
                    raise
                if attempt == retries - 1:
                    self._record_failure()
                    raise
                jitter = random.uniform(0.5, 1.5)
                time.sleep((2**attempt) * jitter)
            finally:
                request_ms = (time.perf_counter() - request_started) * 1000
                self.metrics["http_duration_ms"] += request_ms
                self.metrics["http_request_count"] += 1
                self.metrics[f"{request_kind}_request_count"] += 1
                self.metrics["http_max_request_ms"] = max(
                    self.metrics["http_max_request_ms"], request_ms
                )

        raise RuntimeError(f"Falha ao requisitar {url} após {retries} tentativas")

    def fetch_page(self, page_id: int) -> dict[str, Any]:
        url = f"{self.config.base_url}/{page_id}"
        resp = self._get_with_retry(
            url, {"_fields": "id,title,link,modified,content,parent"}
        )
        return resp.json()

    def reset_metrics(self) -> None:
        self.discovery_errors: list[str] = []
        self.metrics: dict[str, int | float] = {
            "http_request_count": 0,
            "list_request_count": 0,
            "detail_request_count": 0,
            "http_duration_ms": 0.0,
            "http_max_request_ms": 0.0,
            "rate_limit_wait_ms": 0.0,
            "retries": 0,
            "timeouts": 0,
            "status_403": 0,
            "status_429": 0,
            "status_5xx": 0,
            "circuit_breaker_openings": 0,
            "list_pages": 0,
            "discovered": 0,
            "last_page": 0,
            "catalog_total_pages": 0,
            "catalog_total_items": 0,
            "last_external_id": "",
            "catalog_end_reached": False,
        }

    def metrics_snapshot(self) -> dict[str, int | float]:
        result = dict(self.metrics)
        request_count = int(result["http_request_count"])
        result["http_average_request_ms"] = (
            float(result["http_duration_ms"]) / request_count if request_count else 0.0
        )
        return result

    def iter_catalog_metadata(
        self,
        limit: int | None = None,
        *,
        start_page: int = 1,
        start_offset: int = 0,
        per_page: int | None = None,
        max_pages: int | None = None,
        orderby: str = "modified",
        order: str = "desc",
    ) -> Iterator[dict[str, Any]]:
        if start_page < 1:
            raise ValueError("start_page deve ser maior que zero")
        page = start_page
        count = 0
        requested_limit = limit if limit is not None else self.config.max_items_per_run
        max_items = min(requested_limit, self.config.max_items_per_run)
        page_size = max(1, min(100, per_page or max_items))
        page_limit = min(
            max_pages or self.config.max_pages_per_run, self.config.max_pages_per_run
        )
        pages_read = 0

        while pages_read < page_limit and count < max_items:
            params = {
                "parent": self.config.parent_catalog_id,
                "per_page": page_size,
                "page": page,
                "_fields": "id,title,link,modified,parent",
                "orderby": orderby,
                "order": order,
            }
            try:
                resp = self._get_with_retry(self.config.base_url, params)
            except (httpx.HTTPError, CircuitBreakerOpenException) as exc:
                self.discovery_errors.append(str(exc))
                logger.error(f"Interrompendo iteração do catálogo: {exc}")
                break

            entries = resp.json()
            if not isinstance(entries, list):
                self.discovery_errors.append(
                    f"Resposta inválida na página {page}: esperado array"
                )
                break
            self.metrics["list_pages"] += 1
            pages_read += 1
            self.metrics["last_page"] = page
            total_pages_header = resp.headers.get("x-wp-totalpages")
            total_items_header = resp.headers.get("x-wp-total")
            try:
                total_items = int(total_items_header) if total_items_header else None
            except (TypeError, ValueError):
                total_items = None
            if total_items is not None:
                self.metrics["catalog_total_items"] = max(
                    int(self.metrics["catalog_total_items"]), total_items
                )
            try:
                total_pages = int(total_pages_header) if total_pages_header else None
            except (TypeError, ValueError):
                total_pages = None
            if total_pages is not None:
                self.metrics["catalog_total_pages"] = max(
                    int(self.metrics["catalog_total_pages"]), total_pages
                )
            if not entries:
                self.metrics["catalog_end_reached"] = True
                break

            for entry_offset, entry in enumerate(entries):
                if page == start_page and entry_offset < start_offset:
                    continue
                yield entry
                count += 1
                self.metrics["discovered"] += 1
                self.metrics["last_external_id"] = str(entry.get("id", ""))
                self.metrics["last_offset"] = entry_offset + 1
                if count >= max_items:
                    return

            if total_pages is not None and total_pages < page:
                self.discovery_errors.append(
                    f"Header X-WP-TotalPages inconsistente ({total_pages}) na página {page}"
                )
                if len(entries) < page_size:
                    break
            if (total_pages is not None and page >= total_pages) or len(
                entries
            ) < page_size:
                self.metrics["catalog_end_reached"] = True
                break
            page += 1

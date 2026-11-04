"""Cliente HTTP robusto para a BBM com Rate Limiting, Retry-After, Backoff e Circuit Breaker."""
from __future__ import annotations

import logging
import random
import time
from collections.abc import Iterator
from typing import Any
from urllib.parse import urlparse

import httpx

from collector.src.config import CollectorConfig

logger = logging.getLogger("manga_atlas_collector.client")


class CircuitBreakerOpenException(Exception):
    """Exceção levantada quando o circuito de requisições foi aberto para proteger a fonte."""
    pass


class BBMClient:
    def __init__(self, config: CollectorConfig | None = None):
        self.config = config or CollectorConfig.from_env()
        self._last_request_time: float = 0.0
        self._consecutive_failures: int = 0
        self._circuit_open_until: float = 0.0
        self._failure_threshold: int = 5
        self._cooldown_seconds: float = 60.0

        # Validação estrita do host de destino (SSRF)
        parsed = urlparse(self.config.base_url)
        self.allowed_host = parsed.hostname

        self.client = httpx.Client(
            headers={"User-Agent": self.config.user_agent},
            timeout=httpx.Timeout(
                self.config.read_timeout_seconds,
                connect=self.config.connect_timeout_seconds
            ),
            follow_redirects=False,  # Não segue redirects cegamente para prevenir redirecionamentos SSRF
        )

    def _wait_for_rate_limit(self) -> None:
        """Garante o intervalo mínimo obrigatório entre requisições consecutivas."""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.config.min_request_interval_seconds:
            sleep_duration = self.config.min_request_interval_seconds - elapsed
            time.sleep(sleep_duration)
        self._last_request_time = time.time()

    def _check_circuit(self) -> None:
        """Verifica se o circuito está aberto devido a falhas consecutivas ou bloqueios."""
        now = time.time()
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
        if status_code in (429, 403) or self._consecutive_failures >= self._failure_threshold:
            self._circuit_open_until = time.time() + self._cooldown_seconds
            logger.warning(
                f"Abrindo circuit breaker por {self._cooldown_seconds}s após status={status_code} "
                f"(falhas consecutivas={self._consecutive_failures})."
            )

    def _get_with_retry(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        self._check_circuit()

        # Validação de segurança da URL
        parsed = urlparse(url)
        if parsed.hostname != self.allowed_host:
            raise ValueError(f"Requisição bloqueada para destino não autorizado: {parsed.hostname}")

        retries = self.config.max_retries
        for attempt in range(retries):
            self._wait_for_rate_limit()
            try:
                response = self.client.get(url, params=params)

                # HTTP 429 Too Many Requests -> Respeita Retry-After
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    delay = int(retry_after) if retry_after and retry_after.isdigit() else 30
                    logger.warning(f"HTTP 429 recebido! Respeitando Retry-After de {delay}s...")
                    self._record_failure(429)
                    time.sleep(delay)
                    continue

                # HTTP 403 Forbidden -> Interrupção imediata e não contorno
                if response.status_code == 403:
                    logger.error("HTTP 403 Forbidden: Acesso rejeitado pela fonte. Interrompendo sem retry.")
                    self._record_failure(403)
                    response.raise_for_status()

                # Erros Transitórios 5xx -> Exponential backoff com jitter
                if response.status_code in (500, 502, 503, 504):
                    self._record_failure(response.status_code)
                    jitter = random.uniform(0.5, 1.5)
                    backoff = (2 ** attempt) * self.config.min_request_interval_seconds * jitter
                    logger.warning(f"Erro {response.status_code} na tentativa {attempt + 1}. Backoff de {backoff:.2f}s...")
                    time.sleep(backoff)
                    continue

                response.raise_for_status()
                self._record_success()
                return response

            except httpx.HTTPError as exc:
                if attempt == retries - 1:
                    self._record_failure()
                    raise
                jitter = random.uniform(0.5, 1.5)
                time.sleep((2 ** attempt) * jitter)

        raise RuntimeError(f"Falha ao requisitar {url} após {retries} tentativas")

    def fetch_page(self, page_id: int) -> dict[str, Any]:
        url = f"{self.config.base_url}/{page_id}"
        resp = self._get_with_retry(url, {"_fields": "id,title,link,modified,content,parent"})
        return resp.json()

    def iter_catalog_metadata(self, limit: int | None = None) -> Iterator[dict[str, Any]]:
        page = 1
        count = 0
        max_items = limit or self.config.max_items_per_run
        max_pages = self.config.max_pages_per_run

        while page <= max_pages:
            params = {
                "parent": self.config.parent_catalog_id,
                "per_page": min(100, max_items),
                "page": page,
                "_fields": "id,title,link,modified,parent",
                "orderby": "modified",
                "order": "desc",
            }
            try:
                resp = self._get_with_retry(self.config.base_url, params)
            except (httpx.HTTPError, CircuitBreakerOpenException) as exc:
                logger.error(f"Interrompendo iteração do catálogo: {exc}")
                break

            entries = resp.json()
            if not entries:
                break

            for entry in entries:
                yield entry
                count += 1
                if count >= max_items:
                    return

            total_pages = int(resp.headers.get("x-wp-totalpages", page))
            if page >= total_pages:
                break
            page += 1

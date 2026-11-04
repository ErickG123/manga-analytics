# Plano Técnico — SPEC-006

## 1. Módulos Implementados

- `collector/src/config.py`: Validação de variáveis de ambiente com defaults conservadores e verificação SSRF.
- `collector/src/clients/bbm_client.py`:
  - `Rate Limiter`: Garante delay mínimo entre chamadas HTTP.
  - `Circuit Breaker`: Interrompe chamadas por período de cooldown diante de respostas 429/403 ou 5 falhas consecutivas.
  - `Exponential Backoff`: Retry com jitter multiplicativo apenas para falhas transitórias.
- `collector/tests/test_bbm_client.py`: Cobertura de rate limiting, circuit breaker em 429 e proteção SSRF.

## 2. Documentação e Runbooks

- `docs/collector/security-and-rate-limiting.md`: Diretrizes e políticas de segurança.
- `docs/collector/operational-runbook.md`: Guia de operação da CLI e tratativa de incidentes.
- `docs/collector/audit-report.md`: Relatório completo de auditoria do coletor.

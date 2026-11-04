# Tarefas — SPEC-006

- [x] **Fase 1: Configuração Centralizada e Segura**
  - [x] Criar `collector/src/config.py` com validação de esquema de URL e allowlist de hosts
- [x] **Fase 2: Confiabilidade do Cliente HTTP**
  - [x] Implementar rate limiting com controle por tempo mínimo entre requisições
  - [x] Implementar suporte ao cabeçalho `Retry-After` em respostas `429`
  - [x] Tratar `403 Forbidden` sem retries ou bypasses
  - [x] Implementar Circuit Breaker com período de cooldown
  - [x] Aplicar timeout de conexão e leitura explícitos
  - [x] Desativar redirects automáticos para prevenir redirecionamentos maliciosos (SSRF)
- [x] **Fase 3: Testes Automatizados com Pytest**
  - [x] Cobrir rate limiting em `collector/tests/test_bbm_client.py`
  - [x] Cobrir circuit breaker e `Retry-After` em `429`
  - [x] Cobrir rejeição de hosts não autorizados
- [x] **Fase 4: Documentação Técnica e Operacional**
  - [x] Criar `docs/collector/security-and-rate-limiting.md`
  - [x] Criar `docs/collector/operational-runbook.md`
  - [x] Criar `docs/collector/audit-report.md`

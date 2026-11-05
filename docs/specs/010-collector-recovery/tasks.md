# Tarefas — Recuperação segura do Collector

- [x] Auditar retries, bloqueios, circuit breaker, checkpoint e persistência existentes.
- [x] Criar migration e contratos persistentes de fonte, jobs e falhas individuais.
- [x] Implementar política HTTP limitada e parsing de Retry-After.
- [x] Aplicar suspensão/bloqueio persistente antes de qualquer requisição.
- [x] Registrar ciclo de vida de execução e interrupções.
- [x] Registrar fichas problemáticas e oferecer reprocessamento seguro.
- [x] Testar retry, bloqueios, checkpoint, concorrência e idempotência local.
- [x] Atualizar documentação e relatório com resultados reais.
- [x] Rodar suíte Python, Ruff, integração PostgreSQL isolada e `npm run check` quando aplicável.

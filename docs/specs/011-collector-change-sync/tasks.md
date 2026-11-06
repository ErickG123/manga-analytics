# Tarefas — SPEC-011

- [x] Estender a consulta de páginas BBM com limites `modified_after`/`modified_before`.
- [x] Persistir cursor concluído e janela ativa no checkpoint `sync`.
- [x] Retomar a paginação e offsets sem avançar o cursor durante uma janela incompleta.
- [x] Adaptar CLI e execução `sync` para janela incremental limitada e recuperável.
- [x] Cobrir mudanças, itens sem alteração, janela vazia, falhas e retomada.
- [x] Criar e validar dump PostgreSQL antes da migration.
- [x] Validar migrações, suíte Python, Ruff, formatação e `npm run check` aplicável.
- [x] Atualizar runbook e resultados com comando, limites e procedimento de retomada.

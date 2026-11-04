# Plano Técnico — SPEC-005

## 1. Segurança Administrativa

- Criar endpoint `POST /api/admin/auth/login` que recebe `{ password }` ou `{ token }`.
- Validar contra variável de ambiente `ADMIN_API_KEY` (com fallback seguro).
- Retornar token de sessão administrativa efêmero assinado ou validado em cache/memória com TTL de expiração.
- Criar tela de Login Angular `features/admin/pages/admin-login/` (`/admin/login`).
- `ImportMonitoringComponent`: carregar a sessão autenticada do `AdminAuthService` em memória, redirecionando para login caso não autenticado (nunca hardcoded no código).

## 2. Robustez dos Jobs de Importação

- No `apps/api/src/modules/admin/admin.routes.ts`:
  - Lock de concorrência: verificar se existe job com `status = 'running'`. Caso exista, responder `409 Conflict` com mensagem explicativa.
  - Reconciliação na inicialização e listagem: marcar jobs `running` com mais de 30 minutos como `'failed'` com mensagem `Execução interrompida ou processo reiniciado`.

## 3. Fixtures Determinísticas de Teste

- Criar script `apps/api/src/fixtures.ts` com registros suficientes para múltiplas páginas, obras com e sem lançamentos futuros, capas ausentes e observações históricas.

## 4. Atualização da Documentação de Testes

- Atualizar `docs/testing/manual-validation.md` com status, dados de teste e passos precisos sem IDs fixos fantasmas.
- Criar `docs/testing/test-data.md`.
- Criar `docs/testing/validation-report.md`.

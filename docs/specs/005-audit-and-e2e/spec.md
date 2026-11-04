# SPEC-005: Auditoria, Correções e Preparação para Validação End-to-End

## Contexto e Objetivos

Realizar a consolidação técnica e funcional do **Mangá Atlas** após auditoria:

1. Eliminar exposição de segredo no frontend com tela de login administrativa segura (`/admin/login`), sessão com token de curta duração/cookie e verificação restrita no Fastify.
2. Implementar exclusão mútua (`409 Conflict`) no endpoint de jobs assíncronos e recuperação de jobs interrompidos/abandonados no TypeORM.
3. Criar fixtures determinísticas completas (`apps/api/src/fixtures.ts`) cobrindo paginação, dados com/sem capas, datas parciais, previsões e reajustes.
4. Expandir e corrigir o roteiro de testes manuais (`docs/testing/manual-validation.md`) e gerar documentação de dados de teste (`docs/testing/test-data.md`) e relatório de validação (`docs/testing/validation-report.md`).
5. Garantir que todas as suítes de validação (`npm run check` e `pytest`) mantenham 100% de sucesso.

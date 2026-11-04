# Plano — SPEC-009

1. Definir `volume_variants` e vincular separadamente preços atuais e observações.
2. Implementar extração de rótulos de variante e agrupamento por número no parser.
3. Persistir base e variantes em transação com upsert por chave estável.
4. Expor as variantes em DTO/API, modelos Angular e detalhe da obra.
5. Cobrir parsing de Blue Lock, idempotência PostgreSQL e apresentação no detalhe.
6. Executar pytest, Ruff, testes API/UI, cobertura e `npm run check`.
7. Reimportar Blue Lock em lote limitado depois da migration e verificar dados e duplicatas.

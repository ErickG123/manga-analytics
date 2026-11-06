# Plano — SPEC-011

1. Revisar o endpoint WordPress e o checkpoint existente; usar filtro de alterações com limite superior fixo e ordenação por ID.
2. Adicionar campos de janela/cursor ao checkpoint e migration TypeORM compatível.
3. Implementar persistência atômica de janela, retomada por página/offset e avanço do cursor somente após completar a janela.
4. Atualizar CLI `sync` para retomar janela ativa e processar mudanças em lotes limitados.
5. Cobrir query params, alterações detectadas, fichas inalteradas, cursor de término e replay com fixtures/mock HTTP e PostgreSQL isolado.
6. Gerar e validar um dump local antes de aplicar alterações de schema; manter o dump fora do Git.
7. Rodar testes, lint, formatação, build/API check aplicável e registrar limitações operacionais.

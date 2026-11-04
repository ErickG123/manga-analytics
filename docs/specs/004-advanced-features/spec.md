# SPEC-004: Implementação das Funcionalidades Avançadas — Mangá Atlas

## Contexto e Visão Geral

Consolidação e implementação das 5 funcionalidades avançadas no Mangá Atlas sobre a stack estabelecida (Angular 21, Fastify TypeScript, PostgreSQL 17 com TypeORM, Coletor Python com pytest/Ruff):

1. Qualidade e rastreabilidade dos dados (regras ISBN, datas, preços, entidade `DataQualityIssue`).
2. Painel administrativo do Collector e monitoramento de sincronizações.
3. Análises avançadas de preços e lançamentos com ECharts e agregações SQL.
4. Busca avançada com filtros combinados, ordenação estável, paginação e query params na URL.
5. Acompanhamento de obras favoritas sem autenticação (localStorage, signals, página `/favoritos`).

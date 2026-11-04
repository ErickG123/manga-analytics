# Plano Técnico — SPEC-002: Implementação Full Stack

## 1. Estratégia de Implementação

O projeto será implementado em 7 fases sequenciais:

1. **Fase 1: Infraestrutura & Docker Compose**
   - Criar `docker-compose.yml` para PostgreSQL 17 com volume persistente e healthcheck.
   - Criar `.env.example` e `.env` com configurações seguras de desenvolvimento.
   - Configurar Prisma (`prisma/schema.prisma`) com todas as tabelas solicitadas.
   - Gerar cliente Prisma e criar script de seed (`prisma/seed.ts`).
   - Executar migrations iniciais no PostgreSQL.

2. **Fase 2: Backend Fastify (TypeScript)**
   - Criar estrutura em `apps/api/` (ou módulo integrado com Fastify).
   - Configurar plugins Fastify: CORS, `@fastify/swagger`, `@fastify/swagger-ui`, Prisma client injection, tratamento global de erros.
   - Implementar módulos:
     - `manga`: listagem, busca, paginação, detalhes com edições e volumes.
     - `publisher`: listagem de editoras cadastradas.
     - `volume`: consulta individual.
     - `calendar`: `/releases` filtrado por ano, mês, editora, status.
     - `analytics`: endpoints de agregação (visão geral, preços por obra/editora, lançamentos por mês, histórico de observação).
     - `reports`: relatórios em JSON e exportação CSV com sanitização.
     - `health`: status da aplicação e conexão com banco.
   - Implementar testes unitários e de integração com Vitest usando `fastify.inject()`.

3. **Fase 3: Coletor Python & ETL (BBM)**
   - Reestruturar `collector/` com:
     - `src/clients/bbm_client.py`: chamadas respeitosas com User-Agent e backoff.
     - `src/parsers/bbm_parser.py`: extração de metadados, capas, volumes e preços.
     - `src/normalizers/`: tratamento de datas brasileiras (`DD/MM/YYYY`, `MM/YYYY`, `YYYY`), preços BRL para `Decimal`.
     - `src/persistence/db.py`: persistência idempotente no PostgreSQL.
     - `src/jobs/sync.py`: rotina de sincronização piloto com suporte a checkpoint.
   - Criar fixtures HTML em `collector/tests/fixtures/` baseadas em fichas reais.
   - Criar testes com `pytest`.

4. **Fase 4: Integração Frontend Angular 21**
   - Configurar `environment.ts` com URL base da API (`http://localhost:3333/api/v1`).
   - Criar `core/services/api.service.ts` e serviços dedicados por feature:
     - `features/catalog/services/catalog.service.ts`
     - `features/calendar/services/calendar.service.ts`
     - `features/analytics/services/analytics.service.ts`
     - `features/reports/services/reports.service.ts`
   - Atualizar componentes para consumir dados da API, tratando loading, empty states e erros.
   - Adaptar `manga-card` para exibir capa real quando disponível ou fallback visual.

5. **Fase 5: Gráficos Interativos com Apache ECharts**
   - Instalar `echarts` e integrar nos componentes de análise e detalhes.
   - Renderizar:
     - Gráfico de linha para evolução de preço por volume.
     - Gráfico de barras para comparativo entre editoras.
     - Gráfico de colunas para lançamentos por mês.
     - Tooltips estilizados em tema dark, moedas formatadas em BRL e datas em pt-BR.

6. **Fase 6: Relatórios & Exportação CSV**
   - Implementar tela de relatórios ou seção para download de relatórios de lançamentos e preços.
   - Baixar arquivos CSV sanitizados via browser.

7. **Fase 7: Validação e CI**
   - Atualizar scripts no `package.json` raiz (`docker:up`, `db:migrate`, `db:seed`, `api:start`, etc.).
   - Executar suíte completa de testes no frontend, backend e Python.
   - Atualizar documentação e ADRs (`ADR-006: Fastify Backend`).

## 2. Decisões Arquiteturais Relevantes

- **ADR-006:** Adoção de Fastify + TypeScript para a camada de backend e API REST com Prisma ORM.
- **ADR-007:** Apache ECharts para gráficos avançados no frontend dark theme.
- **ADR-008:** Tipagem `Decimal(10,2)` no PostgreSQL para todos os campos de valor monetário.

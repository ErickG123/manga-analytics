# Tarefas — SPEC-002: Implementação Full Stack

- [ ] **Fase 1: Infraestrutura & Docker Compose**
  - [ ] Criar `docker-compose.yml` para PostgreSQL 17
  - [ ] Criar `.env.example` e `.env`
  - [ ] Criar `prisma/schema.prisma` com todas as entidades
  - [ ] Subir PostgreSQL via Docker Compose
  - [ ] Executar migrations Prisma e criar `prisma/seed.ts` com dados piloto

- [ ] **Fase 2: Backend Fastify**
  - [ ] Instalar dependências Fastify, Swagger, CORS, Prisma Client
  - [ ] Criar servidor Fastify e plugins em `apps/api`
  - [ ] Implementar módulos: `manga`, `publisher`, `volume`, `calendar`, `analytics`, `reports`, `health`
  - [ ] Configurar Swagger/OpenAPI em `/docs`
  - [ ] Criar testes do backend com Vitest e `fastify.inject()`
  - [ ] Validar inicialização e rotas da API

- [ ] **Fase 3: Coletor Python & ETL**
  - [ ] Criar parsers de fichas BBM em `collector/src/parsers/`
  - [ ] Criar normalizador de datas e preços BRL em `collector/src/normalizers/`
  - [ ] Criar módulo de persistência PostgreSQL em `collector/src/persistence/`
  - [ ] Criar fixtures HTML de teste em `collector/tests/fixtures/`
  - [ ] Criar testes unitários com `pytest`
  - [ ] Executar importação piloto e validar integridade

- [ ] **Fase 4: Integração Angular 21**
  - [ ] Adicionar suporte a `HttpClient` e configurar ambiente (`environment.ts`)
  - [ ] Criar serviços HTTP dedicados por feature
  - [ ] Integrar tela de Catálogo com busca, filtros por editora, paginação e capas
  - [ ] Integrar tela de Detalhes da Obra com volumes e edições
  - [ ] Integrar tela de Calendário com datas em formato brasileiro
  - [ ] Atualizar testes unitários do frontend

- [ ] **Fase 5: Gráficos com Apache ECharts**
  - [ ] Instalar `echarts`
  - [ ] Criar componente reutilizável ou integração de gráficos na página de análises
  - [ ] Implementar linha de evolução de preços, barras de editoras e colunas de lançamentos
  - [ ] Validar tooltips, moedas em BRL e tema dark

- [ ] **Fase 6: Relatórios & Exportação CSV**
  - [ ] Implementar endpoint e lógica de exportação CSV com sanitização
  - [ ] Integrar opção de download de relatórios no frontend

- [ ] **Fase 7: Validação & Documentação**
  - [ ] Executar `npm run check` (frontend)
  - [ ] Executar testes do backend
  - [ ] Executar `pytest` e `ruff` no Python
  - [ ] Criar novos ADRs (`ADR-006`, `ADR-007`)
  - [ ] Atualizar `AGENTS.md` e `README.md`

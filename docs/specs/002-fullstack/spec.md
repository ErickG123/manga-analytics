# SPEC-002 — Mangá Atlas Full Stack: PostgreSQL, Fastify API, Coletor BBM e ECharts

## 1. Contexto & Problema

O Mangá Atlas possui atualmente uma interface frontend Angular 21 navegável e formatada com alta fidelidade visual, operando sobre dados demonstrativos em memória (`MockMangaRepository`). Para viabilizar a missão da aplicação (análise de lançamentos, evolução de preços e catálogo persistente no mercado editorial de mangás no Brasil), é necessário prover uma infraestrutura full stack com banco de dados relacional, API REST de alta performance, rotinas de coleta/ETL e gráficos analíticos interativos.

## 2. Objetivo

Evoluir a aplicação para um sistema full stack com:

1. PostgreSQL 17 gerenciado via Docker Compose com persistência e healthcheck.
2. Modelagem relacional estrita com Prisma ORM (Manga, Edition, Volume, VolumePrice, PriceObservation, Publisher, DataSource, ExternalReference, ImportJob).
3. Backend Fastify modular em TypeScript com documentação OpenAPI/Swagger, filtros, paginação e exportação CSV.
4. Coletor/ETL em Python com extração, normalização, fixtures de teste, persistência e suporte a sincronização incremental da Biblioteca Brasileira de Mangás (BBM).
5. Frontend Angular 21 integrado à API real via serviços dedicados, paginação, filtros, renderização de capas reais (com fallback) e gráficos analíticos interativos com Apache ECharts.

## 3. Requisitos Funcionais

- **RF-01:** Subir PostgreSQL 17 localmente via `docker-compose.yml` na porta `5432`.
- **RF-02:** Migrations Prisma aplicando schema canônico com tipos numéricos adequados (`Decimal` para valores monetários) e constraints de unicidade.
- **RF-03:** API Fastify fornecendo endpoints para:
  - `/api/v1/mangas` (listagem paginada, busca por título, filtro por editora/status)
  - `/api/v1/mangas/:id` (detalhes, edições, volumes, capas e preços)
  - `/api/v1/publishers` (listagem de editoras)
  - `/api/v1/volumes/:id` (detalhes de volume)
  - `/api/v1/releases` (calendário de lançamentos com filtros por ano/mês/status/editora)
  - `/api/v1/analytics/*` (visão geral, média por editora, evolução de preços, lançamentos por mês)
  - `/api/v1/reports/*` (relatórios com exportação CSV protegida contra formula injection)
  - `/api/v1/health` (healthcheck da API e banco)
- **RF-04:** Coletor Python com suporte a parsing de fichas BBM, extração de datas com precisão brasileira (`day`, `month`, `year`), conversão de preços BRL para `Decimal`, identificação de capas brasileiras e persistência idempotente.
- **RF-05:** Frontend Angular consumindo a API, apresentando catálogo real, ficha de detalhes, calendário em formato pt-BR, dashboard com gráficos ECharts e relatórios com download CSV.

## 4. Requisitos Não Funcionais

- **RNF-01:** Preservação estrita da arquitetura feature-based, separação de componentes (`.ts`, `.html`, `.scss`, `.spec.ts`) e modelos em `models/*.model.ts`.
- **RNF-02:** Preservação da identidade visual dark e paleta de cores.
- **RNF-03:** Modo estrito do TypeScript tanto no frontend quanto no backend.
- **RNF-04:** Testes automatizados: Vitest para frontend e backend Fastify, pytest para coletor Python.
- **RNF-05:** Formatação via Prettier, lint via ESLint e Ruff no Python.

## 5. Critérios de Aceite

1. `docker compose up -d` sobe o container PostgreSQL 17 e o healthcheck fica saudável.
2. `npx prisma migrate dev` e `seed` executam sem falhas.
3. API Fastify inicia, responde requisições em `/api/v1` e exibe documentação Swagger em `/docs`.
4. Coletor Python possui testes unitários via pytest rodando com sucesso sobre fixtures representativas de HTML.
5. Angular conecta na API Fastify e renderiza catálogo, detalhes, calendário e gráficos ECharts sem erros no console.
6. Exportação CSV gera arquivos válidos em UTF-8 com sanitização de fórmulas.
7. Scripts de validação (`npm run check`, testes unitários de backend, testes python) finalizam com código 0.

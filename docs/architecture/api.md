# API Fastify — Mangá Atlas

A API HTTP vive em `apps/api/`, usa Fastify 5, TypeORM e PostgreSQL e é consumida pela aplicação Angular. Rotas são agrupadas por domínio. A inicialização aplica as migrations e registra entidades, plugins de CORS, validação e documentação.

## Estrutura

```text
apps/api/src/
├── app.ts                 # Montagem da aplicação e rotas
├── server.ts              # Servidor HTTP
├── config/                # DataSource TypeORM
├── entities/              # Entidades PostgreSQL
├── migrations/            # Evolução versionada do schema
├── plugins/               # Plugins Fastify
└── modules/
    ├── manga/              # Busca, catálogo e detalhe
    ├── publisher/          # Editoras
    ├── volume/             # Volumes e variantes
    ├── calendar/           # Agenda de lançamentos
    ├── analytics/          # KPIs e dados agrupados para gráficos
    ├── reports/             # Relatórios e exportação CSV
    └── admin/               # Operações administrativas do Collector
```

Cada módulo mantém rotas, serviços e `models/*.model.ts` quando esses arquivos se aplicam. Os contratos HTTP são tipados em models. A API filtra os volumes por edição; por isso um volume pode identificar a publicação, seu nome e tipo de formato sem fundir republicações da mesma obra.

## Endpoints de domínio

Prefixo versionado: `/api/v1`.

- Catálogo/detalhe: `/mangas`, `/mangas/:slug`.
- Editoras e calendário: `/publishers`, `/calendar`.
- Analytics: `/analytics/overview`, rotas `/analytics/*/by-*` e `/analytics/editions/by-format`.
- Exportações: `/reports/releases?format=csv` e `/reports/prices?format=csv`.
- Saúde e OpenAPI: rotas registradas pelo app e plugins correspondentes.

Os filtros de análise e relatórios compartilham ano, editora, categoria, situação, obra e presença de preço conforme o endpoint; `formatType` filtra publicações por taxonomia normalizada. O agregado de formatos informa contagem de publicações, obras e volumes. CSVs de lançamentos/preços incluem publicação e seus metadados de formato.

## Console do Collector

Rotas administrativas protegidas por token incluem `GET /api/admin/collector/control/status`, `GET /api/admin/collector/events` (SSE), `POST /api/admin/collector/backfill/start` e `POST /api/admin/collector/backfill/pause`. O servidor Fastify inicia apenas o comando fixo do Collector, em lotes de até 100 fichas; a pausa entra em vigor depois do lote e preserva o checkpoint. O stream publica checkpoint, percentual estimado, estado da fonte e falhas/revisões. Configure o executável Python e a raiz do projeto quando a API não for executada na raiz do repositório.

## Persistência e migrations

As entidades estão em `apps/api/src/entities/`. Use migrations em `apps/api/src/migrations/` para mudanças estruturais e registre-as em `config/data-source.ts`. A migration `1793971000000-AddEditionFormatMetadata` adiciona identidade da edição de origem, tipo e evidência editorial, remove a presunção legada de `Tankobon` e permite mais de uma publicação por obra/editora. Veja [formatos de publicação](../data/publication-formats.md).

## Testes

- Integração das rotas: `npm run test:api` (`apps/api/src/app.spec.ts`).
- O serviço de catálogo possui testes de transformação/DTO em `apps/api/src/modules/manga/services/manga.service.spec.ts`.
- Validação conjunta com o frontend e build: `npm run check`.

# Plano Técnico — SPEC-003: Auditoria e Refatoração Arquitetural

## 1. Estratégia de Implementação

### 1.1 Refatoração da API Fastify (`apps/api/src`)

- **Plugins (`apps/api/src/plugins/`):**
  - `cors.plugin.ts`: Registro do `@fastify/cors`
  - `swagger.plugin.ts`: Registro do `@fastify/swagger` e `@fastify/swagger-ui`
  - `sensible.plugin.ts`: Registro do `@fastify/sensible`
- **Módulos (`apps/api/src/modules/`):**
  - `manga/`: `manga.routes.ts`, `manga.controller.ts`, `manga.service.ts`, `manga.repository.ts`, `models/manga.model.ts`
  - `publisher/`: `publisher.routes.ts`, `publisher.controller.ts`, `publisher.service.ts`, `publisher.repository.ts`, `models/publisher.model.ts`
  - `volume/`: `volume.routes.ts`, `volume.controller.ts`, `volume.service.ts`, `volume.repository.ts`, `models/volume.model.ts`
  - `calendar/`: `calendar.routes.ts`, `calendar.controller.ts`, `calendar.service.ts`, `models/calendar.model.ts`
  - `analytics/`: `analytics.routes.ts`, `analytics.controller.ts`, `analytics.service.ts`, `models/analytics.model.ts`
  - `reports/`: `reports.routes.ts`, `reports.controller.ts`, `reports.service.ts`, `models/reports.model.ts`
  - `health/`: `health.routes.ts`, `health.controller.ts`
- **Centralização:** `app.ts` apenas registra plugins e módulos de forma limpa.

### 1.2 Refatoração do Coletor Python (`collector/`)

- Mover/consolidar código em `collector/src/`:
  - `clients/bbm_client.py`: Comunicação com a API WordPress BBM com backoff e headers adequados.
  - `parsers/bbm_parser.py`: Extração pura de HTML e estruturas de tabelas.
  - `normalizers/data_normalizer.py`: Normalização de preços e datas brasileiras.
  - `models/`: Dataclasses para `MangaCollected`, `VolumeCollected`, `ImportResult`.
  - `repositories/manga_repository.py`: Persistência idempotente em PostgreSQL via `psycopg`.
  - `services/import_service.py`: Orquestração de busca -> parse -> normalização -> persistência.
  - `cli.py`: Ponto de entrada com comandos `import`, `sync` e flags `--limit`, `--dry-run`.
- Limpar arquivos legados da raiz de `collector/`.

### 1.3 Atualização de Documentação e Testes

- Atualizar testes de regressão da API e do coletor.
- Atualizar `docs/architecture/` e `AGENTS.md`.

## 2. Decisões Arquiteturais

- **ADR-009:** Arquitetura Modular por Domínio na API Fastify (separação Routes -> Controller -> Service -> Repository).
- **ADR-010:** Pipeline em Camadas do Coletor Python com CLI Integrada.

# Plano Técnico — SPEC-004

## 1. TypeORM Models & Migrations

- Criar `apps/api/src/entities/data-quality-issue.entity.ts`.
- Adicionar entidade ao `DataSource` e exportar em `apps/api/src/entities/index.ts`.
- Enriquecer o seed com problemas de qualidade e histórico de jobs.

## 2. API Fastify

- Plugin `auth.plugin.ts` para proteção das rotas `/api/admin/*`.
- Módulo `admin`:
  - `admin.routes.ts`: monitoramento de jobs, revalidação e estatísticas.
  - `data-quality.routes.ts`: listagem de issues, filtros de severidade, resolução.
- Módulo `analytics`:
  - Enriquecer rotas com médias por editora, evolução de preços e preço por página.
- Módulo `manga`:
  - Busca textual e multi-filtros com paginação TypeORM (`skip`, `take`, ordenação estável).
- Módulo `volume`:
  - Rota de histórico temporal com `PriceObservation`.

## 3. Coletor Python

- Validador `collector/src/normalizers/quality_validator.py`:
  - Verificação de ISBN-10 e ISBN-13 (dígitos verificadores).
  - Validação de datas parciais vs inválidas.
  - Detecção de preços negativos.
- Atualização do repositório para salvar issues de qualidade quando encontradas.
- Testes com pytest em `collector/tests/test_quality_validator.py`.

## 4. Frontend Angular 21

- **Busca & Filtros:** Atualizar `CatalogPage` para sincronizar query params com `Router` e `ActivatedRoute`, debounce na busca e paginação.
- **Favoritos:** Criar `FavoriteService` (com signals e `localStorage`), botões de favoritar no card e detalhe, e nova página `src/app/features/favorites/pages/favorites.page.ts`.
- **Admin Monitoring:** Criar `src/app/features/admin/pages/import-monitoring/` com métricas, status de jobs e tabela de qualidade de dados.
- **Analytics:** Atualizar gráficos ECharts para usar novos dados de comparação por editora e preço/página.
- **Roteiro Manual:** Gerar `docs/testing/manual-validation.md`.

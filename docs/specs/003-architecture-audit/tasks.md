# Tarefas — SPEC-003: Auditoria e Refatoração Arquitetural

- [x] **Fase 1: Plugins Fastify e Infraestrutura**
  - [x] Criar `apps/api/src/plugins/cors.plugin.ts`
  - [x] Criar `apps/api/src/plugins/swagger.plugin.ts`
  - [x] Criar `apps/api/src/plugins/sensible.plugin.ts`

- [x] **Fase 2: Modularização da API Fastify**
  - [x] Módulo `health` (`routes`)
  - [x] Módulo `manga` (`routes`, `controller`, `service`, `repository`, `models`)
  - [x] Módulo `publisher` (`routes`, `controller`, `service`, `repository`, `models`)
  - [x] Módulo `volume` (`routes`, `service`)
  - [x] Módulo `calendar` (`routes`, `service`, `models`)
  - [x] Módulo `analytics` (`routes`, `service`, `models`)
  - [x] Módulo `reports` (`routes`, `service`, sanitização CSV)
  - [x] Refatorar `apps/api/src/app.ts` para orquestração modular limpa
  - [x] Executar e validar testes da API com Vitest

- [x] **Fase 3: Refatoração do Coletor Python**
  - [x] Criar modelos de domínio do coletor em `collector/src/models/entities.py`
  - [x] Implementar repositório PostgreSQL do coletor em `collector/src/repositories/collector_repository.py`
  - [x] Implementar serviço de importação em `collector/src/services/import_service.py`
  - [x] Implementar CLI com `argparse` em `collector/src/cli.py`
  - [x] Remover arquivos legados duplicados da raiz de `collector/`
  - [x] Atualizar testes com pytest e validar formatação e imports

- [x] **Fase 4: Validação e Documentação**
  - [x] Executar `npm run check` (Prettier, ESLint, Vitest Angular, Vitest Fastify, Build de produção)
  - [x] Executar testes do coletor com pytest (`py -m pytest collector/tests`)
  - [x] Validar integridade do `.gitignore`
  - [x] Atualizar documentação arquitetural e ADRs

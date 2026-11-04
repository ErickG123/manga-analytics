# SPEC-003 — Auditoria e Refatoração Arquitetural: API Fastify e Collector Python

## 1. Contexto & Diagnóstico Inicial

Durante a auditoria arquitetural realizada no repositório, identificamos pontos de melhoria importantes na separação de responsabilidades da API Fastify e do coletor Python:

### Diagnóstico Arquitetural

| Item                                       | Descrição                                                                                                                             | Localização           | Impacto                                                                        | Severidade | Solução                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API Monolítica em um único arquivo**     | Todas as rotas, consultas TypeORM diretas, mapeamentos e transformações de CSV residem dentro de `apps/api/src/app.ts` (~400 linhas). | `apps/api/src/app.ts` | Dificulta manutenção, reutilização e testabilidade isolada por módulo.         | **Alta**   | Reorganizar em módulos de domínio (`modules/manga`, `publisher`, `volume`, `calendar`, `analytics`, `reports`, `health`) com controllers, services, repositories e models dedicados. |
| **Acesso direto a banco em handlers HTTP** | Handlers de rota do Fastify constroem queries TypeORM diretamente (`QueryBuilder`, joins manuais).                                    | `apps/api/src/app.ts` | Acoplamento de infraestrutura de persistência com a camada de transporte HTTP. | **Alta**   | Mover acesso ao banco para repositories e serviços de domínio com injeção limpa.                                                                                                     |
| **Modelos de API não padronizados**        | Tipos de retorno e contratos de resposta declarados inline ou inferidos de queries.                                                   | `apps/api/src/app.ts` | Violação da convenção de interfaces em `models/*.model.ts`.                    | **Média**  | Extrair DTOs e contratos para arquivos `*.model.ts` em cada módulo.                                                                                                                  |
| **Collector com scripts legados na raiz**  | Arquivos legados `collector/main.py`, `collector/parser.py`, `collector/bbm_client.py` coexistem com a pasta `collector/src/`.        | `collector/*.py`      | Confusão sobre o ponto de entrada oficial e duplicação de lógicas.             | **Média**  | Consolidar pacote Python em `collector/src/manga_atlas_collector/` com CLI estruturada (`python -m collector.cli`), repositório de persistência e serviços de importação.            |
| **Falta de CLI estruturada no Collector**  | O coletor não possui suporte nativo a flags de linha de comando (`--limit`, `--dry-run`, `import`, `sync`).                           | `collector/`          | Dificulta automação via cron/jobs e execuções parciais de teste.               | **Média**  | Implementar `cli.py` utilizando `argparse` com comandos `import`, `sync` e `--dry-run`.                                                                                              |

## 2. Objetivo da Refatoração

1. **API Fastify:** Adotar arquitetura modular orientada a domínios (`manga`, `publisher`, `volume`, `calendar`, `analytics`, `reports`, `health`), separando rotas, controllers, services e repositories, com models estritos em `*.model.ts`.
2. **Collector Python:** Estruturar o coletor com camadas claras (`clients`, `parsers`, `normalizers`, `repositories`, `services`, `jobs`, `cli`), mantendo idempotência, tipagem estrita com dataclasses e CLI intuitiva com `--limit` e `--dry-run`.
3. **Preservação Total:** Manter 100% dos contratos HTTP e compatibilidade com o frontend Angular 21, banco PostgreSQL 17 e TypeORM.
4. **Qualidade:** Assegurar que `npm run check`, `npm run test:api`, `npm run test:collector` e `ruff check` terminem com código 0.

## 3. Critérios de Aceite

- [ ] API modularizada em `apps/api/src/modules/` sem consultas SQL nos handlers HTTP.
- [ ] Plugins do Fastify isolados em `apps/api/src/plugins/`.
- [ ] Contratos de dados da API padronizados em `models/*.model.ts`.
- [ ] Coletor Python estruturado com CLI (`--limit`, `--dry-run`), modelos tipados e persistência isolada.
- [ ] Suíte de testes do backend, frontend e python passando com 100% de sucesso.
- [ ] Documentação arquitetural (`docs/architecture/`) e `AGENTS.md` atualizadas.

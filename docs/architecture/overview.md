# Visão geral da arquitetura — Mangá Atlas

O Mangá Atlas cataloga publicações brasileiras de mangá e permite consultar obras, editoras, volumes, datas de lançamento, formatos editoriais, preços de capa e métricas agregadas. É composto por uma SPA Angular, uma API Fastify, PostgreSQL e um processo de coleta independente em Python.

## Componentes e fronteiras

| Componente             | Localização      | Responsabilidade                                                                                           |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Web                    | `src/app/`       | Catálogo e filtros, detalhe, calendário, análises e downloads de relatórios.                               |
| API                    | `apps/api/src/`  | Contratos REST, validação, consultas TypeORM, agregações e CSV.                                            |
| Banco                  | PostgreSQL 17    | Obras, editoras, edições, volumes, variantes, preços, referências externas e estado operacional da coleta. |
| Collector              | `collector/src/` | Cliente HTTP, parser BBM, normalização, checkpoints, persistência idempotente e CLI.                       |
| Especificações e guias | `docs/`          | Requisitos, decisões, procedimentos operacionais e evidências de teste.                                    |

```text
BBM ──HTTP──> Collector Python ──SQL──> PostgreSQL <──TypeORM── API Fastify <──HTTP── Angular
```

O Collector não é executado dentro do navegador. A API não faz scraping: ela lê o catálogo persistido e expõe os contratos ao frontend. A web e a API podem ser iniciadas e pausadas sem parar o PostgreSQL.

## Domínio e granularidade

- **Obra (`mangas`)** representa o título. A referência externa BBM identifica a ficha consultada.
- **Edição/publicação (`editions`)** representa uma publicação brasileira da obra por editora. A chave de origem distingue, por exemplo, publicação regular e republicação 2 em 1.
- **Volume (`volumes`)** pertence a uma edição, não diretamente à obra. O mesmo número pode existir em publicações distintas.
- **Variante (`volume_variants`)** registra variações comerciais ou físicas do volume, como blind pack, quando a fonte fornece essa informação.
- **Preço/observação** guarda valor, moeda, origem e instante de observação. Esse instante não indica a data real de um reajuste.
- **Formato editorial** é classificado com tipo normalizado, rótulo bruto, detalhe físico, número de volumes compilados por livro e evidência textual. Uma ausência de evidência é `unknown`, nunca uma suposição de edição regular.

Os tipos, fontes de evidência, limitações de classificação e campos de API estão descritos em [Formatos de publicação](../data/publication-formats.md).

## Pastas de código

- Angular segue organização feature-based: `core/` para infraestrutura transversal, `features/` para domínios de tela e `shared/` para elementos reutilizáveis.
- Cada componente possui TypeScript, HTML e SCSS separados. Tipos de domínio ficam em `models/*.model.ts`.
- API separa módulos por domínio, entidades, modelos e migrations.
- Collector separa clientes, parsers, normalizers, models, repositories e services.

## Persistência e evolução

PostgreSQL é a fonte de verdade. Migrations TypeORM documentam alterações estruturais; as operações do Collector são transacionais e idempotentes por obra, edição, número do volume e origem. Checkpoints permitem retomar uma varredura progressiva; falhas de fichas são registradas para repetição. Consulte o [runbook de operação do Collector](../collector/operational-runbook.md).

## Execução local e validação

Pré-requisitos, portas, variáveis, comandos para iniciar/pausar os serviços e backups ficam no [guia de início](../development/getting-started.md). Os comandos de validação e cobertura estão em [testes](../development/testing.md).

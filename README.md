# Mangá Atlas

Aplicação para catalogar mangás publicados no Brasil, acompanhar volumes e lançamentos e explorar formatos editoriais e preços de capa informados pelas fontes.

## O que existe no repositório

- `src/`: aplicação web Angular 21. As features incluem catálogo e detalhe da obra, calendário de lançamentos e análises com filtros, indicadores, gráficos ampliáveis e exportação de relatórios.
- `apps/api/`: API REST Fastify + TypeORM. Expõe catálogo, editoras, calendário, analytics, relatórios CSV e endpoints de administração do Collector.
- `collector/`: ETL Python para consultar as fichas públicas do BBM, interpretar metadados, tabelas por publicação, volumes, variantes e preços e gravar os resultados no PostgreSQL.
- `apps/api/src/entities/`: modelo relacional principal. Uma obra pode ter diversas edições/publicações brasileiras, cada qual com volumes, formato e editora próprios.
- `docs/`: arquitetura, desenvolvimento, operação, testes, especificações e relatórios de análise.
- `backfill-loop.ps1`: execução continuada do backfill em lotes com retomada via checkpoint.
- `.github/workflows/ci.yml`: pipeline de push e pull request para format, lint, testes Angular e build. Os testes e o lint Python são executados com os comandos locais abaixo.

## Modelo de dados em poucas palavras

Uma **obra** é o título catalogado. Uma obra pode ter várias **publicações/edições brasileiras** (por exemplo, publicação regular e edição 2 em 1); cada edição pertence a uma editora e recebe volumes próprios. Um volume pode ter variantes físicas/comerciais, como blind pack, e preços observados. A edição registra o formato editorial, a descrição física publicada pela fonte, quantos volumes originais são compilados em cada livro quando conhecido e o texto usado como evidência.

Os tipos editoriais normalizados são `regular`, `two_in_one`, `three_in_one`, `omnibus`, `definitive`, `deluxe`, `box_set`, `digital_edition`, `other` e `unknown`. `unknown` significa que a página consultada não permitiu classificar com segurança; não deve ser lido como formato regular. Detalhes e limites estão em [Formatos de publicação](docs/data/publication-formats.md).

Preço de capa informado junto ao lançamento não é uma série histórica garantida. O timestamp de observação registra quando o Collector consultou a fonte, não quando a editora reajustou o preço. Veja [acesso e semântica dos dados](docs/architecture/data-access.md).

## Requisitos

- Node.js 22 LTS ou compatível com Angular 21 e npm 10+.
- Python 3.12+ e dependências do projeto para o Collector.
- Docker Desktop com Docker Compose para executar PostgreSQL 17.
- Arquivo `.env` local baseado em `.env.example`.

## Subir o ambiente

```powershell
npm ci
py -m pip install -r collector/requirements.txt
docker compose up -d postgres
npm run api:start
```

Em outro terminal:

```powershell
npm run start
```

Frontend: `http://localhost:4200`; API: `http://localhost:3333` (ou a porta configurada no `.env`); PostgreSQL: `localhost:5432`. A API aplica as migrations registradas ao inicializar. Use `docker compose up -d` para subir os serviços definidos no Compose. Não execute dois processos Collector concorrentes contra a mesma fonte.

## Comandos úteis

| Objetivo                                                   | Comando                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Validação web completa (format, lint, testes, API e build) | `npm run check`                                                              |
| Cobertura dos testes Angular                               | `npm run test:coverage`                                                      |
| Testes da API                                              | `npm run test:api`                                                           |
| Testes do Collector                                        | `npm run test:collector`                                                     |
| Lint Python                                                | `npm run lint:collector`                                                     |
| Simular importação inicial                                 | `py -m collector.src.cli import --limit 5 --dry-run`                         |
| Sincronizar fichas modificadas                             | `py -m collector.src.cli sync --limit 50`                                    |
| Consultar estado da fonte/checkpoint                       | `py -m collector.src.cli source-status`                                      |
| Retomar backfill em páginas de até 100 fichas              | `py -m collector.src.cli backfill --batch-size 100 --resume`                 |
| Retomar com reparse completo das fichas                    | `py -m collector.src.cli backfill --batch-size 100 --resume --force-reparse` |
| Executar loop PowerShell com reparse                       | `./backfill-loop.ps1 -ForceReparse`                                          |
| Ver falhas recuperáveis                                    | `py -m collector.src.cli failures`                                           |

O Collector respeita as pausas e limites definidos na configuração. O script PowerShell encerra em bloqueio, suspensão, erro ou fim de catálogo e espera entre lotes; veja o [runbook de importação progressiva](docs/collector/progressive-import-runbook.md) antes de uma carga longa. Para acompanhar a execução visualmente, use o console autenticado em `/admin/monitoramento`.

Também é possível controlar o backfill em `/admin/monitoramento`: a API Fastify executa o Collector Python instalado no mesmo servidor, envia progresso autenticado via SSE e permite pausar após o lote atual. Veja os requisitos de `COLLECTOR_PYTHON_EXECUTABLE` e `COLLECTOR_PROJECT_ROOT` no [runbook operacional](docs/collector/operational-runbook.md).

## Backup e restauração PostgreSQL

Os backups locais ficam em `backups/`, diretório ignorado pelo Git porque contém os dados da aplicação. Para dump custom usando o usuário e banco do Compose:

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose exec -T postgres pg_dump -U manga_atlas -Fc -f /tmp/manga-atlas.dump manga_atlas
docker cp manga_atlas_postgres:/tmp/manga-atlas.dump backups/manga-atlas.dump
docker compose exec -T postgres rm /tmp/manga-atlas.dump
```

Valide o arquivo com `pg_restore --list backups/manga-atlas.dump`. Para restaurar, copie o dump ao container e execute `docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-acl -U manga_atlas -d manga_atlas /tmp/manga-atlas.dump`, então remova o arquivo temporário. Confirme o banco-alvo antes de restaurar: `--clean` remove objetos existentes nele.

## Documentação

- [Visão geral e arquitetura](docs/architecture/overview.md)
- [Guia de início e execução](docs/development/getting-started.md)
- [Testes e qualidade](docs/development/testing.md)
- [API](docs/architecture/api.md) · [Collector](docs/architecture/collector.md) · [acesso a dados](docs/architecture/data-access.md)
- [Formato editorial e publicações](docs/data/publication-formats.md)
- [Operação, checkpoint, retry e limites do Collector](docs/collector/operational-runbook.md)
- [Especificações SDD](docs/specs/)

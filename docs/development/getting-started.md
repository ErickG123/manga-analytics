# Guia de início — Mangá Atlas

## Requisitos e configuração

- Node.js 22 LTS ou compatível com Angular 21, npm 10+.
- Python 3.12+ para o Collector.
- Docker Desktop e Docker Compose para PostgreSQL 17.
- `.env` local preenchido com base em `.env.example`. Não adicione credenciais ao Git.

Na raiz do repositório:

```powershell
npm ci
py -m pip install -r collector/requirements.txt
Copy-Item .env.example .env
```

Revise as variáveis do `.env` local, especialmente `DATABASE_URL`, usuário e senha do PostgreSQL e URLs/portas da API. O `DATABASE_URL` do Collector deve conectar ao banco do Compose; a configuração aceita URL PostgreSQL padrão e trata o parâmetro de schema para `psycopg`.

## Inicialização

```powershell
docker compose up -d postgres
npm run api:start
```

Em outro terminal:

```powershell
npm run start
```

A web fica em `http://localhost:4200`, a API em `http://localhost:3333` (ou `API_PORT`) e o PostgreSQL em `localhost:5432`. A API inicializa a conexão, aplica as migrations registradas e então atende HTTP. O Collector é uma CLI independente e deve ser executado em um terminal próprio.

Para encerrar os servidores executados em primeiro plano, pressione `Ctrl+C` nos respectivos terminais. Para parar somente o banco em container: `docker compose stop postgres`; para retomá-lo: `docker compose start postgres`. `npm run docker:down` remove os containers definidos pelo compose; evite esse comando se precisar preservar o banco sem ter um backup válido.

## Comandos

| Ação                   | Comando                         |
| ---------------------- | ------------------------------- |
| Web de desenvolvimento | `npm run start`                 |
| Build de produção      | `npm run build`                 |
| Testes Angular         | `npm run test -- --watch=false` |
| Cobertura Angular      | `npm run test:coverage`         |
| Testes API             | `npm run test:api`              |
| Testes Collector       | `npm run test:collector`        |
| Lint Python            | `npm run lint:collector`        |
| Validação geral        | `npm run check`                 |

## Collector

```powershell
py -m collector.src.cli source-status
py -m collector.src.cli import --limit 5 --dry-run
py -m collector.src.cli sync --limit 50
py -m collector.src.cli backfill --batch-size 5 --resume
```

Use `--dry-run` antes de uma importação exploratória. O modo persistente atualiza obra, publicação/edição, volumes, variantes e preços quando a origem informa novos valores. `sync` prioriza fichas modificadas. O backfill percorre o catálogo com checkpoint e pode retomar após interrupção. Para reparsear páginas conhecidas pelo parser atualizado, veja o [runbook de importação progressiva](../collector/progressive-import-runbook.md); observe sempre o rate limit configurado.

## Testes e banco

`npm run check` executa Prettier, ESLint, Vitest, testes da API e build. O pytest do Collector e o Ruff são comandos separados acima. Consulte [estratégia de testes e cobertura](testing.md).

Para backup custom, execute `pg_dump -U manga_atlas -Fc -f /tmp/manga-atlas.dump manga_atlas` dentro do container PostgreSQL e copie o arquivo com `docker cp manga_atlas_postgres:/tmp/manga-atlas.dump backups/manga-atlas.dump`. `backups/` é ignorada pelo Git porque contém dados coletados. Valide com `pg_restore --list`. Para restaurar, use `pg_restore --clean --if-exists --no-owner --no-acl -U manga_atlas -d manga_atlas /tmp/manga-atlas.dump` dentro do container. Para os comandos completos, use [README](../../README.md#backup-e-restauração-postgresql).

# Arquitetura do Collector Python — Mangá Atlas

O Collector é um processo ETL independente que consulta fichas BBM, interpreta e normaliza os dados e persiste atualizações idempotentes no PostgreSQL.

## Camadas

```text
collector/src/
├── clients/       # HTTP, limite de requisições, retry e espera
├── parsers/       # Extração HTML, publicação, tabela, variantes e metadados
├── normalizers/   # Datas brasileiras, preço BRL e texto
├── models/        # Modelos tipados de obras, publicações e volumes
├── repositories/  # PostgreSQL via psycopg, transações e upserts
├── services/      # Importação, sincronização, checkpoint e métricas
└── cli.py         # Comandos import, sync, backfill e estado operacional
```

## Fluxo e comandos

```powershell
# Simular importação sem escrita
py -m collector.src.cli import --limit 5 --dry-run

# Atualizar páginas modificadas
py -m collector.src.cli sync --limit 50

# Backfill progressivo, retomável por checkpoint
py -m collector.src.cli backfill --batch-size 100 --resume

# Estado operacional da fonte e falhas registradas
py -m collector.src.cli source-status
py -m collector.src.cli failures
```

O backfill avança por páginas de até 100 fichas e registra checkpoint; `--resume` continua o trabalho interrompido. A listagem solicita `content.rendered` e o Collector analisa esse HTML em memória, salvando apenas os dados normalizados e as referências/hash da origem. Se uma ficha não trouxer HTML na resposta, o Collector consulta o detalhe individualmente. `--force-reparse` reinterpreta também páginas já conhecidas pelo Collector, necessário quando uma atualização do parser deve enriquecer registros existentes. No Windows, `./backfill-loop.ps1 -ForceReparse` retoma em páginas com espera, consulta estado e interrompe em erro, suspensão, bloqueio ou fim do catálogo. Não execute concorrentes contra a mesma origem.

O painel admin pode iniciar a mesma rotina sem PowerShell: a API Fastify executa lotes Python predefinidos, publica o estado via SSE autenticado e preserva o último checkpoint ao pausar entre lotes. Configure `COLLECTOR_PYTHON_EXECUTABLE` e `COLLECTOR_PROJECT_ROOT` quando necessário; veja o [runbook operacional](../collector/operational-runbook.md).

## Publicações e persistência

O parser percorre todas as tabelas de volume da ficha e associa cada uma ao cabeçalho de publicação mais próximo. O serviço transforma os grupos em `PublicationCollected`, mantendo separadas quantidades e preços. A identidade de uma edição inclui obra, editora e chave derivada da publicação. Volumes e variantes continuam vinculados à sua edição.

Formatos editoriais (`regular`, `two_in_one`, `three_in_one`, `omnibus`, `definitive`, `deluxe`, `other`, `unknown`) incluem texto de evidência; os detalhes físicos da ficha ocupam campo separado. Uma classificação ausente fica `unknown`, sem assumir Tankobon/regular. Ver [documentação de formatos](../data/publication-formats.md).

Upserts preservam valores já conhecidos quando uma nova captura omite informação. Novas observações de preço são gravadas quando o valor fornecido muda; `observedAt` representa a coleta e não a data do reajuste. Referências externas mantêm hash, data de modificação, resultado de sincronização e checkpoint.

## Resiliência e limites

As falhas de ficha podem ser registradas e repetidas isoladamente. HTTP 429 gera espera/suspensão; bloqueios e falhas de estado não devem ser convertidos em sucesso para manter o loop. Configure intervalo, tentativas, concorrência e pausas conforme `.env.example`. O runbook de [rate limit e segurança](../collector/security-and-rate-limiting.md), [recuperação](../collector/recovery-runbook.md) e [backfill progressivo](../collector/progressive-import-runbook.md) cobre operações detalhadas.

Os testes locais do parser usam fixtures e não medem latência nem disponibilidade BBM: `npm run test:collector` e `npm run lint:collector`.

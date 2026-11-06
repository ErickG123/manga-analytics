# Paginação e checkpoints do Collector

## Modos

- `import --limit N` lê até N itens da listagem começando na página 1; mantém `modified desc` para o lote recente. `--limit` conta obras descobertas/avaliadas, não obras novas. Pode atravessar páginas, até os limites configurados.
- `sync --limit N` consulta a janela de modificações com `modified_after`/`modified_before`, em ordem crescente de ID; por padrão avalia até 50 fichas por execução (sujeito a `COLLECTOR_MAX_ITEMS_PER_RUN`). Só baixa detalhes cujo `modified` diverge do checkpoint salvo.
- `backfill --batch-size N --resume` percorre o catálogo progressivamente com `orderby=id&order=asc`, que é mais estável diante de novas páginas publicadas no final do catálogo. Cada chamada processa até N fichas de uma página e salva página/offset confirmados em `collector_checkpoints`.
- `--force-refresh` ignora o atalho por `modified`; não cria observação de preço se os valores não mudaram.

A primeira janela incremental exige o checkpoint `catalog` concluído e começa no início da última varredura completa, para cobrir alterações feitas enquanto o backfill percorria a fonte. O cursor avança só ao concluir a janela. A janela ativa e seu offset são salvos no escopo `sync`; nova execução retoma do ponto pendente. O filtro usa sobreposição dinâmica, com mínimo de cinco minutos e aumentando para cobrir o intervalo varrido anteriormente, para reexaminar registros caso atualizações concorrentes alterem a paginação.

## Paginação e headers

O client incrementa `page`, respeita `per_page` até 100 e `COLLECTOR_MAX_PAGES_PER_RUN`. Quando presente, `X-WP-TotalPages` auxilia a detectar o fim; um header inválido/inconsistente não é tratado como cursor confiável. Sem esse header, uma página vazia ou menor que `per_page` encerra a leitura. Payload diferente de array é registrado como erro de descoberta.

Uma página não é um cursor imutável quando a ordenação é por `modified`. Backfill usa IDs crescentes: novas páginas WordPress normalmente recebem IDs maiores e são anexadas depois dos já percorridos. O Collector deduplica persistência por referência externa e chaves únicas de edição/volume. Isso reduz o risco de deslocamento; não promete consistência absoluta se a fonte apagar, reparentear ou reordenar registros durante a varredura. Uma nova passagem completa pode ser usada para reconciliação.

## Checkpoint e falhas

O checkpoint tem chave `(sourceId, scope)` e registra modo, status, próxima página, último ID confirmado, total processado e atualização. Ele é alterado só depois do lote terminar sem falhas. Se uma ficha falhar, a página é repetida na retomada; itens previamente confirmados nela são ignorados via `modified`/hash e upserts idempotentes. Há uma janela entre a transação dos dados de uma obra e o checkpoint da página: uma queda nessa janela pode repetir o trabalho, mas não deve duplicar obras/volumes nem observações iguais.

Um lock no status impede outro backfill simultâneo. Um `running` parado por mais de 45 minutos pode ser retomado, sempre da última página confirmada. Reset muda apenas a posição e contadores do checkpoint; não exclui catálogo, preços ou jobs. Dry-run não adquire nem altera checkpoint.

Use `py -m collector.src.cli sync --limit 50`. Se o JSON indicar `window_complete: false`, execute o comando novamente para continuar a mesma janela; quando for `true`, o cursor foi avançado e a próxima execução abre uma janela nova. `--dry-run` simula a janela atual sem alterar cursor ou dados.

## Rate limiting e limites

`COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS` tem mínimo efetivo de 5 segundos. A espera é calculada entre inícios de requisições; download lento satisfaz parte ou todo o intervalo. Retries também passam pelo limitador e somam seu backoff/`Retry-After`. Concorrência fica em 1. O teto de páginas e duração por execução continua ativo.

## Exemplos

```powershell
py -m collector.src.cli backfill --batch-size 5
py -m collector.src.cli backfill --batch-size 5 --resume
py -m collector.src.cli backfill --batch-size 10 --resume --metrics-json docs/testing/results/backfill-10.json
py -m collector.src.cli backfill --batch-size 5 --resume --dry-run
py -m collector.src.cli backfill --batch-size 5 --reset-checkpoint
```

`--reset-checkpoint` volta à página 1; o exemplo deve ser usado sem `--resume`. O backfill limita cada execução a uma página, até `--batch-size` fichas; `COLLECTOR_MAX_PAGES_PER_RUN` continua limitando o client nos modos gerais de import/sync. Verifique estado com `CollectorRepository.get_checkpoint()` ou consulta somente leitura na tabela `collector_checkpoints`. A migration TypeORM deve estar aplicada antes de backfill.

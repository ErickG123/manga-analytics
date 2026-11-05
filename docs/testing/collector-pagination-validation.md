# Validação de paginação, backfill e checkpoints

Data: 04/11/2026 (horário de São Paulo). Base auditada: branch `main` após o commit `f827790`.

## Auditoria e implementação

Antes, `import --limit N` começava sempre na página 1, usava `modified desc`, definia `per_page` como o limite e materializava os metadados em memória. Portanto, com os padrões atuais, um `--limit 10` normalmente consultava somente a primeira página; não havia posição persistente para continuar. Existia checkpoint por obra (modified/hash), mas não checkpoint de backfill.

Agora há `backfill --batch-size N [--resume]`, com ordenação `id asc` e checkpoint TypeORM `collector_checkpoints` com status, página, offset, último ID e contador. Cada item confirmado avança o offset; após a página sem bloqueio de transporte, avança para a próxima. Falhas de parsing são registradas e puladas para não prender o catálogo; 403/429 param a execução e conservam a posição anterior ao item pendente. Replays são idempotentes por referência externa e chaves únicas de edição/volume. `--reset-checkpoint` muda a posição sem excluir obras/preços. Dry-run não grava checkpoint.

A ordenação por ID reduz deslocamentos causados por novas páginas no topo da ordenação `modified`; páginas removidas/reparentadas ou alterações retroativas ainda podem exigir uma passagem de reconciliação. Não se promete consistência absoluta durante alterações concorrentes na fonte.

O client interpreta `X-WP-TotalPages` quando válido, mas também termina em página vazia/curta; payload inválido vira erro. A configuração real lida do `.env` foi: intervalo mínimo 5 s, concorrência 1, 5 páginas/client run, 50 itens/run e limite de duração 1.800 s. O limitador mede entre inícios de requisições; o tempo de resposta conta para o intervalo. Retries e `Retry-After` continuam ativos.

## Benchmark sintético no PostgreSQL isolado

Três repetições por caso, fixtures locais com 1 volume por obra, banco `manga_atlas_collector_validation`, PostgreSQL 17, sem HTTP. O teste confirma que dry-run não persiste e repetição do mesmo fixture não cria duplicações.

|     Lote | Dry-run médio | Persistência média |            Persistências criadas na 1ª repetição | Falhas |
| -------: | ------------: | -----------------: | -----------------------------------------------: | -----: |
|  5 obras |      17,97 ms |          172,39 ms |                                                5 |      0 |
| 10 obras |      18,29 ms |          363,62 ms | 5 novas; 5 já existentes no conjunto de fixtures |      0 |

As repetições seguintes foram idempotentes e não criaram novos registros. Os tempos sintéticos medem parsing/repositório local e não são comparáveis ao tempo remoto limitado por 5 s.

## Lotes reais pequenos

Execuções autorizadas, limitadas à BBM e persistidas apenas no banco isolado. Nenhuma carga completa foi iniciada.

| Caso                     | Página | Selecionadas/processadas | Criadas | Falhas | Requisições | Rate wait | Duração |
| ------------------------ | -----: | -----------------------: | ------: | -----: | ----------: | --------: | ------: |
| Dry-run 1 (5 fichas)     |      1 |                      5/5 |       0 |      0 |           6 |   19,02 s | 26,01 s |
| Dry-run 2 (5 fichas)     |      1 |                      5/5 |       0 |      0 |           6 |   24,84 s | 25,03 s |
| Dry-run 3 (5 fichas)     |      1 |                      5/5 |       0 |      0 |           6 |   24,84 s | 25,02 s |
| Persistência inicial (5) |      1 |                      5/5 |       5 |      0 |           6 |   24,61 s | 25,07 s |
| Retomada (5)             |      2 |                      5/5 |       3 |      2 |           6 |   48,27 s | 55,47 s |

Média dos dry-runs remotos: **25,35 s**. A retomada comprova avanço de página 1 para 2 e persistiu três obras. Uma ficha tinha tabela incompleta; outra resposta foi HTTP 429. O client respeitou `Retry-After` de 30 s, abriu o circuit breaker e encerrou. Nenhuma requisição remota adicional foi feita depois do 429. O checkpoint por offset foi implementado e coberto depois disso em PostgreSQL isolado; não foi revalidado remotamente devido ao bloqueio.

Após a validação completa e a suíte de integração, o banco isolado ficou com 220 obras, 220 edições, 1.756 volumes e 449 observações de preço (inclui dados de testes/benchmarks anteriores no mesmo banco). O checkpoint global usado no teste remoto ficou em status `failed`, página 2, offset 0, último ID `105587`; a execução recebeu 429 antes da implementação por offset ser implantada. As cinco obras do primeiro lote e três da retomada estão identificadas pelas métricas; não se atribui todo o total do banco a esta rodada.

## Estimativa do catálogo completo

Na listagem do primeiro lote, a API retornou `X-WP-TotalPages=261` com `per_page=5`: aproximadamente 1.301–1.305 fichas. Sob o intervalo configurado, uma varredura completa a 5 obras/página exigiria cerca de 261 consultas de lista + até 1.305 detalhes = 1.566 requisições. O limite teórico pelo intervalo é aproximadamente **2 h 10 min**. Com páginas de 10, seriam aproximadamente 131 listas + até 1.305 detalhes, ou **2 h**.

Isso é uma estimativa nominal, não SLA: o 429 observado antes de terminar a segunda página indica que a fonte pode impor limites adicionais. Repetições após falha, respostas mais lentas e mudanças no catálogo aumentam o tempo. O total de páginas pode mudar durante a varredura. A carga completa continua pendente e não foi executada.

## Testes e evidências

- `python -m ruff check collector`: aprovado.
- `COLLECTOR_TEST_DATABASE_URL=... python -m pytest collector/tests`: 34 testes aprovados, incluindo paginação mockada, offset, retomada/reset de checkpoint, idempotência, variants e importação fixture de 5/10.
- Cobertura pytest do Collector: **82%** linhas totais (`collector/src`), com 34 testes aprovados.
- `npm run check`: validar ao final desta alteração antes do commit.
- Detalhes JSON: `docs/testing/results/backfill-dry-run-*.json`, `backfill-live-5*.json` e `collector-pagination-benchmark.json`.

Comandos para continuar: veja [runbook progressivo](../collector/progressive-import-runbook.md) e [paginação/checkpoints](../collector/pagination-and-checkpoints.md).

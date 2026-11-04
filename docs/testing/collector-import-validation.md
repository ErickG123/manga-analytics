# Validação do collector, sincronização incremental e benchmark

Data da validação: 04/11/2026.

## Escopo e limite de acesso à fonte

O fluxo implementado é descoberta de metadados no BBM, obtenção da ficha, parsing HTML, normalização, validação e persistência transacional idempotente no PostgreSQL. O campo `modified` da fonte e o hash SHA-256 da ficha são usados como checkpoints em `ExternalReference`. Uma ficha com checkpoint completo e `modified` igual é ignorada sem baixar o detalhe. `--force-refresh` baixa a ficha e usa o hash para evitar gravações quando o conteúdo não mudou. Registros sem parsing completo dos volumes permanecem pendentes e podem ser tentados novamente.

O `--limit` restringe a quantidade de fichas descobertas/avaliadas; não significa quantidade de novas obras. O valor também respeita `max_items_per_run`. A primeira sincronização de registros legados sem checkpoint baixa suas fichas para criar esse estado.

As requisições limitadas abaixo foram executadas após autorização expressa do operador. O `robots.txt` não declara permissão para coleta ou armazenamento e não foi tratado como autorização. Não foi executada carga completa do catálogo. [Robots.txt do BBM](https://blogbbm.com/robots.txt)

## Baseline e ambiente isolado

Antes da importação real, a base principal foi consultada em modo somente leitura: 5 obras, 5 edições, 91 volumes, 1 editora, 20 observações de preço, 0 problemas de qualidade, 10 jobs e 0 referências externas. Não havia pares duplicados `(editionId, number)` nem `(mangaId, publisherId)`. A migration adicionou colunas de checkpoint e índices únicos sem alterar essas contagens.

Os testes de persistência usaram PostgreSQL 17 isolado (`manga_atlas_collector_validation`) e fixtures HTML locais; nenhuma requisição HTTP foi feita. O banco isolado contém os dados de teste e foi mantido.

| Rodada                     | Fichas selecionadas | Detalhes baixados da fixture | Criadas | Atualizadas | Inalteradas | Volumes | Preços observados | Tempo total |
| -------------------------- | ------------------: | ---------------------------: | ------: | ----------: | ----------: | ------: | ----------------: | ----------: |
| Limite 5                   |                   5 |                            5 |       5 |           0 |           0 |      91 |                20 |   206,04 ms |
| Limite 10, após a rodada 5 |                  10 |                            5 |       5 |           0 |           5 |      10 |                 0 |   156,01 ms |
| Repetição do limite 10     |                  10 |                            0 |       0 |           0 |          10 |       0 |                 0 |    12,24 ms |

Após as duas primeiras rodadas, os dados associados às fixtures somavam 10 obras, 10 edições, 101 volumes e 20 observações de preço; sem duplicatas de edição ou volume. A integração PostgreSQL também confirmou importação repetida sem novas observações artificiais de preço e mudança real de preço gerando observação nova. Esses tempos são locais e sintéticos; não estimam desempenho ou latência do BBM.

## Rodadas reais limitadas no BBM

Comandos executados na base de desenvolvimento `manga_atlas`:

```powershell
py -m collector.src.cli -v import --limit 5 --metrics-json docs/testing/results/collector-live-5.json
py -m collector.src.cli import --limit 10 --metrics-json docs/testing/results/collector-live-10.json
py -m collector.src.cli sync --limit 10 --metrics-json docs/testing/results/collector-live-10-recheck.json
```

| Métrica                               | Histórico informado | Importação 5 | Importação 10 |
| ------------------------------------- | ------------------: | -----------: | ------------: |
| Fichas selecionadas                   |                   5 |            5 |            10 |
| Detalhes baixados                     |       não informado |            5 |             5 |
| Obras criadas                         |                   5 |            0 |             4 |
| Obras atualizadas                     |       não informado |            5 |             0 |
| Obras inalteradas                     |       não informado |            0 |             5 |
| Falhas                                |                   0 |            0 |             1 |
| Volumes lidos nas fichas baixadas     |                  91 |           91 |           157 |
| Volumes persistidos                   |                  91 |           91 |           105 |
| Volumes com preço nas fichas baixadas |                  20 |           20 |           110 |
| Requisições HTTP                      |       não informado |            6 |             6 |
| Tempo HTTP acumulado                  |       não informado |    158,44 ms |   8.031,41 ms |
| Espera de rate limit                  |       não informado |     9.654 ms |      2.874 ms |
| Parsing                               |       não informado |     42,66 ms |      73,80 ms |
| Validação                             |       não informado |      0,15 ms |       0,20 ms |
| Persistência                          |       não informado |    171,46 ms |     155,22 ms |
| Duração total                         |         10 min 53 s | 10.050,35 ms |  11.213,86 ms |

As respostas da fonte foram HTTP 200, sem retry, timeout, 403, 429 ou 5xx. Na rodada 10, os cinco primeiros detalhes não foram baixados: os checkpoints de `modified` os classificaram como inalterados. Das cinco fichas restantes, quatro foram criadas (105 volumes) e Blue Lock falhou porque a fonte apresenta duas linhas conflitantes para o volume 27. O parser agora detecta o conflito e deixa a ficha sem persistência, em vez de enviar valores duplicados ao upsert. A sincronização limitada de rechecagem confirmou 9 inalteradas e 1 falha explícita de Blue Lock, com 2 requisições (listagem e um detalhe), em 2.047 ms.

Na primeira rodada de 5 foi detectada uma divergência de editora entre os registros legados e a fonte, que gerou edições/volumes paralelos. A reconciliação transacional posterior manteve os IDs das cinco edições originais, consolidou os 91 volumes e moveu os históricos de preço; as cópias geradas foram incorporadas sem remover observações. O comportamento correspondente foi coberto por teste PostgreSQL isolado. A base principal ficou com 9 obras, 9 edições, 196 volumes, 2 editoras (uma sem edições ativas), 110 observações de preço, 9 referências BBM completas, 0 problemas de qualidade e 11 jobs (10 concluídos e 1 job deixado em `running` por teste da API, marcado como `failed` sem apagar o registro). Não há referências externas duplicadas, pares obra/editora duplicados nem chaves edição/volume duplicadas. O aumento de 20 observações na rodada 5 decorreu da falta de vínculo/checkpoint e da edição paralela legada; as reexecuções posteriores não criaram observações adicionais para valores inalterados.

Os resultados completos, incluindo dados HTTP e mensagens de falha, estão nos JSONs em `docs/testing/results/collector-live-*.json`.

## Métricas e limitações

O collector separa tempo de requisições HTTP, espera de rate limit, download completo, parsing, validação, persistência e duração total. Conta chamadas de lista/detalhe, retries, timeouts e respostas 403/429/5xx. Os testes offline reportam zero HTTP porque usam fixtures. SQL statements/transações, tempo isolado de checkpoint, contagem de problemas de qualidade e metadados de versão/build não são instrumentados.

Configuração padrão auditada: intervalo mínimo de 2 s, concorrência 1, timeout de conexão 10 s, leitura 30 s, até 3 retries para falhas transitórias, no máximo 5 páginas, 50 itens e 1800 s por execução. Respostas 403 interrompem sem retry; 429 respeita `Retry-After` e abre o circuit breaker.

## Como reproduzir offline

```powershell
py -m pytest collector/tests -q
py -m pytest collector/tests --cov=collector.src --cov-report=term-missing
py -m ruff check collector
```

Para executar também os testes de integração PostgreSQL, configure `COLLECTOR_TEST_DATABASE_URL` apontando para um banco isolado de validação. Não use a base principal como banco de fixture.

Para operações autorizadas, a CLI suporta `import` e `sync`; opções `--dry-run`, `--force-refresh` e `--metrics-json` estão documentadas em [runbook operacional](../collector/operational-runbook.md). A autorização do operador cobriu as rodadas limitadas desta validação; lotes maiores aguardam análise das condições de uso da fonte. Uma falha de parsing ou status 403/429 deve interromper qualquer expansão do lote até análise.

## Histórico fornecido pelo operador

O histórico informado de 5 obras, 91 volumes e 20 preços em aproximadamente 10 min 53 s não é diretamente comparável: nesta execução foram 5 obras já existentes atualizadas em 10,05 s. O dry-run histórico de aproximadamente 10 s também não foi repetido. A divergência antiga entre duração acumulada e duração por ficha foi corrigida nas métricas: `fetch_total_duration_ms` inclui espera de rate limit, enquanto `http_duration_ms` mede somente o tempo de resposta HTTP.

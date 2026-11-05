# Retry e recuperação do Collector

## Arquitetura e limites

O `BBMClient` é a única camada que repete requisições HTTP. `COLLECTOR_MAX_RETRIES` é mantida por compatibilidade e significa **tentativas totais** (padrão 3; máximo configurável 5), não tentativas adicionais. A CLI e os repositories não repetem a mesma chamada. Um retry individual só pode ocorrer em timeout/conexão ou HTTP 500, 502, 503 e 504.

O backoff usa crescimento exponencial, jitter de 0,8–1,2, limite configurado e passa pelo limitador global em cada request. A configuração de produção continua com `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS=5` e `COLLECTOR_MAX_CONCURRENCY=1`. A espera HTTP e o backoff são métricas separadas. Para 503, `Retry-After` numérico ou HTTP-date é respeitado; um prazo maior que 60 segundos encerra a execução e persiste suspensão em vez de encurtá-lo.

## Classificação e ação

| Falha                                | Política                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Timeout/conexão, 500/502/504         | Retry HTTP limitado; se esgotado, registra `failed_retryable` e não avança o checkpoint daquela ficha.                  |
| 503 com `Retry-After` maior que 60 s | Suspende a origem até o prazo, encerra sem nova request e mantém posição.                                               |
| 429                                  | Sem retry e sem sleep prolongado; grava status `suspended`, prazo UTC e resposta, encerra job como `rate_limited`.      |
| 403                                  | Sem retry; grava `blocked` sem expiração e exige revisão manual.                                                        |
| 400/404                              | Falha `failed_permanent`; sem download repetido automático.                                                             |
| HTML/tabela inválida                 | Registra `needs_review`; checkpoint pode avançar após o registro durável.                                               |
| Erro PostgreSQL                      | Não tenta novamente às cegas nem avança a ficha; transação do upsert é revertida e replay idempotente pode recuperá-la. |
| Ctrl+C                               | Job e checkpoint marcados `interrupted`; posição confirmada fica preservada.                                            |

Header `Retry-After` aceita segundos ou data HTTP e é interpretado em UTC. Valor ausente, inválido, negativo efetivo ou data passada/zero em 429 adota `COLLECTOR_RATE_LIMIT_FALLBACK_SECONDS` (padrão 900 s). Um 429 com prazo maior que 30 dias vira bloqueio manual, sem prazo, para evitar encurtar uma ordem longa do servidor. Uma nova execução durante cooldown é bloqueada antes de descobrir o catálogo. Após o prazo, o operador pode reavaliar e iniciar explicitamente; não há retomada autônoma em background. O 403 nunca expira sozinho.

Dry-run continua sem gravar obras, jobs ou checkpoints, mas ainda consulta o estado da origem e persiste uma suspensão 429/403 recebida. Esse metadado é uma trava de segurança para impedir que a próxima execução ignore a resposta do servidor.

## Persistência e consistência

Migrations TypeORM adicionam `collector_source_states`, `collector_failures`, campos de métricas/checkpoint em `import_jobs` e índice único de job `running` por fonte. Cada execução gravada tem estado final, tipo, duração/métricas no JSON, motivo e checkpoint observado. Falhas individuais têm fonte, ID externo, URL, categoria/status, mensagem limitada e sanitizada, tentativas, status HTTP e job. `retry-failed` seleciona apenas `failed_retryable`; sucesso marca a pendência como resolvida. `needs_review` e `failed_permanent` não são baixadas automaticamente.

O upsert de uma obra e seus volumes, variantes e preços ocorre em uma transação PostgreSQL e é idempotente. A gravação do checkpoint é uma transação separada; se o processo cair entre o commit da obra e o checkpoint, a ficha será repetida e conciliada pelo upsert. Falha de parsing só autoriza avançar depois de seu registro durável. A trava parcial no PostgreSQL impede dois jobs Collector `running` na mesma origem; o checkpoint também conserva sua trava de backfill com lease.

## Comandos

```powershell
py -m collector.src.cli source-status
py -m collector.src.cli backfill --batch-size 5 --resume
py -m collector.src.cli retry-failed --limit 5
py -m collector.src.cli failures --limit 20
py -m collector.src.cli source-unblock --reason "Revisão manual da resposta 403 concluída"
```

`source-unblock` só limpa bloqueios manuais após revisão (403 ou Retry-After 429 excessivo). Ele não ignora um cooldown 429 ativo. Use `backfill --resume` para continuar do checkpoint; `--reset-checkpoint` só após decisão explícita. `retry-failed` não percorre o catálogo: busca os IDs falhados recuperáveis no banco e os consulta individualmente, ainda sujeita às regras de suspensão e intervalo.

## Variáveis

| Variável                                  | Padrão | Uso                                                                                                                                       |
| ----------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `COLLECTOR_MAX_RETRIES`                   |    `3` | Tentativas HTTP totais (compatibilidade do nome).                                                                                         |
| `COLLECTOR_HTTP_RETRY_BASE_DELAY_SECONDS` |    `5` | Base do backoff; mínimo 1 s.                                                                                                              |
| `COLLECTOR_HTTP_RETRY_MAX_DELAY_SECONDS`  |   `60` | Teto de cada backoff gerado.                                                                                                              |
| `COLLECTOR_RATE_LIMIT_FALLBACK_SECONDS`   |  `900` | Suspensão conservadora para 429 sem Retry-After utilizável.                                                                               |
| `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS`  |    `5` | Piso obrigatório; configuração menor é elevada para 5 s ao carregar `.env`. O `.env` local auditado usa 10 s, sem alteração nesta tarefa. |
| `COLLECTOR_MAX_CONCURRENCY`               |    `1` | Concorrência preservada em 1.                                                                                                             |

## Limitações

O histórico anterior não tem log por request com timestamp suficiente para recuperar todas as chamadas anteriores ao incidente. As métricas JSON provam endpoint, total daquela execução, último ID e resposta 429, mas não registram `Retry-After` como campo próprio. A suspensão persistente é aplicada a execuções novas; não foi feita coleta remota para validar comportamento. Erros SQL não recebem retry automático, pois não há confirmação segura do resultado em falhas de commit.

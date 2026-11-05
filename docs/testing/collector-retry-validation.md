# Validação — Retry, suspensão e recuperação do Collector

Data: 04/11/2026 (horário de São Paulo). Repositório auditado em `main`, HEAD inicial `2f25651`. Nenhuma request remota foi executada nesta tarefa.

## Diagnóstico histórico verificado

O JSON `docs/testing/results/backfill-live-5-resume.json` registra a execução de retomada em 05/11 UTC (timestamp produzido pelo artefato, embora o relatório anterior esteja datado de 04/11 local). Foram 6 requests lógicas: 1 listagem da página 2 e 5 detalhes. O último detalhe retornou 429 em `/wp-json/wp/v2/pages/105587` (Abara); a métrica marcou 1 status 429, 0 retries e 0 403/5xx. O `Retry-After: 30` é reportado no resumo de validação anterior; o JSON não persiste o header em campo estruturado. A espera total de rate limiting reportada foi 48,268 s, que inclui 30 s de espera pelo header mais o intervalo normal. Não há request no JSON após o 429: o último ID e a falha são o mesmo.

O client anterior abria o circuit breaker em memória e dormia 30 s antes de encerrar; reiniciar o processo removia esse cooldown. O checkpoint reportado continuou na página 2, offset 0, status `failed`, com `lastExternalId=105587`. Como esse último ID coincide com a ficha que recebeu 429, não é evidência suficiente de confirmação da ficha; o replay da página pode repetir as obras já gravadas, mitigado pelos upserts idempotentes. O histórico não prova o timestamp individual de cada request nem a semântica exata do último ID.

## Alterações

- Retry HTTP centralizado com tentativas totais limitadas (`COLLECTOR_MAX_RETRIES`, padrão 3), backoff exponencial com jitter e teto, timeout/conexão e 500/502/503/504.
- 429 agora não dorme nem repete: persiste suspensão e `Retry-After` ou cooldown conservador; 403 cria bloqueio manual sem expiração. 503 com `Retry-After` superior ao orçamento também persiste suspensão para não permitir reexecução antes do prazo.
- Guarda persistente antes de novo job/request, expiração automática apenas de cooldown temporário e CLI explícita para reconhecer 403 após revisão.
- Jobs persistem estado terminal, tipo, motivo, métricas e checkpoint. Índice único no PostgreSQL impede jobs Collector concorrentes por fonte.
- Falhas individuais ficam duráveis. Parsing determinístico vira `needs_review`; fichas recuperáveis ficam `failed_retryable`; `retry-failed` consulta apenas recuperáveis. Erro de banco não avança checkpoint.
- Painel administrativo mostra estado da origem, prazo, checkpoint, pendências e status de execução.

## Validações executadas

| Comando/cenário                                                                               | Resultado                                                                                                                               |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `python -m pytest collector/tests -q`                                                         | 47 passaram, 7 integração ignoradas sem URL de teste.                                                                                   |
| PostgreSQL 17 temporário + `COLLECTOR_TEST_DATABASE_URL`; suíte Collector com cobertura       | 54 passaram; integração executou sem skips.                                                                                             |
| Cobertura `collector.src`                                                                     | 80% total (BBM client 87%, repository 81%, import service 65%).                                                                         |
| Retry-After numérico/data HTTP, 403, 429, 503 adiado, backoff e ausência de request posterior | Coberto por mocks sem sleeps de rede.                                                                                                   |
| Suspensão e falha individuais após recriar Repository                                         | Passou em PostgreSQL temporário dedicado. O prazo persistido foi lido por uma segunda instância; a falha durável também foi consultada. |
| Checkpoint, persistência/upsert e idempotência PostgreSQL                                     | Passaram na mesma suíte isolada; não se usou o banco principal para dados dos testes.                                                   |
| `python -m ruff check collector`                                                              | Aprovado.                                                                                                                               |
| `npm run check`                                                                               | Aprovado: Prettier, ESLint, 25 testes frontend, 16 API e build Angular.                                                                 |

O PostgreSQL temporário usado nos testes foi separado do container do projeto e contém apenas dados de fixture. Nenhuma métrica de benchmark remoto foi coletada nesta validação. O `npm run check` inicializou as migrations também no banco indicado pelo `.env`: nenhum registro de obra/preço foi removido, e um job `running` com mais de 45 minutos (ID iniciado por `53b07a4a`) foi marcado `interrupted` pela reconciliação explícita da migration. As duas migrations novas ficaram registradas nesse banco.

## Limitações e próximo passo

- O retry SQL não é automático. A persistência é transacional e idempotente, mas erros de commit com resultado desconhecido exigem replay seguro.
- `resumeCount` é cumulativo para execuções de backfill retomadas e foi validado junto ao lock por fonte.
- `retry-failed` resolve fichas recuperáveis; fichas de qualidade determinística requerem revisão e não são automaticamente rebaixadas para retry.
- A suíte testa persistência após reinicializar objetos de repositório no mesmo servidor PostgreSQL; reiniciar fisicamente o container não foi necessário para comprovar durabilidade em disco.
- Recomenda-se primeira validação remota futura somente após o operador revisar `source-status`, com lote explícito de no máximo uma ficha e intervalo de 5 s, sem provocar 429. Nenhuma validação remota está autorizada por este relatório.

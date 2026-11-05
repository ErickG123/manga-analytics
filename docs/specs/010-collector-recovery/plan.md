# Plano — Recuperação segura do Collector

1. Centralizar erros HTTP tipados no `BBMClient`, com tentativas totais limitadas, backoff exponencial limitado e tratamento de Retry-After.
2. Adicionar migration TypeORM para estado da fonte, execuções do collector e falhas individuais. O client Python seguirá usando SQL parametrizado no PostgreSQL, sem criar uma segunda camada de retry.
3. Antes de qualquer coleta, validar estado persistido da fonte; 429 grava cooldown conservador e 403 grava bloqueio manual.
4. Registrar job, métricas e motivo terminal. Tratar Ctrl+C como interrupção, preservando checkpoint confirmado.
5. Persistir ficha inválida/falha individual antes de avançar checkpoint; fornecer listagem e reprocessamento limitado apenas para pendências elegíveis.
6. Reutilizar lock de checkpoint com lease existente para backfill e registrar histórico por execução.
7. Cobrir client e orquestração com mocks; executar integração apenas em banco isolado declarado por `COLLECTOR_TEST_DATABASE_URL`.
8. Atualizar runbooks, documentação técnica e relatório de validação. Não executar chamadas remotas.

## Riscos e decisões

- A base não possui evidência completa do evento remoto histórico; não inferir endpoint/contagem além dos JSON e logs versionados.
- Job + checkpoint + obra usam transações distintas. Upsert de obra é transacional/idempotente; falha entre commit da obra e checkpoint provoca replay seguro, não perda.
- Falhas de parsing são `needs_review`; falhas transitórias de transporte não avançam checkpoint. Bloqueios 403/429 nunca o avançam.
- Retry de SQL não será adicionado sem distinguir erro transitório e resultado de commit; operações DB falham e o replay idempotente recupera.

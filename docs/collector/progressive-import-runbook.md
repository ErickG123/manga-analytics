# Runbook de importação progressiva

1. Inicie PostgreSQL e API para aplicar migrations TypeORM: `npm run docker:up` e `npm run api:start`.
2. Confirme no `.env` `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS=5.0`, `COLLECTOR_MAX_CONCURRENCY=1` e a URL de banco correta.
3. Consulte checkpoint `bbm/catalog`; confirme que não há execução `running` recente.
4. Faça simulação limitada: `py -m collector.src.cli backfill --batch-size 5 --dry-run --metrics-json docs/testing/results/backfill-dry-run.json`. O dry-run não avança checkpoint.
5. Execute lote controlado: `py -m collector.src.cli backfill --batch-size 5 --metrics-json docs/testing/results/backfill-5.json`.
6. Revise métricas, falhas e checkpoint. Em caso de falha, analise antes de continuar; o checkpoint mantém a página para replay.
7. Continue com `py -m collector.src.cli backfill --batch-size 5 --resume --metrics-json docs/testing/results/backfill-5-resume.json`. Confirme que a página e os IDs avançaram.
8. Lotes maiores usam `--batch-size 10 --resume`; cada chamada avança no máximo uma página, limitada por `COLLECTOR_MAX_ITEMS_PER_RUN`, duração máxima e intervalo mínimo.
9. Para interromper, encerre o processo com Ctrl+C. A página não confirmada será repetida. Não inicie outro backfill enquanto o lock estiver ativo.
10. `--reset-checkpoint` somente reinicia a posição; não remove dados. Não pode ser usado enquanto o checkpoint estiver ativo.
11. Verifique jobs/métricas JSON e integridade de referências, edição/volume e observações. A persistência é idempotente para replay.
12. O catálogo é marcado `completed` quando a API sinaliza fim por `X-WP-TotalPages` ou página curta/vazia. Como a ordenação da fonte pode mudar, planeje uma passagem de reconciliação e não interprete um checkpoint completo como garantia matemática contra alterações concorrentes.
13. Sincronizações futuras de obras recentes continuam usando `py -m collector.src.cli sync --limit 10`; isso não reinicia o backfill.

Ver detalhes técnicos e limitações em [Paginação e checkpoints](pagination-and-checkpoints.md).

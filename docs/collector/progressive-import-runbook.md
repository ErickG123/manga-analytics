# Runbook de importação progressiva

1. Inicie PostgreSQL: `docker compose up -d postgres`. Inicie a API brevemente para aplicar migrations TypeORM (`npm run api:start`) e depois pare o processo se não for necessário para outras telas.
2. Confirme no `.env` o intervalo configurado, `COLLECTOR_MAX_CONCURRENCY=1` e a URL de banco correta. O processo em execução deve usar o mínimo de 10 segundos entre requisições para a passagem atual.
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
13. Depois do catálogo completo, use `py -m collector.src.cli sync --limit 50` para mudanças incrementais. Repita enquanto a saída indicar `window_complete: false`; a janela é retomada pelo checkpoint. Agende esse comando periodicamente para acompanhar mudanças futuras.
14. Para corrigir somente editoras das fichas já importadas, valide primeiro com `py -m collector.src.cli repair-publishers --dry-run` e depois execute `py -m collector.src.cli repair-publishers`. Esse fluxo lê o conteúdo nas listagens de até 100 fichas por requisição e atualiza apenas o vínculo da editora.
15. Para alterações de parser que afetem volumes, preços, variantes ou formato editorial, use uma passagem completa forçada: `py -m collector.src.cli backfill --batch-size 100 --reset-checkpoint --force-reparse`, seguida de `./backfill-loop.ps1 -ForceReparse`. O primeiro comando reinicia o checkpoint sem apagar dados e processa a primeira página; o loop retoma da página seguinte. O backfill busca conteúdo de até 100 fichas por requisição de listagem, processa e persiste cada ficha individualmente e mantém fallback para consulta de detalhes quando o conteúdo não vier na listagem. Para aproximadamente 1.200 fichas, são cerca de 12–13 requisições de listagem, mais detalhes de fallback e eventuais retries; a duração final depende do intervalo configurado, do tempo de resposta e da fonte.

Ver detalhes técnicos e limitações em [Paginação e checkpoints](pagination-and-checkpoints.md).

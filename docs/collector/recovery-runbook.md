# Runbook de recuperação do Collector

## Inspecionar a origem e o progresso

```powershell
py -m collector.src.cli source-status
py -m collector.src.cli failures --limit 20
```

O estado da origem informa `active`, `suspended` (429 ou 503 adiado) ou `blocked` (403), prazo UTC, motivo e último status HTTP. O painel administrativo também exibe suspensão, checkpoint e quantidade de fichas pendentes. Um job suspenso/bloqueado aparece no histórico com seu motivo terminal.

Para conferir checkpoint diretamente:

```sql
SELECT "sourceId", scope, status, "currentPage", "currentOffset", "lastExternalId", "processedCount", "updatedAt"
FROM collector_checkpoints WHERE "sourceId" = 'bbm' AND scope = 'catalog';
```

## Retomar um backfill elegível

1. Confira `source-status`; não execute se a origem estiver suspensa ou bloqueada.
2. Confira que não há job `running` e verifique o motivo da última execução.
3. Após terminar o cooldown 429/503, avalie novamente o acesso e execute explicitamente:

```powershell
py -m collector.src.cli backfill --batch-size 5 --resume
```

O processo não agenda a retomada sozinho. A execução repetida é segura porque os upserts de obra/edição/volume/variante/preço são idempotentes. Um bloqueio ativo ou job concorrente impede chamadas.

## Revisar HTTP 403

O 403 não tem expiração automática. Consulte log e causa com o responsável pela origem. Só após a avaliação, registre o motivo e reconheça o bloqueio:

```powershell
py -m collector.src.cli source-unblock --reason "Descrever a revisão operacional concluída"
```

Esse comando também pode liberar um 429 cujo `Retry-After` exceda 30 dias, depois de avaliação explícita. Não remove um cooldown 429 ativo.

## Fichas individuais

`failures` mostra fichas `failed_retryable`, `failed_permanent` e `needs_review`. Reprocessamento limitado:

```powershell
py -m collector.src.cli retry-failed --limit 5
```

Somente `failed_retryable` é elegível. A rotina respeita cooldown e rate limit, registra um novo job e marca a falha resolvida apenas após persistir a ficha. Para conteúdo incompleto, revise a fonte/fixture antes de qualquer ajuste; não fique repetindo parsing determinístico.

## Interrupção, banco e concorrência

- Ctrl+C termina com status `interrupted`; o checkpoint confirma somente os itens já persistidos ou registrados como pendência.
- `failed` por banco mantém a obra na posição de replay. Verifique disponibilidade e logs do PostgreSQL; depois use `--resume`.
- Um índice PostgreSQL impede mais de um job Collector `running` por fonte. Não remova o lock manualmente; jobs abandonados com mais de 45 minutos são reconciliados em novo início.
- Um erro `needs_review` não é perda silenciosa: consta em `collector_failures` e a página pode avançar com segurança.

## Consultas operacionais

```sql
SELECT id, "runType", status, "startedAt", "finishedAt", "terminationReason", "checkpointPage", "checkpointOffset", metrics
FROM import_jobs WHERE "sourceId" = 'bbm' ORDER BY "createdAt" DESC LIMIT 20;

SELECT "externalId", category, status, attempts, "lastHttpStatus", "updatedAt", message
FROM collector_failures WHERE "sourceId" = 'bbm' AND status <> 'resolved'
ORDER BY "updatedAt";
```

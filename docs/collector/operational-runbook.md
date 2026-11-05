# Runbook Operacional do Coletor Python — Mangá Atlas

Este guia orienta os operadores e desenvolvedores na execução, diagnóstico e solução de incidentes do coletor de dados.

---

## 1. Comandos de Execução da CLI

### 1.1 Execução em Modo de Simulação (Dry-Run)

Recomendado para testar parsing e conectividade sem alterar o banco de dados:

```bash
python -m collector.src.cli import --limit 5 --dry-run
```

### 1.2 Importação Limitada Controlada

Executa coleta segura de um lote pequeno de obras persistindo no PostgreSQL:

```bash
python -m collector.src.cli import --limit 10
```

### 1.3 Sincronização Incremental

Avalia até cinco fichas recentes por padrão. `--limit` limita fichas selecionadas, não novas obras. Checkpoints completos com `modified` inalterado não baixam a ficha novamente. Registros legados sem checkpoint recebem uma carga detalhada na primeira execução.

```bash
python -m collector.src.cli sync --limit 10 --dry-run
```

`--force-refresh` baixa novamente os detalhes; o hash do HTML evita persistência quando o conteúdo não mudou. `--metrics-json caminho/relatorio.json` exporta métricas da execução. O dry-run não persiste dados.

**Restrição vigente:** a validação remota está bloqueada enquanto não houver confirmação de autorização e condições de coleta/armazenamento pela fonte. `robots.txt` não constitui essa autorização. Os testes aprovados usam fixtures locais e PostgreSQL isolado; veja o [relatório de validação](../testing/collector-import-validation.md).

---

## 2. Tratamento de Incidentes Operacionais

### 2.1 Incidente: HTTP 429 Too Many Requests

- **Comportamento automático:** O coletor persiste a suspensão e o prazo UTC, encerra o job e preserva o checkpoint. Novas execuções não fazem requests antes do fim do cooldown.
- **Ação do Operador:** Consulte `py -m collector.src.cli source-status`; após o prazo, reavalie e retome com `backfill --resume`. Veja o [runbook de recuperação](recovery-runbook.md).

### 2.2 Incidente: HTTP 403 Forbidden

- **Sintoma:** Log `HTTP 403 Forbidden: Acesso rejeitado pela fonte. Interrompendo sem retry.`.
- **Comportamento automático:** A coleta é abortada imediatamente e o estado `blocked` permanece no PostgreSQL.
- **Ação do Operador:** Investigue a resposta e avalie a política da fonte. Após revisão explícita, use `source-unblock --reason ...`; não contorne a rejeição.

### 2.3 Recuperação de Jobs Abandonados

A API Fastify executa uma rotina automática de reconciliação em `/api/admin/stats` e `/api/admin/jobs`: qualquer job que permaneça em status `running` por mais de 30 minutos (devido a queda de processo ou reinicialização do servidor) é automaticamente marcado como `failed`, liberando o lock de concorrência para novas execuções.

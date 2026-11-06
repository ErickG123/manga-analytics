# Runbook Operacional do Coletor Python — Mangá Atlas

Este guia orienta os operadores e desenvolvedores na execução, diagnóstico e solução de incidentes do coletor de dados.

---

## 1. Comandos de Execução da CLI

### 1.0 Console Administrativo

O painel em `/admin/monitoramento` pode iniciar ou retomar o reprocessamento, reiniciar o checkpoint, solicitar pausa após o lote atual e exibir progresso/falhas em atualização ao vivo. O servidor Fastify executa o comando Python com argumentos fixos; o navegador não envia comandos de shell. A pausa preserva o último checkpoint confirmado.

Configure `COLLECTOR_PYTHON_EXECUTABLE` quando o Python não estiver no `PATH` (`py` é o padrão no Windows; `python3` nos demais sistemas) e `COLLECTOR_PROJECT_ROOT` se o diretório de trabalho do processo API não for a raiz do repositório. O servidor da API precisa ter o módulo `collector/`, dependências Python instaladas, acesso ao PostgreSQL e saída HTTPS para o BBM. A tela transmite estado por SSE autenticado e consulta o checkpoint persistido para se recuperar de recarregamentos.

O progresso percentual usa o total de itens informado pelo WordPress e o contador de checkpoint, portanto é estimado e pode variar se o catálogo mudar durante a coleta. Falhas de captura e fichas `needs_review` permanecem registradas em `collector_failures` e são listadas no painel.

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

**Autorização operacional:** o operador deste projeto autorizou consultas remotas ao BBM mesmo quando `robots.txt` não permita a rota. Essa autorização não instrui o Collector a ignorar respostas do servidor: 429 aciona cooldown e 403 mantém a origem bloqueada para revisão. Não contorne status HTTP nem aumente concorrência para acelerar uma carga. As simulações e testes locais continuam separados de uma importação persistente; consulte o [relatório de validação](../testing/collector-import-validation.md).

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

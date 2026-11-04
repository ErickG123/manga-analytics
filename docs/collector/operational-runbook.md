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

- **Sintoma:** Log `HTTP 429 recebido! Respeitando Retry-After de Xs...`.
- **Comportamento automático:** O coletor suspende as requisições pelo tempo estipulado no header e abre o circuit breaker para evitar novas rajadas.
- **Ação do Operador:** Não forçar reexecuções manuais imediatas. Aguardar o término do cooldown e aumentar o valor de `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS` no `.env`.

### 2.2 Incidente: HTTP 403 Forbidden

- **Sintoma:** Log `HTTP 403 Forbidden: Acesso rejeitado pela fonte. Interrompendo sem retry.`.
- **Comportamento automático:** A coleta é abortada imediatamente.
- **Ação do Operador:** Verificar a integridade do User-Agent e confirmar eventuais alterações de política junto aos administradores da fonte. **Não utilizar técnicas de contorno ou spoofing de cabeçalhos.**

### 2.3 Recuperação de Jobs Abandonados

A API Fastify executa uma rotina automática de reconciliação em `/api/admin/stats` e `/api/admin/jobs`: qualquer job que permaneça em status `running` por mais de 30 minutos (devido a queda de processo ou reinicialização do servidor) é automaticamente marcado como `failed`, liberando o lock de concorrência para novas execuções.

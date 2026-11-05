# Spec 010 — Recuperação segura do Collector

## Objetivo

Adicionar retries HTTP transitórios limitados e centralizados, suspensão persistente da origem em 429, bloqueio com revisão em 403, histórico de execução e registro durável de fichas que precisam de revisão. A retomada deve preservar o checkpoint e não emitir requisições enquanto a origem estiver bloqueada.

## Requisitos

- `COLLECTOR_MAX_RETRIES` continua representando tentativas totais e não retries adicionais.
- Produção mantém intervalo mínimo de 5 segundos e concorrência 1.
- Retry só para timeout, conexão e HTTP 500/502/503/504, com backoff limitado e respeito a Retry-After em 503.
- HTTP 429 persiste cooldown UTC, finaliza a execução sem espera longa e bloqueia novos jobs até expirar.
- HTTP 403 persiste bloqueio sem expiração automática; desbloqueio exige comando e motivo explícitos.
- Checkpoint só avança depois de persistência confirmada ou falha individual duravelmente registrada.
- Jobs e falhas individuais têm histórico consultável no PostgreSQL.
- Locks no banco continuam impedindo backfills concorrentes.
- Testes locais e de PostgreSQL isolado comprovam retry, suspensão, checkpoint e idempotência. Nenhuma coleta real é executada.

## Fora de escopo

Importação completa, aumento de concorrência, redução de intervalo, contorno de bloqueios, UI administrativa nova e retry ilimitado.

## Critérios de aceite

Ver checklist em `tasks.md`; o relatório final deve separar fatos verificados de limitações dos logs históricos.

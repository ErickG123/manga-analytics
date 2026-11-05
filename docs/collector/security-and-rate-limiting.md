# Segurança, Rate Limiting e Confiabilidade do Coletor Python

Este documento estabelece a política de consumo ético, seguro e responsável dos dados públicos da Biblioteca Brasileira de Mangás (BBM).

---

## 1. Princípios de Consumo Responsável

O coletor opera sob o princípio de não sobrecarga da infraestrutura da BBM:

- **Rate Limiting:** Todas as requisições respeitam um intervalo mínimo obrigatório de 5 segundos (configurado em `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS`), sem concorrência paralela (`max_concurrency = 1`). O intervalo é medido entre os inícios das requisições; o tempo da resposta conta para o intervalo.
- **Respeito a `Retry-After`:** O cliente interpreta segundos ou data HTTP. Em 429 persiste o prazo e encerra o processo; em 503 retries limitados respeitam o prazo e adiam a execução se excederem o orçamento.
- **Tratamento de `403 Forbidden`:** O coletor interrompe imediatamente o lote de requisições diante de um código `403`. **É terminantemente proibido qualquer tentativa de contorno, bypass, spoofing de IP ou rotação de proxies.**
- **Bloqueio persistente:** 429 grava cooldown em PostgreSQL; 403 grava bloqueio sem expiração. O circuit breaker em memória continua protegendo a execução atual de falhas consecutivas.
- **Transparência:** O coletor utiliza User-Agent explícito:
  `MangaAtlasCollector/1.1 (+https://github.com/erick-alves/manga-analytics; research@manga-atlas.local)`

---

## 2. Parâmetros de Configuração (`collector/src/config.py`)

| Variável                                 | Padrão                                    | Descrição                                                  |
| ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `COLLECTOR_ENABLED`                      | `true`                                    | Habilita ou desabilita o processo de coleta                |
| `COLLECTOR_BASE_URL`                     | `https://blogbbm.com/wp-json/wp/v2/pages` | Endpoint oficial da WordPress REST API da BBM              |
| `COLLECTOR_PARENT_CATALOG_ID`            | `82066`                                   | ID pai da página do guia de mangás                         |
| `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS` | `5.0`                                     | Intervalo mínimo entre inícios de requisições consecutivas |
| `COLLECTOR_MAX_CONCURRENCY`              | `1`                                       | Limite de processos de coleta simultâneos                  |
| `COLLECTOR_CONNECT_TIMEOUT_SECONDS`      | `10.0`                                    | Timeout máximo para abertura de conexão TCP                |
| `COLLECTOR_READ_TIMEOUT_SECONDS`         | `30.0`                                    | Timeout máximo de leitura de resposta HTTP                 |
| `COLLECTOR_MAX_RETRIES`                  | `3`                                       | Quantidade máxima de tentativas em falhas transitórias     |
| `COLLECTOR_MAX_PAGES_PER_RUN`            | `5`                                       | Limite máximo de páginas de índice por execução            |
| `COLLECTOR_MAX_ITEMS_PER_RUN`            | `50`                                      | Limite máximo de obras a coletar por execução              |
| `COLLECTOR_DRY_RUN`                      | `false`                                   | Executa sem realizar escritas no PostgreSQL                |

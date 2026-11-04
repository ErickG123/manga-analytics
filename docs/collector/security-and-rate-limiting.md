# Segurança, Rate Limiting e Confiabilidade do Coletor Python

Este documento estabelece a política de consumo ético, seguro e responsável dos dados públicos da Biblioteca Brasileira de Mangás (BBM).

---

## 1. Princípios de Consumo Responsável

O coletor opera sob o princípio de não sobrecarga da infraestrutura da BBM:

- **Rate Limiting:** Todas as requisições respeitam um intervalo mínimo obrigatório configurado em `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS` (padrão de 2.0 segundos), sem concorrência paralela (`max_concurrency = 1`).
- **Respeito a `Retry-After`:** Respostas com código `429 Too Many Requests` acionam leitura do cabeçalho `Retry-After` e aguardam exatamente o tempo determinado pelo servidor.
- **Tratamento de `403 Forbidden`:** O coletor interrompe imediatamente o lote de requisições diante de um código `403`. **É terminantemente proibido qualquer tentativa de contorno, bypass, spoofing de IP ou rotação de proxies.**
- **Circuit Breaker:** Diante de respostas 429, 403 ou 5 falhas consecutivas, o circuito entra em cooldown (60 segundos) prevenindo requisições em loop.
- **Transparência:** O coletor utiliza User-Agent explícito:
  `MangaAtlasCollector/1.1 (+https://github.com/erick-alves/manga-analytics; research@manga-atlas.local)`

---

## 2. Parâmetros de Configuração (`collector/src/config.py`)

| Variável                                 | Padrão                                    | Descrição                                              |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `COLLECTOR_ENABLED`                      | `true`                                    | Habilita ou desabilita o processo de coleta            |
| `COLLECTOR_BASE_URL`                     | `https://blogbbm.com/wp-json/wp/v2/pages` | Endpoint oficial da WordPress REST API da BBM          |
| `COLLECTOR_PARENT_CATALOG_ID`            | `82066`                                   | ID pai da página do guia de mangás                     |
| `COLLECTOR_MIN_REQUEST_INTERVAL_SECONDS` | `2.0`                                     | Intervalo mínimo entre requisições consecutivas        |
| `COLLECTOR_MAX_CONCURRENCY`              | `1`                                       | Limite de processos de coleta simultâneos              |
| `COLLECTOR_CONNECT_TIMEOUT_SECONDS`      | `10.0`                                    | Timeout máximo para abertura de conexão TCP            |
| `COLLECTOR_READ_TIMEOUT_SECONDS`         | `30.0`                                    | Timeout máximo de leitura de resposta HTTP             |
| `COLLECTOR_MAX_RETRIES`                  | `3`                                       | Quantidade máxima de tentativas em falhas transitórias |
| `COLLECTOR_MAX_PAGES_PER_RUN`            | `5`                                       | Limite máximo de páginas de índice por execução        |
| `COLLECTOR_MAX_ITEMS_PER_RUN`            | `50`                                      | Limite máximo de obras a coletar por execução          |
| `COLLECTOR_DRY_RUN`                      | `false`                                   | Executa sem realizar escritas no PostgreSQL            |

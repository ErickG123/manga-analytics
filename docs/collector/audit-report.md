# Relatório de Auditoria do Coletor Python — Mangá Atlas

## 1. Funcionamento Atual e Mapeamento do Fluxo

O coletor opera em um pipeline estritamente desacoplado:

1. **Descoberta:** `BBMClient.iter_catalog_metadata()` consulta a WordPress REST API (`/wp-json/wp/v2/pages?parent=82066`) com ordenação decrescente por `modified`.
2. **Download:** `BBMClient.fetch_page(id)` obtém o payload HTML da ficha de cada obra com rate limiting e circuit breaker ativos.
3. **Parsing:** `bbm_parser.parse_bbm_page()` extrai metadados da obra e lista cronológica de volumes via BeautifulSoup.
4. **Normalização:** `data_normalizer.py` trata datas e valores financeiros com precisão `Decimal`.
5. **Validação:** `quality_validator.py` verifica regras de integridade (ISBN-10/13, precisão de datas e consistência de preços).
6. **Persistência Idempotente:** `CollectorRepository.save_manga()` realiza upserts relacionais transacionais via `psycopg`, prevenindo duplicações de obras, edições ou volumes.

---

## 2. Riscos Auditados e Mitigações Implementadas

| Risco                          | Severidade | Impacto                                            | Mitigação Implementada                                                                            |
| ------------------------------ | ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Rajadas de Requisições**     | Alto       | Bloqueio temporário de IP por flood                | Rate limiting com atraso mínimo configurável entre chamadas (`BBMClient._wait_for_rate_limit`)    |
| **Ignorar Retry-After em 429** | Alto       | Ban permanente do host da BBM                      | Leitura automática do header `Retry-After` e suspensão de novas requisições                       |
| **Bypass de 403 Forbidden**    | Crítico    | Violação ética e de termos de serviço              | Bloqueio imediato de novas tentativas diante de `403` sem rotinas de contorno                     |
| **Circuit Breaker Ausente**    | Médio      | Loops infinitos em falhas 5xx                      | Abertura do circuito por 60 segundos após 5 falhas consecutivas ou status 429/403                 |
| **Vulnerabilidade a SSRF**     | Médio      | Redirecionamento para hosts internos ou maliciosos | Validação explícita de host (`blogbbm.com`) e desativação de redirects automáticos no HTTP client |

---

## 3. Cobertura de Testes Automatizados (pytest)

- `test_bbm_client.py`: Validação de rate limiting por intervalo de tempo, abertura de circuit breaker em 429 e bloqueio de SSRF em URLs externas.
- `test_bbm_parser.py`: Extração correta de títulos, editoras, preços e volumes a partir de fixture HTML real.
- `test_quality_validator.py`: Validação matemática de algoritmos de ISBN-10, ISBN-13 e classificações de datas parciais.

## 4. Estado da validação incremental

Este relatório descreve os controles do cliente e não atesta autorização da fonte para coleta ou armazenamento. A validação incremental com fixtures locais, PostgreSQL isolado e rodadas remotas limitadas após autorização expressa do operador está em [Validação do collector](../testing/collector-import-validation.md). Qualquer expansão além desse lote limitado requer revisar as condições de acesso e uso da fonte.

Com autorização expressa do operador, também foram executadas rodadas reais limitadas a 5 e 10 fichas. Nove checkpoints foram confirmados como inalterados sem download de detalhe; Blue Lock foi barrado por linhas conflitantes do volume 27. A base terminou sem duplicatas de referência, edição ou volume. A carga completa do catálogo não foi executada; rodadas maiores dependem de revisar as condições de uso da fonte. O relatório de validação registra o primeiro erro de lote, a proteção adicionada e as métricas observadas.

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

Os resultados de lotes pequenos e checkpoints descritos no [relatório de validação](../testing/collector-import-validation.md) são históricos. Em 06/11/2026, o operador autorizou explicitamente consultas remotas ao BBM mesmo quando a rota não aparece em `robots.txt`. O Collector continua respeitando o intervalo configurado e encerra em 429/403; essa autorização não permite contornar respostas do servidor.

A ficha com publicações múltiplas (incluindo Blue Lock/Mob Psycho) motivou suporte a várias tabelas e identidade por publicação. Foi acrescentada uma migration que conserva as obras/volumes atuais e permite várias edições por obra/editora. O catálogo local tem 1.202 obras e 9.934 volumes antes de completar a atualização de metadados editoriais.

Em 06/11/2026 foi validada uma simulação remota no checkpoint: uma ficha, 19 volumes com preço, HTTP 200, nenhuma escrita no banco. O reparse foi reiniciado desde a página 1 para cobrir o catálogo inteiro. Uma ficha excedeu 100 caracteres no detalhe de formato; o campo foi ampliado para `text` e a ficha 1945 foi persistida no replay. A reconciliação também foi ampliada para migrar a edição antiga da editora original para a editora brasileira quando a ficha atual informa uma editora conhecida, mesclando volumes/preços caso já exista uma publicação canônica. A validação confirmou `.Hack` (uma edição JBC), `07-Ghost` (uma Panini) e `1945` (duas publicações NewPOP). Até 16:27 BRT, as páginas 1–2 tinham sido reprocessadas (10 fichas no checkpoint naquele momento), sem falhas; o banco continha 1.202 obras, 1.204 edições e 9.949 volumes. O dump `backups/manga-atlas-publication-formats-checkpoint-page3-20261106-1627.dump` é snapshot daquele progresso, não o dump final pós-reprocessamento. O loop anterior foi encerrado com checkpoint preservado em página 14, posição 0 (65 fichas confirmadas). O novo fluxo usa lotes de até 100 conteúdos por página e também pode ser controlado pela tela Admin; registre o término, falhas e dump final após a conclusão.

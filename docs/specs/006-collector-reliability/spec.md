# SPEC-006: Auditoria de Segurança, Rate Limiting e Confiabilidade do Collector Python

## Contexto e Objetivos

Auditoria completa do Collector Python para consumo responsável e seguro da Biblioteca Brasileira de Mangás (BBM):

1. **Rate Limiting Centralizado:** Intervalo mínimo obrigatório entre requisições configurável (`min_request_interval_seconds`) prevenindo rajadas.
2. **Proteção Contra Sobrecarga e Circuit Breaker:** Identificação e respeito estrito a `Retry-After` em respostas `429 Too Many Requests`; suspensão imediata e registro em respostas `403 Forbidden` sem tentativas de bypass; backoff exponencial com jitter para erros transitórios `5xx`.
3. **Proteção Contra SSRF e Validação de Hosts:** Verificação estrita de domínio (`blogbbm.com`) impedindo redirects ou requisições para hosts arbitrários.
4. **Identificação Transparente:** User-Agent formal e honesto identificando o projeto e canal de contato de pesquisa.
5. **Configuração Centralizada:** Módulo `config.py` tipado e documentado com variáveis de ambiente seguras.

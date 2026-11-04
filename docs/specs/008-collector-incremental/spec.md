# SPEC-008: Estado incremental e validação do Collector

## Objetivo

Reduzir downloads e gravações repetidas no Collector, preservar integridade na persistência de edições, volumes e preços, e medir importações de tamanho limitado em ambiente reproduzível.

## Requisitos

1. Checkpoint por referência externa com `modified` da fonte, hash do conteúdo, instante de sincronização e estado completo/pendente.
2. Pular download de fichas completas cujo `modified` não mudou; oferecer `--force-refresh` com comparação de hash.
3. Repetição de importação deve ser idempotente, sem volumes/edições duplicados ou observações artificiais de preço.
4. Tabela de volumes ausente ou parcialmente interpretada não pode marcar uma ficha como sincronizada.
5. CLI deve informar fichas avaliadas, criadas, atualizadas, inalteradas e falhas; expor medições e exportação JSON.
6. Validar persistência com fixtures e PostgreSQL isolado, incluindo rodadas de 5 e 10 fichas.
7. Não acessar a fonte remotamente até que coleta e armazenamento estejam autorizados e suas condições estejam esclarecidas.

## Critérios de aceite

- Repetição da mesma fixture não cria registros nem observações duplicadas.
- Alteração de preço cria nova observação sem alterar o timestamp de atualização da obra se os demais dados forem iguais.
- Rodada incremental pula detalhes previamente sincronizados.
- Relatório separa tempo HTTP, espera de rate limit, parsing, validação, banco e total.
- Benchmark usa banco isolado; nenhum registro da base principal é alterado por fixtures.
- Bloqueio de validação remota e suas razões estão documentados.

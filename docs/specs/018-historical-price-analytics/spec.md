# SPEC-018: Análises históricas de preços e comparabilidade

## Objetivo

Apresentar os preços coletados por período, editora e formato com amostra, cobertura e temporalidade explícitas, para apoiar comparações históricas do mercado brasileiro de mangás.

## Requisitos

1. Preço por ano de lançamento usa o último preço conhecido do volume e a data brasileira de lançamento; não é série de reajustes nem correção monetária.
2. Preço por mês de observação usa `PriceObservation.observedAt` e descreve somente valores/cambios observados pelo collector.
3. Preço médio, mediano e quartis por editora/formato informam volumes precificados e cobertura sobre volumes elegíveis.
4. Comparação por formato informa preço por exemplar físico e só calcula preço equivalente por volume de origem quando `volumesPerBook` ou formato regular fornece uma unidade confiável.
5. Comparação entre publicações da mesma obra usa apenas números de volume correspondentes, identifica editora/formato e declara que o número igual não garante conteúdo equivalente.
6. Preço por página só é calculado quando páginas e preço estão disponíveis; a cobertura de páginas aparece junto aos resultados.
7. Filtros globais de lançamento não podem ser confundidos com o período de observação dos preços.
8. Consultas usam TypeORM QueryBuilder, contam IDs na granularidade adequada e não convertem dados ausentes em zero.

## Critérios de aceite

- API e web expõem métricas por editora, formato, observação mensal e preço por página com amostras e cobertura.
- A tela apresenta comparações com unidade, período, origem do preço e limitações visíveis.
- Filtros, exportação CSV, fullscreen e responsividade permanecem funcionais.
- Testes cobrem cálculos/contratos e `npm run check` termina com código zero.

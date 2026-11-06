# SPEC-012: Exploração comparativa do catálogo

## Objetivo

Organizar a tela de análises para comparar editoras, acompanhar lançamentos ao longo do tempo e explorar preços com filtros compartilhados e métricas transparentes.

## Evidências do banco (2026-11-06)

- 1.202 obras, 9.934 volumes, 59 editoras com obras vinculadas e 28 variantes.
- 6.904 volumes distintos têm preço registrado; há 6.948 registros/observações, pois 44 volumes têm mais de um registro.
- Os registros de observação existentes são todos de 2026. O objetivo da série é comparar os preços de capa informados pela fonte por ano de lançamento do volume, conforme confirmado pelo usuário.
- Não chamar essa série de histórico de reajustes ou inflação: o eixo temporal é o ano de lançamento, e o valor é o preço de capa informado para aquele volume.
- 7.352 volumes têm ano/mês/dia de lançamento conhecido; 2.582 não têm ano. A série mensal deve omitir datas sem mês.
- Nenhum volume possui contagem de páginas. Métrica preço/página não deve ser apresentada como disponível.
- A categoria atualmente é `Geral` para as 1.202 obras; o filtro de categoria não oferece escolha efetiva.

## Escopo

1. Exibir uma série mensal de lançamentos por editora, respeitando filtros globais; limitar visualmente a quantidade de linhas e agrupar o restante.
2. Exibir preço de capa médio e mediano por ano de lançamento, com quantidade de volumes com preço na amostra.
3. Reorganizar os gráficos por pergunta de negócio (editoras, lançamentos, preços), reduzir excesso de categorias em gráficos e mostrar estados sem dados.
4. Exibir uma tabela ranqueada de obras por preço médio com tamanho da amostra.
5. Debounce nos filtros de texto/ano e botão de limpeza; esconder filtros sem variação de dados.
6. Dispor gráficos ao redimensionar e liberar instâncias ao sair da página.
7. Manter filtros coerentes entre indicadores e CSVs, explicitar os limites de observação de preço e precisão das datas.

## Regras de interpretação

- A linha temporal usa `releaseYear` e `releaseMonth`; datas apenas anuais/desconhecidas não viram um mês fictício.
- A comparação anual usa o preço de capa informado pela fonte para cada volume, agrupado pelo ano de lançamento. Não é evolução histórica de reajustes do mesmo volume.
- A comparação de editoras informa volume de amostra e cobertura. Não ranquear média sem preço conhecido.
- Se a série tiver poucos registros após os filtros, a interface informa isso em vez de desenhar zeros como dados observados.
- Observações históricas só poderão sustentar uma série de evolução de preços após haver capturas em anos/datas distintas.

## Critérios de aceite

- Filtros combinam-se em todos os novos gráficos e em relatórios.
- A timeline mostra editoras legíveis, meses vazios explicitamente zerados apenas dentro do período e restante agrupado.
- Média anual identifica o ano como ano de lançamento e mostra `n` da amostra.
- Obras no ranking incluem amostra e não exibem entradas sem preço.
- Período inválido ou muito amplo produz mensagem compreensível.
- Casos de filtros, ordenação, zero-amostra e interpretação temporal cobertos por testes.

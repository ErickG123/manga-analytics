# SPEC-016: Desempenho da timeline e datas de lançamento

## Objetivo

Manter os filtros PrimeNG alinhados e reduzir o custo inicial da timeline, agrupando os volumes pela data de lançamento registrada na fonte.

## Requisitos

1. Os filtros usam os estilos oficiais do PrimeNG para layout interno, ícones, limpar e foco.
2. O navegador consome a API e não acessa o banco de dados.
3. A timeline inicial recebe somente contagens agregadas por ano e mês.
4. A lista de volumes de um mês é carregada ao expandir o mês e paginada dentro do grupo.
5. Registros com ano conhecido e mês desconhecido aparecem em grupo próprio, sem atribuir mês fictício.
6. O ano considerado é o da data brasileira registrada na tabela de volumes do BBM; a data de publicação/cadastro da página WordPress não determina lançamento.
7. O intervalo inicial das análises deriva dos anos de lançamento existentes após os filtros de editora, obra, situação, preço e formato, limitado à janela de até 20 anos suportada pelos gráficos.

## Critérios de aceite

- Seletores mantêm rótulo, botão de limpar e seta dentro do controle no tema escuro.
- Abrir a timeline não consulta nem renderiza todas as capas e fichas de uma vez.
- Expandir um mês carrega sua primeira página; navegar pagina somente os resultados desse mês.
- A API retorna agregações e fichas; componentes web não usam acesso direto ao banco.
- Os anos e agrupamentos usam `releaseYear`/`releaseMonth`, preenchidos pela data brasileira do volume.
- Testes cobrem agregação, filtragem, expansão sob demanda, paginação e faixa dinâmica de anos.

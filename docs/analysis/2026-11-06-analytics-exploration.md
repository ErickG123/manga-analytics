# Análise de telas e dados — 06/11/2026

## Retrato do banco

| Indicador                           |                                   Valor |
| ----------------------------------- | --------------------------------------: |
| Obras                               |                                   1.202 |
| Volumes                             |                                   9.934 |
| Editoras com obras vinculadas       |                                      59 |
| Variantes de volume                 |                                      28 |
| Volumes distintos com preço de capa |                           6.904 (69,5%) |
| Registros de preço                  | 6.948, cobrindo 6.904 volumes distintos |
| Preço médio / mediano de capa       |                     R$ 31,89 / R$ 29,90 |
| Volumes com ano de lançamento       |                           7.352 (74,0%) |
| Volumes sem ano conhecido           |                                   2.582 |
| Contagens de páginas disponíveis    |                                       0 |

As precisões registradas nas datas são: 3.961 no dia, 3.350 no mês, 41 somente no ano e 2.582 sem ano. Os preços do site foram interpretados como preço de capa do volume no lançamento, conforme confirmação do usuário. As 6.948 observações de coleta estão datadas em 2026; para a comparação desejada, o eixo correto é o **ano de lançamento do volume**, não o ano de consulta ao site.

Há 1.202 obras na categoria `Geral`, então o filtro de categoria não ajudava a explorar o catálogo e foi ocultado enquanto só existir essa opção. A editora “Não informada” ainda está associada a 16 obras/30 volumes, e há um rótulo placeholder `—-` associado a 28 obras/273 volumes; este último merece revisão da origem antes de ser renomeado.

## Pontos encontrados e ajustes

- A tela já tinha KPIs e gráficos de preço, cobertura, lançamentos e faixas, mas não mostrava duas análises úteis que a API já podia calcular: preço por ano de lançamento e lançamento por editora ao longo do tempo.
- Exibir todas as 59 editoras nos gráficos torna os eixos e legendas difíceis de ler. Os gráficos comparativos agora focam nas 12 editoras com mais volumes e a timeline mostra até 7 séries, agrupando as demais.
- A comparação por editora agora também tem uma tabela com obras, volumes, amostra de preço, cobertura e média. Os gráficos deixam de tratar ausência de amostra como zero.
- A tela agora mostra média e mediana do preço de capa por ano de lançamento, junto ao tamanho da amostra. O gráfico não infere reajuste do mesmo volume nem inflação.
- Os filtros têm debounce de 350 ms e botão de limpeza; o filtro de categoria some quando não há mais de uma categoria.
- Respostas com erro deixam de ser convertidas silenciosamente em listas vazias/zeros. Os gráficos são liberados ao sair da tela e redimensionados junto aos painéis.
- O filtro de ano do CSV de observações agora usa o ano de lançamento do volume, consistente com os filtros da tela; a data de observação segue como informação da linha exportada.
- A ordem das faixas de preço é numérica/crescente. O KPI de lançamentos conta volumes com status lançado e ano conhecido.

## Próximas oportunidades baseadas na cobertura

- Comparação de preço por página não pode ser mostrada ainda: nenhum dos 9.934 volumes possui contagem de páginas.
- Comparação de editoras continua possível, mas recomenda-se revisar o rótulo `—-` e as 16 obras sem editora informada.
- Para séries por mês, 2.582 volumes não têm ano e não entram no agrupamento; 41 têm apenas ano e também não podem ser distribuídos por mês.
- Arquivos CSV são apropriados para o volume atual, próximo de 10 mil volumes. Caso o catálogo cresça muito, vale mudar a exportação para streaming e oferecer relatório com paginação/seleção de colunas.
- Os filtros analíticos ainda não são restaurados pela URL; isso pode ser adicionado para facilitar compartilhamento de recortes.

## Artefato de segurança

Foi gerado e validado por `pg_restore --list` o dump local `backups/manga_atlas_2026-11-06_publishers.dump` (1.602.670 bytes). `backups/` já é ignorada pelo Git para evitar publicar dados do banco.

## Validação

- `npm run check`: aprovado (formatação, ESLint, 28 testes Angular, 18 testes API e build de produção).
- `npm run test:coverage`: aprovado; 76,33% de statements, 74,02% de branches e 76,88% de linhas no escopo instrumentado.
- Verificação de emojis decorativos: aprovada.

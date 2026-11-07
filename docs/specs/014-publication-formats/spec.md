# SPEC-014: Publicações, formatos editoriais e análise do catálogo

## Objetivo

Representar separadamente cada publicação brasileira de uma obra e registrar quando os dados da fonte indicarem edição regular, 2 em 1, 3 em 1, omnibus, definitiva, deluxe, box, digital ou outro formato. Preservar o texto e a evidência de origem para distinguir fatos explícitos de classificações não identificadas.

## Requisitos

1. Uma obra pode possuir várias publicações da mesma editora, cada qual com seus próprios volumes e preços.
2. Cada publicação guarda um nome/chave de origem, classificação normalizada, rótulo textual, detalhes de formato físico, volumes compilados por livro e evidência de classificação.
3. Quando a página não trouxer evidência suficiente, a classificação será `unknown`; o sistema não deve presumir `Tankobon`.
4. O parser BBM identifica blocos de publicação e preserva volumes, datas, preços e variantes dentro do bloco correspondente.
5. A reimportação é idempotente e não mistura volumes numerados iguais de publicações diferentes.
6. API e detalhe da obra expõem metadados de cada publicação.
7. Análises oferecem filtros e agregações por classificação, incluindo publicações, obras e volumes, e distinguem dados classificados de desconhecidos.
8. Documentação explica modelo, fonte, heurísticas, lacunas conhecidas, importação, atualização do catálogo e backup.

## Taxonomia

- `regular`
- `two_in_one`
- `three_in_one`
- `omnibus`
- `definitive`
- `deluxe`
- `box_set`
- `digital_edition`
- `other`
- `unknown`

O rótulo original e a evidência BBM são preservados junto à categoria. `volumesPerBook` só é preenchido quando a fonte declarar a quantidade ou a regra for inferida com evidência rastreável.

## Critérios de aceite

- Uma mesma obra/editora aceita múltiplas publicações sem colisão de volumes.
- Um parser fixture com primeira edição regular e uma reedição 2 em 1 cria grupos separados e mantém preços/datas por volume.
- Uma página sem indicação de formato permanece desconhecida, sem rótulo regular inventado.
- Blue Lock mantém variantes especiais associadas ao volume e à publicação de origem.
- Linha `Box` na tabela é persistida como publicação `box_set`, com data/preço próprios, sem atribuir número a volume convencional.
- Cabeçalho `EDIÇÃO DIGITAL` cria uma publicação `digital_edition` distinta da edição impressa.
- Células HTML mescladas por `rowspan`/`colspan` mantêm os dados alinhados às linhas dos volumes.
- A API permite filtrar e agrupar publicações pelos formatos e informa a quantidade desconhecida.
- A suíte da aplicação, collector, integração PostgreSQL isolada e build passam.

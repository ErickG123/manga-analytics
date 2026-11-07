# Especificação: persistência parcial do Collector e preço ausente

## Contexto

O Collector está rejeitando fichas inteiras quando a tabela tem linhas que não podem ser interpretadas, cabeçalhos incompletos ou números de volume repetidos. Fichas sem tabela também não preservam os metadados básicos. A ausência de preço precisa continuar distinta de um preço numérico zero.

## Requisitos

- Persistir os volumes identificáveis mesmo quando outras linhas da ficha forem ignoradas ou ambíguas.
- Aceitar tabela com número de volume sem colunas de data brasileira ou preço; os campos permanecem ausentes.
- Preservar linhas duplicadas com dados divergentes como variantes com classificação explícita de identificação pendente.
- Salvar a obra/edição mesmo que nenhum volume seja identificável, sem inventar números de volume.
- Manter fichas parciais como pendentes de revisão e retomar seus checkpoints; erro de uma ficha não interrompe o lote.
- Um preço ausente não cria observação `R$ 0,00`; a API classifica como `not_informed` e as telas podem usar `R$ 0,00` somente como marcador com rótulo explicativo.
- Preços ausentes ficam fora de filtros de preço conhecido, agregações, médias e gráficos.

## Critérios de aceite

- Testes cobrem tabela sem preço/data, tabela parcial, duplicata divergente e persistência de ficha sem volume.
- API e telas distinguem preço real de preço não informado.
- Reprocessamento do catálogo persiste o que for válido e deixa erros de qualidade em revisão sem interromper lotes.
- Validação completa web/API/Collector passa.

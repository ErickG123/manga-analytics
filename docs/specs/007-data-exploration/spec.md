# SPEC-007: Exploração confiável do catálogo Mangá Atlas

## Objetivo

Evoluir catálogo, detalhes, calendário, análises e exportações para que funcionem com os dados reais e escalem sem carregar todo o catálogo no navegador. Padronizar ícones da interface sem emojis decorativos e medir as etapas do collector sem aumentar sua carga na BBM.

## Diagnóstico

- `MangaRepository.findMany` filtra ISBN em `volume.isbn`, embora a entidade use `isbn13`; filtros de obras com preço/capa, ordenação por volume e paginação precisam ser completados.
- `CatalogPageComponent` busca uma lista uma vez e filtra/pagina no cliente; seu repositório descarta a paginação da API.
- `MangaService.getByIdentifier` devolve `coverUrl`, mas `detail.page.html` sempre mostra iniciais e rotula dados reais como demo.
- `/api/v1/releases` retorna todos os volumes com datas parciais e o calendário aplica editora/status no cliente.
- `/api/v1/analytics/*` materializa relações inteiras, não aceita filtros globais e retorna média zero quando não há preços. O gráfico mensal não preenche lacunas explicitamente.
- Relatórios não compartilham parâmetros de filtros e carregam entidades inteiras para formar CSV.
- Templates têm emojis e glifos decorativos; a UI não tem regra automatizada direcionada a esses elementos.
- O collector tem cliente, parser e persistência sem duração por etapa; a execução inicial observada excedeu o intervalo configurado, mas é necessário medir chamadas e escrita antes de atribuir causa.

## Requisitos

1. A busca, filtros, ordenação estável e paginação do catálogo devem ser executados no PostgreSQL e refletidos em query params.
2. Filtros só serão oferecidos quando houver campos persistidos. Busca considera título, título original, autor, editora e ISBN-13.
3. Detalhes devem apresentar capas e dados existentes, preservar fallback real quando ausentes e permitir filtrar/ordenar a lista de volumes sem inventar informações.
4. Calendário deve aceitar intervalo, ano, mês, editora, obra, status e disponibilidade de preço; resposta paginada e agrupamentos não podem converter datas parciais em dias exatos.
5. Métricas globais devem ser agregadas no banco e responder ao mesmo conjunto de filtros. Médias, mediana, cobertura e tamanho de amostra devem distinguir ausência de zero e documentar que os preços usados são preços registrados por volume.
6. Séries temporais devem preencher zero somente os meses dentro do período selecionado; datas incompletas não serão convertidas em dias fictícios.
7. Exportações devem aplicar filtros, escapar CSV, proteger contra formula injection e manter Unicode.
8. Interface Angular não deve usar emojis decorativos; controles com ícone devem ser acessíveis e usar SVG consistente sem pacote desnecessário.
9. Collector deve expor duração por HTTP, parsing/normalização e persistência; medições devem usar fixtures locais e não aumentar concorrência nem reduzir o rate limit.
10. Documentar consultas, filtros, métricas, limitações e validação. Atualizar testes Angular, Fastify/PostgreSQL e Python.

## Fora de escopo

- Coleta remota em massa, carga contra BBM, mudanças destrutivas no schema, dados demonstrativos ou inferências de reajuste.
- Adicionar biblioteca de ícones enquanto SVGs locais forem suficientes.

## Critérios de aceite

- Filtros combináveis e paginação do catálogo são server-side e restauráveis pela URL.
- Detalhe usa capa da API quando disponível e oferece filtros de volumes.
- Calendário aceita filtros de período e editoras sem datas fictícias.
- Analytics mostra cobertura/amostra e as séries não inventam registros.
- CSVs respeitam filtros e sanitizam fórmulas.
- UI não tem emojis decorativos; controles por ícone têm nomes acessíveis.
- Collector registra duração por etapa sem alterar política de acesso à fonte.
- Validações Angular/Fastify/Python e `npm run check` são executadas e documentadas.

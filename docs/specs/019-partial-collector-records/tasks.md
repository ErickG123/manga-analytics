# Tarefas: persistência parcial do Collector

- [x] Permitir tabela sem data/preço e reter volumes identificados.
- [x] Salvar duplicatas divergentes como variantes em vez de descartar a ficha.
- [x] Salvar metadados básicos de fichas sem volume legível e manter a revisão aberta.
- [x] Expor `priceStatus` nos contratos de manga/calendário.
- [x] Mostrar R$ 0,00 como marcador identificado, sem criar preço falso no banco.
- [x] Cobrir comportamento com testes de parser, serviço, API e tela.
- [x] Executar validação completa.
- [x] Reprocessar catálogo com a versão corrigida e revisar novos erros; não ocorreram erros técnicos/HTTP, 107 fichas seguiram em revisão por ausência de tabela ou linhas ambíguas.

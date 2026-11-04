# SPEC-009: Variantes e edições especiais de volumes

## Objetivo

Guardar variações brasileiras do mesmo número de volume sem tratá-las como duplicatas nem sobrescrever a edição padrão. Exemplos incluem `Capa variante` e `Blind Pack`.

## Requisitos

1. Cada volume continua único por número na edição; variantes ficam associadas ao volume base.
2. Uma variante tem nome original, chave estável, data/status, capa e preço próprios quando disponíveis.
3. Histórico de preço de uma variante não pode ser confundido com o preço do volume padrão.
4. O parser identifica rótulos em colunas auxiliares da tabela BBM e em sufixos do número.
5. Duplicatas idênticas são consolidadas; duas linhas do mesmo número com rótulos de variante distintos são persistidas separadamente.
6. Conflito sem rótulo ou duplicidade conflitante do mesmo rótulo permanece erro de parsing e não persiste a ficha.
7. API e detalhe Angular expõem nome, data e preço da variante.
8. Reimportação é idempotente para volumes, variantes e observações de preço.

## Critérios de aceite

- A ficha Blue Lock preserva o volume 27 padrão e `Blind Pack` com sua data/preço próprios.
- O volume 15 padrão e `Capa variante` permanecem registros distintos ligados ao mesmo volume.
- A gravação repetida não cria outra variante ou observação para preço inalterado.
- Migração é reversível e não altera os dados atuais de volume.

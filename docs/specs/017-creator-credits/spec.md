# Especificação: créditos completos de criação

## Objetivo

Preservar todos os créditos de criação identificados nas páginas do BBM, mantendo associados os papéis informados pela fonte.

## Comportamento esperado

- O collector reconhece créditos rotulados como autor, roteiro, história, argumento, arte, desenho, ilustração, tradução, adaptação, criação, personagens e cores.
- Mais de um crédito por obra é armazenado no campo `author` como texto legível, com o papel junto ao nome.
- Créditos repetidos com o mesmo papel e nome são deduplicados.
- Quando a fonte não contém créditos reconhecíveis, a atualização não apaga o valor já persistido.
- O banco aceita textos maiores que 255 caracteres para não truncar obras com muitos colaboradores.

## Limites

A extração depende de rótulos textuais presentes na página. Créditos sem rótulo ou apresentados apenas em imagens podem não ser identificados.

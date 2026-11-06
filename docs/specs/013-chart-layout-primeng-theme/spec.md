# SPEC-013: Layout de gráficos, PrimeNG e tema escuro

## Objetivo

Melhorar a leitura dos gráficos e indicadores analíticos, padronizar os controles visíveis com PrimeNG e garantir que o tema escuro seja aplicado também aos componentes e tooltips do ECharts.

## Requisitos

1. Oferecer ação de tela cheia para cada gráfico, com saída por botão e tecla Escape, sem recriar os dados ou perder filtros.
2. Mostrar big numbers com hierarquia visual, separador de milhar pt-BR e explicação de amostra/cobertura.
3. Formatar preços como BRL, percentuais com uma casa decimal, contagens sem decimais, datas/meses em pt-BR e amostras nos tooltips/legendas.
4. Configurar PrimeNG v21 com tema Aura e seletor escuro explícito compatível com Angular 21.
5. Trocar controles nativos de filtro e ações analíticas por componentes PrimeNG, preservando rótulos, foco e acessibilidade.
6. Ativar o seletor escuro `.app-dark` no elemento raiz e manter contraste de cards, campos, tabelas, tooltips e gráficos.
7. Não usar emojis; ícones devem vir do PrimeIcons.

## Critérios de aceite

- Todo gráfico tem controle visível de tela cheia; Escape e o controle de fechar retornam à tela normal.
- ECharts redimensiona ao entrar/sair da tela cheia.
- Tooltips exibem valores em pt-BR e explicam o conceito e a amostra usada.
- Controles analíticos usam PrimeNG e ficam legíveis no tema escuro.
- `npm run check` e cobertura do frontend passam; APIs e web permanecem pausadas após validação.

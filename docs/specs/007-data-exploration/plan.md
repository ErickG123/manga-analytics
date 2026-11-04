# Plano — SPEC-007

## Abordagem

1. **Contratos e catálogo:** expandir DTOs tipados e validar parâmetros; usar `EXISTS`/joins seletivos para evitar duplicações por relações 1:N; ordenar por campos agregados com desempate por ID; fazer a API devolver página, total e facetas reais. Atualizar o contrato Angular para filtros, debounce cancelável, query params, erro/loading e controles de paginação.
2. **Detalhe e volumes:** garantir DTO completo de capa, metadados da edição e proveniência que exista no banco. Criar filtros locais somente sobre os volumes daquela obra, sem baixar outras obras; ordenar e descrever precisão de data/preço.
3. **Calendário:** validar intervalo e filtros na API, projetar campos necessários, paginar e incluir precisão da data. Agrupar no cliente sobre um intervalo carregado/paginado sem inventar dias.
4. **Analytics:** consultas agregadas PostgreSQL com filtros consistentes; cálculo monetário decimal no SQL; retornar `null` para estatísticas sem amostras, percentuais e amostras. Gerar meses vazios dentro do intervalo solicitado.
5. **Relatórios:** query builder com filtros compartilhados e projeção explícita; serialização CSV centralizada segura para fórmulas, delimitadores e Unicode.
6. **Ícones e acessibilidade:** trocar pictogramas de UI por SVG inline decorativo ou controles SVG com `aria-label`; criar lint/script restrito a templates/constantes de interface e testes de acessibilidade.
7. **Collector:** instrumentação monotônica por chamada HTTP e etapa de processamento/escrita; benchmark local com fixture e PostgreSQL em ambiente de teste; não realizar coleta remota de benchmark.
8. **Validação e documentação:** atualizar testes existentes e acrescentar casos de filtros combinados, nulidade, datas parciais, CSV e duração; executar suíte real.

## Riscos e mitigação

- **Cobertura limitada dos dados atuais:** exibir amostra e disponibilidade; não inferir dados ausentes.
- **Data parcial em calendário:** permitir a visão mensal e marcar precisão; datas sem dia não entram em ordenação diária como dia 1.
- **Cardinalidade e paginação:** usar subconsultas/`EXISTS` ou agregações e testar mais de uma página.
- **Privacidade/acesso do collector:** fixtures locais nos benchmarks e rate limit atual mantido.

## Decisões

- Não adicionar dependência de ícones: usar SVG inline sem emojis e com rótulos acessíveis.
- O filtro de preço refere-se a um preço de capa registrado no volume; observações históricas não serão tratadas como preço de mercado.

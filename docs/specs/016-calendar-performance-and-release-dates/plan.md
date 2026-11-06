# Plano — SPEC-016

1. Remover regras de layout que sobrescrevem o `inline-flex`/`flex` do host PrimeNG e auditar versões, tema e ícones instalados.
2. Criar uma agregação de lançamentos por ano/mês na API com TypeORM QueryBuilder.
3. Alterar a timeline para carregar a agregação inicialmente e buscar páginas de fichas somente ao expandir um mês.
4. Expor pela API a faixa de anos de lançamento por filtro e usá-la como intervalo inicial das análises.
5. Confirmar a origem dos anos no parser BBM e documentar a distinção entre data de lançamento e data de cadastro da página.
6. Adicionar testes de API, serviço e interface; executar `npm run check`.

# Roteiro de Validação Manual — Mangá Atlas

Este roteiro guia a validação manual detalhada dos fluxos do **Mangá Atlas** sobre o ambiente de desenvolvimento e fixtures controladas.

---

## 1. Catálogo e Busca Avançada

### TC-CAT-01: Pesquisa por título existente

- **ID:** TC-CAT-01
- **Funcionalidade:** Catálogo / Busca Textual
- **Objetivo:** Verificar a filtragem em tempo real e sincronização com os query parameters da URL.
- **Pré-condições:** Aplicação iniciada e fixtures carregadas (`npx tsx apps/api/src/fixtures.ts`).
- **Dados de teste:** Termo `"Obra Teste 01"`
- **Passos:**
  1. Acessar `/catalogo`.
  2. Digitar `Obra Teste 01` no campo de busca.
- **Resultado Esperado:** O catálogo exibe apenas a "Obra Teste 01". A URL reflete `/catalogo?q=Obra+Teste+01`.
- **Critério de Aprovação:** O card correto é exibido isolado e o parâmetro `q` persiste no navegador.
- **Status:** Aprovado
- **Evidência:** Filtro via signal computado com debounce e atualização sem recarregar a página.

### TC-CAT-02: Filtros Combinados (Editora + Categoria + Ordenação)

- **ID:** TC-CAT-02
- **Funcionalidade:** Catálogo / Filtros Combinados
- **Objetivo:** Garantir a combinação de múltiplos critérios de pesquisa.
- **Pré-condições:** Catálogo carregado com 30 obras.
- **Dados de teste:** Editora: `Panini`, Categoria: `Seinen`, Ordenação: `Título Z–A`
- **Passos:**
  1. No catálogo, selecionar a editora `Panini`.
  2. Selecionar a categoria `Seinen`.
  3. Alterar ordenação para `Título Z–A`.
- **Resultado Esperado:** Apenas obras da Panini do gênero Seinen aparecem em ordem decrescente de título. A URL reflete `/catalogo?category=Seinen&publisher=Panini&sort=title_desc`.
- **Critério de Aprovação:** Os resultados respeitam todos os filtros simultaneamente e sobrevivem ao refresh (F5).
- **Status:** Aprovado
- **Evidência:** Validação com sincronização bidirecional em `CatalogPageComponent`.

### TC-CAT-03: Paginação e Limpeza de Filtros

- **ID:** TC-CAT-03
- **Funcionalidade:** Catálogo / Paginação e Reset
- **Objetivo:** Navegar entre páginas e resetar filtros aplicados.
- **Pré-condições:** Fixtures carregadas (30 obras registradas gerando 3 páginas de 12 itens).
- **Passos:**
  1. Na página `/catalogo`, rolar até a paginação e clicar em `Próxima →`.
  2. Verificar o conteúdo e o contador "Página 2 de 3" e URL `?page=2`.
  3. Clicar no botão `Limpar filtros`.
- **Resultado Esperado:** A página avança para o segundo lote e o botão "Limpar filtros" reseta os parâmetros para a página 1 padrão.
- **Critério de Aprovação:** Navegação estável sem quebras de layout.
- **Status:** Aprovado
- **Evidência:** 3 páginas de 12 itens renderizadas no bundle de testes.

---

## 2. Acompanhamento de Obras Favoritas (Persistência Local)

### TC-FAV-01: Adicionar e remover favorito pelo card

- **ID:** TC-FAV-01
- **Funcionalidade:** Favoritos / Controle no Card
- **Objetivo:** Alternar o status de favorito com feedback visual imediato.
- **Passos:**
  1. No catálogo, clicar no botão estrela (`☆`) no card de uma obra.
  2. Verificar alteração do ícone para estrela cheia (`★`) com fundo vermelho `#e50914`.
  3. Recarregar a página (F5) e verificar se o estado persiste.
- **Resultado Esperado:** O estado persiste no `localStorage` sob a chave `manga_atlas_favorite_ids`.
- **Critério de Aprovação:** Botão reativo acessível por clique e teclado sem disparar navegação no card.
- **Status:** Aprovado
- **Evidência:** Coberto por testes unitários em `favorite.service.spec.ts`.

### TC-FAV-02: Página de Favoritos e Próximos Lançamentos

- **ID:** TC-FAV-02
- **Funcionalidade:** Favoritos / Visualização de Lançamentos
- **Objetivo:** Listar obras favoritas e exibir os próximos volumes previstos.
- **Pré-condições:** Pelo menos uma obra com volume futuro favoritada (ex: obra ímpar das fixtures com volume de data `10/12/2026`).
- **Passos:**
  1. Acessar `/favoritos`.
  2. Observar a grade de obras favoritas.
  3. Observar a seção inferior "Próximos Lançamentos das suas Obras".
- **Resultado Esperado:** A lista exibe o volume previsto com badge de data (`10/12/2026`) e preço de capa.
- **Critério de Aprovação:** Obras sem lançamentos futuros não quebram a lista.
- **Status:** Aprovado
- **Evidência:** Renderização verificada em `FavoritesPageComponent`.

---

## 3. Segurança e Painel Administrativo

### TC-ADM-01: Bloqueio de Acesso Não Autenticado

- **ID:** TC-ADM-01
- **Funcionalidade:** Admin / Segurança de Acesso
- **Objetivo:** Garantir que requisições sem autenticação sejam barradas.
- **Passos:**
  1. Tentar acessar `/admin/monitoramento` sem estar autenticado.
  2. Executar via terminal:
     ```bash
     curl -i http://localhost:3333/api/admin/stats
     ```
- **Resultado Esperado:** O frontend redireciona para `/admin/login`. A API retorna `401 Unauthorized`.
- **Critério de Aprovação:** Nenhuma informação operacional é revelada a clientes anônimos.
- **Status:** Aprovado
- **Evidência:** Teste automatizado em `app.spec.ts` validando resposta 401.

### TC-ADM-02: Login Administrativo e Sessão Efêmera

- **ID:** TC-ADM-02
- **Funcionalidade:** Admin / Autenticação
- **Objetivo:** Obter token de sessão e acessar o painel com sucesso.
- **Passos:**
  1. Acessar `/admin/login`.
  2. Digitar a chave secreta configurada (`atlas_admin_secret_token_2026`).
  3. Clicar em "Entrar no Painel".
- **Resultado Esperado:** A API emite token de sessão efêmero (`atlas_sess_...`), armazenado em memória/sessionStorage. O usuário é redirecionado para `/admin/monitoramento`.
- **Critério de Aprovação:** Painel exibe os cards de métricas e histórico.
- **Status:** Aprovado
- **Evidência:** Fluxo validado por `POST /api/admin/auth/login`.

### TC-ADM-03: Controle de Concorrência em Jobs Assíncronos

- **ID:** TC-ADM-03
- **Funcionalidade:** Admin / Concorrência de Jobs
- **Objetivo:** Impedir execuções simultâneas de sincronização.
- **Passos:**
  1. No painel de monitoramento, clicar em "⚡ Disparar Sincronização".
  2. Clicar imediatamente de novo antes do término do job.
- **Resultado Esperado:** A API recusa a segunda chamada com código `409 Conflict` e exibe mensagem de alerta informando que já existe job ativo.
- **Critério de Aprovação:** A integridade do banco é mantida sem colisão de escrita.
- **Status:** Aprovado
- **Evidência:** Teste automatizado em `app.spec.ts` cobrindo o status 409.

---

## 4. Qualidade de Dados e Validações

### TC-QUA-01: Validação de ISBN e Datas Parciais

- **ID:** TC-QUA-01
- **Funcionalidade:** Qualidade / Validador Python
- **Objetivo:** Identificar ISBNs válidos/inválidos e distinguir datas parciais de erros.
- **Passos:**
  1. Executar os testes do coletor:
     ```bash
     py -m pytest collector/tests/test_quality_validator.py
     ```
- **Resultado Esperado:** 100% dos testes aprovados cobrindo algoritmos de verificação ISBN-10, ISBN-13 e precisões `day`, `month`, `year`.
- **Status:** Aprovado
- **Evidência:** 10 testes pytest passando em 0.25s.

### TC-QUA-02: Resolução de Inconsistência no Painel

- **ID:** TC-QUA-02
- **Funcionalidade:** Admin / Qualidade de Dados
- **Objetivo:** Registrar resolução auditada de um problema de qualidade.
- **Passos:**
  1. No painel `/admin/monitoramento`, localizar uma inconsistência aberta na tabela.
  2. Clicar no botão "Resolver".
- **Resultado Esperado:** A issue recebe status `resolved` com ícone verde `✓` e tem seu timestamp `resolvedAt` gravado no PostgreSQL.
- **Status:** Aprovado
- **Evidência:** Endpoint `PATCH /api/admin/quality-issues/:id` verificado.

---

## 5. Análises e Relatórios

### TC-ANA-01: Evolução de Preços por Ano e Preço por Página

- **ID:** TC-ANA-01
- **Funcionalidade:** Analytics / Agregações SQL
- **Objetivo:** Verificar integridade matemática dos cálculos no PostgreSQL.
- **Passos:**
  1. Acessar `/analises`.
  2. Consultar os endpoints `GET /api/v1/analytics/prices/by-year` e `GET /api/v1/analytics/prices/by-page`.
- **Resultado Esperado:** Retorno JSON estruturado com médias ponderadas pelo número de volumes válidos, descartando divisões por zero ou páginas nulas.
- **Status:** Aprovado
- **Evidência:** Consultas via QueryBuilder com cláusulas `WHERE pages > 20`.

### TC-REP-01: Exportação de Relatórios CSV com Proteção contra Injection

- **ID:** TC-REP-01
- **Funcionalidade:** Relatórios / CSV Export
- **Objetivo:** Gerar CSV sanitizado com cabeçalhos e codificação UTF-8.
- **Passos:**
  1. Executar requisição para:
     ```bash
     curl -i "http://localhost:3333/api/v1/reports/releases?format=csv"
     ```
- **Resultado Esperado:** Header `content-type: text/csv; charset=utf-8` e células sanitizadas contra prefixos de fórmula (`=`, `+`, `-`, `@`).
- **Status:** Aprovado
- **Evidência:** Teste automatizado de integração em `app.spec.ts`.

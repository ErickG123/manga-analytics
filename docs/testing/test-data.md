# Documentação de Dados e Ambiente de Testes — Mangá Atlas

Este guia detalha a arquitetura, preparação e execução do conjunto de dados de testes determinísticos para o **Mangá Atlas**.

---

## 1. Estrutura das Fixtures Determinísticas

O script [`apps/api/src/fixtures.ts`](file:///C:/Users/erick.alves/Documents/GitHub/manga-analytics/apps/api/src/fixtures.ts) foi desenvolvido para garantir reprodutibilidade completa de testes unitários, testes de integração e validação manual, sem depender de web scraping externo ou dados instáveis.

### Composição do Lote Determinístico

1. **Fonte Controlada:**
   - Nome: `Fonte de Testes Determinísticos`
   - URL: `https://fixtures.mangaatlas.local`
2. **Editoras Base:**
   - `Panini`, `JBC`, `Pipoca & Nanquim`, `NewPOP`.
3. **Catálogo de 30 Obras (`Obra Teste 01` a `Obra Teste 30`):**
   - **Paginação:** Com 30 itens e tamanho de página padrão de 12 itens, gera exatamente 3 páginas completas de validação.
   - **Categorias:** Alternância determinística entre `Seinen`, `Shonen` e `Shojo`.
   - **Capas:** Capas com imagem remota de teste e capas intencionalmente nulas (para validar fallbacks visuais de monograma e acessibilidade).
   - **Volumes e Datas:**
     - Volume 1 publicado em cada obra com precisão diária (`15/01/202X`).
     - Volume 2 previsto (`10/12/2026`) em obras ímpares para testar previsões de lançamentos.
     - Histórico temporal com 2 observações de preço para os primeiros 5 volumes.
4. **Jobs de Importação Demonstrativos:**
   - 1 job com status `completed` (30 registros criados).
   - 1 job com status `failed` contendo logs e mensagens sanitizadas de falha externa para teste de diagnóstico.

---

## 2. Comandos de Preparação do Ambiente

### 2.1 Subir o Banco PostgreSQL

```bash
docker compose up -d
```

### 2.2 Popular o Banco com as Fixtures

```bash
npx tsx apps/api/src/fixtures.ts
```

### 2.3 Executar as Suítes de Testes

```bash
# Testes do Frontend Angular (Vitest)
npm test -- --watch=false

# Testes da API Fastify (Vitest)
npm run test:api

# Testes do Coletor Python (pytest)
py -m pytest collector/tests
```

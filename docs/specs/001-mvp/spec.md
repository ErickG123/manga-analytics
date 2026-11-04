# SPEC-001 — MVP do Mangá Atlas

## Objetivo

Criar uma interface navegável de catálogo, calendário e análise de preços de mangás publicados no Brasil, estabelecendo os alicerces de qualidade, arquitetura feature-based e testes automatizados.

## Escopo inicial

- Angular 21, componentes standalone, lazy loading por feature, signals e OnPush.
- Separação estrita de componentes (`.ts`, `.html`, `.scss`, `.spec.ts`).
- Organização de modelos em diretórios `models/*.model.ts`.
- Ferramental de qualidade configurado: Prettier, ESLint (Flat Config) e Vitest.
- Dados fictícios por `MangaRepository`, com contrato independente da fonte.
- Coletor Python experimental para metadados e ficha individual BBM.
- Sem API própria, autenticação, banco remoto ou sincronização agendada nesta etapa.

## Critérios de aceite

1. Catálogo lista obras e permite buscar por título, autor ou editora.
2. Filtro de categoria funciona em conjunto com a busca.
3. Seleção de uma obra abre a página de detalhes e seus volumes.
4. Calendário lista volumes ordenados por data de exemplo.
5. Análises exibem agregados ilustrativos.
6. Todas as telas identificam dados fictícios; não os apresentam como informações verificadas.
7. O cliente BBM pagina metadados e permite obter uma ficha pelo ID.
8. Parser ignora tabelas não relacionadas a volumes.
9. Pipeline de CI e scripts de qualidade passam com 100% de sucesso.

## Fora do escopo

Coleta massiva, histórico confiável de preços, login, alertas, scraping de capas, publicação de dados BBM sem verificação de autorização.

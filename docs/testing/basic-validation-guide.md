# Guia de Validação Básica — Mangá Atlas

Este guia é o roteiro operacional oficial para desenvolvedores e avaliadores executarem e validarem o funcionamento básico de ponta a ponta do **Mangá Atlas** (Angular 21 + Fastify + PostgreSQL 17 com TypeORM + Coletor Python).

---

## 1. Objetivo

Este guia tem como meta certificar que:

- O banco de dados PostgreSQL 17 está ativo e acessível.
- A API Fastify inicializa, responde ao health check e atende consultas relacionais do TypeORM.
- O frontend Angular 21 renderiza o catálogo, navega entre rotas e consome os dados.
- O Coletor Python executa a suíte de testes unitários offline e o modo dry-run sem erros.
- A segurança administrativa protege os endpoints de monitoramento.

_Fora do escopo:_ Raspagens massivas de dados em produção contra a BBM e testes de carga destrutivos.

---

## 2. Pré-requisitos e Versões

| Ferramenta                  | Versão Recomendada                      | Verificação                                   |
| --------------------------- | --------------------------------------- | --------------------------------------------- |
| **Node.js**                 | `v20.x` ou `v22.x LTS`                  | `node -v`                                     |
| **npm**                     | `v10.x+`                                | `npm -v`                                      |
| **Python**                  | `3.12+` (com `py` launcher ou `python`) | `py --version` ou `python --version`          |
| **Docker & Docker Compose** | Docker v24+ / Compose v2+               | `docker --version` e `docker compose version` |
| **Git**                     | `v2.40+`                                | `git --version`                               |
| **GitHub CLI**              | `v2.30+` (opcional para git remoto)     | `gh --version`                                |

---

## 3. Estrutura do Projeto

- **Frontend (`src/`):** Aplicação Angular 21 com standalone components, Signals, SCSS modular e consumo de API REST.
- **Backend API (`apps/api/`):** API modular Fastify em TypeScript com plugins (CORS, Sensible, Swagger, Auth) e persistência via TypeORM.
- **Banco de Dados:** PostgreSQL 17 provisionado via `docker-compose.yml` (Porta `5432`).
- **Coletor (`collector/`):** Módulo Python em camadas (`clients`, `parsers`, `normalizers`, `repositories`, `services`, `cli.py`).
- **Documentação (`docs/`):** Arquitetura, decisões (ADRs), qualidade, SDD e testes.

---

## 4. Preparação do Ambiente

### 4.1 Instalar Dependências JavaScript

Na raiz do repositório:

```bash
npm install
```

### 4.2 Configurar o Arquivo de Variáveis de Ambiente

Copie o arquivo de exemplo para `.env`:

```bash
# Windows PowerShell:
Copy-Item .env.example .env

# Linux/macOS:
cp .env.example .env
```

### 4.3 Iniciar o Banco PostgreSQL

Inicie o container oficial do PostgreSQL 17:

```bash
npm run docker:up
```

_Para verificar se o container está saudável:_

```bash
docker ps
```

Você deverá ver o container `manga_atlas_postgres` com status `Up (healthy)`.

### 4.4 Inicializar as Tabelas e Carga Inicial (Seed e Fixtures)

Popule o banco de dados com dados iniciais ou lote completo de 30 obras determinísticas para testes:

```bash
# Carga inicial padrão
npm run db:seed

# Carga de fixtures determinísticas para testes amplos e paginação
npx tsx apps/api/src/fixtures.ts
```

---

## 5. Inicialização dos Serviços

### 5.1 Iniciar a API Fastify

Em um terminal dedicado na raiz do projeto:

```bash
npm run api:start
```

- **Porta:** `3333`
- **URL Base:** `http://localhost:3333`
- **Swagger / OpenAPI:** `http://localhost:3333/documentation`
- **Encerramento:** Pressione `Ctrl + C` para finalizar.

### 5.2 Iniciar o Frontend Angular

Em outro terminal dedicado:

```bash
npm start
```

- **Porta:** `4200`
- **URL da Aplicação:** `http://localhost:4200`
- **Encerramento:** Pressione `Ctrl + C` para finalizar.

---

## 6. Health Check da API

Com a API em execução, valide o status da API e conexão com o PostgreSQL:

```bash
curl -i http://localhost:3333/api/v1/health
```

**Resposta esperada (HTTP 200):**

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-11-04T..."
}
```

---

## 7. Verificação do PostgreSQL

Verifique a existência das tabelas criadas pelo TypeORM via Docker:

```bash
docker exec -it manga_atlas_postgres psql -U manga_atlas -d manga_atlas -c "\dt"
```

**Tabelas esperadas:**

- `mangas`
- `editions`
- `volumes`
- `volume_prices`
- `price_observations`
- `publishers`
- `data_sources`
- `import_jobs`
- `data_quality_issues`

Para conferir a contagem de obras inseridas:

```bash
docker exec -it manga_atlas_postgres psql -U manga_atlas -d manga_atlas -c "SELECT count(*) FROM mangas;"
```

---

## 8. Testes do Coletor Python

### 8.1 Testes Unitários Offline (Sem dependência externa)

```bash
py -m pytest collector/tests
```

**Resultado esperado:** 13 testes aprovados (`test_bbm_client.py`, `test_bbm_parser.py`, `test_quality_validator.py`).

### 8.2 Simulação em Modo Dry-Run

Executa o fluxo de parsing e normalização sem realizar escritas no banco:

```bash
py -m collector.src.cli import --limit 2 --dry-run
```

---

## 9. Validação Funcional das Telas (Navegador)

Acesse `http://localhost:4200` no seu navegador:

1. **Catálogo (`/catalogo`):**
   - Verifique a exibição dos cards com imagem ou monograma de capa.
   - Digite um termo de busca (ex: `"Obra Teste 01"`). Observe a filtragem em tempo real e atualização da URL (`?q=...`).
   - Alterne filtros de editora e ordenação. Clique em `Limpar filtros`.
   - Navegue pela paginação inferior caso haja mais de 12 itens.
2. **Favoritos (`/favoritos`):**
   - No catálogo, clique na estrela de um card (`☆`) para favoritar (o botão fica vermelho com estrela preenchida `★`).
   - Clique em **Favoritos** no menu superior. A obra selecionada estará listada junto à seção de próximos lançamentos.
   - Recarregue a página (F5) para atestar que o estado persiste no `localStorage`.
3. **Calendário (`/calendario`):**
   - Acesse o calendário e confira a listagem cronológica dos volumes agrupados por mês/ano.
4. **Análises de Preços (`/analises`):**
   - Verifique o carregamento dos gráficos interativos (Apache ECharts) de preço médio por ano e distribuição por editora.
5. **Painel Administrativo (`/admin/monitoramento`):**
   - Se não autenticado, você será redirecionado para `/admin/login`.
   - Na tela de login, insira a chave: `atlas_admin_secret_token_2026`.
   - No painel, consulte o histórico de importações, cards de estatísticas e inconsistências de qualidade com botão para "Resolver".

---

## 10. Validação Automatizada Completa

Para executar toda a esteira de qualidade do repositório em um único comando:

```bash
npm run check
```

Esse comando executa sequencialmente:

1. `npm run format:check` (Prettier)
2. `npm run lint` (ESLint 9 Flat Config)
3. `npm test -- --watch=false` (19 testes unitários do Angular com Vitest)
4. `npm run test:api` (12 testes de integração da API Fastify)
5. `npm run build` (Compilação estrita de produção do Angular)

---

## 11. Resolução de Problemas Comuns (Troubleshooting)

- **Erro `Port 5432 already in use`:**
  - Outra instância local do PostgreSQL pode estar rodando. Pare o serviço local ou altere a porta em `docker-compose.yml` e no `.env`.
- **Erro `401 Unauthorized` na API:**
  - A rota sob `/api/admin/*` exige autenticação. Faça login pela interface em `/admin/login` ou forneça o header `Authorization: Bearer <TOKEN>`.
- **Erro `409 Conflict` ao disparar sincronização:**
  - Já existe um job com status `running` no banco. Aguarde 2 segundos para conclusão ou aguarde a reconciliação automática de jobs abandonados.
- **Python `ModuleNotFoundError: No module named 'collector'`:**
  - Execute sempre a CLI como módulo a partir da raiz do repositório: `py -m collector.src.cli <comando>`.

---

## 12. Checklist Operacional de Validação

| ID         | Área      | Ação                                       | Resultado Esperado                                | Status        |
| ---------- | --------- | ------------------------------------------ | ------------------------------------------------- | ------------- |
| **CHK-01** | Infra     | `npm run docker:up`                        | Container PostgreSQL 17 ativo e saudável          | Não executado |
| **CHK-02** | Banco     | `npm run db:seed`                          | Tabelas criadas e populadas via TypeORM           | Não executado |
| **CHK-03** | API       | `curl http://localhost:3333/api/v1/health` | HTTP 200 com status "ok" e database "connected"   | Não executado |
| **CHK-04** | Coletor   | `py -m pytest collector/tests`             | 13 testes unitários aprovados                     | Não executado |
| **CHK-05** | Web       | Acessar `/catalogo`                        | Catálogo renderizado com busca e paginação ativas | Não executado |
| **CHK-06** | Web       | Favoritar obra e acessar `/favoritos`      | Obra persistida no localStorage                   | Não executado |
| **CHK-07** | Admin     | Acessar `/admin/login` e autenticar        | Redirecionamento para painel de monitoramento     | Não executado |
| **CHK-08** | Qualidade | `npm run check`                            | Prettier, ESLint, testes e build com código 0     | Não executado |

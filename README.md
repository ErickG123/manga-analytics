# Mangá Atlas

Aplicação full stack para catalogar mangás publicados no Brasil, acompanhar lançamentos e analisar a evolução histórica dos preços de capa.

---

## 🚀 Tecnologias

- **Frontend:** Angular 21 (Standalone Components, Signals, OnPush)
- **Estilos:** SCSS modular (Tema Dark com acentos vermelhos)
- **Backend API:** Fastify + TypeScript (Arquitetura Modular por Domínio)
- **Persistência:** PostgreSQL 17 gerenciado via **TypeORM** com driver nativo `pg`
- **Visualização de Dados:** Apache ECharts
- **Qualidade & Lint:** ESLint 9 (Flat Config), Prettier, Ruff
- **Testes Automatizados:** Vitest integrado ao Angular CLI e Fastify, pytest para Python
- **Coleta e ETL:** Python 3.12+ (BeautifulSoup4, httpx com rate limiting e circuit breaker)
- **Metodologia:** Spec-Driven Development (SDD)

---

## 📂 Estrutura do Repositório

```text
manga-atlas/
├── AGENTS.md                  # Regras mandatórias para agentes e desenvolvedores
├── apps/
│   └── api/                   # Backend Fastify + TypeORM
│       ├── src/
│       │   ├── entities/      # Entidades de banco TypeORM
│       │   ├── modules/       # Módulos de domínio (manga, publisher, volume, calendar, analytics, admin)
│       │   ├── plugins/       # Plugins Fastify (CORS, Swagger, Sensible, Auth)
│       │   └── fixtures.ts    # Fixtures de teste determinísticas
├── collector/                 # Coletor ETL em Python com rate limiting e circuit breaker
│   ├── src/                   # Camadas de clients, parsers, normalizers, repositories, services e CLI
│   └── tests/                 # Testes unitários com pytest
├── docs/                      # Documentação completa de arquitetura, testes e SDD
│   ├── architecture/          # Visão geral, convenções e ADRs
│   ├── collector/             # Políticas de segurança, rate limiting e runbook operacional
│   ├── testing/               # Guias de validação básica e relatórios de auditoria
│   └── specs/                 # Especificações do fluxo SDD
├── src/                       # Código-fonte da aplicação Angular 21
│   └── app/
│       ├── core/              # Serviços singleton e contratos de repositório
│       └── features/          # Features isoladas (catalog, favorites, calendar, analytics, admin)
└── docker-compose.yml         # Infraestrutura local com PostgreSQL 17
```

---

## 🛠️ Como Validar o Mangá Atlas

Para executar uma validação básica de ponta a ponta do sistema (PostgreSQL, Fastify, Angular e Coletor):

👉 Consulte o [**Guia de Validação Básica (docs/testing/basic-validation-guide.md)**](docs/testing/basic-validation-guide.md)

### Resumo Rápido dos Comandos:

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar banco de dados PostgreSQL 17
npm run docker:up

# 3. Carregar dados iniciais no banco
npm run db:seed

# 4. Iniciar a API Fastify (Porta 3333)
npm run api:start

# 5. Iniciar o Frontend Angular (Porta 4200)
npm run start
```

---

## 🧪 Validação e Qualidade Automatizada

Para rodar toda a suíte de verificação integrada (Prettier + ESLint + Vitest Angular + Vitest Fastify + Build de produção):

```bash
npm run check
```

Para rodar os testes unitários do Coletor Python:

```bash
py -m pytest collector/tests
```

---

## 📖 Documentação Arquitetural e SDD

Para aprofundar nas decisões e padrões do projeto:

- [Guia de Validação Básica](docs/testing/basic-validation-guide.md)
- [Roteiro de Validação Manual Detalhado](docs/testing/manual-validation.md)
- [Instruções para Agentes (AGENTS.md)](AGENTS.md)
- [Visão Geral da Arquitetura](docs/architecture/overview.md)
- [Decisões Arquiteturais (ADRs)](docs/architecture/decisions/README.md)
- [Segurança e Rate Limiting do Coletor](docs/collector/security-and-rate-limiting.md)
- [Runbook Operacional do Coletor](docs/collector/operational-runbook.md)
- [Guia do Fluxo SDD](docs/sdd/README.md)

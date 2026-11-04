# Arquitetura da API Fastify — Mangá Atlas

A API Fastify do **Mangá Atlas** adota uma **arquitetura modular orientada a domínios de negócio**, garantindo baixo acoplamento, alta coesão e testabilidade independente.

---

## 1. Estrutura de Camadas

```text
apps/api/src/
├── app.ts                  # Registro de plugins e módulos
├── server.ts               # Ponto de entrada e inicialização HTTP
├── config/                 # Conexão e configuração TypeORM
├── entities/               # Entidades relacionais TypeORM
├── plugins/                # Plugins globais (CORS, Swagger, Sensible)
└── modules/                # Módulos por Domínio
    ├── health/             # Healthcheck
    ├── manga/              # Catálogo de mangás, busca e detalhes
    ├── publisher/          # Listagem de editoras
    ├── volume/             # Consulta individual de volumes
    ├── calendar/           # Cronograma de lançamentos
    ├── analytics/          # Agregações de mercado e preços médios
    └── reports/            # Relatórios tabulares e exportação CSV
```

---

## 2. Responsabilidades no Módulo

Cada módulo é organizado em responsabilidades estritas:

1. **Routes (`*.routes.ts`):** declara endpoints HTTP, parâmetros e delega para o Controller.
2. **Controller (`*.controller.ts`):** recebe requisições Fastify, valida parâmetros e traduz para DTOs.
3. **Service (`*.service.ts`):** orquestra regras de negócio e transforma entidades em DTOs. Não depende de objetos do Fastify.
4. **Repository (`*.repository.ts`):** encapsula consultas ao banco de dados via TypeORM.
5. **Models (`models/*.model.ts`):** define as interfaces tipadas de entrada e saída.

---

## 3. Testabilidade

- Testes de integração via `app.inject()` em [`apps/api/src/app.spec.ts`](file:///C:/Users/erick.alves/Documents/GitHub/manga-analytics/apps/api/src/app.spec.ts).
- Testes unitários de serviços com repositórios mockados em [`apps/api/src/modules/manga/services/manga.service.spec.ts`](file:///C:/Users/erick.alves/Documents/GitHub/manga-analytics/apps/api/src/modules/manga/services/manga.service.spec.ts).

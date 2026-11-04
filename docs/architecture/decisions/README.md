# Architecture Decision Records (ADRs)

Este diretório mantém os registros formais de decisões arquiteturais do projeto **Mangá Atlas**.

Cada ADR documenta o contexto, a decisão adotada, as alternativas ponderadas e as consequências técnicas.

---

## Estrutura Padrão de um ADR

- **Título:** ADR-XXX: Título conciso
- **Status:** Proposto | Aceito | Substituído
- **Data:** YYYY-MM-DD
- **Contexto:** Qual problema motivou a decisão?
- **Decisão:** O que foi decidido e por quê?
- **Alternativas Consideradas:** Quais outras opções foram avaliadas?
- **Consequências:** Quais impactos positivos e negativos decorrem dessa escolha?

---

## Decisões Confirmadas

### ADR-001: Separação de Arquivos de Componentes (.ts, .html, .scss)

- **Status:** Aceito
- **Decisão:** Todos os componentes Angular devem obrigatoriamente utilizar arquivos externos separados para lógica, template e estilização.
- **Consequência:** Melhora a manutenibilidade, legibilidade e compatibilidade com formatadores de templates.

### ADR-002: Organização de Models em pastas `models/*.model.ts`

- **Status:** Aceito
- **Decisão:** Interfaces de domínio não devem ser declaradas no interior de componentes. Ficam organizadas em pastas `models/` locais por feature ou em `shared/models/`.
- **Consequência:** Desacoplamento limpo de contratos e facilidade de reutilização e testes.

### ADR-003: Adoção do Vitest como Executor Oficial de Testes

- **Status:** Aceito
- **Decisão:** Utilização do builder oficial `@angular/build:unit-test` configurado com `runner: "vitest"` e `@vitest/coverage-v8`.
- **Consequência:** Extrema velocidade de execução, dispensando servidores Karma e navegadores pesados para testes unitários de lógica e DOM.

### ADR-004: Prettier e ESLint Flat Config

- **Status:** Aceito
- **Decisão:** Utilização de ESLint 9+ em formato Flat Config (`eslint.config.mjs`) com `angular-eslint` e `eslint-config-prettier`, executando o Prettier separadamente.
- **Consequência:** Previne conflitos de formatação e assegura conformidade com acessibilidade e standalone components.

### ADR-005: Coletor Python Desacoplado

- **Status:** Aceito
- **Decisão:** Rotinas de raspagem de dados residem no módulo `collector/` em Python, sem execução ou exposição no frontend do navegador.
- **Consequência:** Segurança e independência de ciclo de vida entre a interface do usuário e as rotinas de enriquecimento de dados.

### ADR-006: Utilização do TypeORM em vez de Prisma

- **Status:** Aceito
- **Decisão:** Adoção do TypeORM com PostgreSQL e `reflect-metadata` para a camada de persistência da API Fastify.
- **Consequência:** Modelagem de entidades orientada a classes e decorators TypeScript, controle direto de relacionamentos e tipagem integrada.

### ADR-007: Modularização por Domínio na API Fastify

- **Status:** Aceito
- **Decisão:** Estruturação da API em módulos autônomos (`modules/<domain>/`) contendo `routes`, `controllers`, `services`, `repositories` e `models`.
- **Consequência:** Eliminação de acoplamento indevido, orquestrador `app.ts` enxuto e facilidade de testes unitários com mocks dos repositórios.

### ADR-008: Arquitetura em Camadas e CLI no Coletor Python

- **Status:** Aceito
- **Decisão:** Organização do coletor em camadas funcionais (`clients`, `parsers`, `normalizers`, `repositories`, `services`, `models`) operado via CLI centralizada em `collector/src/cli.py`.
- **Consequência:** Eliminação de duplicações, separação clara entre scraping de rede, extração HTML, transformação de tipos e persistência idempotente no PostgreSQL.

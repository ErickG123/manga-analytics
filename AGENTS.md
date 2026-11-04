# AGENTS.md — Diretrizes para Agentes de IA

Este documento define as regras mandatórias para qualquer agente de IA ou desenvolvedor atuando no repositório **Mangá Atlas**.

Para detalhes arquiteturais completos, consulte:

- [Visão Geral da Arquitetura](docs/architecture/overview.md)
- [Convenções de Código](docs/architecture/conventions.md)
- [Arquitetura Feature-Based](docs/architecture/feature-based.md)
- [Padrões de Acesso a Dados](docs/architecture/data-access.md)
- [Estratégia de Testes](docs/development/testing.md)
- [Padrões de Qualidade](docs/development/quality.md)
- [Fluxo SDD](docs/sdd/README.md)

---

## 1. Angular 21 & TypeScript

- **Angular 21 obrigatório:** utilizar standalone components (`standalone: true`), signals (`signal`, `computed`, `input`), injeção moderna (`inject()`) e deferrable views quando aplicável.
- **TypeScript strict mode:** não desabilitar verificações estritas, não utilizar `any` e utilizar `import type` para importações de tipos/interfaces.
- **Sem dependências desnecessárias:** utilizar builders e recursos oficiais do Angular CLI (`@angular/build`) antes de cogitar pacotes externos.

---

## 2. Separação Estrita de Componentes

- **Arquivos externos obrigatórios:** todo componente deve possuir arquivos separados:
  - `<nome>.component.ts` (lógica)
  - `<nome>.component.html` (template via `templateUrl`)
  - `<nome>.component.scss` (estilos via `styleUrl`)
  - `<nome>.component.spec.ts` (testes unitários com Vitest)
- **Proibido template e styles inline:** não declarar propriedades `template: '...'` ou `styles: ['...']` em `@Component`.
- Manter o template limpo e acessível, evitando regras de negócio ou transformações complexas na view.

---

## 3. Models e Interfaces de Domínio

- **Localização:** todas as interfaces e tipos de domínio devem residir em arquivos com sufixo `.model.ts`, dentro de diretórios `models/`.
- **Escopo por feature:** se o modelo pertence à feature (ex.: `Catalog`, `Calendar`, `Analytics`), deve residir em `src/app/features/<feature>/models/<nome>.model.ts`.
- **Shared apenas para contratos comuns:** somente mover modelos para `src/app/shared/models/` quando forem de fato utilizados por múltiplas features ou contratos do núcleo.
- **Proibido declarar interfaces de domínio dentro de componentes ou serviços.**

---

## 4. Arquitetura Feature-Based

- **Isolamento de features:** cada feature encapsula seus próprios componentes, páginas, modelos e regras (`catalog`, `calendar`, `analytics`).
- **Core:** reservado para infraestrutura global, serviços transversais e contratos de dados singleton (`core/data`, `core/services`). Não colocar regras específicas de uma tela em `core/`.
- **Shared:** reservado para componentes visuais genéricos, pipes e diretivas genuinamente reutilizáveis.
- **Evitar acoplamento circular:** imports nunca devem criar dependências circulares entre módulos ou features.

---

## 5. Qualidade e Ferramentas

- **Prettier:** formatador padrão (`npm run format` e `npm run format:check`).
- **ESLint:** análise estática com Flat Config moderno (`npm run lint` e `npm run lint:fix`).
- **Vitest:** executor oficial de testes unitários frontend integrado ao Angular CLI (`npm run test`, `npm run test:watch`, `npm run test:coverage`).
- **Comando de validação completa:** `npm run check` (formatação + lint + testes unitários + build de produção). Todos os agentes devem garantir que `npm run check` termine com código 0.

---

## 6. Spec-Driven Development (SDD)

- O fluxo oficial de desenvolvimento do projeto é **Spec → Plan → Tasks → Implementation → Validation**.
- Consultar e atualizar as especificações em `docs/specs/` antes e após alterações arquiteturais ou funcionais.
- Decisões estruturais devem ser registradas em `docs/architecture/decisions/`.

---

## 7. Python & Coleta de Dados

- O módulo `collector/` é independente do frontend e focado em coleta/normalização.
- Respeitar rate limits, pausas entre requisições e identificação do coletor.
- Não expor credenciais nem misturar datas de observação com datas de lançamento ou reajuste de preços.

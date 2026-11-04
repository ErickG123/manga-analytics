# Visão Geral da Arquitetura — Mangá Atlas

## 1. Objetivo da Aplicação

O **Mangá Atlas** é uma plataforma concebida para catalogar mangás publicados no Brasil, acompanhar o cronograma de lançamentos e analisar a dinâmica de preços e reajustes ao longo do tempo.

O sistema opera com separação clara de responsabilidades:

1. **Frontend (Angular 21):** interface SPA reativa, acessível e focada na experiência de busca, visualização de catálogos e análise de mercado.
2. **Coletor de Dados (Python):** módulo autônomo responsável por coletar, parsear e normalizar dados a partir de fontes públicas (ex.: Guia dos Quadrinhos, BBM, editoras).
3. **Persistência & API (Fase futura):** backend com banco relacional (PostgreSQL) para histórico imutável de observações de preços e metadados estruturados.

---

## 2. Stack Tecnológica

| Camada                   | Tecnologia                                       | Justificativa                                                                         |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Frontend Framework**   | Angular 21 (Standalone, Signals, OnPush)         | Desempenho nativo, controle fino de reatividade e tipagem forte com TypeScript.       |
| **Estilização**          | SCSS                                             | Arquitetura modular de estilos, variáveis CSS nativas e manutenibilidade.             |
| **Formatação & Linting** | Prettier + ESLint (Flat Config) + angular-eslint | Padronização estética consistente e validação de acessibilidade e boas práticas.      |
| **Testes Unitários**     | Vitest + @angular/build:unit-test                | Execução ultra-rápida nativa com suporte a JSDOM e TestBed sem complexidade do Karma. |
| **Coletor**              | Python 3.12+ (BeautifulSoup4 / httpx)            | Facilidade para rotinas de extração, tolerância a falhas e raspagem respeitosa.       |
| **Metodologia**          | Spec-Driven Development (SDD)                    | Rastreabilidade total entre requisitos de negócio, planos técnicos e código.          |

---

## 3. Organização do Repositório

```text
manga-atlas/
├── .github/
│   └── workflows/
│       └── ci.yml               # Pipeline de integração contínua
├── AGENTS.md                    # Instruções obrigatórias para agentes e desenvolvedores
├── collector/                   # Script e testes do coletor Python
│   ├── bbm_client.py
│   └── test_bbm_client.py
├── docs/                        # Documentação arquitetural e especificações
│   ├── architecture/            # Visão geral, convenções, decisões (ADRs)
│   ├── development/             # Guias de ambiente, testes e qualidade
│   └── specs/                   # Especificações SDD por ciclo/versão
├── public/                      # Ativos estáticos públicos
├── src/                         # Código fonte da aplicação Angular
│   ├── app/
│   │   ├── core/                # Infraestrutura e contratos de dados
│   │   ├── features/            # Domínios e telas da aplicação
│   │   └── shared/              # Utilitários e componentes transversais
│   ├── main.ts
│   └── styles.scss
├── angular.json                 # Configuração do Angular CLI e builders
├── eslint.config.mjs            # Flat Config moderno do ESLint
├── .prettierrc.json             # Configuração oficial do Prettier
├── tsconfig.json                # Configuração estrita do TypeScript
└── package.json
```

---

## 4. Fronteiras e Limites do Sistema

> [!IMPORTANT]
> **O Frontend no navegador não é um backend.** O Angular opera exclusivamente em tempo de execução no cliente. Ele consome dados providos por contratos abstraídos via `MangaRepository` (injetados por tokens do Angular). Dados fictícios e contratos desacoplados permitem a evolução contínua da interface antes da exposição da API de produção.

- **Frontend:** Consome contratos tipados e signals. Não armazena segredos de bancos de dados nem executa raspagem em tempo de execução.
- **Coletor Python:** Executado fora do browser, com pausas controladas e tratamento específico de headers HTTP para respeitar servidores de origem.
- **Diferenciação de status de implementação:**
  - _Implementado:_ Frontend funcional com dados demonstrativos em memória, catálogo com busca/filtro, página de detalhes de volumes, calendário e análises demonstrativas, suíte de testes com Vitest, Prettier e ESLint.
  - _Planejado:_ Backend dedicado com banco relacional para persistência de preços e API REST/GraphQL.

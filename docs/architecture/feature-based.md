# Arquitetura Feature-Based — Mangá Atlas

A arquitetura do frontend segue uma divisão orientada a domínios de negócio e casos de uso (**feature-based**), garantindo alta coesão e baixo acoplamento entre as funcionalidades.

---

## 1. Visão Geral da Estrutura

```text
src/app/
├── core/
│   ├── config/              # Configurações globais da aplicação
│   ├── data/                # Contratos abstratos de repositório e dados
│   └── services/            # Serviços utilitários transversais singleton
│
├── features/
│   ├── catalog/             # Catálogo de obras e detalhes de volumes
│   │   ├── components/      # Componentes de apresentação específicos da feature
│   │   │   └── manga-card/
│   │   ├── pages/           # Páginas navegáveis roteadas
│   │   │   ├── catalog/
│   │   │   └── detail/
│   │   └── models/          # Modelos de domínio locais da feature
│   │       ├── manga.model.ts
│   │       └── volume.model.ts
│   │
│   ├── calendar/            # Calendário de lançamentos e previsões
│   │   ├── pages/
│   │   │   └── calendar/
│   │   └── models/
│   │       └── calendar-entry.model.ts
│   │
│   └── analytics/           # Painel analítico de preços médios e tendências
│       ├── pages/
│       │   └── analytics/
│       └── models/
│           └── analytics-summary.model.ts
│
├── shared/
│   ├── components/          # Componentes visuais genéricos reutilizáveis
│   ├── directives/          # Diretivas utilitárias compartilhadas
│   ├── pipes/               # Pipes utilitários compartilhados
│   └── models/              # Modelos e entidades centrais compartilhadas
│
├── app.component.*          # Shell da aplicação (header, navegação, outlet, footer)
└── app.routes.ts            # Configuração de rotas de primeiro nível com lazy-loading
```

---

## 2. Responsabilidades por Camada

### `core/`

- Responsável por infraestrutura, autenticação futura, interceptors HTTP e contratos centrais de dados (`core/data`).
- É importado apenas na raiz da aplicação (`main.ts` ou componentes raiz).
- **Regra:** Nunca coloque componentes visuais ou regras exclusivas de uma feature em `core/`.

### `features/`

- Cada diretório em `features/` representa um domínio funcional independente:
  - **Catalog:** exploração, busca textual, filtros por categoria e ficha detalhada de cada mangá.
  - **Calendar:** visão cronológica de volumes lançados e previstos.
  - **Analytics:** inteligência agregada de preços, médias e gráficos comparativos.
- Cada feature é dona de seus componentes, modelos locais e rotas lazy-loaded.
- **Regra:** Uma feature não deve importar componentes privados ou páginas internas de outra feature.

### `shared/`

- Reservado para código comprovadamente reutilizado por 2 ou mais features (ex.: componentes de paginação genérica, filtros de data, pipes de formatação).
- **Regra:** Não envie código para `shared/` por especulação futura; mantenha na feature até que surja necessidade real de reuso.

---

## 3. Como Adicionar uma Nova Feature

Para criar uma nova funcionalidade (exemplo: `features/wishlist`):

1. **Criar a estrutura de diretórios:**
   ```text
   src/app/features/wishlist/
   ├── components/
   ├── pages/
   │   └── wishlist/
   │       ├── wishlist.page.ts
   │       ├── wishlist.page.html
   │       ├── wishlist.page.scss
   │       └── wishlist.page.spec.ts
   └── models/
       └── wishlist-item.model.ts
   ```
2. **Definir modelos em `models/`:**
   Crie `wishlist-item.model.ts` com tipagem estrita.
3. **Desenvolver o componente da página:**
   Utilize `templateUrl` e `styleUrl`, aplicando `ChangeDetectionStrategy.OnPush`.
4. **Registrar a rota no `app.routes.ts`:**
   ```typescript
   {
     path: 'wishlist',
     loadComponent: () =>
       import('./features/wishlist/pages/wishlist/wishlist.page').then(
         (m) => m.WishlistPageComponent
       ),
   }
   ```
5. **Criar testes unitários com Vitest:**
   Adicione o arquivo `.spec.ts` validando os comportamentos principais da página.

# Convenções de Desenvolvimento e Código

Este documento formaliza as regras estritas de nomenclatura, estruturação de arquivos e boas práticas adotadas no projeto **Mangá Atlas**.

---

## 1. Nomenclatura de Arquivos e Diretórios

- Todos os arquivos e diretórios utilizam **kebab-case**.
- Componentes: `<nome>.component.ts`
- Templates de componentes: `<nome>.component.html`
- Folhas de estilo de componentes: `<nome>.component.scss`
- Testes unitários de componentes e serviços: `<nome>.component.spec.ts` ou `<nome>.service.spec.ts`
- Modelos e tipos de domínio: `<nome>.model.ts`
- Serviços: `<nome>.service.ts` ou `<nome>.repository.ts`

---

## 2. Separação Obrigatória dos Componentes

Nenhum componente Angular deve conter HTML ou estilos inline no arquivo TypeScript.

### ❌ Incorreto (inline)

```typescript
// manga-card.component.ts
@Component({
  selector: 'app-manga-card',
  standalone: true,
  template: `
    <article class="card">
      <h3>{{ manga.title }}</h3>
    </article>
  `,
  styles: [
    `
      .card {
        padding: 16px;
      }
    `,
  ],
})
export class MangaCardComponent {}
```

### ✅ Correto (arquivos dedicados)

```text
manga-card/
├── manga-card.component.ts
├── manga-card.component.html
├── manga-card.component.scss
└── manga-card.component.spec.ts
```

```typescript
// manga-card.component.ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Manga } from '../../models/manga.model';

@Component({
  selector: 'app-manga-card',
  standalone: true,
  imports: [],
  templateUrl: './manga-card.component.html',
  styleUrl: './manga-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MangaCardComponent {
  readonly manga = input.required<Manga>();
}
```

---

## 3. Organização dos Models de Domínio

- Não declare interfaces ou contratos de domínio no corpo de arquivos de componentes ou serviços.
- Crie sempre uma pasta `models/` na raiz da feature ou em `shared/models/`.
- Utilize nomes descritivos com o sufixo `.model.ts`.

Exemplo na feature `catalog`:

```text
src/app/features/catalog/models/
├── manga.model.ts
└── volume.model.ts
```

Exemplo em `shared/models/`:

```text
src/app/shared/models/
├── manga.model.ts
├── volume.model.ts
├── release-date.model.ts
└── price-observation.model.ts
```

---

## 4. Boas Práticas TypeScript

- **Tipagem explícita e defensiva:** evite `any` a todo custo. Use tipos de união fechados quando os valores forem finitos (ex.: `'released' | 'planned' | 'unknown'`).
- **Imutabilidade:** prefira propriedades `readonly` em arrays e objetos emitidos por repositórios (`readonly Manga[]`).
- **Import type:** use `import type { ... }` para tipos e interfaces que não geram código em tempo de execução. O ESLint está configurado com `@typescript-eslint/consistent-type-imports` para automatizar essa regra.

---

## 5. Boas Práticas Angular

- **Reatividade com Signals:** prefira `signal`, `computed` e `input` aos antigos decorators `@Input()` e getters tradicionais.
- **ChangeDetectionStrategy.OnPush:** deve ser configurado em todos os componentes para performance previsível.
- **Injeção de dependência via `inject()`:** prefira a função `inject(Service)` ao construtor convencional.
- **Acessibilidade:** todos os inputs de formulário devem conter `aria-label` ou rótulos `<label>` associados. O `angular-eslint` valida automaticamente regras do pacote `templateAccessibility`.

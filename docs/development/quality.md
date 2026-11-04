# Padrões de Qualidade e CI

Este documento define os critérios de qualidade de código, ferramentas de automação e a esteira de integração contínua (CI) do projeto **Mangá Atlas**.

---

## 1. Ferramentas Integradas

1. **Prettier:**
   - Assegura estilo de código unificado (aspas simples, largura de 100 caracteres, ponto e vírgula, indentação de 2 espaços).
   - Utiliza parser Angular para templates `.html`.
2. **ESLint (Flat Config):**
   - Utiliza `eslint.config.mjs` com `angular-eslint` e `typescript-eslint`.
   - Valida boas práticas do Angular (standalone components, seletores com prefixo `app`).
   - Habilita regras de acessibilidade para templates (`templateAccessibility`).
   - Desabilita conflitos de formatação através de `eslint-config-prettier`.
3. **Vitest:**
   - Valida a lógica de negócios e rendering dos componentes de forma rápida e confiável.
4. **TypeScript Strict Mode:**
   - Não permite `any` implícito, assegura checagem de tipos estrita e tipagem defensiva.

---

## 2. Checklist Pré-Pull Request (Comando `npm run check`)

Antes de abrir um Pull Request ou mesclar alterações na branch principal, o desenvolvedor ou agente deve rodar:

```bash
npm run check
```

Esse comando encadeia a execução de:

1. `npm run format:check` (valida se todos os arquivos estão formatados com Prettier)
2. `npm run lint` (valida regras estáticas do ESLint)
3. `npm run test -- --watch=false` (executa a suíte unitária do Vitest)
4. `npm run build` (garante que o bundle de produção compila sem avisos ou erros de tipo)

---

## 3. Pipeline de Integração Contínua (GitHub Actions)

O repositório possui uma pipeline configurada em `.github/workflows/ci.yml` que é acionada em:

- Pushes na branch `main`
- Pull Requests direcionados para a branch `main`

A pipeline executa:

1. Setup do ambiente Node.js 22 LTS.
2. Instalação limpa via `npm ci`.
3. `npm run format:check`.
4. `npm run lint`.
5. `npm run test -- --watch=false`.
6. `npm run build`.

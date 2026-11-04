# Guia de Início Rápido (Getting Started)

Instruções para configurar e executar o ambiente de desenvolvimento do **Mangá Atlas**.

---

## 1. Pré-requisitos

- **Node.js:** Versão 22 LTS ou 24 (compatível com Angular 21).
- **npm:** Versão 10 ou superior.
- **Python:** Versão 3.12+ (apenas se for executar ou evoluir o coletor de dados em `collector/`).

---

## 2. Instalação das Dependências

Clone o repositório e instale as dependências com o npm:

```bash
npm install
```

Para instalações idênticas em ambientes de integração contínua (CI):

```bash
npm ci
```

---

## 3. Comandos de Execução do Frontend

| Ação                                                 | Comando                             |
| ---------------------------------------------------- | ----------------------------------- |
| Iniciar servidor local de desenvolvimento            | `npm run start` (ou `npx ng serve`) |
| Compilar projeto para produção                       | `npm run build` (ou `npx ng build`) |
| Executar testes unitários (Vitest)                   | `npm run test -- --watch=false`     |
| Executar testes unitários em modo watch              | `npm run test:watch`                |
| Gerar relatório de cobertura de testes               | `npm run test:coverage`             |
| Verificar formatação com Prettier                    | `npm run format:check`              |
| Formatar arquivos com Prettier                       | `npm run format`                    |
| Executar análise estática com ESLint                 | `npm run lint`                      |
| Corrigir erros elegíveis com ESLint                  | `npm run lint:fix`                  |
| Validação completa (formatação, lint, teste e build) | `npm run check`                     |

A aplicação ficará disponível em `http://localhost:4200/`.

---

## 4. Execução do Coletor Python (Opcional)

Se desejar executar os testes do coletor de metadados:

```bash
cd collector
python -m unittest test_bbm_client.py
```

# Plano técnico — SPEC-001

1. Estruturar Angular por `features/catalog`, `features/calendar`, `features/analytics`.
2. Separar modelos em pastas `models/` locais e contratos compartilhados em `shared/models` e `core/data`.
3. Separar todos os componentes em arquivos dedicados (`.ts`, `.html`, `.scss`, `.spec.ts`).
4. Configurar Prettier, ESLint (Flat Config) e Vitest via builder oficial do Angular CLI.
5. Implementar páginas com dados demonstrativos, sem dependência de servidor.
6. Criar coletor Python separado, com pausa entre requisições e execução manual.
7. Validar parsers em exemplos de HTML e evoluir testes antes da integração real.
8. Futura fase: persistência PostgreSQL + API gerenciada ou backend dedicado, conforme requisitos de consulta e operação.

## Decisões Técnicas

- **ADR-001:** componentes com arquivos separados (.ts, .html, .scss).
- **ADR-002:** organização de models em pastas `models/*.model.ts`.
- **ADR-003:** adoção do Vitest como executor oficial de testes unitários.
- **ADR-004:** Prettier e ESLint Flat Config integrados.
- **ADR-005:** coletor Python desacoplado do frontend.

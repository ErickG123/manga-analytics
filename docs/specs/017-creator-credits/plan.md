# Plano: créditos completos de criação

1. Extrair múltiplos pares papel/nome dos blocos textuais do BBM e deduplicá-los.
2. Persistir os créditos concatenados com seus papéis, preservando a semântica do campo atual.
3. Ampliar o tipo da coluna `mangas.author` para `text` por migração reversível e segura.
4. Cobrir extração, deduplicação e não interferência nos campos de editora com testes do parser.
5. Documentar a limitação de depender de rótulos e validar collector/API/web.

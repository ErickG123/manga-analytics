# Plano — SPEC-014

1. Estender modelos de coleta para grupos de publicação e metadados editoriais tipados.
2. Alterar parser BBM para reconhecer as seções `nª Publicação`, metadados e tabelas associadas; detectar rótulos explícitos e manter evidência.
3. Criar migração compatível com registros atuais, retirar o falso padrão `Tankobon` e permitir várias edições por obra/editora.
4. Persistir cada grupo de volumes de modo idempotente, preservando histórico de preço e variantes.
5. Expor edições na API e permitir análises agregadas e filtradas por formato.
6. Atualizar tela de detalhe e dashboard com classificação, cobertura de dados, comparações e legenda explicativa.
7. Atualizar documentação principal e documentação de arquitetura/coleta/relatórios.
8. Validar parser, persistência PostgreSQL isolada, API, Angular, cobertura, CLI de importação real; reprocessar catálogo e produzir dump após a sincronização.

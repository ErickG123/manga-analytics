# Plano: persistência parcial do Collector

1. Tornar colunas de data/preço opcionais e interpretar linhas por número de volume.
2. Converter linhas divergentes do mesmo número em variantes explícitas e reter aviso de qualidade.
3. Persistir dados parciais e metadados básicos, com sincronização pendente até revisão/reprocessamento íntegro.
4. Classificar preços como informados ou não informados em contratos de API; exibir o marcador R$ 0,00 sem persistir/usar em cálculos.
5. Testar parser, import service, contratos de API e templates; executar validação completa.
6. Reprocessar o catálogo começando da primeira página e observar os novos erros.

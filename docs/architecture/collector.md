# Arquitetura do Coletor Python — Mangá Atlas

O **Mangá Atlas Collector** é um pipeline ETL independente, projetado para extrair, normalizar e persistir metadados e volumes de mangás publicados no Brasil de forma idempotente e segura.

---

## 1. Estrutura de Camadas

```text
collector/
├── src/
│   ├── clients/            # Comunicação HTTP externa (BBMClient com retries e backoff)
│   ├── parsers/            # Extração de dados a partir de HTML (BeautifulSoup)
│   ├── normalizers/        # Normalização de datas brasileiras e preços BRL
│   ├── models/             # Modelos tipados com dataclasses
│   ├── repositories/       # Persistência idempotente via psycopg e PostgreSQL
│   ├── services/           # Orquestração de importação e sincronização
│   └── cli.py              # Interface de linha de comando (import, sync, --dry-run)
└── tests/
    ├── fixtures/           # Arquivos HTML estáticos para testes reproduzíveis
    └── test_bbm_parser.py  # Testes com pytest
```

---

## 2. Linha de Comando (CLI)

```bash
# Executar em modo simulação (sem gravar no banco)
python -m collector.src.cli import --limit 10 --dry-run

# Executar importação persistente
python -m collector.src.cli import --limit 10

# Executar sincronização incremental
python -m collector.src.cli sync
```

## 3. Sincronização incremental e idempotência

O checkpoint da referência externa registra `sourceModifiedAt`, `sourceContentHash`, `lastSyncedAt` e `syncStatus`. Fichas completas com a mesma data de modificação são ignoradas sem download; `--force-refresh` força o download e compara o hash antes de gravar. Uma ficha cuja tabela de volumes não foi completamente interpretada fica pendente para nova tentativa. `--limit` limita fichas avaliadas, não obras novas.

O repositório faz upsert transacional da obra, edição e volumes com chaves únicas, preserva dados existentes quando a fonte omite valores e cria observação de preço apenas quando o preço mudou. Veja [validação e benchmark](../testing/collector-import-validation.md) para evidências e limitações.

As medições offline usam fixtures locais e não validam acesso nem latência da fonte. Nenhuma sincronização remota deve ser iniciada sem autorização e condições de uso confirmadas pela fonte.

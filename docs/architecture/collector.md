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

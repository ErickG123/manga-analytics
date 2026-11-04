"""CLI oficial do Mangá Atlas Collector."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from collector.src.services.import_service import ImportService


def setup_logging(verbose: bool):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        level=level,
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main():
    parser = argparse.ArgumentParser(
        prog="manga-atlas-collector",
        description="Coletor de dados e catalogação BBM para o Mangá Atlas",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Ativa logs detalhados"
    )
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponíveis")

    # Subcomando import
    import_parser = subparsers.add_parser("import", help="Importa dados do BBM")
    import_parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Máximo de fichas selecionadas (não de obras novas)",
    )
    import_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa o parsing sem persistir no banco",
    )
    import_parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Consulta novamente as fichas mesmo com modified já sincronizado",
    )
    import_parser.add_argument(
        "--metrics-json",
        type=Path,
        help="Salva o resumo não sensível da execução em JSON",
    )

    # Subcomando sync
    sync_parser = subparsers.add_parser(
        "sync",
        help="Executa sincronização incremental baseada em modificações recentes",
    )
    sync_parser.add_argument(
        "--limit", type=int, default=5, help="Máximo de fichas descobertas para avaliar"
    )
    sync_parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Consulta novamente as fichas mesmo com modified já sincronizado",
    )
    sync_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula a sincronização sem persistir no banco",
    )
    sync_parser.add_argument(
        "--metrics-json",
        type=Path,
        help="Salva o resumo não sensível da execução em JSON",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    if not args.command or args.command == "import":
        limit = getattr(args, "limit", 10)
        dry_run = getattr(args, "dry_run", False)
        force_refresh = getattr(args, "force_refresh", False)
        metrics_path = getattr(args, "metrics_json", None)
        if limit is not None and limit < 1:
            parser.error("--limit deve ser maior que zero")
        service = ImportService()
        result = service.run_import(
            limit=limit, dry_run=dry_run, force_refresh=force_refresh
        )
        _write_metrics(metrics_path, result)
        if result.failed > 0 and result.created == 0:
            sys.exit(1)
        sys.exit(0)
    elif args.command == "sync":
        if args.limit < 1:
            parser.error("--limit deve ser maior que zero")
        service = ImportService()
        result = service.run_import(
            limit=args.limit,
            dry_run=args.dry_run,
            force_refresh=args.force_refresh,
            run_type="sync",
        )
        _write_metrics(args.metrics_json, result)
        if result.failed > 0 and result.created == 0 and result.updated == 0:
            sys.exit(1)
        sys.exit(0)
    else:
        parser.print_help()
        sys.exit(1)


def _write_metrics(path: Path | None, result) -> None:
    if path is None:
        return

    def serialize(value):
        if isinstance(value, datetime):
            return value.isoformat()
        raise TypeError(f"Tipo não serializável no relatório: {type(value).__name__}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(asdict(result), ensure_ascii=False, indent=2, default=serialize)
        + "\n",
        encoding="utf-8",
    )
    logging.getLogger("manga_atlas_collector").info("Métricas JSON salvas em %s", path)


if __name__ == "__main__":
    main()

"""CLI oficial do Mangá Atlas Collector."""
from __future__ import annotations

import argparse
import logging
import sys

from collector.src.services.import_service import ImportService


def setup_logging(verbose: bool):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        level=level,
        datefmt='%Y-%m-%d %H:%M:%S'
    )

def main():
    parser = argparse.ArgumentParser(
        prog='manga-atlas-collector',
        description='Coletor de dados e catalogação BBM para o Mangá Atlas'
    )
    parser.add_argument('-v', '--verbose', action='store_true', help='Ativa logs detalhados')
    subparsers = parser.add_subparsers(dest='command', help='Comandos disponíveis')

    # Subcomando import
    import_parser = subparsers.add_parser('import', help='Importa dados do BBM')
    import_parser.add_argument('--limit', type=int, default=10, help='Quantidade máxima de obras para processar')
    import_parser.add_argument('--dry-run', action='store_true', help='Executa o parsing sem persistir no banco')

    # Subcomando sync
    subparsers.add_parser('sync', help='Executa sincronização incremental baseada em modificações recentes')

    args = parser.parse_args()
    setup_logging(args.verbose)

    if not args.command or args.command == 'import':
        limit = getattr(args, 'limit', 10)
        dry_run = getattr(args, 'dry_run', False)
        service = ImportService()
        result = service.run_import(limit=limit, dry_run=dry_run)
        if result.failed > 0 and result.created == 0:
            sys.exit(1)
        sys.exit(0)
    elif args.command == 'sync':
        service = ImportService()
        result = service.run_import(limit=5, dry_run=False)
        sys.exit(0)
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == '__main__':
    main()

"""CLI oficial do Mangá Atlas Collector."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict
from datetime import UTC, datetime
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

    subparsers.add_parser(
        "source-status", help="Exibe suspensão persistida da origem BBM"
    )
    unblock_parser = subparsers.add_parser(
        "source-unblock", help="Libera bloqueio 403 após revisão explícita"
    )
    unblock_parser.add_argument(
        "--reason", required=True, help="Motivo da avaliação operacional"
    )
    failures_parser = subparsers.add_parser(
        "failures", help="Lista fichas pendentes de revisão"
    )
    failures_parser.add_argument("--limit", type=int, default=20)
    retry_failed_parser = subparsers.add_parser(
        "retry-failed", help="Reprocessa falhas transitórias registradas"
    )
    retry_failed_parser.add_argument("--limit", type=int, default=5)
    retry_failed_parser.add_argument("--dry-run", action="store_true")
    retry_failed_parser.add_argument("--metrics-json", type=Path)

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

    backfill_parser = subparsers.add_parser(
        "backfill", help="Importa progressivamente o catálogo e retoma pelo checkpoint"
    )
    backfill_parser.add_argument(
        "--batch-size",
        type=int,
        default=5,
        help="Máximo de obras selecionadas nesta página/lote",
    )
    backfill_parser.add_argument(
        "--resume", action="store_true", help="Continua da página salva no checkpoint"
    )
    backfill_parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Reinicia a posição; não remove dados importados",
    )
    backfill_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula sem persistir obras ou checkpoint",
    )
    backfill_parser.add_argument(
        "--metrics-json", type=Path, help="Salva métricas da execução em JSON"
    )
    sync_parser.add_argument(
        "--metrics-json",
        type=Path,
        help="Salva o resumo não sensível da execução em JSON",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    if args.command in {"source-status", "source-unblock", "failures"}:
        from collector.src.repositories.collector_repository import CollectorRepository

        repo = CollectorRepository()
        if args.command == "source-status":
            print(
                json.dumps(
                    repo.get_source_state() or {"status": "active"},
                    ensure_ascii=False,
                    indent=2,
                    default=str,
                )
            )
            sys.exit(0)
        if args.command == "source-unblock":
            if not repo.acknowledge_source_block(args.reason):
                print("Nenhum bloqueio 403 pendente para liberar.")
                sys.exit(1)
            print(
                "Bloqueio manual revisado e removido. Cooldown 429 ativo continua sem liberação manual."
            )
            sys.exit(0)
        if args.limit < 1:
            parser.error("--limit deve ser maior que zero")
        print(
            json.dumps(
                repo.list_open_failures(args.limit),
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
        sys.exit(0)

    if args.command == "retry-failed":
        if args.limit < 1:
            parser.error("--limit deve ser maior que zero")
        service = ImportService()
        result = service.run_import(
            limit=args.limit,
            dry_run=args.dry_run,
            force_refresh=True,
            run_type="retry_failed",
            retry_failed=True,
        )
        _write_metrics(args.metrics_json, result)
        print(json.dumps(asdict(result), ensure_ascii=False, indent=2, default=str))
        sys.exit(1 if result.failed else 0)

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
    elif args.command == "backfill":
        if args.batch_size < 1:
            parser.error("--batch-size deve ser maior que zero")
        service = ImportService()
        repo = service.repository
        source_state = repo.get_source_state("bbm")
        if (
            source_state
            and source_state["status"] == "suspended"
            and source_state.get("suspended_until")
            and source_state["suspended_until"] <= datetime.now(UTC)
        ):
            repo.clear_expired_suspension("bbm")
            source_state = repo.get_source_state("bbm")
        if source_state and source_state["status"] in ("suspended", "blocked"):
            print(
                f"Backfill bloqueado pela origem BBM ({source_state['status']}): "
                f"{source_state.get('reason') or 'consulte source-status'}"
            )
            sys.exit(1)
        if args.reset_checkpoint and not args.dry_run and not repo.reset_checkpoint():
            parser.error("Não é possível resetar: existe um backfill ativo.")
        checkpoint = (
            repo.get_checkpoint() if args.resume and not args.reset_checkpoint else None
        )
        start_page = int(checkpoint["current_page"]) if checkpoint else 1
        start_offset = int(checkpoint.get("current_offset", 0)) if checkpoint else 0
        if checkpoint and checkpoint["status"] == "completed":
            print(
                "Catálogo já marcado como concluído. Use --reset-checkpoint para nova passagem."
            )
            sys.exit(0)
        if not args.dry_run and not repo.acquire_checkpoint(page=start_page):
            parser.error("Já existe um backfill ativo para a fonte BBM.")
        processed_count = int(checkpoint["processed_count"]) if checkpoint else 0

        def save_item_checkpoint(offset: int, external_id: str) -> None:
            nonlocal processed_count
            processed_count += 1
            repo.save_checkpoint(
                page=start_page,
                offset=offset,
                last_external_id=external_id or None,
                processed_count=processed_count,
                status="running",
            )

        try:
            result = service.run_import(
                limit=args.batch_size,
                dry_run=args.dry_run,
                run_type="backfill",
                start_page=start_page,
                orderby="id",
                order="asc",
                max_pages=1,
                start_offset=start_offset,
                item_checkpoint=None if args.dry_run else save_item_checkpoint,
            )
            result.config["backfill_start_page"] = start_page
            result.config["backfill_end_page"] = int(
                result.http_metrics.get("last_page", start_page)
            )
            if not args.dry_run:
                metrics = result.http_metrics
                end_reached = bool(metrics.get("catalog_end_reached", False))
                last_page = int(metrics.get("last_page", start_page))
                discovery_failed = bool(getattr(service.client, "discovery_errors", []))
                request_blocked = bool(
                    metrics.get("status_403", 0) or metrics.get("status_429", 0)
                )
                if request_blocked or result.termination_status in (
                    "rate_limited",
                    "blocked",
                ):
                    repo.set_checkpoint_status(
                        result.termination_status
                        or (
                            "rate_limited"
                            if metrics.get("status_429", 0)
                            else "blocked"
                        )
                    )
                elif (
                    discovery_failed
                    or result.retryable_failures
                    or result.termination_status == "failed"
                ):
                    repo.set_checkpoint_status("failed")
                else:
                    repo.save_checkpoint(
                        page=last_page + 1,
                        offset=0,
                        last_external_id=str(metrics.get("last_external_id") or "")
                        or None,
                        processed_count=processed_count,
                        status="completed" if end_reached else "pending",
                    )
            _write_metrics(args.metrics_json, result)
        except KeyboardInterrupt:
            if not args.dry_run:
                repo.set_checkpoint_status("interrupted")
                if service.active_run_id:
                    try:
                        repo.finish_import_job(
                            job_id=service.active_run_id,
                            status="interrupted",
                            reason="Interrompido pelo operador (Ctrl+C); checkpoint confirmado preservado.",
                            metrics={"http": service.client.metrics_snapshot()},
                            processed=0,
                            created=0,
                            updated=0,
                            failed=0,
                            page=start_page,
                            offset=start_offset,
                        )
                    except Exception:
                        logging.getLogger("manga_atlas_collector").exception(
                            "Não foi possível atualizar o job interrompido no PostgreSQL."
                        )
            print("Execução interrompida; checkpoint confirmado preservado.")
            sys.exit(130)
        finally:
            if not args.dry_run:
                checkpoint_now = repo.get_checkpoint()
                if checkpoint_now and checkpoint_now["status"] == "running":
                    repo.set_checkpoint_status("interrupted")
        if result.failed:
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

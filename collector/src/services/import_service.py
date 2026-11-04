"""Serviço de importação e sincronização do Coletor."""
from __future__ import annotations

import logging

import psycopg

from collector.src.clients.bbm_client import BBMClient
from collector.src.models.entities import ImportResult, MangaCollected, VolumeCollected
from collector.src.parsers.bbm_parser import parse_bbm_page
from collector.src.repositories.collector_repository import CollectorRepository

logger = logging.getLogger('manga_atlas_collector')

class ImportService:
    def __init__(self, client: BBMClient | None = None, repository: CollectorRepository | None = None):
        self.client = client or BBMClient()
        self.repository = repository or CollectorRepository()

    def run_import(self, limit: int | None = 10, dry_run: bool = False) -> ImportResult:
        result = ImportResult()
        logger.info(f"Iniciando importação (limit={limit}, dry_run={dry_run})...")

        metadata_iter = self.client.iter_catalog_metadata(limit=limit)
        for meta in metadata_iter:
            page_id = meta.get('id')
            raw_title = meta.get('title', {}).get('rendered', '')
            if not page_id or not raw_title:
                continue

            result.processed += 1
            try:
                page_data = self.client.fetch_page(page_id)
                html_content = page_data.get('content', {}).get('rendered', '')
                parsed = parse_bbm_page(html_content, raw_title)

                manga = MangaCollected(
                    title=parsed['title'],
                    original_title=parsed.get('original_title'),
                    author=parsed.get('author'),
                    publisher=parsed['publisher'],
                    cover_url=parsed.get('cover_url'),
                    external_id=str(page_id),
                    external_url=meta.get('link'),
                    volumes=[
                        VolumeCollected(
                            number=v['number'],
                            title=v['title'],
                            release_date=v['release_date'],
                            release_date_precision=v['release_date_precision'],
                            release_year=v.get('release_year'),
                            release_month=v.get('release_month'),
                            release_day=v.get('release_day'),
                            release_status=v['release_status'],
                            price_amount=v['price_amount'],
                            cover_url=v['cover_url']
                        )
                        for v in parsed.get('volumes', [])
                    ]
                )
                price_summary = ', '.join(
                    f"vol. {volume.number}: R$ {volume.price_amount:.2f}"
                    for volume in manga.volumes
                    if volume.price_amount is not None
                )
                volume_summary = f"{len(manga.volumes)} volumes, {sum(volume.price_amount is not None for volume in manga.volumes)} com preço"

                if dry_run:
                    logger.info(f"[DRY-RUN] Processado: {manga.title}: {volume_summary}")
                    if price_summary:
                        logger.info(f"[DRY-RUN] Preços encontrados: {price_summary}")
                    result.created += 1
                else:
                    self.repository.save_manga(manga)
                    logger.info(f"[PERSISTIDO] {manga.title}: {volume_summary}")
                    result.created += 1

            except (ValueError, KeyError, RuntimeError, psycopg.Error) as e:
                err_msg = f"Falha na página {page_id} ({raw_title}): {e}"
                logger.error(err_msg)
                result.failed += 1
                result.errors.append(err_msg)

        logger.info(f"Fim da importação: {result.created} criados, {result.failed} falhas de {result.processed} processados.")
        return result

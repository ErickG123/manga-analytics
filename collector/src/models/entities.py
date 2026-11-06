"""Modelos de dados tipados para a coleta e persistência."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Literal

DatePrecision = Literal["day", "month", "year", "unknown"]
ReleaseStatus = Literal["released", "planned", "unknown"]
EditionFormatType = Literal[
    "regular",
    "two_in_one",
    "three_in_one",
    "omnibus",
    "definitive",
    "deluxe",
    "other",
    "unknown",
]


@dataclass
class PublicationCollected:
    source_key: str
    name: str
    format_type: EditionFormatType = "unknown"
    format_label: str | None = None
    format_details: str | None = None
    volumes_per_book: int | None = None
    format_evidence: str | None = None
    volumes: list[VolumeCollected] = field(default_factory=list)


@dataclass
class VolumeVariantCollected:
    name: str
    release_date: str | None = None
    release_date_precision: DatePrecision = "unknown"
    release_year: int | None = None
    release_month: int | None = None
    release_day: int | None = None
    release_status: ReleaseStatus = "unknown"
    price_amount: Decimal | None = None
    cover_url: str | None = None
    isbn13: str | None = None
    page_count: int | None = None


@dataclass
class VolumeCollected:
    number: int
    title: str | None = None
    release_date: str | None = None
    release_date_precision: DatePrecision = "unknown"
    release_year: int | None = None
    release_month: int | None = None
    release_day: int | None = None
    release_status: ReleaseStatus = "unknown"
    price_amount: Decimal | None = None
    cover_url: str | None = None
    isbn13: str | None = None
    page_count: int | None = None
    variants: list[VolumeVariantCollected] = field(default_factory=list)


@dataclass
class MangaCollected:
    title: str
    publisher: str
    original_title: str | None = None
    author: str | None = None
    category: str | None = None
    synopsis: str | None = None
    cover_url: str | None = None
    external_id: str | None = None
    external_url: str | None = None
    source_modified_at: str | None = None
    source_content_hash: str | None = None
    sync_complete: bool = False
    volumes: list[VolumeCollected] = field(default_factory=list)
    publications: list[PublicationCollected] = field(default_factory=list)


@dataclass
class ImportResult:
    run_id: str = ""
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: float = 0.0
    discovered: int = 0
    selected: int = 0
    processed: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    would_create: int = 0
    would_update: int = 0
    failed: int = 0
    retryable_failures: int = 0
    termination_status: str | None = None
    volumes_found: int = 0
    volumes_with_price: int = 0
    variants_found: int = 0
    variants_with_price: int = 0
    variants_created: int = 0
    variants_updated: int = 0
    variants_unchanged: int = 0
    volumes_created: int = 0
    volumes_updated: int = 0
    volumes_unchanged: int = 0
    works_with_cover: int = 0
    works_without_cover: int = 0
    timings_ms: dict[str, float] = field(default_factory=dict)
    http_metrics: dict[str, int | float] = field(default_factory=dict)
    config: dict[str, int | float | bool | str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


@dataclass
class PersistenceResult:
    status: Literal["created", "updated", "unchanged"]
    manga_id: str
    volumes_created: int = 0
    volumes_updated: int = 0
    volumes_unchanged: int = 0
    price_changes: int = 0
    variants_created: int = 0
    variants_updated: int = 0
    variants_unchanged: int = 0

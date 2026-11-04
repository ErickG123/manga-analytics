"""Modelos de dados tipados para a coleta e persistência."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

DatePrecision = Literal['day', 'month', 'year', 'unknown']
ReleaseStatus = Literal['released', 'planned', 'unknown']

@dataclass
class VolumeCollected:
    number: int
    title: str | None = None
    release_date: str | None = None
    release_date_precision: DatePrecision = 'unknown'
    release_year: int | None = None
    release_month: int | None = None
    release_day: int | None = None
    release_status: ReleaseStatus = 'unknown'
    price_amount: Decimal | None = None
    cover_url: str | None = None
    isbn13: str | None = None
    page_count: int | None = None

@dataclass
class MangaCollected:
    title: str
    publisher: str
    original_title: str | None = None
    author: str | None = None
    category: str = 'Geral'
    synopsis: str | None = None
    cover_url: str | None = None
    external_id: str | None = None
    external_url: str | None = None
    volumes: list[VolumeCollected] = field(default_factory=list)

@dataclass
class ImportResult:
    processed: int = 0
    created: int = 0
    updated: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

"""Normalização de datas brasileiras e preços BRL."""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Literal

DatePrecision = Literal['day', 'month', 'year', 'unknown']
ReleaseStatus = Literal['released', 'planned', 'unknown']

PRICE_REGEX = re.compile(r'R\$\s*([\d.]+,\d{2})')
MONTH_NAMES = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
    'outubro': 10, 'novembro': 11, 'dezembro': 12,
    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
}

def parse_price_brl(text: str | None) -> Decimal | None:
    if not text:
        return None
    match = PRICE_REGEX.search(text)
    if not match:
        return None
    raw = match.group(1).replace('.', '').replace(',', '.')
    return Decimal(raw)

def parse_brazilian_date(text: str | None) -> tuple[str | None, DatePrecision, int | None, int | None, int | None]:
    if not text or not text.strip() or text.strip() == '—':
        return None, 'unknown', None, None, None

    cleaned = text.strip()

    # Formato DD/MM/YYYY
    dmy_match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', cleaned)
    if dmy_match:
        day = int(dmy_match.group(1))
        month = int(dmy_match.group(2))
        year = int(dmy_match.group(3))
        formatted = f"{day:02d}/{month:02d}/{year}"
        return formatted, 'day', year, month, day

    # Formato MM/YYYY
    my_match = re.search(r'(\d{1,2})/(\d{4})', cleaned)
    if my_match:
        month = int(my_match.group(1))
        year = int(my_match.group(2))
        formatted = f"{month:02d}/{year}"
        return formatted, 'month', year, month, None

    # Formato NomeDoMês/YYYY ou NomeDoMês de YYYY
    for name, month_num in MONTH_NAMES.items():
        pattern = rf'{name}\s*(?:de|/)?\s*(\d{{4}})'
        match = re.search(pattern, cleaned, re.IGNORECASE)
        if match:
            year = int(match.group(1))
            formatted = f"{month_num:02d}/{year}"
            return formatted, 'month', year, month_num, None

    # Apenas Ano YYYY
    y_match = re.search(r'(\d{4})', cleaned)
    if y_match:
        year = int(y_match.group(1))
        return str(year), 'year', year, None, None

    return cleaned, 'unknown', None, None, None

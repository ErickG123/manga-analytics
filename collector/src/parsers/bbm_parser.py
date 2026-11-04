"""Parser de HTML de fichas da BBM."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from bs4 import BeautifulSoup

from collector.src.normalizers.data_normalizer import (
    parse_brazilian_date,
    parse_price_brl,
)


def _normalize_label(value: str) -> str:
    normalized = unicodedata.normalize('NFKD', value)
    return ''.join(char for char in normalized if not unicodedata.combining(char)).strip().lower()


def parse_bbm_page(html: str, page_title: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, 'html.parser')

    # 1. Metadados básicos
    title = page_title.strip()
    author = None
    publisher_name = 'Panini'
    original_title = None

    text_content = soup.get_text('\n', strip=True)
    author_match = re.search(r'(?:Roteiro|História|Arte|Autor|Autoria):\s*([^\n\r]+)', text_content, re.IGNORECASE)
    if author_match:
        author = author_match.group(1).strip()

    pub_match = re.search(r'(?:Editora|Publicação):\s*([^\n\r]+)', text_content, re.IGNORECASE)
    if pub_match:
        p_raw = pub_match.group(1).strip()
        for candidate in ['Panini', 'JBC', 'Pipoca & Nanquim', 'NewPOP', 'Conrad', 'L&PM']:
            if candidate.lower() in p_raw.lower():
                publisher_name = candidate
                break

    # 2. Capas de volumes brasileiros
    covers: list[str] = []
    for img in soup.find_all('img'):
        src = img.get('src') or img.get('data-src')
        if src and ('wp-content/uploads' in src) and not any(x in src.lower() for x in ['logo', 'banner', 'avatar', 'icon']):
            covers.append(src)

    # 3. Tabela de Volumes
    volumes: list[dict[str, Any]] = []
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        header_row_index = None
        column_indexes: dict[str, int] = {}
        for row_index, row in enumerate(rows):
            cells = row.find_all(['th', 'td'], recursive=False)
            labels = [_normalize_label(cell.get_text(' ', strip=True)) for cell in cells]
            volume_index = next((i for i, label in enumerate(labels) if 'vol' in label), None)
            brazil_index = next((i for i, label in enumerate(labels) if 'brasil' in label), None)
            if volume_index is not None and brazil_index is not None:
                header_row_index = row_index
                column_indexes['volume'] = volume_index
                column_indexes['date'] = brazil_index
                price_index = next((i for i, label in enumerate(labels) if 'preco' in label), None)
                if price_index is not None:
                    column_indexes['price'] = price_index
                break

        if header_row_index is None:
            continue

        for row in rows[header_row_index + 1:]:
            cells = row.find_all(['th', 'td'], recursive=False)
            if len(cells) <= max(column_indexes.values()):
                continue

            num_text = cells[column_indexes['volume']].get_text(' ', strip=True)
            num_match = re.search(r'\d+', num_text)
            if num_match:
                vol_num = int(num_match.group())
            elif re.search(r'unico|one[- ]?shot', _normalize_label(num_text)):
                vol_num = 1
            else:
                continue

            # Data BR
            br_date_text = cells[column_indexes['date']].get_text(' ', strip=True)
            date_val, precision, year, month, day = parse_brazilian_date(br_date_text)

            # Preço BR
            price_text = cells[column_indexes['price']].get_text(' ', strip=True) if 'price' in column_indexes else ''
            price_decimal = parse_price_brl(price_text)

            cover_url = covers[vol_num - 1] if len(covers) >= vol_num else (covers[0] if covers else None)

            status = 'released' if date_val and date_val != '—' else 'planned'

            volumes.append({
                'number': vol_num,
                'title': f"Volume {vol_num}",
                'release_date': date_val,
                'release_date_precision': precision,
                'release_year': year,
                'release_month': month,
                'release_day': day,
                'release_status': status,
                'price_amount': price_decimal,
                'cover_url': cover_url,
            })
        break

    return {
        'title': title,
        'original_title': original_title,
        'author': author,
        'publisher': publisher_name,
        'cover_url': covers[0] if covers else None,
        'volumes': volumes
    }

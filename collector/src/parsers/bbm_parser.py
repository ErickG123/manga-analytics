"""Parser de HTML de fichas da BBM."""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

from bs4 import BeautifulSoup

from collector.src.normalizers.data_normalizer import (
    parse_brazilian_date,
    parse_price_brl,
)


def _normalize_label(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return (
        "".join(char for char in normalized if not unicodedata.combining(char))
        .strip()
        .lower()
    )


def _release_status(year: int | None, month: int | None, day: int | None) -> str:
    if year is None:
        return "unknown"
    today = datetime.now(UTC).date()
    if year < today.year:
        return "released"
    if year > today.year:
        return "planned"
    if month is None:
        return "unknown"
    if month < today.month:
        return "released"
    if month > today.month:
        return "planned"
    if day is None:
        return "unknown"
    return "released" if day < today.day else "planned"


def _variant_label(value: str) -> str | None:
    remainder = re.sub(r"^\D*\d+\s*", "", value).strip(" \t-–—|:")
    if remainder and _normalize_label(remainder) not in {"vol", "volume", "n"}:
        return remainder
    return None


def _is_release_date(value: str) -> bool:
    _, precision, year, _, _ = parse_brazilian_date(value)
    return precision in {"day", "month", "year"} and year is not None


def _publisher_from_text(text_content: str) -> str:
    pub_match = re.search(
        r"Editora(?:\s+brasileira)?\s*:\s*([^\n\r]+)",
        text_content,
        re.IGNORECASE,
    )
    if not pub_match:
        return "Não informada"

    publisher_name = pub_match.group(1).strip() or "Não informada"
    for candidate in ["Panini", "JBC", "Pipoca & Nanquim", "NewPOP", "Conrad", "L&PM"]:
        if candidate.casefold() in publisher_name.casefold():
            return candidate
    return publisher_name


def parse_bbm_publisher(html: str) -> str:
    """Extract only the Brazilian publisher, without parsing volume tables."""
    text_content = BeautifulSoup(html, "html.parser").get_text("\n", strip=True)
    return _publisher_from_text(text_content)


def parse_bbm_page(html: str, page_title: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    # 1. Metadados básicos
    title = page_title.strip()
    author = None
    publisher_name = "Não informada"
    original_title = None

    text_content = soup.get_text("\n", strip=True)
    author_match = re.search(
        r"(?:Roteiro|História|Arte|Autor|Autoria):\s*([^\n\r]+)",
        text_content,
        re.IGNORECASE,
    )
    if author_match:
        author = author_match.group(1).strip()

    publisher_name = _publisher_from_text(text_content)

    # 2. Capas de volumes brasileiros
    covers: list[str] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if (
            src
            and ("wp-content/uploads" in src)
            and not any(x in src.lower() for x in ["logo", "banner", "avatar", "icon"])
        ):
            covers.append(src)

    # 3. Tabela de Volumes
    volumes: list[dict[str, Any]] = []
    volume_table_found = False
    volume_rows_skipped = 0
    duplicate_volume_rows = 0
    conflicting_volume_numbers: set[int] = set()
    row_headers: list[str] = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        header_row_index = None
        column_indexes: dict[str, int] = {}
        for row_index, row in enumerate(rows):
            cells = row.find_all(["th", "td"], recursive=False)
            labels = [
                _normalize_label(cell.get_text(" ", strip=True)) for cell in cells
            ]
            volume_index = next(
                (
                    i
                    for i, label in enumerate(labels)
                    if re.fullmatch(r"vol(?:ume)?s?\.?", label)
                ),
                None,
            )
            brazil_index = next(
                (
                    i
                    for i, label in enumerate(labels)
                    if label == "brasil"
                    or (
                        "brasil" in label
                        and any(
                            token in label
                            for token in ("data", "publicado", "publicacao")
                        )
                    )
                ),
                None,
            )
            if volume_index is not None and brazil_index is not None:
                header_row_index = row_index
                row_headers = labels
                column_indexes["volume"] = volume_index
                column_indexes["date"] = brazil_index
                price_index = next(
                    (i for i, label in enumerate(labels) if "preco" in label), None
                )
                if price_index is not None:
                    column_indexes["price"] = price_index
                break

        if header_row_index is None:
            continue
        volume_table_found = True

        for row in rows[header_row_index + 1 :]:
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) <= max(column_indexes.values()):
                volume_rows_skipped += 1
                continue

            num_text = cells[column_indexes["volume"]].get_text(" ", strip=True)
            num_match = re.search(r"\d+", num_text)
            if num_match:
                vol_num = int(num_match.group())
            elif re.search(r"unico|one[- ]?shot", _normalize_label(num_text)):
                vol_num = 1
            else:
                volume_rows_skipped += 1
                continue

            # Data BR
            br_date_text = cells[column_indexes["date"]].get_text(" ", strip=True)
            date_val, precision, year, month, day = parse_brazilian_date(br_date_text)

            # Preço BR
            price_text = (
                cells[column_indexes["price"]].get_text(" ", strip=True)
                if "price" in column_indexes
                else ""
            )
            price_decimal = parse_price_brl(price_text)

            cover_url = (
                covers[vol_num - 1]
                if len(covers) >= vol_num
                else (covers[0] if covers else None)
            )

            status = _release_status(year, month, day)

            variant_labels: list[str] = []
            suffix_label = _variant_label(num_text)
            if suffix_label:
                variant_labels.append(suffix_label)
            for index, cell in enumerate(cells):
                if index in column_indexes.values():
                    continue
                if index < len(row_headers) and any(
                    token in row_headers[index]
                    for token in ("compre", "loja", "link", "buy", "amazon")
                ):
                    continue
                candidate = cell.get_text(" ", strip=True).strip(" \t-–—|:")
                if (
                    candidate
                    and not _is_release_date(candidate)
                    and _normalize_label(candidate) not in {"-", "—"}
                    and candidate.casefold()
                    not in {label.casefold() for label in variant_labels}
                ):
                    variant_labels.append(candidate)

            volume = {
                "number": vol_num,
                "title": f"Volume {vol_num}",
                "release_date": date_val,
                "release_date_precision": precision,
                "release_year": year,
                "release_month": month,
                "release_day": day,
                "release_status": status,
                "price_amount": price_decimal,
                "cover_url": cover_url,
                "variants": [],
            }
            prior_volume = next(
                (item for item in volumes if item["number"] == vol_num), None
            )
            if prior_volume is not None:
                duplicate_volume_rows += 1
                if variant_labels:
                    variant = {**volume, "name": " / ".join(variant_labels)}
                    variant.pop("number")
                    variant.pop("title")
                    variant.pop("variants")
                    existing_variant = next(
                        (
                            item
                            for item in prior_volume["variants"]
                            if item["name"].casefold() == variant["name"].casefold()
                        ),
                        None,
                    )
                    if existing_variant is None:
                        prior_volume["variants"].append(variant)
                    elif existing_variant != variant:
                        conflicting_volume_numbers.add(vol_num)
                elif {
                    key: value
                    for key, value in prior_volume.items()
                    if key != "variants"
                } != {key: value for key, value in volume.items() if key != "variants"}:
                    conflicting_volume_numbers.add(vol_num)
                continue
            volumes.append(volume)
        break

    return {
        "title": title,
        "original_title": original_title,
        "author": author,
        "publisher": publisher_name,
        "cover_url": covers[0] if covers else None,
        "volumes": volumes,
        "volume_table_found": volume_table_found,
        "volume_rows_skipped": volume_rows_skipped,
        "duplicate_volume_rows": duplicate_volume_rows,
        "conflicting_volume_numbers": sorted(conflicting_volume_numbers),
        "volume_parse_complete": volume_table_found
        and bool(volumes)
        and volume_rows_skipped == 0
        and not conflicting_volume_numbers,
    }

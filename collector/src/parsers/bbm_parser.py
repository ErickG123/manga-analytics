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


def _publication_heading(table) -> tuple[str, Any] | tuple[str, None]:
    heading_pattern = re.compile(
        r"\d+\s*(?:a|o|ª|º|°)?\s*(?:publicacao|edicao)", re.IGNORECASE
    )
    for candidate in table.find_all_previous(["p", "h2", "h3", "h4"]):
        label = candidate.get_text(" ", strip=True)
        if heading_pattern.fullmatch(_normalize_label(label)):
            return label, candidate
    return "Edição Brasileira", None


def _publication_metadata(
    title: str, heading: str, heading_node, table
) -> dict[str, Any]:
    context: list[str] = [title, heading]
    format_details = None
    if heading_node is not None:
        for node in heading_node.find_all_next(["p", "h2", "h3", "h4", "table"]):
            if node is table:
                break
            node_text = node.get_text(" ", strip=True)
            if re.fullmatch(
                r"\d+\s*(?:a|o|ª|º|°)?\s*(?:publicacao|edicao)",
                _normalize_label(node_text),
            ):
                break
            context.append(node_text)
            for strong in node.find_all("strong"):
                if (
                    _normalize_label(strong.get_text(" ", strip=True)).rstrip(":")
                    == "formato"
                ):
                    format_details = (
                        strong.parent.get_text(" ", strip=True)
                        .split(":", 1)[-1]
                        .strip()
                    )
    for anchor in table.find_all("a", href=True):
        context.append(str(anchor.get("href", "")))

    source = " ".join(context)
    normalized = _normalize_label(source).replace("–", "-").replace("—", "-")
    match = re.search(r"\b([23])\s*(?:-\s*em\s*-?\s*|em\s*|[-x×])1\b", normalized)
    if match:
        number = int(match.group(1))
        label = f"{number} em 1"
        format_type = "two_in_one" if number == 2 else "three_in_one"
    elif re.search(r"\bomnibus\b", normalized):
        label, format_type, number = "Omnibus", "omnibus", None
    elif re.search(r"\bedicao\s+definitiva\b|\bdefinitiva\b", normalized):
        label, format_type, number = "Edição definitiva", "definitive", None
    elif re.search(r"\bdeluxe\b", normalized):
        label, format_type, number = "Deluxe", "deluxe", None
    elif re.search(r"\bregular\b|\bedicao\s+padrao\b", normalized):
        label, format_type, number = "Regular", "regular", 1
    else:
        label, format_type, number = None, "unknown", None

    evidence = " | ".join(part for part in (heading, label, format_details) if part)
    return {
        "source_key": re.sub(r"[^a-z0-9]+", "_", _normalize_label(heading)).strip("_")
        or "default",
        "name": heading,
        "format_type": format_type,
        "format_label": label,
        "format_details": format_details,
        "volumes_per_book": number,
        "format_evidence": evidence or None,
    }


_CREDIT_FIELDS = re.compile(
    r"(?P<role>Autor(?:es|ia)?|Roteiro|Hist[oó]ria|Argumento|"
    r"Arte(?:-final)?|Desenho|Ilustra[cç][aã]o|Tradu[cç][aã]o|"
    r"Adapta[cç][aã]o|Cria[cç][aã]o|Personagens|Cores)\s*:",
    re.IGNORECASE,
)
_PAGE_FIELDS = re.compile(
    r"(?:Editora(?:\s+brasileira|\s+original)?|Formato|G[eê]nero|"
    r"Status|Volumes?|Pre[cç]o|ISBN|Origem|Publica[cç][aã]o)\s*:",
    re.IGNORECASE,
)


def _extract_author_credits(soup: BeautifulSoup) -> str | None:
    """Collect all labeled creator credits while retaining each role."""
    credit_entries: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for node in soup.find_all(["p", "li", "dt", "dd"]):
        text = node.get_text(" ", strip=True)
        matches = list(_CREDIT_FIELDS.finditer(text))
        if not matches:
            continue
        boundaries = sorted(
            [match.start() for match in matches]
            + [match.start() for match in _PAGE_FIELDS.finditer(text)]
        )
        for match in matches:
            next_boundary = next(
                (position for position in boundaries if position > match.start()),
                len(text),
            )
            value = text[match.end() : next_boundary].strip(" \t\n\r:;,.|–—-")
            if not value:
                continue
            role = match.group("role").strip()
            key = (_normalize_label(role), _normalize_label(value))
            if key not in seen:
                credit_entries.append((role, value))
                seen.add(key)

    if not credit_entries:
        # Preserve compatibility with pages that put credits in plain text rather
        # than a paragraph or list item.
        for line in soup.get_text("\n", strip=True).splitlines():
            match = _CREDIT_FIELDS.match(line.strip())
            if match:
                value = line[match.end() :].strip(" \t\n\r:;,.|–—-")
                if value:
                    role = match.group("role").strip()
                    key = (_normalize_label(role), _normalize_label(value))
                    if key not in seen:
                        credit_entries.append((role, value))
                        seen.add(key)

    if not credit_entries:
        return None
    return "; ".join(f"{role}: {value}" for role, value in credit_entries)


def parse_bbm_publisher(html: str) -> str:
    """Extract only the Brazilian publisher, without parsing volume tables."""
    text_content = BeautifulSoup(html, "html.parser").get_text("\n", strip=True)
    return _publisher_from_text(text_content)


def parse_bbm_page(html: str, page_title: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    # 1. Metadados básicos
    title = page_title.strip()
    author = _extract_author_credits(soup)
    publisher_name = "Não informada"
    original_title = None

    text_content = soup.get_text("\n", strip=True)
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

    # 3. Tabelas de volumes, agrupadas pela publicação indicada antes de cada tabela.
    volumes: list[dict[str, Any]] = []
    publications: list[dict[str, Any]] = []
    volume_table_found = False
    volume_rows_skipped = 0
    duplicate_volume_rows = 0
    conflicting_volume_numbers: set[int] = set()
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        header_row_index = None
        column_indexes: dict[str, int] = {}
        row_headers: list[str] = []
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
        publication_name, publication_heading_node = _publication_heading(table)
        publication = _publication_metadata(
            title, publication_name, publication_heading_node, table
        )
        table_volumes: list[dict[str, Any]] = []
        table_skipped = 0
        table_duplicates = 0
        table_conflicts: set[int] = set()

        for row in rows[header_row_index + 1 :]:
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) <= max(column_indexes.values()):
                table_skipped += 1
                continue

            num_text = cells[column_indexes["volume"]].get_text(" ", strip=True)
            num_match = re.search(r"\d+", num_text)
            if num_match:
                vol_num = int(num_match.group())
            elif re.search(r"unico|one[- ]?shot", _normalize_label(num_text)):
                vol_num = 1
            else:
                table_skipped += 1
                continue

            br_date_text = cells[column_indexes["date"]].get_text(" ", strip=True)
            date_val, precision, year, month, day = parse_brazilian_date(br_date_text)
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
                (item for item in table_volumes if item["number"] == vol_num), None
            )
            if prior_volume is not None:
                table_duplicates += 1
                if variant_labels:
                    variant = {**volume, "name": " / ".join(variant_labels)}
                    for key in ("number", "title", "variants"):
                        variant.pop(key)
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
                        table_conflicts.add(vol_num)
                elif {
                    key: value
                    for key, value in prior_volume.items()
                    if key != "variants"
                } != {key: value for key, value in volume.items() if key != "variants"}:
                    table_conflicts.add(vol_num)
                continue
            table_volumes.append(volume)

        volume_rows_skipped += table_skipped
        duplicate_volume_rows += table_duplicates
        conflicting_volume_numbers.update(table_conflicts)
        publication["volumes"] = table_volumes
        if table_volumes:
            publications.append(publication)
            if not volumes:
                volumes = table_volumes

    return {
        "title": title,
        "original_title": original_title,
        "author": author,
        "publisher": publisher_name,
        "cover_url": covers[0] if covers else None,
        "volumes": volumes,
        "publications": publications,
        "volume_table_found": volume_table_found,
        "volume_rows_skipped": volume_rows_skipped,
        "duplicate_volume_rows": duplicate_volume_rows,
        "conflicting_volume_numbers": sorted(conflicting_volume_numbers),
        "volume_parse_complete": volume_table_found
        and bool(volumes)
        and volume_rows_skipped == 0
        and not conflicting_volume_numbers,
    }

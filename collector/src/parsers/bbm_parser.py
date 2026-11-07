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


def _date_cell_label(value: str) -> str | None:
    """Return edition text such as 'Capa Variante' before an embedded date."""
    match = re.search(
        r"\d{1,2}/\d{1,2}/\d{4}|\d{1,2}/\d{4}|"
        r"(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|"
        r"setembro|outubro|novembro|dezembro)\s*(?:de\s*)?\d{4}",
        value,
        re.IGNORECASE,
    )
    if not match:
        return None
    label = value[: match.start()].strip(" \t-–—|:")
    if not label or _normalize_label(label) in {"publicado no brasil", "brasil"}:
        return None
    return label


def _brazilian_volume_number(value: str) -> int | None:
    """Extract a Brazilian volume number from cells like '#02 – 11/06/2024'."""
    match = re.search(r"#\s*(\d+)\s*[-–—:]\s*(?=\d{1,2}/|[a-z])", value, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _volume_number_tokens(value: str) -> list[int]:
    return [int(number) for number in re.findall(r"#\s*(\d+)", value)]


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
        r"^\d+\s*(?:a|o|ª|º|°)?\s*(?:publicacao|edicao)\b", re.IGNORECASE
    )
    for candidate in table.find_all_previous(["p", "h2", "h3", "h4"]):
        label = candidate.get_text(" ", strip=True)
        if heading_pattern.match(_normalize_label(label)):
            return label, candidate
        if re.fullmatch(r"edicao\s+digital", _normalize_label(label)):
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
            if re.match(
                r"^\d+\s*(?:a|o|ª|º|°)?\s*(?:publicacao|edicao)\b",
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
    elif re.search(
        r"\bedicao\s+digital\b|\bdigital\s+edition\b",
        _normalize_label(heading) + " " + _normalize_label(format_details or ""),
    ):
        label, format_type, number = "Edição digital", "digital_edition", None
    elif re.search(
        r"\bbox\b|\bcaixa\b",
        _normalize_label(heading) + " " + _normalize_label(format_details or ""),
    ):
        label, format_type, number = "Box", "box_set", None
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


def _logical_table_rows(rows: list[Any]) -> list[list[str]]:
    """Expand HTML row/column spans into a rectangular text grid.

    BBM groups Brazilian release dates and prices across consecutive volume
    rows with ``rowspan``. Treating only the explicit cells as columns drops
    those continuation rows or shifts their values into the wrong columns.
    """
    result: list[list[str]] = []
    pending: dict[int, tuple[int, str]] = {}

    for row in rows:
        grid: list[str | None] = []
        next_pending: dict[int, tuple[int, str]] = {}

        for column, (remaining_rows, text) in pending.items():
            while len(grid) <= column:
                grid.append(None)
            grid[column] = text
            if remaining_rows > 1:
                next_pending[column] = (remaining_rows - 1, text)

        cursor = 0
        for cell in row.find_all(["th", "td"], recursive=False):
            while cursor < len(grid) and grid[cursor] is not None:
                cursor += 1

            text = cell.get_text(" ", strip=True)
            try:
                colspan = max(1, int(cell.get("colspan", 1)))
            except (TypeError, ValueError):
                colspan = 1
            try:
                rowspan = max(1, int(cell.get("rowspan", 1)))
            except (TypeError, ValueError):
                rowspan = 1

            for offset in range(colspan):
                column = cursor + offset
                while len(grid) <= column:
                    grid.append(None)
                grid[column] = text
                if rowspan > 1:
                    next_pending[column] = (rowspan - 1, text)
            cursor += colspan

        result.append([value or "" for value in grid])
        pending = next_pending

    return result


def _table_section_label(cells: list[str]) -> str | None:
    """Recognize a section heading stretched across a source table."""
    values = [value.strip() for value in cells if value.strip()]
    if not values or len({_normalize_label(value) for value in values}) != 1:
        return None

    label = values[0]
    normalized = _normalize_label(label)
    if re.search(r"\d", label) or parse_price_brl(label) is not None:
        return None
    _, precision, year, _, _ = parse_brazilian_date(label)
    if precision != "unknown" or year is not None:
        return None
    if normalized in {"-", "--", "na", "n/a", "vol", "volume"}:
        return None
    return label


def _merge_publication_table(
    existing: dict[str, Any], incoming: dict[str, Any], table_index: int
) -> None:
    """Merge repeated HTML tables that describe the same source publication."""
    for volume in incoming["volumes"]:
        previous = next(
            (
                candidate
                for candidate in existing["volumes"]
                if candidate["number"] == volume["number"]
            ),
            None,
        )
        if previous is None:
            existing["volumes"].append(volume)
            continue

        previous_base = {
            key: value for key, value in previous.items() if key != "variants"
        }
        incoming_base = {
            key: value for key, value in volume.items() if key != "variants"
        }
        if previous_base == incoming_base:
            existing_variants = previous["variants"]
            for variant in volume["variants"]:
                if variant not in existing_variants:
                    existing_variants.append(variant)
            continue

        variant = {**volume, "name": f"Variação da tabela {table_index + 1}"}
        for key in ("number", "title", "variants"):
            variant.pop(key)
        if variant not in previous["variants"]:
            previous["variants"].append(variant)

    incoming_evidence = incoming.get("format_evidence")
    if incoming_evidence and incoming_evidence not in (
        existing.get("format_evidence") or ""
    ):
        existing["format_evidence"] = " | ".join(
            value
            for value in (existing.get("format_evidence"), incoming_evidence)
            if value
        )


def parse_bbm_page(html: str, page_title: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    # 1. Metadados básicos
    title = page_title.strip()
    author = _extract_author_credits(soup)
    publisher_name = "Não informada"
    original_title = None

    text_content = soup.get_text("\n", strip=True)
    publisher_name = _publisher_from_text(text_content)
    normalized_page_text = _normalize_label(text_content)
    brazilian_volume_count = re.search(
        r"\b(?:n[º°o.]?\s*de\s+volumes\s+no\s+brasil|volumes\s+no\s+brasil)\s*:?\s*(\d+)\b",
        normalized_page_text,
    )
    explicitly_single_volume = bool(
        brazilian_volume_count and int(brazilian_volume_count.group(1)) == 1
    )
    declared_brazilian_volume_count = (
        int(brazilian_volume_count.group(1)) if brazilian_volume_count else None
    )
    metadata_price = re.search(
        r"pre[cç]o\s*:?\s*(R\$\s*[\d.]+,\d{2})", text_content, re.IGNORECASE
    )
    page_price = parse_price_brl(metadata_price.group(1) if metadata_price else None)
    published_in_brazil = re.search(
        r"(?:publicado no brasil|lan[cç]amento)\s*:?\s*([^\n]+)",
        text_content,
        re.IGNORECASE,
    )
    page_release = parse_brazilian_date(
        published_in_brazil.group(1) if published_in_brazil else None
    )
    is_catalog_index = bool(re.search(r"\[child_pages\b", html, re.IGNORECASE))

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
    chapter_table_found = False
    volume_rows_skipped = 0
    duplicate_volume_rows = 0
    conflicting_volume_numbers: set[int] = set()
    fallback_schedule_rows: list[tuple[str, str]] = []
    for table_index, table in enumerate(soup.find_all("table")):
        rows = table.find_all("tr")
        logical_rows = _logical_table_rows(rows)
        header_row_index = None
        column_indexes: dict[str, int] = {}
        row_headers: list[str] = []
        for row_index, cells in enumerate(logical_rows):
            labels = [_normalize_label(cell) for cell in cells]
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
            if volume_index is not None:
                header_row_index = row_index
                row_headers = labels
                column_indexes["volume"] = volume_index
                if brazil_index is not None:
                    column_indexes["date"] = brazil_index
                else:
                    date_index = next(
                        (
                            i
                            for i, label in enumerate(labels)
                            if "data" in label
                            and any(
                                token in label for token in ("publicacao", "lancamento")
                            )
                        ),
                        None,
                    )
                    if date_index is not None:
                        column_indexes["date"] = date_index
                price_index = next(
                    (i for i, label in enumerate(labels) if "preco" in label), None
                )
                if price_index is not None:
                    column_indexes["price"] = price_index
                break

        if header_row_index is None:
            for schedule_header_index, cells in enumerate(logical_rows):
                labels = [_normalize_label(cell) for cell in cells]
                date_index = next(
                    (
                        index
                        for index, label in enumerate(labels)
                        if label == "brasil"
                        or ("data" in label and "brasil" in label)
                        or "data de publicacao" in label
                        or "data de lancamento" in label
                    ),
                    None,
                )
                price_index = next(
                    (index for index, label in enumerate(labels) if "preco" in label),
                    None,
                )
                if (
                    date_index is None
                    or price_index is None
                    or date_index == price_index
                ):
                    continue
                for schedule_row in logical_rows[schedule_header_index + 1 :]:
                    if max(date_index, price_index) < len(schedule_row):
                        fallback_schedule_rows.append(
                            (schedule_row[date_index], schedule_row[price_index])
                        )
                break
            if any(
                re.fullmatch(r"cap(?:itulo)?s?\.?", _normalize_label(cell))
                for row in logical_rows
                for cell in row
            ):
                chapter_table_found = True
            continue
        volume_table_found = True
        publication_name, publication_heading_node = _publication_heading(table)
        publication = _publication_metadata(
            title, publication_name, publication_heading_node, table
        )
        table_volumes_by_section: dict[str, list[dict[str, Any]]] = {}
        current_section_name = ""
        box_volumes: list[dict[str, Any]] = []
        special_item_volumes: list[dict[str, Any]] = []
        table_section_labels: list[str] = []
        table_source_notes: list[str] = []
        table_skipped = 0
        table_duplicates = 0
        table_conflicts: set[int] = set()
        inferred_brazilian_numbers: dict[tuple[str | None, str | None], int] = {}

        for row_index, cells in enumerate(
            logical_rows[header_row_index + 1 :], start=header_row_index + 1
        ):
            if len(cells) <= max(column_indexes.values()):
                table_skipped += 1
                continue

            num_text = cells[column_indexes["volume"]]
            normalized_num_text = _normalize_label(num_text)
            box_description = next(
                (
                    cell
                    for cell in cells
                    if re.search(
                        r"\b(?:box|caixa|kit|conjunto|pack)\b", _normalize_label(cell)
                    )
                ),
                None,
            )
            row_date_text = (
                cells[column_indexes["date"]] if "date" in column_indexes else ""
            )
            row_price_text = (
                cells[column_indexes["price"]] if "price" in column_indexes else ""
            )
            publication_is_box = publication["format_type"] == "box_set"
            hash_is_box_volume = publication_is_box and normalized_num_text == "#"
            inline_box = (
                box_description is not None
                and not re.search(r"\d", num_text)
                and (
                    parse_brazilian_date(row_date_text)[2] is not None
                    or parse_price_brl(row_price_text) is not None
                )
                and not hash_is_box_volume
            )
            if inline_box:
                box_name = box_description.strip(" \t-–—|:") or "Box"
                date_val, precision, year, month, day = parse_brazilian_date(
                    row_date_text
                )
                box_volumes.append(
                    {
                        "number": 1,
                        "title": box_name,
                        "release_date": date_val,
                        "release_date_precision": precision,
                        "release_year": year,
                        "release_month": month,
                        "release_day": day,
                        "release_status": _release_status(year, month, day),
                        "price_amount": parse_price_brl(row_price_text),
                        "cover_url": covers[0] if covers else None,
                        "variants": [],
                    }
                )
                continue

            if re.fullmatch(r"box(?:\s*(?:set|#?\d+))?", normalized_num_text):
                br_date_text = (
                    cells[column_indexes["date"]] if "date" in column_indexes else ""
                )
                date_val, precision, year, month, day = parse_brazilian_date(
                    br_date_text
                )
                price_text = (
                    cells[column_indexes["price"]] if "price" in column_indexes else ""
                )
                box_number_match = re.search(r"\d+", num_text)
                box_number = int(box_number_match.group()) if box_number_match else 1
                box_volumes.append(
                    {
                        "number": box_number,
                        "title": num_text or "Box",
                        "release_date": date_val,
                        "release_date_precision": precision,
                        "release_year": year,
                        "release_month": month,
                        "release_day": day,
                        "release_status": _release_status(year, month, day),
                        "price_amount": parse_price_brl(price_text),
                        "cover_url": covers[0] if covers else None,
                        "variants": [],
                    }
                )
                continue

            section_label = _table_section_label(cells)
            if section_label:
                if section_label.casefold() not in {
                    label.casefold() for label in table_section_labels
                }:
                    table_section_labels.append(section_label)
                if re.search(r"\bparte\s+\d+\b", _normalize_label(section_label)):
                    current_section_name = section_label
                continue

            part_heading = next(
                (
                    cell.strip()
                    for cell in cells
                    if re.search(
                        r"\bpart(?:e)?\s+\d+\s*[:/–—-]", _normalize_label(cell)
                    )
                ),
                None,
            )
            if (
                part_heading
                and not re.search(r"#\s*\d+", num_text)
                and not _is_release_date(row_date_text)
                and parse_price_brl(row_price_text) is None
            ):
                if part_heading.casefold() not in {
                    label.casefold() for label in table_section_labels
                }:
                    table_section_labels.append(part_heading)
                current_section_name = part_heading
                continue

            if "amostra" in normalized_num_text:
                note = "Registro não volumétrico: " + " | ".join(
                    value for value in cells if value.strip()
                )
                table_source_notes.append(note)
                continue

            if re.fullmatch(r"etc[.…]*", normalized_num_text):
                table_source_notes.append(
                    "Marcador de continuação sem dados de volume: "
                    + " | ".join(value for value in cells if value.strip())
                )
                continue

            if normalized_num_text in {"comp.", "capitulo especial"} and (
                parse_brazilian_date(row_date_text)[2] is not None
                or parse_price_brl(row_price_text) is not None
            ):
                special_item_volumes.append(
                    {
                        "number": len(special_item_volumes) + 1,
                        "title": num_text.strip(),
                        "release_date": parse_brazilian_date(row_date_text)[0],
                        "release_date_precision": parse_brazilian_date(row_date_text)[
                            1
                        ],
                        "release_year": parse_brazilian_date(row_date_text)[2],
                        "release_month": parse_brazilian_date(row_date_text)[3],
                        "release_day": parse_brazilian_date(row_date_text)[4],
                        "release_status": _release_status(
                            *parse_brazilian_date(row_date_text)[2:]
                        ),
                        "price_amount": parse_price_brl(row_price_text),
                        "cover_url": covers[0] if covers else None,
                        "variants": [],
                    }
                )
                table_source_notes.append(
                    "Item especial da fonte preservado em publicação própria: "
                    + num_text.strip()
                )
                continue

            br_date_text = (
                cells[column_indexes["date"]] if "date" in column_indexes else ""
            )
            date_val, precision, year, month, day = parse_brazilian_date(br_date_text)
            has_brazilian_release_date = (
                precision in {"day", "month", "year"} and year is not None
            )
            price_text = (
                cells[column_indexes["price"]] if "price" in column_indexes else ""
            )
            price_decimal = parse_price_brl(price_text)
            source_volume_numbers = _volume_number_tokens(num_text)
            explicit_brazilian_number = _brazilian_volume_number(br_date_text)
            if explicit_brazilian_number:
                vol_num = explicit_brazilian_number
            elif len(source_volume_numbers) > 1:
                if not has_brazilian_release_date and price_decimal is None:
                    table_source_notes.append(
                        "Linha sem publicação brasileira ainda associada a volume: "
                        + " | ".join(value for value in cells if value.strip())
                    )
                    continue
                group_key = (date_val, str(price_decimal) if price_decimal else None)
                if group_key not in inferred_brazilian_numbers:
                    inferred_brazilian_numbers[group_key] = (
                        len(inferred_brazilian_numbers) + 1
                    )
                vol_num = inferred_brazilian_numbers[group_key]
            elif source_volume_numbers:
                vol_num = source_volume_numbers[0]
            elif num_match := re.search(r"\d+", num_text):
                vol_num = int(num_match.group())
            elif (
                hash_is_box_volume
                or (explicitly_single_volume and normalized_num_text == "#")
                or re.search(r"unico|one[- ]?shot", _normalize_label(num_text))
            ):
                vol_num = 1
            else:
                table_skipped += 1
                continue

            if (
                not has_brazilian_release_date
                and price_decimal is None
                and ("date" in column_indexes or "price" in column_indexes)
            ):
                table_source_notes.append(
                    "Linha sem data ou preço brasileiro: "
                    + " | ".join(value for value in cells if value.strip())
                )
                continue
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
            date_label = _date_cell_label(br_date_text)
            if date_label:
                variant_labels.append(date_label)
            for index, cell in enumerate(cells):
                if index in column_indexes.values():
                    continue
                if index < len(row_headers) and any(
                    token in row_headers[index]
                    for token in ("compre", "loja", "link", "buy", "amazon")
                ):
                    continue
                candidate = cell.strip(" \t-–—|:")
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
                "title": (
                    publication.get("format_label") or "Box"
                    if publication_is_box
                    else f"Volume {vol_num}"
                ),
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
            table_volumes = table_volumes_by_section.setdefault(
                current_section_name, []
            )
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
                    is_later_digital_release = (
                        publication["format_type"] == "digital_edition"
                        and prior_volume.get("release_date")
                        and date_val
                        and prior_volume.get("release_date") != date_val
                        and prior_volume.get("price_amount") is not None
                        and price_decimal is not None
                    )
                    if is_later_digital_release:
                        variant = {
                            **volume,
                            "name": f"Reedição digital de {date_val}",
                        }
                        for key in ("number", "title", "variants"):
                            variant.pop(key)
                        prior_volume["variants"].append(variant)
                    else:
                        table_conflicts.add(vol_num)
                        variant = {
                            **volume,
                            "name": f"Variação não identificada (linha {row_index + 1})",
                        }
                        for key in ("number", "title", "variants"):
                            variant.pop(key)
                        prior_volume["variants"].append(variant)
                continue
            table_volumes.append(volume)

        volume_rows_skipped += table_skipped
        duplicate_volume_rows += table_duplicates
        conflicting_volume_numbers.update(table_conflicts)
        table_volumes = [
            volume
            for section_volumes in table_volumes_by_section.values()
            for volume in section_volumes
        ]
        if table_section_labels or table_source_notes:
            section_evidence = "; ".join(
                part
                for part in (
                    "Seções da tabela: " + "; ".join(table_section_labels)
                    if table_section_labels
                    else None,
                    "; ".join(table_source_notes) if table_source_notes else None,
                )
                if part
            )
            publication["format_evidence"] = " | ".join(
                value
                for value in (publication.get("format_evidence"), section_evidence)
                if value
            )
        if table_volumes:
            for section_name, section_volumes in table_volumes_by_section.items():
                section_publication = {**publication, "volumes": section_volumes}
                if section_name:
                    section_key = (
                        re.sub(
                            r"[^a-z0-9]+", "_", _normalize_label(section_name)
                        ).strip("_")
                        or "parte"
                    )
                    section_publication["source_key"] = (
                        f"{publication['source_key']}_{section_key}"
                    )
                    section_publication["name"] = section_name
                    section_publication["format_evidence"] = " | ".join(
                        value
                        for value in (
                            publication.get("format_evidence"),
                            f"Seção editorial da fonte: {section_name}",
                        )
                        if value
                    )
                existing_publication = next(
                    (
                        candidate
                        for candidate in publications
                        if candidate["source_key"] == section_publication["source_key"]
                    ),
                    None,
                )
                if existing_publication:
                    _merge_publication_table(
                        existing_publication, section_publication, table_index
                    )
                else:
                    publications.append(section_publication)
            if not volumes:
                volumes = table_volumes
        if box_volumes:
            boxes_by_name: dict[str, list[dict[str, Any]]] = {}
            for box_volume in box_volumes:
                box_name = box_volume["title"] or "Box"
                boxes_by_name.setdefault(box_name, []).append(box_volume)
            for box_name, grouped_volumes in boxes_by_name.items():
                box_key = (
                    re.sub(r"[^a-z0-9]+", "_", _normalize_label(box_name)).strip("_")
                    or "box"
                )
                normalized_box_name = _normalize_label(box_name)
                if re.search(r"\bkit\b", normalized_box_name):
                    box_label = "Kit"
                elif re.search(r"\bconjunto\b", normalized_box_name):
                    box_label = "Conjunto"
                elif re.search(r"\bpack\b", normalized_box_name):
                    box_label = "Pack"
                else:
                    box_label = "Box"
                box_publication = {
                    **publication,
                    "source_key": f"{publication['source_key']}_{box_key}",
                    "name": box_name,
                    "format_type": "box_set",
                    "format_label": box_label,
                    "format_details": None,
                    "volumes_per_book": None,
                    "format_evidence": "Conjunto identificado na tabela da fonte",
                    "volumes": grouped_volumes,
                }
                publications.append(box_publication)
                if not volumes:
                    volumes = grouped_volumes
        if special_item_volumes:
            for special in special_item_volumes:
                special_name = special["title"]
                special_key = (
                    re.sub(r"[^a-z0-9]+", "_", _normalize_label(special_name)).strip(
                        "_"
                    )
                    or "item_especial"
                )
                publications.append(
                    {
                        **publication,
                        "source_key": f"{publication['source_key']}_{special_key}",
                        "name": special_name,
                        "format_type": "unknown",
                        "format_label": None,
                        "format_details": None,
                        "volumes_per_book": None,
                        "format_evidence": f"Item especial da fonte: {special_name}",
                        "volumes": [special],
                    }
                )
                if not volumes:
                    volumes = [special]

    if not publications and declared_brazilian_volume_count:
        count = declared_brazilian_volume_count
        schedule_data = [
            (parse_brazilian_date(date_text), parse_price_brl(price_text))
            for date_text, price_text in fallback_schedule_rows
            if _is_release_date(date_text) or parse_price_brl(price_text) is not None
        ]
        fallback_volumes: list[dict[str, Any]] = []
        for index in range(count):
            if len(schedule_data) == count:
                (release_date, precision, year, month, day), price = schedule_data[
                    index
                ]
            elif count == 1 and schedule_data:
                (release_date, precision, year, month, day), price = schedule_data[0]
            elif count == 1 and page_release[2] is not None:
                release_date, precision, year, month, day = page_release
                price = page_price
            else:
                release_date = None
                precision = "unknown"
                year = month = day = None
                price = page_price
            fallback_volumes.append(
                {
                    "number": index + 1,
                    "title": f"Volume {index + 1}",
                    "release_date": release_date,
                    "release_date_precision": precision,
                    "release_year": year,
                    "release_month": month,
                    "release_day": day,
                    "release_status": _release_status(year, month, day),
                    "price_amount": price,
                    "cover_url": covers[index]
                    if len(covers) > index
                    else (covers[0] if covers else None),
                    "variants": [],
                }
            )
        is_magazine = "formato de revista" in normalized_page_text
        evidence = f"Quantidade de volumes no Brasil informada pela fonte: {count}"
        if page_price is not None and not schedule_data:
            evidence += (
                " | Preço geral da ficha aplicado aos volumes sem preço individual"
            )
        publication = {
            "source_key": "edicao_brasileira",
            "name": "Edição Brasileira",
            "format_type": "other" if is_magazine else "unknown",
            "format_label": "Revista" if is_magazine else None,
            "format_details": None,
            "volumes_per_book": None,
            "format_evidence": evidence,
            "volumes": fallback_volumes,
        }
        publications.append(publication)
        volumes = fallback_volumes
        volume_table_found = True

    if publications:
        volumes = [
            volume for publication in publications for volume in publication["volumes"]
        ]

    return {
        "title": title,
        "original_title": original_title,
        "author": author,
        "publisher": publisher_name,
        "cover_url": covers[0] if covers else None,
        "volumes": volumes,
        "publications": publications,
        "volume_table_found": volume_table_found,
        "chapter_table_found": chapter_table_found,
        "catalog_index_page": is_catalog_index,
        "volume_rows_skipped": volume_rows_skipped,
        "duplicate_volume_rows": duplicate_volume_rows,
        "conflicting_volume_numbers": sorted(conflicting_volume_numbers),
        "volume_parse_complete": (
            volume_table_found
            and bool(volumes)
            and volume_rows_skipped == 0
            and not conflicting_volume_numbers
        )
        or (chapter_table_found and not volume_table_found)
        or (
            is_catalog_index
            and not volume_table_found
            and not declared_brazilian_volume_count
        ),
    }

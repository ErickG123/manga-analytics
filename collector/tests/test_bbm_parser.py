from decimal import Decimal
from pathlib import Path

from collector.src.normalizers.data_normalizer import (
    parse_brazilian_date,
    parse_price_brl,
)
from collector.src.parsers.bbm_parser import parse_bbm_page


def test_parse_price_brl():
    assert parse_price_brl("R$ 39,90") == Decimal("39.90")
    assert parse_price_brl("Preço de capa: R$ 124,50") == Decimal("124.50")
    assert parse_price_brl("—") is None
    assert parse_price_brl("") is None


def test_parse_brazilian_date_formats():
    val, prec, y, m, d = parse_brazilian_date("15/04/2026")
    assert val == "15/04/2026"
    assert prec == "day"
    assert (y, m, d) == (2026, 4, 15)

    val_m, prec_m, y_m, m_m, d_m = parse_brazilian_date("maio de 2026")
    assert val_m == "05/2026"
    assert prec_m == "month"
    assert (y_m, m_m, d_m) == (2026, 5, None)

    val_y, prec_y, y_y, m_y, d_y = parse_brazilian_date("2027")
    assert val_y == "2027"
    assert prec_y == "year"
    assert (y_y, m_y, d_y) == (2027, None, None)


def test_parse_bbm_page_fixture():
    fixture_path = Path(__file__).parent / "fixtures" / "sample_bbm_page.html"
    html = fixture_path.read_text(encoding="utf-8")
    data = parse_bbm_page(html, "One Piece Aventura Escolar")

    assert data["title"] == "One Piece Aventura Escolar"
    assert data["author"] == "Souhei Kouji"
    assert data["publisher"] == "Panini"
    assert len(data["volumes"]) == 3
    assert data["volumes"][0]["price_amount"] == Decimal("39.90")
    assert data["volumes"][0]["release_date"] == "15/04/2026"
    assert data["volumes"][1]["release_date_precision"] == "month"
    assert data["volumes"][2]["release_status"] == "unknown"
    assert data["volume_parse_complete"] is True


def test_parse_bbm_table_with_data_cells_as_headers():
    html = """<table><tr><td>Vol.</td><td>Japão</td><td>Brasil</td><td>Preço</td></tr>
    <tr><td># 01</td><td>02/02/2020</td><td>05/08/2027</td><td>R$ 42,90</td></tr></table>"""
    parsed = parse_bbm_page(html, "Obra de teste")
    volume = parsed["volumes"][0]
    assert volume["number"] == 1
    assert volume["release_date"] == "05/08/2027"
    assert volume["release_status"] == "planned"
    assert volume["price_amount"] == Decimal("42.90")


def test_parser_does_not_assume_panini_for_unknown_publisher():
    parsed = parse_bbm_page("<p>Editora: Devir</p>", "Obra de teste")
    assert parsed["publisher"] == "Devir"

    parsed_without_publisher = parse_bbm_page(
        "<p>Sem editora informada</p>", "Outra obra"
    )
    assert parsed_without_publisher["publisher"] == "Não informada"
    assert parsed_without_publisher["volume_parse_complete"] is False


def test_parser_deduplicates_identical_volume_rows():
    html = """<table><tr><th>Volume</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>15</td><td>02/12/2023</td><td>R$ 36,90</td></tr>
    <tr><td>15</td><td>02/12/2023</td><td>R$ 36,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra de teste")

    assert len(parsed["volumes"]) == 1
    assert parsed["duplicate_volume_rows"] == 1
    assert parsed["conflicting_volume_numbers"] == []
    assert parsed["volume_parse_complete"] is True


def test_parser_marks_conflicting_duplicate_volume_rows_incomplete():
    html = """<table><tr><th>Volume</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>27</td><td>15/01/2025</td><td>R$ 40,90</td></tr>
    <tr><td>27</td><td>18/01/2025</td><td>R$ 49,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra de teste")

    assert len(parsed["volumes"]) == 1
    assert parsed["conflicting_volume_numbers"] == [27]
    assert parsed["volume_parse_complete"] is False


def test_parser_attaches_special_editions_as_variants_of_the_same_volume():
    html = """<table>
    <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th><th>Compre em</th></tr>
    <tr><td>#15</td><td>17/08/2021</td><td>02/12/2023</td><td>R$ 36,90</td><td>Amazon</td></tr>
    <tr><td>#15</td><td>– capa variante –</td><td>02/12/2023</td><td>R$ 36,90</td><td>Amazon</td></tr>
    <tr><td>#27</td><td>15/12/2023</td><td>15/01/2025</td><td>R$ 40,90</td><td>Panini</td></tr>
    <tr><td>#27</td><td>– Blind Pack –</td><td>18/01/2025</td><td>R$ 49,90</td><td>Panini</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "Blue Lock")

    assert parsed["volume_parse_complete"] is True
    assert parsed["conflicting_volume_numbers"] == []
    assert len(parsed["volumes"]) == 2
    volume_15, volume_27 = parsed["volumes"]
    assert volume_15["release_date"] == "02/12/2023"
    assert volume_15["price_amount"] == Decimal("36.90")
    assert volume_15["variants"][0]["name"] == "capa variante"
    assert volume_15["variants"][0]["release_date"] == "02/12/2023"
    assert volume_27["price_amount"] == Decimal("40.90")
    assert volume_27["variants"][0]["name"] == "Blind Pack"
    assert volume_27["variants"][0]["release_date"] == "18/01/2025"
    assert volume_27["variants"][0]["price_amount"] == Decimal("49.90")

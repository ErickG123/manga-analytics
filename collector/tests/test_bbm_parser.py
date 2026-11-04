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
    assert data["volumes"][2]["release_status"] == "planned"

from decimal import Decimal

from collector.src.normalizers.quality_validator import (
    validate_isbn,
    validate_price,
    validate_release_date,
)


def test_validate_isbn_10_valid():
    # 0-306-40615-2 é um ISBN-10 válido
    is_valid, _ = validate_isbn("0-306-40615-2")
    assert is_valid is True


def test_validate_isbn_10_with_x():
    # 0-8044-2957-X é um ISBN-10 válido com dígito X
    is_valid, _ = validate_isbn("0-8044-2957-X")
    assert is_valid is True


def test_validate_isbn_10_invalid_check_digit():
    is_valid, reason = validate_isbn("0-306-40615-5")
    assert is_valid is False
    assert "não confere" in reason


def test_validate_isbn_13_valid():
    # 978-85-426-0000-1 ou 978-0-306-40615-7
    is_valid, _ = validate_isbn("978-0-306-40615-7")
    assert is_valid is True


def test_validate_isbn_13_invalid():
    is_valid, reason = validate_isbn("978-0-306-40615-9")
    assert is_valid is False
    assert "inválido" in reason


def test_validate_price():
    assert validate_price(Decimal("29.90"))[0] is True
    assert validate_price(Decimal("0.00"))[0] is False
    assert validate_price(Decimal("-10.50"))[0] is False
    assert validate_price(None)[0] is False


def test_validate_release_date():
    day_res = validate_release_date("15/07/2023")
    assert day_res["valid"] is True
    assert day_res["precision"] == "day"

    month_res = validate_release_date("08/2026")
    assert month_res["valid"] is True
    assert month_res["precision"] == "month"

    year_res = validate_release_date("2024")
    assert year_res["valid"] is True
    assert year_res["precision"] == "year"

    invalid_res = validate_release_date("data-estranha")
    assert invalid_res["valid"] is False
    assert invalid_res["precision"] == "unknown"

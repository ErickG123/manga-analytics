"""Módulo de validação de regras de qualidade e rastreabilidade de dados."""

from decimal import Decimal
import re
from typing import Any


def validate_isbn(isbn: str | None) -> tuple[bool, str]:
    """Valida códigos ISBN-10 e ISBN-13 incluindo dígitos verificadores.

    Retorna (is_valid, reason).
    """
    if not isbn:
        return False, "ISBN ausente"

    # Remove hífens e espaços
    cleaned = re.sub(r"[-\s]", "", isbn).upper()

    if len(cleaned) == 10:
        # Validação ISBN-10
        total = 0
        for i in range(9):
            if not cleaned[i].isdigit():
                return False, "Caractere inválido no corpo do ISBN-10"
            total += int(cleaned[i]) * (10 - i)

        check_digit = cleaned[9]
        if check_digit == "X":
            total += 10
        elif check_digit.isdigit():
            total += int(check_digit)
        else:
            return False, "Dígito verificador inválido no ISBN-10"

        if total % 11 == 0:
            return True, "ISBN-10 válido"
        return False, "Dígito verificador do ISBN-10 não confere"

    elif len(cleaned) == 13:
        # Validação ISBN-13
        if not cleaned.isdigit():
            return False, "ISBN-13 deve conter apenas dígitos"

        total = 0
        for i in range(12):
            multiplier = 1 if i % 2 == 0 else 3
            total += int(cleaned[i]) * multiplier

        calculated_check = (10 - (total % 10)) % 10
        if int(cleaned[12]) == calculated_check:
            return True, "ISBN-13 válido"
        return False, f"Dígito verificador do ISBN-13 inválido (esperado {calculated_check})"

    return False, f"Tamanho inválido para ISBN: {len(cleaned)} caracteres"


def validate_price(price: Decimal | None) -> tuple[bool, str]:
    """Valida se o valor de preço é consistente e positivo."""
    if price is None:
        return False, "Preço ausente"
    if price <= 0:
        return False, "Preço deve ser estritamente maior que zero"
    if price > 2000:
        return False, "Preço excede o limite razoável para mercado nacional"
    return True, "Preço válido"


def validate_release_date(raw_date: str | None) -> dict[str, Any]:
    """Analisa e valida datas de lançamento, distinguindo completas, parciais e inválidas."""
    if not raw_date:
        return {"valid": False, "precision": "unknown", "reason": "Data ausente"}

    raw = raw_date.strip()

    # Formato DD/MM/YYYY
    if re.match(r"^\d{2}/\d{2}/\d{4}$", raw):
        return {"valid": True, "precision": "day", "reason": "Data completa"}

    # Formato MM/YYYY
    if re.match(r"^\d{2}/\d{4}$", raw):
        return {"valid": True, "precision": "month", "reason": "Data parcial (mensal)"}

    # Formato YYYY
    if re.match(r"^\d{4}$", raw):
        return {"valid": True, "precision": "year", "reason": "Data parcial (anual)"}

    return {"valid": False, "precision": "unknown", "reason": "Formato de data inválido"}

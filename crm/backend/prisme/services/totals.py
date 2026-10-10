"""Line items and VAT totals for quotes and invoices (règles de calcul françaises).

A line is a dict: {id, type: "item"|"section"|"text", product_id, description,
details, quantity, unit, unit_price, vat_rate, discount (%)}. Amounts are HT.
VAT is computed per rate on the discounted bases, rounded to the cent.
"""

from __future__ import annotations

import secrets
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

FRENCH_VAT_RATES = [20.0, 10.0, 8.5, 5.5, 2.1, 0.0]
FRANCHISE_MENTION = "TVA non applicable, art. 293 B du CGI"

VAT_EXEMPTION_MENTIONS = {
    "franchise": FRANCHISE_MENTION,
    "reverse_charge_services": "Autoliquidation — TVA due par le preneur (art. 283-2 du CGI et art. 196 de la directive 2006/112/CE)",
    "intra_eu_goods": "Exonération de TVA, art. 262 ter I du CGI (livraison intracommunautaire)",
    "export": "Exonération de TVA, art. 262 I du CGI (exportation)",
}


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def normalize_line(raw: dict[str, Any], *, franchise: bool = False, default_vat: float = 20.0) -> dict[str, Any]:
    kind = raw.get("type") or "item"
    line: dict[str, Any] = {
        "id": raw.get("id") or secrets.token_hex(4),
        "type": kind,
        "description": (raw.get("description") or "").strip(),
        "details": raw.get("details") or None,
    }
    if kind != "item":
        return line
    quantity = float(raw.get("quantity") if raw.get("quantity") not in (None, "") else 1)
    unit_price = float(raw.get("unit_price") or 0)
    discount = float(raw.get("discount") or 0)
    vat_rate = 0.0 if franchise else float(raw.get("vat_rate") if raw.get("vat_rate") not in (None, "") else default_vat)
    total = money(Decimal(str(quantity)) * Decimal(str(unit_price)) * (Decimal(1) - Decimal(str(discount)) / 100))
    line.update(
        product_id=raw.get("product_id"),
        quantity=quantity,
        unit=raw.get("unit") or "unité",
        unit_price=unit_price,
        discount=discount,
        vat_rate=vat_rate,
        total=float(total),
    )
    return line


def compute(lines: list[dict[str, Any]], discount: float = 0, *, franchise: bool = False, default_vat: float = 20.0) -> dict[str, Any]:
    normalized = [normalize_line(line, franchise=franchise, default_vat=default_vat) for line in (lines or [])]
    factor = Decimal(1) - Decimal(str(discount or 0)) / 100
    bases: dict[float, Decimal] = {}
    for line in normalized:
        if line["type"] != "item":
            continue
        bases.setdefault(line["vat_rate"], Decimal(0))
        bases[line["vat_rate"]] += Decimal(str(line["total"]))
    breakdown = []
    subtotal = Decimal(0)
    tax_total = Decimal(0)
    lines_total = sum((Decimal(str(line["total"])) for line in normalized if line["type"] == "item"), Decimal(0))
    for rate in sorted(bases, reverse=True):
        base = money(bases[rate] * factor)
        vat = money(base * Decimal(str(rate)) / 100)
        breakdown.append({"rate": rate, "base": float(base), "amount": float(vat)})
        subtotal += base
        tax_total += vat
    return {
        "lines": normalized,
        "lines_total": float(money(lines_total)),
        "discount_amount": float(money(lines_total - subtotal)),
        "subtotal": float(money(subtotal)),
        "tax_total": float(money(tax_total)),
        "total": float(money(subtotal + tax_total)),
        "vat_breakdown": breakdown,
    }

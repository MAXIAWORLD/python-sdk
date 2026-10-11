"""Facturation électronique : Factur-X (PDF/A-3 + XML CII, profil EN 16931).

Depuis le 1er septembre 2026 toutes les entreprises doivent pouvoir recevoir
des factures électroniques, et l'émission devient obligatoire pour les PME au
1er septembre 2027. Prisme produit des factures Factur-X prêtes à être
déposées sur votre Plateforme Agréée (PA).
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from ..models import Invoice
from .invoicing import vat_exemption
from .pdf import render_invoice
from .settings import get_section
from .totals import compute

log = logging.getLogger("prisme.einvoice")

UNIT_CODES = {
    "heure": "HUR", "h": "HUR", "jour": "DAY", "j": "DAY", "mois": "MON", "an": "ANN", "année": "ANN",
    "forfait": "LS", "unité": "C62", "u": "C62", "pièce": "H87", "licence": "C62", "utilisateur": "C62",
    "semaine": "WEE", "km": "KMT", "kg": "KGM", "m2": "MTK", "m²": "MTK",
}
NATURE_PROCESS = {"goods": "B1", "services": "S1", "mixed": "M1"}


def _unit(value: str | None) -> str:
    return UNIT_CODES.get((value or "unité").strip().lower(), "C62")


def _party(snapshot: dict[str, Any], *, seller: bool) -> dict[str, Any]:
    party: dict[str, Any] = {
        "name": snapshot.get("name") or "",
        "country_code": snapshot.get("country_code") or "FR",
    }
    if snapshot.get("address"):
        party["addr_l1"] = snapshot["address"]
    if snapshot.get("city"):
        party["city"] = snapshot["city"]
    if snapshot.get("zip"):
        party["postcode"] = snapshot["zip"]
    siren = (snapshot.get("siren") or "").replace(" ", "")
    if siren:
        party["legal_identifier"] = siren
        party["legal_identifier_schemeid"] = "0002"
        # Adresse électronique de facturation : SIREN dans l'annuaire (schéma 0225)
        party["einvoicing_addr"] = snapshot.get("einvoicing_address") or siren
        party["einvoicing_addr_schemeid"] = "0225"
    elif snapshot.get("email"):
        party["einvoicing_addr"] = snapshot["email"]
        party["einvoicing_addr_schemeid"] = "EM"
    if snapshot.get("vat_number"):
        party["vat_identifier"] = snapshot["vat_number"]
    if seller and snapshot.get("trade_name") and snapshot.get("trade_name") != snapshot.get("name"):
        party["biz_name"] = snapshot["trade_name"]
    if seller and snapshot.get("legal_form"):
        info = snapshot["legal_form"]
        if snapshot.get("capital"):
            info += f" au capital de {snapshot['capital']} €"
        if snapshot.get("rcs_city"):
            info += f" — RCS {snapshot['rcs_city']}"
        party["legal_info"] = info
    return party


def _vat_category(rate: float, seller: dict[str, Any], buyer: dict[str, Any], nature: str | None) -> tuple[str, str | None, str | None]:
    """Return (UNTDID 5305 category, exemption reason, exemption reason code)."""
    if rate > 0 and seller.get("vat_regime") != "franchise":
        return "S", None, None
    return vat_exemption(seller, buyer, nature) or ("Z", None, None)


def build_data_dict(session: Any, invoice: Any) -> dict[str, Any]:
    seller = invoice.seller or {}
    buyer = invoice.buyer or {}
    sign = -1 if invoice.kind == "credit_note" else 1  # CII credit notes carry positive amounts
    result = compute(invoice.lines or [], invoice.discount or 0, franchise=(seller.get("vat_regime") == "franchise"))
    type_code = "381" if invoice.kind == "credit_note" else ("386" if invoice.kind == "deposit" else "380")

    lines = []
    factor = 1 - (invoice.discount or 0) / 100
    for idx, line in enumerate([ln for ln in result["lines"] if (ln.get("type") or "item") == "item"], start=1):
        category, _, _ = _vat_category(line["vat_rate"], seller, buyer, invoice.nature)
        qty = line["quantity"] * sign
        net = line["total"] * sign
        unit_net_price = round(line["unit_price"] * (1 - (line.get("discount") or 0) / 100), 6)
        entry: dict[str, Any] = {
            "BT-126": str(idx),
            "BT-129": qty,
            "BT-130": _unit(line.get("unit")),
            "BT-131": net,
            "BT-146": unit_net_price,
            "BT-151": category,
            "BT-152": line["vat_rate"],
            "BT-153": (line.get("description") or "Ligne")[:200],
        }
        if line.get("details"):
            entry["BT-154"] = str(line["details"])[:1000]
        lines.append(entry)

    breakdown = []
    for b in result["vat_breakdown"]:
        category, reason, reason_code = _vat_category(b["rate"], seller, buyer, invoice.nature)
        item: dict[str, Any] = {
            "BT-116": b["base"] * sign,
            "BT-117": b["amount"] * sign,
            "BT-118": category,
            "BT-119": b["rate"],
        }
        if reason:
            item["BT-120"] = reason
            item["BT-121"] = reason_code
        breakdown.append(item)

    allowances = []
    if invoice.discount and result["discount_amount"]:
        lines_by_rate: dict[float, float] = {}
        for ln in result["lines"]:
            if (ln.get("type") or "item") == "item":
                lines_by_rate[ln["vat_rate"]] = lines_by_rate.get(ln["vat_rate"], 0) + ln["total"]
        for rate, base in lines_by_rate.items():
            category, _, _ = _vat_category(rate, seller, buyer, invoice.nature)
            allowances.append(
                {
                    "amount": round(base * (1 - factor), 2) * sign,
                    "base_amount": round(base, 2) * sign,
                    "rate": invoice.discount,
                    "reason": "Remise commerciale",
                    "vat_category_code": category,
                    "vat_rate": rate,
                }
            )

    notes = []
    if invoice.kind != "credit_note":
        notes.append({"BT-21": "PMT", "BT-22": f"Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : {invoice.recovery_fee or 40:.2f} €."})
        if invoice.late_penalty_rate:
            notes.append({"BT-21": "PMD", "BT-22": invoice.late_penalty_rate})
        if invoice.early_payment_discount:
            notes.append({"BT-21": "AAB", "BT-22": invoice.early_payment_discount})
    if invoice.vat_on_debits:
        notes.append({"BT-21": "TXD", "BT-22": "Option pour le paiement de la TVA d'après les débits."})
    if seller.get("legal_form"):
        legal = f"{seller.get('name')} — {seller.get('legal_form')}" + (f" au capital de {seller['capital']} €" if seller.get("capital") else "")
        if seller.get("rcs_city"):
            legal += f" — RCS {seller['rcs_city']} {seller.get('siren')}"
        notes.append({"BT-21": "ABL", "BT-22": legal})
    if invoice.notes:
        notes.append({"BT-22": invoice.notes[:1000]})

    data: dict[str, Any] = {
        "BT-1": invoice.number,
        "BT-2": invoice.issue_date,
        "BT-3": type_code,
        "BT-5": invoice.currency or "EUR",
        "BT-23": NATURE_PROCESS.get(invoice.nature or "services", "S1"),
        "BT-106": result["lines_total"] * sign,
        "BT-109": result["subtotal"] * sign,
        "BT-110": result["tax_total"] * sign,
        "BT-112": result["total"] * sign,
        "BT-115": round((result["total"] - (invoice.amount_paid or 0)) * sign, 2) if sign > 0 else result["total"] * sign,
        "BG-4": _party(seller, seller=True),
        "BG-7": _party(buyer, seller=False),
        "BG-23": breakdown,
        "BG-25": lines,
    }
    if invoice.amount_paid and sign > 0:
        data["BT-113"] = invoice.amount_paid
    if allowances:
        data["BG-20"] = allowances
        data["BT-107"] = round(sum(a["amount"] for a in allowances), 2)
    if invoice.due_date and invoice.kind != "credit_note":
        data["BT-9"] = invoice.due_date
    if invoice.payment_terms:
        data["BT-20"] = invoice.payment_terms[:250]
    if invoice.service_date and invoice.service_period_end:
        data["BT-73"] = invoice.service_date
        data["BT-74"] = invoice.service_period_end
    data["BT-72"] = invoice.service_period_end or invoice.service_date or invoice.issue_date
    if any(item["BT-118"] == "K" for item in breakdown):
        # Intra-community supply: the deliver-to country is mandatory (BR-IC-12).
        buyer_party = _party(buyer, seller=False)
        data["BG-13"] = {k: v for k, v in buyer_party.items() if k in ("name", "country_code", "addr_l1", "city", "postcode")}
    if notes:
        data["BG-1"] = notes
    if seller.get("iban") and invoice.kind != "credit_note":
        data["BT-81"] = "58"
        data["BT-84"] = seller["iban"].replace(" ", "")
        data["BT-83"] = invoice.number
        if seller.get("bic"):
            data["BT-86"] = seller["bic"].replace(" ", "")
    elif invoice.kind != "credit_note":
        data["BT-81"] = "30"
    if invoice.kind == "credit_note" and invoice.credit_for_id:
        original = session.get(Invoice, invoice.credit_for_id)
        if original is not None:
            data["BG-3"] = [{"BT-25": original.number, "BT-26": original.issue_date}]
    return data


def generate_xml(session: Any, invoice: Any, *, check: bool = True) -> bytes:
    import facturx

    profile = get_section(session, "einvoicing").get("profile") or "en16931"
    data = build_data_dict(session, invoice)
    xml = facturx.generate_xml(data, flavor="factur-x", level=profile, check_xsd=check, check_schematron=False)
    if isinstance(xml, str):
        xml = xml.encode("utf-8")
    return xml


def generate_facturx_pdf(session: Any, invoice: Any) -> bytes:
    """PDF/A-3 with the CII XML embedded (factur-x.xml). Falls back to plain PDF on error."""
    pdf_bytes = render_invoice(session, invoice)
    if not invoice.locked:
        return pdf_bytes
    try:
        import facturx

        xml = generate_xml(session, invoice)
        seller = invoice.seller or {}
        metadata = {
            "author": seller.get("name") or "Prisme",
            "keywords": "Factur-X, facture",
            "title": f"{seller.get('name') or ''} : {'Avoir' if invoice.kind == 'credit_note' else 'Facture'} {invoice.number}",
            "subject": f"Facture {invoice.number} du {invoice.issue_date.isoformat() if isinstance(invoice.issue_date, date) else invoice.issue_date}",
        }
        return facturx.generate_from_binary(pdf_bytes, xml, flavor="factur-x", level="autodetect", check_xsd=True, pdf_metadata=metadata, lang="fr-FR")
    except Exception:  # noqa: BLE001 - never block the user from getting a PDF
        log.exception("Génération Factur-X impossible pour %s ; PDF simple renvoyé.", invoice.number)
        return pdf_bytes

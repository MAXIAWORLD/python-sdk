"""Quotes & invoices lifecycle, aligned with French invoicing rules.

- Brouillons sans numéro ; numéro définitif, continu et chronologique attribué à
  l'émission (série par préfixe et par année : FA-2026-00001, AV-2026-00001).
- Facture émise = inaltérable : aucune modification ni suppression, la
  correction se fait par avoir (facture rectificative) qui référence l'original.
- Identités vendeur / client figées à l'émission (mentions obligatoires).
- Chaînage SHA-256 des pièces émises pour prouver l'intégrité du registre.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..models import Activity, Company, Contact, Invoice, Payment, Quote, User, today, utcnow
from ..serialize import iso, jsonable
from . import audit, totals
from .events import emit
from .settings import get_section

_number_lock = threading.Lock()

COMMERCIAL_FORMS = {"SAS", "SASU", "SARL", "EURL", "SA", "SNC", "SCA", "SCS", "SELARL", "SELAS", "SELAFA", "SCOP"}
GENESIS_HASH = "0" * 64


# ---------------------------------------------------------------------------
# Numbering
# ---------------------------------------------------------------------------


def _next_counter(session: Session, key: str) -> int:
    from ..models import Setting

    row = session.get(Setting, "counters")
    counters = dict(row.value) if row and isinstance(row.value, dict) else {}
    value = int(counters.get(key, 0)) + 1
    counters[key] = value
    if row is None:
        row = Setting(key="counters", value=counters)
    else:
        row.value = counters
    session.add(row)
    return value


def next_quote_number(session: Session) -> str:
    billing = get_section(session, "billing")
    year = today().year
    with _number_lock:
        seq = _next_counter(session, f"quote:{year}")
    return f"{billing['quote_prefix']}-{year}-{seq:04d}"


def next_ticket_number(session: Session) -> str:
    with _number_lock:
        seq = _next_counter(session, "ticket")
    return f"TCK-{seq:05d}"


def _next_invoice_sequence(session: Session, prefix: str, year: int) -> int:
    pattern = f"{prefix}-{year}-%"
    current = session.exec(
        select(func.max(Invoice.sequence)).where(Invoice.number.like(pattern), Invoice.locked == True)  # noqa: E712
    ).one()
    return int(current or 0) + 1


# ---------------------------------------------------------------------------
# Identities (mentions obligatoires)
# ---------------------------------------------------------------------------


def seller_snapshot(session: Session) -> dict[str, Any]:
    c = get_section(session, "company")
    return {
        "name": c.get("legal_name") or c.get("name"),
        "trade_name": c.get("name"),
        "legal_form": c.get("legal_form"),
        "capital": c.get("capital"),
        "address": c.get("address"),
        "zip": c.get("zip"),
        "city": c.get("city"),
        "country": c.get("country") or "France",
        "country_code": c.get("country_code") or "FR",
        "siren": (c.get("siren") or "").replace(" ", ""),
        "siret": (c.get("siret") or "").replace(" ", ""),
        "rcs_city": c.get("rcs_city"),
        "rm": c.get("rm"),
        "ape": c.get("ape"),
        "vat_number": (c.get("vat_number") or "").replace(" ", ""),
        "email": c.get("email"),
        "phone": c.get("phone"),
        "website": c.get("website"),
        "iban": c.get("iban"),
        "bic": c.get("bic"),
        "bank_name": c.get("bank_name"),
        "vat_regime": c.get("vat_regime"),
        "mediator": c.get("mediator"),
        "insurance": c.get("insurance"),
        "einvoicing_address": c.get("einvoicing_address"),
        "logo_url": c.get("logo_url"),
    }


def buyer_snapshot(session: Session, company_id: int | None, contact_id: int | None) -> dict[str, Any]:
    company = session.get(Company, company_id) if company_id else None
    contact = session.get(Contact, contact_id) if contact_id else None
    if company is not None:
        return {
            "type": "company",
            "name": company.name,
            "legal_form": company.legal_form,
            "address": company.address,
            "zip": company.zip,
            "city": company.city,
            "country": company.country or "France",
            "country_code": country_code(company.country),
            "siren": (company.siren or (company.siret or "")[:9]).replace(" ", "") or None,
            "siret": (company.siret or "").replace(" ", "") or None,
            "vat_number": (company.vat_number or "").replace(" ", "") or None,
            "delivery_address": company.delivery_address,
            "is_public_entity": company.is_public_entity,
            "contact_name": contact.full_name if contact else None,
            "email": (contact.email if contact else None) or company.email,
        }
    if contact is not None:
        return {
            "type": "person",
            "name": contact.full_name,
            "address": contact.address,
            "zip": None,
            "city": contact.city,
            "country": contact.country or "France",
            "country_code": country_code(contact.country),
            "email": contact.email,
        }
    return {}


_COUNTRIES = {
    "france": "FR", "belgique": "BE", "belgium": "BE", "suisse": "CH", "switzerland": "CH", "luxembourg": "LU",
    "allemagne": "DE", "germany": "DE", "espagne": "ES", "spain": "ES", "italie": "IT", "italy": "IT",
    "royaume-uni": "GB", "united kingdom": "GB", "uk": "GB", "états-unis": "US", "etats-unis": "US", "usa": "US",
    "united states": "US", "canada": "CA", "pays-bas": "NL", "netherlands": "NL", "portugal": "PT", "irlande": "IE",
    "ireland": "IE", "singapour": "SG", "singapore": "SG", "émirats arabes unis": "AE", "dubai": "AE", "maroc": "MA",
}
EU_CODES = {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"}


def country_code(country: str | None) -> str:
    if not country:
        return "FR"
    value = country.strip()
    if len(value) == 2:
        return value.upper()
    return _COUNTRIES.get(value.lower(), "FR")


def siren_is_valid(siren: str | None) -> bool:
    digits = (siren or "").replace(" ", "")
    if len(digits) != 9 or not digits.isdigit():
        return False
    total = 0
    for i, ch in enumerate(digits):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def legal_checks(session: Session, invoice: Invoice) -> tuple[list[str], list[str]]:
    """Return (blocking errors, warnings) before an invoice can be issued."""
    errors: list[str] = []
    warnings: list[str] = []
    seller = seller_snapshot(session)
    if not seller["name"]:
        errors.append("Raison sociale de votre entreprise manquante (Paramètres › Entreprise).")
    if not (seller["address"] and seller["zip"] and seller["city"]):
        errors.append("Adresse complète de votre siège social manquante (Paramètres › Entreprise).")
    if not siren_is_valid(seller["siren"]):
        errors.append("Numéro SIREN de votre entreprise manquant ou invalide (Paramètres › Entreprise).")
    franchise = seller.get("vat_regime") == "franchise"
    if not franchise and not seller["vat_number"]:
        errors.append("Numéro de TVA intracommunautaire manquant (ou activez la franchise en base de TVA).")
    if (seller.get("legal_form") or "").upper() in COMMERCIAL_FORMS:
        if not seller.get("capital"):
            warnings.append("Montant du capital social non renseigné (mention obligatoire pour les sociétés).")
        if not seller.get("rcs_city"):
            warnings.append("Ville d'immatriculation au RCS non renseignée.")
    buyer = buyer_snapshot(session, invoice.company_id, invoice.contact_id)
    if not buyer.get("name"):
        errors.append("Client manquant : sélectionnez une entreprise ou un contact.")
    elif not (buyer.get("address") and buyer.get("city")):
        errors.append(f"Adresse de facturation du client « {buyer['name']} » incomplète.")
    if buyer.get("type") == "company":
        if buyer.get("country_code") == "FR" and not buyer.get("siren"):
            warnings.append("SIREN du client non renseigné (mention obligatoire avec la facturation électronique).")
        if buyer.get("country_code") in EU_CODES and buyer.get("country_code") != "FR" and not buyer.get("vat_number"):
            errors.append("Client établi dans l'UE : numéro de TVA intracommunautaire du client obligatoire.")
    items = [line for line in invoice.lines or [] if (line.get("type") or "item") == "item"]
    if not items:
        errors.append("La facture ne contient aucune ligne facturable.")
    if any(not (line.get("description") or "").strip() for line in items):
        errors.append("Chaque ligne doit avoir une désignation.")
    if invoice.kind == "credit_note" and not invoice.credit_for_id:
        errors.append("Un avoir doit référencer la facture d'origine.")
    if invoice.due_date and invoice.kind != "credit_note":
        delay = (invoice.due_date - today()).days
        if delay > 60:
            warnings.append("Délai de paiement supérieur à 60 jours (plafond légal art. L441-10 du Code de commerce).")
    return errors, warnings


# ---------------------------------------------------------------------------
# Integrity chain
# ---------------------------------------------------------------------------

HASHED_FIELDS = (
    "number", "kind", "issue_date", "due_date", "currency", "lines", "discount", "subtotal",
    "tax_total", "total", "seller", "buyer", "credit_for_id", "nature", "vat_mention",
)


def _canon(value: Any) -> Any:
    """Canonical form so that 0 and 0.0 (in memory vs. reloaded from the DB) hash identically."""
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return round(float(value), 6)
    if isinstance(value, dict):
        return {k: _canon(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_canon(v) for v in value]
    return value


def invoice_fingerprint(invoice: Invoice) -> str:
    payload = {name: _canon(jsonable(getattr(invoice, name))) for name in HASHED_FIELDS}
    payload["issued_at"] = iso(invoice.issued_at)
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def chain_hash(prev_hash: str, invoice: Invoice) -> str:
    return hashlib.sha256((prev_hash + invoice_fingerprint(invoice)).encode()).hexdigest()


def last_hash(session: Session) -> str:
    row = session.exec(
        select(Invoice).where(Invoice.locked == True, Invoice.hash.isnot(None)).order_by(Invoice.issued_at.desc(), Invoice.id.desc())  # noqa: E712
    ).first()
    return row.hash if row and row.hash else GENESIS_HASH


def verify_chain(session: Session) -> dict[str, Any]:
    rows = session.exec(
        select(Invoice).where(Invoice.locked == True).order_by(Invoice.issued_at.asc(), Invoice.id.asc())  # noqa: E712
    ).all()
    prev = GENESIS_HASH
    broken = []
    for inv in rows:
        expected = chain_hash(prev, inv)
        if inv.prev_hash != prev or inv.hash != expected:
            broken.append({"id": inv.id, "number": inv.number})
        prev = inv.hash or expected
    return {"ok": not broken, "count": len(rows), "broken": broken, "last_hash": prev, "checked_at": iso(utcnow())}


# ---------------------------------------------------------------------------
# Totals & defaults
# ---------------------------------------------------------------------------


def apply_totals(session: Session, doc: Quote | Invoice) -> None:
    company = get_section(session, "company")
    billing = get_section(session, "billing")
    franchise = company.get("vat_regime") == "franchise"
    result = totals.compute(doc.lines or [], doc.discount or 0, franchise=franchise, default_vat=billing["default_vat"])
    doc.lines = result["lines"]
    doc.subtotal = result["subtotal"]
    doc.tax_total = result["tax_total"]
    doc.total = result["total"]
    if franchise:
        doc.vat_mention = totals.FRANCHISE_MENTION


def invoice_defaults(session: Session, invoice: Invoice) -> None:
    billing = get_section(session, "billing")
    company = get_section(session, "company")
    if not invoice.due_date and invoice.kind != "credit_note":
        invoice.due_date = (invoice.issue_date or today()) + timedelta(days=int(billing["payment_days"]))
    if not invoice.payment_terms:
        invoice.payment_terms = f"Paiement à {billing['payment_days']} jours — {billing['payment_methods']}"
    if not invoice.late_penalty_rate:
        invoice.late_penalty_rate = billing["late_penalty_rate"]
    if not invoice.early_payment_discount:
        invoice.early_payment_discount = billing["early_payment_discount"]
    if invoice.recovery_fee is None:
        invoice.recovery_fee = float(billing["recovery_fee"])
    if not invoice.nature:
        invoice.nature = billing["default_nature"]
    invoice.vat_on_debits = bool(company.get("vat_on_debits"))
    if not invoice.terms and billing.get("invoice_terms"):
        invoice.terms = billing["invoice_terms"]


def quote_defaults(session: Session, quote: Quote) -> None:
    billing = get_section(session, "billing")
    if not quote.number:
        quote.number = next_quote_number(session)
    if not quote.valid_until:
        quote.valid_until = (quote.issue_date or today()) + timedelta(days=int(billing["quote_validity_days"]))
    if not quote.terms:
        quote.terms = billing.get("quote_terms")
    if not quote.nature:
        quote.nature = billing["default_nature"]


# ---------------------------------------------------------------------------
# Issuing, payments, credit notes
# ---------------------------------------------------------------------------


def issue_invoice(session: Session, invoice: Invoice, user: User | None) -> dict[str, Any]:
    if invoice.locked:
        raise HTTPException(409, f"La facture {invoice.number} est déjà émise.")
    apply_totals(session, invoice)
    invoice_defaults(session, invoice)
    errors, warnings = legal_checks(session, invoice)
    if errors:
        raise HTTPException(422, detail={"message": "La facture ne peut pas être émise.", "errors": errors, "warnings": warnings})
    billing = get_section(session, "billing")
    prefix = billing["credit_prefix"] if invoice.kind == "credit_note" else billing["invoice_prefix"]
    with _number_lock:
        invoice.issue_date = today()  # la date d'émission suit l'ordre chronologique de la numérotation
        if not invoice.service_date:
            invoice.service_date = invoice.issue_date  # date de la vente / prestation (mention obligatoire)
        if invoice.kind != "credit_note":
            original_delay = int(billing["payment_days"])
            if not invoice.due_date or invoice.due_date < invoice.issue_date:
                invoice.due_date = invoice.issue_date + timedelta(days=original_delay)
        year = invoice.issue_date.year
        seq = _next_invoice_sequence(session, prefix, year)
        invoice.sequence = seq
        invoice.number = f"{prefix}-{year}-{seq:05d}"
        invoice.seller = seller_snapshot(session)
        invoice.buyer = buyer_snapshot(session, invoice.company_id, invoice.contact_id)
        invoice.issued_at = utcnow()
        invoice.locked = True
        invoice.status = "issued"
        invoice.einvoice_format = get_section(session, "einvoicing").get("format") or "factur-x"
        invoice.prev_hash = last_hash(session)
        invoice.hash = chain_hash(invoice.prev_hash, invoice)
        session.add(invoice)
        if invoice.kind == "credit_note" and invoice.credit_for_id:
            original = session.get(Invoice, invoice.credit_for_id)
            if original is not None:
                original.credited_amount = round((original.credited_amount or 0) + abs(invoice.total or 0), 2)
                refresh_status(original)
                if original.credited_amount >= (original.total or 0) - 0.005:
                    original.status = "cancelled"
                    original.cancelled_by_id = invoice.id
                session.add(original)
        audit.record(session, "issue", user.id if user else None, "invoice", invoice.id, invoice.number)
        log_activity(session, invoice, "invoice", f"{'Avoir' if invoice.kind == 'credit_note' else 'Facture'} {invoice.number} émise", user)
        session.commit()
    session.refresh(invoice)
    emit("invoice.issued", {"id": invoice.id, "number": invoice.number, "total": invoice.total, "company_id": invoice.company_id}, user.id if user else None)
    return {"warnings": warnings}


def refresh_status(invoice: Invoice) -> None:
    if not invoice.locked or invoice.status == "cancelled":
        return
    if invoice.kind == "credit_note":
        invoice.status = "issued" if invoice.status not in ("sent",) else invoice.status
        return
    balance = invoice.balance_due
    if balance <= 0.005:
        if invoice.status != "paid":
            invoice.paid_at = utcnow()
        invoice.status = "paid"
    elif (invoice.amount_paid or 0) > 0:
        invoice.status = "partial"
    elif invoice.due_date and invoice.due_date < today():
        invoice.status = "overdue"
    elif invoice.sent_at:
        invoice.status = "sent"
    else:
        invoice.status = "issued"


def record_payment(session: Session, invoice: Invoice, data: dict[str, Any], user: User | None) -> Payment:
    if not invoice.locked:
        raise HTTPException(409, "Émettez la facture avant d'enregistrer un paiement.")
    if invoice.status == "cancelled":
        raise HTTPException(409, "Cette facture est annulée par avoir.")
    amount = float(data.get("amount") or invoice.balance_due)
    if amount <= 0:
        raise HTTPException(422, "Montant de paiement invalide.")
    payment = Payment(
        invoice_id=invoice.id,
        amount=round(amount, 2),
        date=date.fromisoformat(data["date"]) if data.get("date") else today(),
        method=data.get("method") or "transfer",
        reference=data.get("reference"),
        chain=data.get("chain"),
        tx_hash=data.get("tx_hash"),
        notes=data.get("notes"),
    )
    session.add(payment)
    invoice.amount_paid = round((invoice.amount_paid or 0) + payment.amount, 2)
    was_paid = invoice.status == "paid"
    refresh_status(invoice)
    session.add(invoice)
    audit.record(session, "payment", user.id if user else None, "invoice", invoice.id, f"{invoice.number} : +{payment.amount} €")
    log_activity(session, invoice, "invoice", f"Paiement de {payment.amount:.2f} € reçu — {invoice.number}", user)
    session.commit()
    session.refresh(payment)
    if invoice.status == "paid" and not was_paid:
        emit("invoice.paid", {"id": invoice.id, "number": invoice.number, "total": invoice.total, "company_id": invoice.company_id}, user.id if user else None)
    return payment


def delete_payment(session: Session, invoice: Invoice, payment: Payment, user: User | None) -> None:
    invoice.amount_paid = round(max((invoice.amount_paid or 0) - payment.amount, 0), 2)
    session.delete(payment)
    if invoice.status == "paid":
        invoice.paid_at = None
        invoice.status = "issued"
    refresh_status(invoice)
    session.add(invoice)
    audit.record(session, "payment_delete", user.id if user else None, "invoice", invoice.id, f"{invoice.number} : -{payment.amount} €")
    session.commit()


def create_credit_note(session: Session, invoice: Invoice, user: User | None, *, full: bool = True, reason: str | None = None) -> Invoice:
    if not invoice.locked or invoice.kind == "credit_note":
        raise HTTPException(409, "Un avoir ne peut être créé que pour une facture émise.")
    lines = []
    for line in invoice.lines or []:
        copy = dict(line)
        copy.pop("id", None)
        if (copy.get("type") or "item") == "item":
            copy["quantity"] = -abs(float(copy.get("quantity") or 0))
        lines.append(copy)
    credit = Invoice(
        kind="credit_note",
        title=f"Avoir sur facture {invoice.number}" + (f" — {reason}" if reason else ""),
        company_id=invoice.company_id,
        contact_id=invoice.contact_id,
        deal_id=invoice.deal_id,
        project_id=invoice.project_id,
        owner_id=user.id if user else invoice.owner_id,
        currency=invoice.currency,
        lines=lines,
        discount=invoice.discount,
        nature=invoice.nature,
        credit_for_id=invoice.id,
        notes=f"Avoir rectificatif de la facture n° {invoice.number} du {invoice.issue_date.strftime('%d/%m/%Y')}."
        + (f" Motif : {reason}." if reason else ""),
    )
    apply_totals(session, credit)
    invoice_defaults(session, credit)
    credit.due_date = None
    session.add(credit)
    session.commit()
    session.refresh(credit)
    if full:
        issue_invoice(session, credit, user)
    return credit


def quote_to_invoice(session: Session, quote: Quote, user: User | None, *, deposit_percent: float | None = None) -> Invoice:
    if quote.status in ("declined", "expired"):
        raise HTTPException(409, "Ce devis est refusé ou expiré.")
    if deposit_percent:
        pct = float(deposit_percent)
        result = totals.compute(quote.lines or [], quote.discount or 0)
        lines = [
            {
                "type": "item",
                "description": f"Acompte de {pct:g} % — devis n° {quote.number}",
                "details": f"Base HT soumise à TVA {b['rate']:g} % : {b['base']:.2f} €",
                "quantity": 1,
                "unit": "forfait",
                "unit_price": round(b["base"] * pct / 100, 2),
                "vat_rate": b["rate"],
            }
            for b in result["vat_breakdown"]
        ]
        kind, title, discount = "deposit", f"Facture d'acompte — {quote.title or quote.number}", 0.0
    else:
        lines = [dict(line) for line in quote.lines or []]
        deposits = session.exec(select(Invoice).where(Invoice.quote_id == quote.id, Invoice.kind == "deposit", Invoice.locked == True)).all()  # noqa: E712
        for dep in deposits:
            for line in dep.lines or []:
                if (line.get("type") or "item") != "item":
                    continue
                lines.append(
                    {
                        "type": "item",
                        "description": f"Déduction acompte facturé — facture n° {dep.number}",
                        "quantity": -1,
                        "unit": "forfait",
                        "unit_price": line.get("unit_price"),
                        "vat_rate": line.get("vat_rate"),
                    }
                )
        kind, title, discount = "invoice", quote.title, quote.discount
    invoice = Invoice(
        kind=kind,
        title=title,
        company_id=quote.company_id,
        contact_id=quote.contact_id,
        deal_id=quote.deal_id,
        quote_id=quote.id,
        owner_id=user.id if user else quote.owner_id,
        currency=quote.currency,
        lines=lines,
        discount=discount,
        nature=quote.nature,
        notes=f"Selon devis n° {quote.number} accepté" + (f" le {quote.accepted_at.strftime('%d/%m/%Y')}" if quote.accepted_at else "") + ".",
    )
    apply_totals(session, invoice)
    invoice_defaults(session, invoice)
    session.add(invoice)
    if not deposit_percent:
        quote.status = "invoiced"
    session.flush()
    quote.invoice_id = invoice.id if not deposit_percent else quote.invoice_id
    session.add(quote)
    log_activity(session, quote, "quote", f"Devis {quote.number} transformé en {'facture d’acompte' if deposit_percent else 'facture'}", user)
    session.commit()
    session.refresh(invoice)
    return invoice


def log_activity(session: Session, doc: Any, kind: str, subject: str, user: User | None) -> None:
    session.add(
        Activity(
            type=kind,
            subject=subject,
            company_id=getattr(doc, "company_id", None),
            contact_id=getattr(doc, "contact_id", None),
            deal_id=getattr(doc, "deal_id", None),
            user_id=user.id if user else None,
            meta={"entity": type(doc).__name__.lower(), "id": doc.id},
        )
    )


def mark_overdue(session: Session) -> int:
    rows = session.exec(
        select(Invoice).where(Invoice.locked == True, Invoice.status.in_(["issued", "sent", "partial"]), Invoice.due_date < today())  # noqa: E712
    ).all()
    count = 0
    for inv in rows:
        if inv.status in ("issued", "sent") and inv.kind != "credit_note":
            inv.status = "overdue"
            session.add(inv)
            count += 1
            emit("invoice.overdue", {"id": inv.id, "number": inv.number, "total": inv.total, "company_id": inv.company_id})
    if count:
        session.commit()
    return count


__all__ = [
    "apply_totals",
    "buyer_snapshot",
    "create_credit_note",
    "invoice_defaults",
    "issue_invoice",
    "legal_checks",
    "mark_overdue",
    "next_quote_number",
    "next_ticket_number",
    "quote_defaults",
    "quote_to_invoice",
    "record_payment",
    "refresh_status",
    "seller_snapshot",
    "verify_chain",
]

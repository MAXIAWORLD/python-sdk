"""CSV import/export, FEC accounting export and full JSON backup."""

from __future__ import annotations

import csv
import io
import json
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, select

from ..models import Company, Contact, Invoice, Payment, User
from ..serialize import dump, jsonable, table_models
from .settings import get_section

IMPORT_FIELDS = {
    "contacts": {
        "first_name": ["prénom", "prenom", "first name", "firstname", "first_name"],
        "last_name": ["nom", "last name", "lastname", "last_name", "nom de famille"],
        "email": ["email", "e-mail", "mail", "courriel"],
        "phone": ["téléphone", "telephone", "phone", "tél", "tel"],
        "mobile": ["mobile", "portable", "gsm"],
        "job_title": ["poste", "fonction", "job title", "titre", "job_title"],
        "company": ["entreprise", "société", "societe", "company", "organisation", "organization"],
        "city": ["ville", "city"],
        "country": ["pays", "country"],
        "source": ["source", "origine"],
        "lifecycle": ["cycle de vie", "lifecycle", "statut"],
        "linkedin": ["linkedin"],
        "tags": ["tags", "étiquettes", "labels"],
        "notes": ["notes", "commentaire", "remarques"],
    },
    "companies": {
        "name": ["nom", "raison sociale", "entreprise", "société", "company", "name"],
        "website": ["site", "site web", "website", "url"],
        "industry": ["secteur", "industrie", "industry"],
        "siren": ["siren"],
        "siret": ["siret"],
        "vat_number": ["tva", "n° tva", "vat", "numéro de tva"],
        "address": ["adresse", "address"],
        "zip": ["code postal", "cp", "zip", "postal code"],
        "city": ["ville", "city"],
        "country": ["pays", "country"],
        "phone": ["téléphone", "telephone", "phone"],
        "email": ["email", "e-mail"],
        "type": ["type", "catégorie"],
        "employees": ["effectif", "employés", "employees"],
        "tags": ["tags", "étiquettes"],
    },
    "products": {
        "name": ["nom", "désignation", "designation", "name", "produit"],
        "sku": ["référence", "reference", "sku", "ref"],
        "unit_price": ["prix", "prix unitaire", "pu ht", "price", "unit_price"],
        "unit": ["unité", "unite", "unit"],
        "vat_rate": ["tva", "taux de tva", "vat"],
        "category": ["catégorie", "category"],
        "description": ["description"],
    },
}


def parse_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = content.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=";,\t|")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";" if text.count(";") > text.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows = [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]
    return list(reader.fieldnames or []), rows


def guess_mapping(entity: str, headers: list[str]) -> dict[str, str]:
    fields = IMPORT_FIELDS.get(entity, {})
    mapping: dict[str, str] = {}
    for header in headers:
        h = header.strip().lower()
        for field, aliases in fields.items():
            if h == field or h in aliases:
                mapping[header] = field
                break
    return mapping


def import_rows(session: Session, entity: str, rows: list[dict[str, str]], mapping: dict[str, str], user: User, *, consent_source: str | None = None) -> dict[str, Any]:
    from ..resources import RESOURCES

    resource = RESOURCES[entity]
    created = updated = 0
    errors: list[str] = []
    for index, row in enumerate(rows, start=2):
        data: dict[str, Any] = {}
        for header, field in mapping.items():
            if field and row.get(header) not in (None, ""):
                data[field] = row[header]
        if not data:
            continue
        try:
            if "tags" in data:
                data["tags"] = [t.strip() for t in str(data["tags"]).replace(";", ",").split(",") if t.strip()]
            if entity == "contacts":
                company_name = data.pop("company", None)
                if company_name:
                    company = session.exec(select(Company).where(Company.name == company_name)).first()
                    if company is None:
                        company = RESOURCES["companies"].create(session, {"name": company_name}, user)
                    data["company_id"] = company.id
                existing = session.exec(select(Contact).where(Contact.email == data["email"].lower())).first() if data.get("email") else None
                if existing:
                    resource.update(session, existing.id, data, user)
                    updated += 1
                    continue
            if entity == "companies":
                existing = session.exec(select(Company).where(Company.name == data.get("name"))).first() if data.get("name") else None
                if existing:
                    resource.update(session, existing.id, data, user)
                    updated += 1
                    continue
            if entity == "products":
                for key in ("unit_price", "vat_rate"):
                    if key in data:
                        data[key] = str(data[key]).replace("€", "").replace("%", "").replace(" ", "").replace(",", ".")
            resource.create(session, data, user)
            created += 1
        except HTTPException as exc:
            session.rollback()
            errors.append(f"Ligne {index} : {exc.detail}")
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            errors.append(f"Ligne {index} : {exc}")
    return {"created": created, "updated": updated, "errors": errors[:50], "error_count": len(errors)}


def export_csv(items: list[dict[str, Any]]) -> bytes:
    if not items:
        return "﻿".encode()
    columns: list[str] = []
    for item in items:
        for key, value in item.items():
            if key not in columns and not isinstance(value, dict):
                columns.append(key)
    out = io.StringIO()
    writer = csv.writer(out, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(columns)
    for item in items:
        row = []
        for col in columns:
            value = item.get(col)
            if isinstance(value, list):
                value = ", ".join(str(v) for v in value)
            elif isinstance(value, float):
                value = f"{value:.2f}".replace(".", ",")
            elif value is None:
                value = ""
            row.append(value)
        writer.writerow(row)
    return ("﻿" + out.getvalue()).encode("utf-8")


# ---------------------------------------------------------------------------
# FEC (Fichier des Écritures Comptables) — journal des ventes et encaissements
# ---------------------------------------------------------------------------

FEC_COLUMNS = [
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib",
    "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
]


def _amount(value: float) -> str:
    return f"{abs(value):.2f}".replace(".", ",")


def export_fec(session: Session, start: date, end: date) -> tuple[str, bytes]:
    acc = get_section(session, "accounting")
    company = get_section(session, "company")
    rows: list[list[str]] = []
    num = 0
    invoices = session.exec(
        select(Invoice).where(Invoice.locked == True, Invoice.issue_date >= start, Invoice.issue_date <= end).order_by(Invoice.issue_date, Invoice.sequence)  # noqa: E712
    ).all()
    for inv in invoices:
        num += 1
        d = inv.issue_date.strftime("%Y%m%d")
        valid = (inv.issued_at.date() if inv.issued_at else inv.issue_date).strftime("%Y%m%d")
        buyer = inv.buyer or {}
        aux = f"{acc['customer_aux_prefix']}{inv.company_id or inv.contact_id or 0:05d}"
        aux_lib = (buyer.get("name") or "Client")[:60]
        label = f"{'Avoir' if inv.kind == 'credit_note' else 'Facture'} {inv.number} {aux_lib}"[:100]
        is_credit = (inv.total or 0) < 0

        def line(account: str, account_lib: str, debit: float, credit: float, aux_num: str = "", aux_label: str = "") -> None:
            rows.append([acc["journal_sales"], "Ventes", str(num), d, account, account_lib, aux_num, aux_label, inv.number, d, label, _amount(debit) if debit else "0,00", _amount(credit) if credit else "0,00", "", "", valid, "", inv.currency or "EUR"])

        total = abs(inv.total or 0)
        line(acc["account_customers"], "Clients", 0 if is_credit else total, total if is_credit else 0, aux, aux_lib)
        account = acc["account_goods"] if inv.nature == "goods" else acc["account_services"]
        base_total = abs(inv.subtotal or 0)
        line(account, "Ventes de marchandises" if inv.nature == "goods" else "Prestations de services", base_total if is_credit else 0, 0 if is_credit else base_total)
        vat = abs(inv.tax_total or 0)
        if vat:
            line(acc["account_vat"], "TVA collectée", vat if is_credit else 0, 0 if is_credit else vat)

    payments = session.exec(select(Payment).where(Payment.date >= start, Payment.date <= end).order_by(Payment.date)).all()
    for p in payments:
        inv = session.get(Invoice, p.invoice_id)
        if inv is None:
            continue
        num += 1
        d = p.date.strftime("%Y%m%d")
        aux = f"{acc['customer_aux_prefix']}{inv.company_id or inv.contact_id or 0:05d}"
        aux_lib = ((inv.buyer or {}).get("name") or "Client")[:60]
        label = f"Règlement {inv.number} {aux_lib}"[:100]
        rows.append([acc["journal_bank"], "Banque", str(num), d, acc["account_bank"], "Banque", "", "", p.reference or inv.number, d, label, _amount(p.amount), "0,00", "", "", d, "", inv.currency or "EUR"])
        rows.append([acc["journal_bank"], "Banque", str(num), d, acc["account_customers"], "Clients", aux, aux_lib, p.reference or inv.number, d, label, "0,00", _amount(p.amount), "", "", d, "", inv.currency or "EUR"])

    out = io.StringIO()
    writer = csv.writer(out, delimiter="\t", lineterminator="\r\n")
    writer.writerow(FEC_COLUMNS)
    writer.writerows(rows)
    siren = (company.get("siren") or "000000000").replace(" ", "")
    filename = f"{siren}FEC{end.strftime('%Y%m%d')}.txt"
    return filename, out.getvalue().encode("utf-8")


def backup(session: Session) -> bytes:
    from .. import models  # noqa: F401

    data: dict[str, Any] = {"format": "prisme-backup", "version": 1}
    for table in SQLModel.metadata.sorted_tables:
        model = _model_for(table.name)
        if model is None:
            continue
        rows = session.exec(select(model)).all()
        data[table.name] = [jsonable(dump(r, exclude=set())) if hasattr(r, "__table__") else jsonable(r) for r in rows]
    return json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8")


def _model_for(table_name: str) -> Any:
    return table_models().get(table_name)

"""Application settings stored in the `settings` table, merged over defaults."""

from __future__ import annotations

import copy
from typing import Any

from sqlmodel import Session

from ..config import settings as env
from ..models import Setting, utcnow
from ..security import decrypt_secret, encrypt_secret, mask_secret

LATE_PENALTY_DEFAULT = (
    "En cas de retard de paiement, application de pénalités au taux d'intérêt appliqué par la BCE "
    "à son opération de refinancement la plus récente majoré de 10 points (art. L441-10 du Code de commerce)."
)

DEFAULTS: dict[str, dict[str, Any]] = {
    "company": {
        "name": "",
        "legal_name": "",
        "legal_form": "SAS",
        "capital": "",
        "address": "",
        "zip": "",
        "city": "",
        "country": "France",
        "country_code": "FR",
        "siren": "",
        "siret": "",
        "rcs_city": "",
        "rm": "",
        "ape": "",
        "vat_number": "",
        "email": "",
        "phone": "",
        "website": "",
        "logo_url": "",
        "iban": "",
        "bic": "",
        "bank_name": "",
        "vat_regime": "normal",  # normal | franchise (art. 293 B du CGI)
        "vat_on_debits": False,
        "mediator": "",  # médiateur de la consommation (obligatoire si clientèle B2C)
        "insurance": "",  # assurance professionnelle (mention obligatoire pour certaines activités)
        "einvoicing_address": "",  # adresse de facturation électronique (annuaire PPF)
    },
    "billing": {
        "quote_prefix": "DEV",
        "invoice_prefix": "FA",
        "credit_prefix": "AV",
        "default_vat": 20.0,
        "payment_days": 30,
        "quote_validity_days": 30,
        "default_nature": "services",
        "late_penalty_rate": LATE_PENALTY_DEFAULT,
        "early_payment_discount": "Pas d'escompte pour paiement anticipé.",
        "recovery_fee": 40.0,
        "payment_methods": "Virement bancaire",
        "quote_terms": "Devis valable jusqu'à la date indiquée. Bon pour accord : signature précédée de la mention « Bon pour accord ».",
        "invoice_terms": "",
        "footer": "",
        "auto_overdue": True,
        "reminder_days": [7, 15, 30],
    },
    "branding": {"app_name": "Prisme", "accent": "#5b6cff", "logo_url": ""},
    "general": {
        "public_url": "",
        "timezone": "Europe/Paris",
        "locale": "fr-FR",
        "currency": "EUR",
        "week_start": 1,
    },
    "email": {
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": None,
        "smtp_security": "starttls",  # starttls | ssl | none
        "from_name": "",
        "from_email": "",
        "reply_to": "",
        "imap_enabled": False,
        "imap_host": "",
        "imap_port": 993,
        "imap_user": "",
        "imap_password": None,
        "imap_folder": "INBOX",
        "track_opens": False,  # CNIL : pixels de suivi soumis au consentement -> désactivé par défaut
        "bcc_self": False,
    },
    "ai": {
        "require_approval": True,
        "assistant_name": "Iris",
        "custom_instructions": "",
        "effort": "medium",
        "mask_personal_data": False,
        "daily_briefing": True,
    },
    "mcp": {"enabled": True},
    "rgpd": {
        "controller_name": "",
        "dpo_name": "",
        "dpo_email": "",
        "privacy_url": "",
        "prospect_retention_years": 3,
        "customer_retention_years": 3,
        "auto_anonymize": False,
        "require_explicit_consent": False,
        "form_notice": (
            "Les informations recueillies sont traitées par {company} pour répondre à votre demande et, "
            "si vous l'acceptez, vous adresser des informations commerciales. Vous disposez d'un droit d'accès, "
            "de rectification, d'effacement, d'opposition et de portabilité : {contact}."
        ),
        "register": [],
    },
    "einvoicing": {
        "enabled": True,
        "format": "factur-x",  # factur-x | ubl
        "profile": "en16931",
        "platform_name": "",
        "platform_api_url": "",
        "platform_api_key": None,
        "auto_transmit": False,
    },
    "accounting": {
        "journal_sales": "VT",
        "journal_bank": "BQ",
        "account_customers": "411000",
        "account_services": "706000",
        "account_goods": "707000",
        "account_vat": "445710",
        "account_bank": "512000",
        "customer_aux_prefix": "C",
    },
    "counters": {},
}

SECRET_FIELDS = {
    ("email", "smtp_password"),
    ("email", "imap_password"),
    ("einvoicing", "platform_api_key"),
}


def _deep_merge(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in (extra or {}).items():
        out[key] = value
    return out


def get_section(session: Session, section: str, *, decrypt: bool = True) -> dict[str, Any]:
    row = session.get(Setting, section)
    stored = row.value if row and isinstance(row.value, dict) else {}
    data = _deep_merge(DEFAULTS.get(section, {}), stored)
    for sec, key in SECRET_FIELDS:
        if sec == section:
            data[key] = decrypt_secret(data.get(key)) if decrypt else data.get(key)
    if section == "general" and not data.get("public_url"):
        data["public_url"] = env.public_url_env or f"http://localhost:{env.port}"
    return data


def get_public_section(session: Session, section: str) -> dict[str, Any]:
    """Same as get_section but with secrets masked (for the API)."""
    data = get_section(session, section)
    for sec, key in SECRET_FIELDS:
        if sec == section:
            data[key + "_set"] = bool(data.get(key))
            data[key] = mask_secret(data.get(key))
    return data


def update_section(session: Session, section: str, values: dict[str, Any], *, commit: bool = True) -> dict[str, Any]:
    row = session.get(Setting, section)
    current = dict(row.value) if row and isinstance(row.value, dict) else {}
    for key, value in values.items():
        if (section, key) in SECRET_FIELDS:
            if value in (None, "") or (isinstance(value, str) and "••••" in value):
                if value == "":
                    current[key] = None
                continue
            current[key] = encrypt_secret(value)
        else:
            current[key] = value
    if row is None:
        row = Setting(key=section, value=current)
    else:
        row.value = current
        row.updated_at = utcnow()
    session.add(row)
    if commit:
        session.commit()
    return get_public_section(session, section)


def public_url(session: Session) -> str:
    return get_section(session, "general")["public_url"].rstrip("/")

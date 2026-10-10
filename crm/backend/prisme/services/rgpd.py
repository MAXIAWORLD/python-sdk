"""RGPD tooling: consent proofs, data subject rights, retention policy, processing register."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlmodel import Session, or_, select

from ..models import (
    Activity,
    ConsentLog,
    Contact,
    Deal,
    Document,
    EmailMessage,
    Event,
    FormSubmission,
    Invoice,
    Quote,
    Task,
    Ticket,
    TicketMessage,
    User,
    utcnow,
)
from ..serialize import dump
from . import audit
from .settings import get_section


def log_consent(
    session: Session,
    contact: Contact,
    action: str,
    *,
    channel: str = "email",
    source: str | None = None,
    wording: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    user: User | None = None,
) -> None:
    session.add(
        ConsentLog(
            contact_id=contact.id,
            email=contact.email,
            channel=channel,
            action=action,
            source=source,
            wording=wording,
            ip=ip,
            user_agent=user_agent,
            user_id=user.id if user else None,
        )
    )


def can_receive_marketing(session: Session, contact: Contact) -> tuple[bool, str]:
    """Prospection par email (art. L34-5 CPCE / CNIL).

    - B2C (particulier) : consentement préalable obligatoire.
    - B2B : envoi possible sans consentement si le message concerne la profession
      de la personne, avec possibilité de s'opposer (lien de désinscription).
    """
    if not contact.email:
        return False, "pas d'email"
    if contact.do_not_contact or contact.unsubscribed_at or contact.anonymized_at:
        return False, "opposition / désinscription"
    rules = get_section(session, "rgpd")
    if contact.consent_marketing:
        return True, "consentement"
    if rules.get("require_explicit_consent"):
        return False, "consentement explicite requis"
    if contact.company_id:
        return True, "intérêt légitime B2B"
    return False, "particulier sans consentement"


def export_contact(session: Session, contact: Contact) -> dict[str, Any]:
    """Droit d'accès et à la portabilité (art. 15 et 20)."""

    def rows(model, *conditions):
        return [dump(r) for r in session.exec(select(model).where(*conditions)).all()]

    return {
        "contact": dump(contact),
        "activities": rows(Activity, Activity.contact_id == contact.id),
        "emails": rows(EmailMessage, EmailMessage.contact_id == contact.id),
        "deals": rows(Deal, Deal.contact_id == contact.id),
        "tasks": rows(Task, Task.contact_id == contact.id),
        "events": rows(Event, Event.contact_id == contact.id),
        "tickets": rows(Ticket, Ticket.contact_id == contact.id),
        "quotes": rows(Quote, Quote.contact_id == contact.id),
        "invoices": rows(Invoice, Invoice.contact_id == contact.id),
        "form_submissions": rows(FormSubmission, FormSubmission.contact_id == contact.id),
        "consents": rows(ConsentLog, ConsentLog.contact_id == contact.id),
        "exported_at": utcnow().isoformat(),
    }


def anonymize_contact(session: Session, contact: Contact, user: User | None, reason: str = "Droit à l'effacement") -> None:
    """Droit à l'effacement (art. 17) — les factures émises sont conservées (obligation légale, art. L123-22 C. com.)."""
    initials = f"{(contact.first_name or '?')[:1]}.{(contact.last_name or '?')[:1]}."
    contact.first_name = "Contact"
    contact.last_name = f"anonymisé {initials}"
    for field in ("email", "phone", "mobile", "linkedin", "twitter", "telegram", "wallet_address", "address", "city", "birthday", "notes", "avatar_url", "job_title", "department"):
        setattr(contact, field, None)
    contact.tags = []
    contact.custom = {}
    contact.consent_marketing = False
    contact.do_not_contact = True
    contact.do_not_call = True
    contact.anonymized_at = utcnow()
    session.add(contact)
    for act in session.exec(select(Activity).where(Activity.contact_id == contact.id)).all():
        act.body = None
        session.add(act)
    for mail in session.exec(select(EmailMessage).where(EmailMessage.contact_id == contact.id)).all():
        session.delete(mail)
    for sub in session.exec(select(FormSubmission).where(FormSubmission.contact_id == contact.id)).all():
        sub.data = {"anonymisé": True}
        sub.ip = None
        sub.user_agent = None
        session.add(sub)
    for ticket in session.exec(select(Ticket).where(Ticket.contact_id == contact.id)).all():
        for msg in session.exec(select(TicketMessage).where(TicketMessage.ticket_id == ticket.id, TicketMessage.author_type == "customer")).all():
            msg.body = "[message anonymisé]"
            session.add(msg)
    for log in session.exec(select(ConsentLog).where(ConsentLog.contact_id == contact.id)).all():
        log.email = None
        log.ip = None
        log.user_agent = None
        session.add(log)
    for doc in session.exec(select(Document).where(Document.contact_id == contact.id)).all():
        doc.contact_id = None
        session.add(doc)
    audit.record(session, "anonymize", user.id if user else None, "contact", contact.id, reason)
    session.commit()


def retention_candidates(session: Session) -> list[dict[str, Any]]:
    """Prospects inactifs au-delà de la durée de conservation (CNIL : 3 ans après le dernier contact)."""
    rules = get_section(session, "rgpd")
    years = int(rules.get("prospect_retention_years") or 3)
    limit = utcnow() - timedelta(days=365 * years)
    rows = session.exec(
        select(Contact).where(
            Contact.anonymized_at.is_(None),
            Contact.lifecycle.in_(["lead", "mql", "sql", "lost"]),
            or_(Contact.last_contacted_at.is_(None), Contact.last_contacted_at < limit),
            Contact.updated_at < limit,
        )
    ).all()
    return [
        {
            "id": c.id,
            "name": c.full_name,
            "email": c.email,
            "lifecycle": c.lifecycle,
            "last_contacted_at": c.last_contacted_at.isoformat() if c.last_contacted_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in rows
    ]


DEFAULT_REGISTER = [
    {
        "name": "Gestion de la relation client et prospects",
        "purpose": "Suivi commercial, opportunités, échanges avec les clients et prospects",
        "legal_basis": "Intérêt légitime / exécution du contrat",
        "data": "Identité, coordonnées professionnelles, historique des échanges",
        "people": "Clients, prospects, partenaires",
        "recipients": "Équipe commerciale et direction",
        "retention": "Durée de la relation + 3 ans (prospects : 3 ans après le dernier contact)",
        "security": "Accès authentifié, rôles, journalisation, chiffrement des secrets",
    },
    {
        "name": "Facturation et comptabilité",
        "purpose": "Émission des devis, factures et avoirs ; suivi des paiements",
        "legal_basis": "Obligation légale",
        "data": "Identité, coordonnées de facturation, montants",
        "people": "Clients",
        "recipients": "Service comptable, expert-comptable, plateforme agréée de facturation",
        "retention": "10 ans (art. L123-22 du Code de commerce)",
        "security": "Factures inaltérables, chaînage d'intégrité SHA-256",
    },
    {
        "name": "Prospection commerciale par email",
        "purpose": "Envoi de newsletters et campagnes",
        "legal_basis": "Consentement (particuliers) / intérêt légitime (professionnels)",
        "data": "Nom, email, interactions avec les campagnes",
        "people": "Prospects et clients",
        "recipients": "Équipe marketing",
        "retention": "3 ans après le dernier contact ou jusqu'à désinscription",
        "security": "Lien de désinscription, registre des consentements",
    },
    {
        "name": "Support client",
        "purpose": "Traitement des demandes d'assistance",
        "legal_basis": "Exécution du contrat",
        "data": "Identité, coordonnées, contenu des demandes",
        "people": "Clients",
        "recipients": "Équipe support",
        "retention": "Durée de la relation + 3 ans",
        "security": "Accès restreint, journalisation",
    },
    {
        "name": "Assistant IA",
        "purpose": "Aide à la rédaction, synthèse et automatisation",
        "legal_basis": "Intérêt légitime",
        "data": "Données CRM transmises au fournisseur d'IA configuré",
        "people": "Clients, prospects, utilisateurs",
        "recipients": "Fournisseur d'IA (sous-traitant — vérifier le DPA et le lieu d'hébergement)",
        "retention": "Historique des conversations conservé dans le CRM, supprimable",
        "security": "Validation humaine des actions, option de masquage des données personnelles",
    },
]

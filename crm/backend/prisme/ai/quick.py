"""One-shot AI generations used across the UI (« ✨ » buttons)."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from ..models import Activity, Company, Contact, Deal, EmailMessage, Product, Ticket, TicketMessage, User
from ..resources import RESOURCES
from ..services import analytics
from .tools import _related

KINDS = {
    "draft_email": "Rédiger un email",
    "improve_text": "Améliorer un texte",
    "summarize": "Résumer une fiche",
    "deal_coach": "Coach commercial",
    "ticket_reply": "Suggérer une réponse support",
    "meeting_notes": "Structurer un compte rendu",
    "campaign_copy": "Rédiger une campagne",
    "daily_briefing": "Brief du jour",
    "lead_qualify": "Qualifier un lead",
    "quote_lines": "Proposer des lignes de devis",
    "kb_article": "Rédiger un article d'aide",
}


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)[:15000]


def build_prompt(session: Session, user: User, kind: str, params: dict[str, Any]) -> str:
    if kind == "draft_email":
        target = ""
        if params.get("contact_id"):
            contact = session.get(Contact, int(params["contact_id"]))
            if contact:
                data = RESOURCES["contacts"].get(session, contact.id, user)
                data["related"] = _related(session, "contacts", data)
                target = f"\nDestinataire (données CRM) : {_dump(data)}"
        if params.get("deal_id"):
            deal = RESOURCES["deals"].get(session, int(params["deal_id"]), user)
            target += f"\nOpportunité liée : {_dump(deal)}"
        return (
            f"Rédige un email professionnel en français.\nObjectif : {params.get('purpose') or 'relance commerciale'}\n"
            f"Ton : {params.get('tone') or 'cordial et direct'}\nSignataire : {user.name}{(' — ' + user.title) if user.title else ''}.{target}\n\n"
            "Réponds exactement au format :\nObjet : <objet>\n\n<corps du message en markdown simple, sans signature détaillée>"
        )
    if kind == "improve_text":
        return f"Améliore ce texte selon la consigne « {params.get('instruction') or 'plus clair, plus professionnel'} ». Réponds uniquement avec le texte réécrit.\n\n---\n{params.get('text') or ''}"
    if kind == "summarize":
        resource = params.get("resource") or "contacts"
        data = RESOURCES[resource].get(session, int(params["id"]), user)
        data["related"] = _related(session, resource, data)
        return f"Fais une synthèse actionnable de cette fiche CRM ({resource}) en 5 puces maximum : situation, derniers échanges, enjeux, risques, prochaine action recommandée.\n\n{_dump(data)}"
    if kind == "deal_coach":
        data = RESOURCES["deals"].get(session, int(params["deal_id"]), user)
        data["related"] = _related(session, "deals", data)
        return (
            "Tu es un coach commercial B2B expérimenté. Analyse cette opportunité et réponds en markdown avec : "
            "**Probabilité de gain estimée** (en % avec justification), **Signaux positifs**, **Risques**, "
            "**3 prochaines actions concrètes** (avec qui, quoi, quand) et un **message de relance** court prêt à envoyer.\n\n"
            + _dump(data)
        )
    if kind == "ticket_reply":
        ticket = session.get(Ticket, int(params["ticket_id"]))
        if ticket is None:
            raise HTTPException(404, "Ticket introuvable.")
        msgs = session.exec(select(TicketMessage).where(TicketMessage.ticket_id == ticket.id).order_by(TicketMessage.created_at)).all()
        thread = "\n\n".join(f"[{m.author_type}{' interne' if m.is_internal else ''}] {m.body}" for m in msgs)
        kb = [a for a in RESOURCES["kb-articles"].list(session, [("status", "published"), ("q", ticket.subject.split(' ')[0] if ticket.subject else ''), ("limit", 3)], user)["items"]]
        return (
            f"Rédige la prochaine réponse du support au client pour ce ticket ({ticket.number} — {ticket.subject}). "
            "Ton empathique et précis, solution étape par étape si possible, en français, signée « L'équipe support ».\n\n"
            f"Fil de discussion :\n{thread}\n\nArticles d'aide potentiellement utiles : {_dump([{'title': a['title'], 'summary': a.get('summary')} for a in kb])}"
        )
    if kind == "meeting_notes":
        return (
            "Transforme ces notes brutes de réunion en compte rendu structuré en markdown : **Contexte**, **Points clés**, **Décisions**, "
            "**Actions** (tableau Qui / Quoi / Échéance). Termine par un bloc ```json contenant une liste d'objets "
            '{"title": ..., "due_in_days": ..., "priority": "low|medium|high"} pour les tâches à créer.\n\n'
            + (params.get("text") or "")
        )
    if kind == "campaign_copy":
        return (
            f"Rédige un email marketing B2B en français. Brief : {params.get('brief') or ''}. Cible : {params.get('audience') or 'clients et prospects'}.\n"
            "Format exact :\nObjet : <objet accrocheur, 50 caractères max>\nPré-en-tête : <phrase d'aperçu>\n\n<corps en markdown, avec un appel à l'action clair>\n"
            "N'ajoute pas de lien de désinscription : il est ajouté automatiquement."
        )
    if kind == "daily_briefing":
        data = analytics.dashboard(session, user)
        compact = {
            "kpis": data["kpis"],
            "mes_taches": [{k: t.get(k) for k in ("title", "due_date", "priority")} for t in data["my_tasks"]],
            "rendez_vous": [{k: e.get(k) for k in ("title", "start_at", "type")} for e in data["upcoming_events"]],
            "deals_a_risque": [{k: d.get(k) for k in ("title", "amount", "expected_close_date", "next_step")} for d in data["deals_at_risk"]],
            "renouvellements": data["renewals"],
        }
        return (
            f"Prépare le brief du jour de {user.name}, en français, en markdown concis : une phrase d'accroche, "
            "**Chiffres clés** (3-4 puces), **Priorités du jour** (3-5 puces actionnables), **Points de vigilance**. Pas de tableau.\n\n"
            + _dump(compact)
        )
    if kind == "lead_qualify":
        data = RESOURCES["contacts"].get(session, int(params["contact_id"]), user)
        data["related"] = _related(session, "contacts", data)
        return (
            "Qualifie ce lead B2B (méthode BANT). Réponds en markdown : **Score recommandé /100**, **Budget**, **Autorité**, **Besoin**, "
            "**Timing**, **Stade conseillé** (lead, mql, sql, opportunity) et **Prochaine action**.\n\n" + _dump(data)
        )
    if kind == "quote_lines":
        catalog = [{"id": p.id, "name": p.name, "unit_price": p.unit_price, "unit": p.unit, "vat_rate": p.vat_rate, "kind": p.kind} for p in session.exec(select(Product).where(Product.active == True)).all()]  # noqa: E712
        return (
            "Propose les lignes d'un devis à partir du besoin client et du catalogue. Réponds UNIQUEMENT avec un bloc ```json contenant une liste "
            'd\'objets {"product_id": id ou null, "description": ..., "quantity": nombre, "unit": ..., "unit_price": nombre HT, "vat_rate": nombre}. '
            f"Utilise les produits du catalogue quand ils conviennent.\n\nBesoin : {params.get('brief') or ''}\n\nCatalogue : {_dump(catalog)}"
        )
    if kind == "kb_article":
        return f"Rédige un article de base de connaissances clair (titre, introduction, étapes numérotées, astuces, FAQ courte) en markdown sur : {params.get('topic') or ''}"
    raise HTTPException(400, "Type de génération inconnu.")


__all__ = ["KINDS", "Activity", "Company", "Deal", "EmailMessage", "build_prompt"]

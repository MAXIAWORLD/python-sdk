"""Workflow automations: trigger -> conditions -> actions (with an optional AI agent step)."""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from ..db import session_scope
from ..models import Automation, AutomationRun, Company, Contact, Deal, Project, User, today, utcnow
from ..serialize import dump
from .events import current_depth, set_depth, subscribe

log = logging.getLogger("prisme.automations")
MAX_DEPTH = 3

TRIGGERS = [
    {"type": "contact.created", "label": "Nouveau contact", "group": "Contacts", "entity": "contact"},
    {"type": "contact.updated", "label": "Contact modifié", "group": "Contacts", "entity": "contact"},
    {"type": "company.created", "label": "Nouvelle entreprise", "group": "Contacts", "entity": "company"},
    {"type": "form.submitted", "label": "Formulaire soumis (nouveau lead)", "group": "Marketing", "entity": "contact"},
    {"type": "deal.created", "label": "Nouvelle opportunité", "group": "Ventes", "entity": "deal"},
    {"type": "deal.stage_changed", "label": "Opportunité change d'étape", "group": "Ventes", "entity": "deal"},
    {"type": "deal.won", "label": "Affaire gagnée", "group": "Ventes", "entity": "deal"},
    {"type": "deal.lost", "label": "Affaire perdue", "group": "Ventes", "entity": "deal"},
    {"type": "quote.viewed", "label": "Devis consulté par le client", "group": "Facturation", "entity": "quote"},
    {"type": "quote.accepted", "label": "Devis signé", "group": "Facturation", "entity": "quote"},
    {"type": "quote.declined", "label": "Devis refusé", "group": "Facturation", "entity": "quote"},
    {"type": "invoice.issued", "label": "Facture émise", "group": "Facturation", "entity": "invoice"},
    {"type": "invoice.paid", "label": "Facture payée", "group": "Facturation", "entity": "invoice"},
    {"type": "invoice.overdue", "label": "Facture en retard", "group": "Facturation", "entity": "invoice"},
    {"type": "subscription.created", "label": "Nouvel abonnement", "group": "Abonnements", "entity": "subscription"},
    {"type": "subscription.updated", "label": "Abonnement modifié", "group": "Abonnements", "entity": "subscription"},
    {"type": "ticket.created", "label": "Nouveau ticket", "group": "Support", "entity": "ticket"},
    {"type": "ticket.updated", "label": "Ticket modifié", "group": "Support", "entity": "ticket"},
    {"type": "task.completed", "label": "Tâche terminée", "group": "Projets", "entity": "task"},
    {"type": "project.created", "label": "Nouveau projet", "group": "Projets", "entity": "project"},
    {"type": "schedule.daily", "label": "Chaque jour à 8 h", "group": "Planifié", "entity": None},
    {"type": "schedule.weekly", "label": "Chaque lundi à 8 h", "group": "Planifié", "entity": None},
]

ACTIONS = [
    {"type": "create_task", "label": "Créer une tâche", "fields": ["title", "description", "due_in_days", "priority", "assignee"]},
    {"type": "send_email", "label": "Envoyer un email", "fields": ["to", "email", "subject", "body"]},
    {"type": "notify", "label": "Notifier l'équipe", "fields": ["target", "title", "body"]},
    {"type": "update_record", "label": "Modifier l'élément déclencheur", "fields": ["field", "value"]},
    {"type": "add_tag", "label": "Ajouter un tag", "fields": ["tag"]},
    {"type": "create_deal", "label": "Créer une opportunité", "fields": ["title", "pipeline_id", "amount"]},
    {"type": "create_project", "label": "Créer un projet", "fields": ["name", "billing_mode"]},
    {"type": "webhook", "label": "Appeler un webhook", "fields": ["url"]},
    {"type": "ai_agent", "label": "Confier à l'agent IA", "fields": ["instructions"]},
]

ENTITY_RESOURCE = {
    "contact": "contacts", "company": "companies", "deal": "deals", "quote": "quotes", "invoice": "invoices",
    "subscription": "subscriptions", "ticket": "tickets", "task": "tasks", "project": "projects",
}


def trigger_entity(event: str) -> str | None:
    for t in TRIGGERS:
        if t["type"] == event:
            return t["entity"]
    return event.split(".")[0] if "." in event else None


# ---------------------------------------------------------------------------
# Context & templating
# ---------------------------------------------------------------------------


def build_context(session: Session, event: str, payload: dict[str, Any], actor_id: int | None) -> dict[str, Any]:
    from ..resources import RESOURCES

    entity_name = trigger_entity(event)
    ctx: dict[str, Any] = {"event": event, "payload": payload, "data": payload.get("data") or payload, "changes": payload.get("changes") or {}}
    ctx["today"] = today().strftime("%d/%m/%Y")
    obj_id = payload.get("contact_id") if event == "form.submitted" else payload.get("id")
    if entity_name and obj_id and entity_name in ENTITY_RESOURCE:
        try:
            ctx["entity"] = RESOURCES[ENTITY_RESOURCE[entity_name]].get(session, int(obj_id), None)
        except HTTPException:
            ctx["entity"] = {}
    else:
        ctx["entity"] = {}
    entity = ctx["entity"] or {}
    ctx["entity_type"] = entity_name
    contact_id = entity.get("contact_id") or (entity.get("id") if entity_name == "contact" else None)
    company_id = entity.get("company_id") or (entity.get("id") if entity_name == "company" else None)
    contact = session.get(Contact, contact_id) if contact_id else None
    company = session.get(Company, company_id) if company_id else None
    ctx["contact"] = {**dump(contact), "full_name": contact.full_name} if contact else {}
    ctx["company"] = dump(company) if company else {}
    owner_id = entity.get("owner_id") or entity.get("assignee_id") or (contact.owner_id if contact else None) or actor_id
    owner = session.get(User, owner_id) if owner_id else None
    ctx["owner"] = {"id": owner.id, "name": owner.name, "email": owner.email} if owner else {}
    ctx["actor_id"] = actor_id
    return ctx


_TPL = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def resolve(ctx: dict[str, Any], path: str) -> Any:
    value: Any = ctx
    for part in path.split("."):
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


def render(template: Any, ctx: dict[str, Any]) -> Any:
    if not isinstance(template, str):
        return template

    def repl(match: re.Match) -> str:
        value = resolve(ctx, match.group(1))
        if value is None:
            return ""
        if isinstance(value, float):
            return f"{value:,.2f}".replace(",", " ").replace(".", ",")
        return str(value)

    return _TPL.sub(repl, template)


def check_condition(ctx: dict[str, Any], cond: dict[str, Any]) -> bool:
    field, op, expected = cond.get("field") or "", cond.get("op") or "eq", cond.get("value")
    if op == "changed":
        return field.split(".")[-1] in (ctx.get("changes") or {})
    if op == "changed_to":
        change = (ctx.get("changes") or {}).get(field.split(".")[-1])
        return bool(change) and str(change[1]) == str(expected)
    actual = resolve(ctx, field)
    if actual is None and "." not in field:
        actual = resolve(ctx, f"entity.{field}")
    if op == "is_empty":
        return actual in (None, "", [], {})
    if op == "is_not_empty":
        return actual not in (None, "", [], {})
    if op == "contains":
        if isinstance(actual, list):
            return str(expected) in [str(a) for a in actual]
        return str(expected).lower() in str(actual or "").lower()
    if op == "not_contains":
        return not check_condition(ctx, {**cond, "op": "contains"})
    if op in ("gt", "gte", "lt", "lte"):
        try:
            a, b = float(actual or 0), float(expected or 0)
        except (TypeError, ValueError):
            return False
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    if op == "in":
        values = expected if isinstance(expected, list) else [v.strip() for v in str(expected).split(",")]
        return str(actual) in values
    if op == "ne":
        return str(actual) != str(expected)
    return str(actual) == str(expected)


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


def _system_user(session: Session, ctx: dict[str, Any]) -> User | None:
    if ctx.get("actor_id"):
        user = session.get(User, ctx["actor_id"])
        if user:
            return user
    return session.exec(select(User).where(User.role == "admin", User.is_active == True).order_by(User.id)).first()  # noqa: E712


def _links(ctx: dict[str, Any]) -> dict[str, Any]:
    entity, kind = ctx.get("entity") or {}, ctx.get("entity_type")
    links = {
        "contact_id": ctx["contact"].get("id") if ctx.get("contact") else None,
        "company_id": ctx["company"].get("id") if ctx.get("company") else None,
    }
    if kind == "deal":
        links["deal_id"] = entity.get("id")
    elif entity.get("deal_id"):
        links["deal_id"] = entity.get("deal_id")
    if kind == "project":
        links["project_id"] = entity.get("id")
    elif entity.get("project_id"):
        links["project_id"] = entity.get("project_id")
    if kind == "ticket":
        links["ticket_id"] = entity.get("id")
    return {k: v for k, v in links.items() if v}


def run_action(session: Session, action: dict[str, Any], ctx: dict[str, Any]) -> str:
    from ..resources import RESOURCES

    kind = action.get("type")
    cfg = {k: render(v, ctx) for k, v in (action.get("config") or {}).items()}
    user = _system_user(session, ctx)

    if kind == "create_task":
        assignee = cfg.get("assignee") or "owner"
        assignee_id = ctx["owner"].get("id") if assignee == "owner" else (ctx.get("actor_id") if assignee == "actor" else int(assignee) if str(assignee).isdigit() else None)
        due = today() + timedelta(days=int(cfg.get("due_in_days") or 0)) if str(cfg.get("due_in_days") or "").strip() != "" else None
        data = {"title": cfg.get("title") or "Tâche automatique", "description": cfg.get("description"), "priority": cfg.get("priority") or "medium", "assignee_id": assignee_id, "due_date": due.isoformat() if due else None, **_links(ctx)}
        task = RESOURCES["tasks"].create(session, data, user)
        return f"Tâche « {task.title} » créée"

    if kind == "send_email":
        from .mailer import send_email, smtp_ready

        target = cfg.get("to") or "contact"
        email = ctx["contact"].get("email") if target == "contact" else ctx["owner"].get("email") if target == "owner" else cfg.get("email")
        if not email:
            return "Email ignoré : aucun destinataire"
        if target == "contact":
            contact = session.get(Contact, ctx["contact"].get("id")) if ctx.get("contact") else None
            if contact and (contact.do_not_contact or contact.unsubscribed_at):
                return "Email ignoré : le contact s'est opposé aux sollicitations"
        if not smtp_ready(session):
            return "Email non envoyé : SMTP non configuré"
        send_email(session, to=[email], subject=cfg.get("subject") or "(sans objet)", body=cfg.get("body") or "", user=user, **{k: v for k, v in _links(ctx).items() if k in ("contact_id", "company_id", "deal_id", "ticket_id")})
        return f"Email envoyé à {email}"

    if kind == "notify":
        from .listeners import notify

        target = cfg.get("target") or "owner"
        title = cfg.get("title") or "Notification d'automatisation"
        if target == "all":
            for u in session.exec(select(User).where(User.is_active == True)).all():  # noqa: E712
                notify(session, u.id, title, cfg.get("body"), cfg.get("link"), "info")
        else:
            uid = ctx["owner"].get("id") if target == "owner" else ctx.get("actor_id") if target == "actor" else int(target) if str(target).isdigit() else None
            notify(session, uid, title, cfg.get("body"), cfg.get("link"), "info")
        session.commit()
        return "Notification envoyée"

    if kind in ("update_record", "add_tag"):
        entity_type = ctx.get("entity_type")
        entity = ctx.get("entity") or {}
        if not entity.get("id") or entity_type not in ENTITY_RESOURCE:
            return "Action ignorée : aucun élément à modifier"
        resource = RESOURCES[ENTITY_RESOURCE[entity_type]]
        if kind == "add_tag":
            tags = list(entity.get("tags") or [])
            tag = (cfg.get("tag") or "").strip()
            if tag and tag not in tags:
                tags.append(tag)
                resource.update(session, entity["id"], {"tags": tags}, user)
            return f"Tag « {tag} » ajouté"
        resource.update(session, entity["id"], {cfg.get("field"): cfg.get("value")}, user)
        return f"Champ {cfg.get('field')} mis à jour"

    if kind == "create_deal":
        data = {"title": cfg.get("title") or f"Opportunité — {ctx['company'].get('name') or ctx['contact'].get('full_name') or 'nouveau lead'}", "amount": float(cfg.get("amount") or 0), "source": "automatisation"}
        if cfg.get("pipeline_id"):
            data["pipeline_id"] = int(cfg["pipeline_id"])
        links = _links(ctx)
        data.update({k: v for k, v in links.items() if k in ("contact_id", "company_id")})
        deal = RESOURCES["deals"].create(session, data, user)
        return f"Opportunité « {deal.title} » créée"

    if kind == "create_project":
        entity = ctx.get("entity") or {}
        name = cfg.get("name") or f"Projet — {entity.get('title') or entity.get('number') or ctx['company'].get('name') or 'nouveau client'}"
        deal_id = entity.get("id") if ctx.get("entity_type") == "deal" else entity.get("deal_id")
        if deal_id:
            existing = session.exec(select(Project).where(Project.deal_id == deal_id)).first()
            if existing:  # a deal re-opened then won again must not spawn a second project
                return f"Projet « {existing.name} » déjà existant pour cette opportunité"
        data = {"name": name, "billing_mode": cfg.get("billing_mode") or "fixed", "company_id": ctx["company"].get("id") if ctx.get("company") else None, "deal_id": deal_id, "start_date": today().isoformat(), "budget_amount": entity.get("amount") or entity.get("subtotal") or 0}
        project = RESOURCES["projects"].create(session, data, user)
        return f"Projet « {project.name} » créé"

    if kind == "webhook":
        url = cfg.get("url")
        if not url:
            return "Webhook ignoré : URL manquante"
        resp = httpx.post(url, json={"event": ctx["event"], "data": ctx.get("entity") or ctx.get("data")}, timeout=10)
        return f"Webhook appelé ({resp.status_code})"

    if kind == "ai_agent":
        from ..ai.agent import run_background_agent

        instructions = cfg.get("instructions") or ""
        summary = run_background_agent(session, user, instructions, ctx)
        return f"Agent IA : {summary[:300]}"

    return f"Action inconnue : {kind}"


def execute(session: Session, automation: Automation, event: str, payload: dict[str, Any], actor_id: int | None, *, dry_run: bool = False) -> AutomationRun:
    ctx = build_context(session, event, payload, actor_id)
    run = AutomationRun(automation_id=automation.id, event=event, payload={"id": payload.get("id")}, log=[])
    conditions = automation.conditions or []
    if not all(check_condition(ctx, c) for c in conditions):
        run.status = "skipped"
        run.log = ["Conditions non remplies"]
        if not dry_run:
            session.add(run)
            session.commit()
        return run
    logs: list[str] = []
    status = "success"
    for action in automation.actions or []:
        if dry_run:
            logs.append(f"[test] {action.get('type')} : {({k: render(v, ctx) for k, v in (action.get('config') or {}).items()})}")
            continue
        try:
            logs.append(run_action(session, action, ctx))
        except HTTPException as exc:
            session.rollback()
            status = "error"
            logs.append(f"Erreur ({action.get('type')}) : {exc.detail}")
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            status = "error"
            log.exception("Automation %s action failed", automation.id)
            logs.append(f"Erreur ({action.get('type')}) : {exc}")
    run.status = status
    run.log = logs
    if not dry_run:
        automation = session.get(Automation, automation.id) or automation
        automation.run_count = (automation.run_count or 0) + 1
        automation.last_run_at = utcnow()
        automation.last_status = status
        session.add(automation)
        session.add(run)
        session.commit()
    return run


@subscribe
def automation_listener(item: dict[str, Any]) -> None:
    event = item["event"]
    if item.get("depth", 0) >= MAX_DEPTH:
        return
    alias = {"ticket.created_detail": None}
    if event in alias:
        return
    with session_scope() as session:
        autos = session.exec(select(Automation).where(Automation.active == True)).all()  # noqa: E712
        matching = [a for a in autos if (a.trigger or {}).get("type") == event and _trigger_config_ok(a, item)]
        if not matching:
            return
        previous = current_depth()
        set_depth(item.get("depth", 0) + 1)
        try:
            for automation in matching:
                execute(session, automation, event, item.get("payload") or {}, item.get("user_id"))
        finally:
            set_depth(previous)


def _trigger_config_ok(automation: Automation, item: dict[str, Any]) -> bool:
    cfg = (automation.trigger or {}).get("config") or {}
    payload = item.get("payload") or {}
    if cfg.get("to_stage") and payload.get("to_stage") != cfg["to_stage"]:
        return False
    if cfg.get("form_id") and str(payload.get("form_id")) != str(cfg["form_id"]):
        return False
    return True


def run_scheduled(kind: str) -> int:
    with session_scope() as session:
        autos = session.exec(select(Automation).where(Automation.active == True)).all()  # noqa: E712
        matching = [a for a in autos if (a.trigger or {}).get("type") == kind]
        for automation in matching:
            execute(session, automation, kind, {}, None)
        return len(matching)


__all__ = ["ACTIONS", "TRIGGERS", "Deal", "execute", "run_scheduled"]

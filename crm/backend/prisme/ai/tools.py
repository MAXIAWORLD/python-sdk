"""CRM tools exposed to language models.

One registry serves both the in-app assistant (any provider) and the MCP server
(Claude Desktop / Claude Code with a Claude subscription). Every write goes
through the same `Resource` engine as the web UI, so business rules, French
invoicing constraints, audit trail and automations all apply.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

import jsonschema
from fastapi import HTTPException
from sqlmodel import Session, select

from ..models import (
    Activity,
    Contact,
    Deal,
    EmailMessage,
    Invoice,
    Pipeline,
    Product,
    Quote,
    Stage,
    Subscription,
    Task,
    Ticket,
    TicketMessage,
    User,
    today,
)
from ..resources import RESOURCES
from ..serialize import dump_one
from ..services import analytics, audit, invoicing, subscriptions

READ, WRITE, SENSITIVE = "read", "write", "sensitive"

AI_RESOURCES = [
    "contacts", "companies", "deals", "pipelines", "stages", "products", "quotes", "invoices", "payments",
    "subscriptions", "projects", "tasks", "time-entries", "events", "activities", "tickets", "kb-articles",
    "segments", "campaigns", "forms", "email-templates", "documents", "automations", "users",
]
WRITABLE_RESOURCES = [
    "contacts", "companies", "deals", "products", "quotes", "invoices", "subscriptions", "projects", "tasks",
    "time-entries", "events", "activities", "tickets", "kb-articles", "segments", "campaigns", "email-templates",
]

# Compact projections returned in lists (saves tokens).
LIST_FIELDS: dict[str, list[str]] = {
    "contacts": ["id", "full_name", "email", "phone", "job_title", "company", "lifecycle", "lead_score", "source", "owner", "tags", "last_contacted_at", "consent_marketing", "do_not_contact"],
    "companies": ["id", "name", "type", "status", "industry", "city", "country", "website", "siren", "health_score", "owner", "tags"],
    "deals": ["id", "title", "company", "contact", "stage", "status", "amount", "mrr", "value", "probability", "expected_close_date", "next_step", "owner", "priority"],
    "quotes": ["id", "number", "title", "status", "company", "contact", "total", "subtotal", "issue_date", "valid_until", "accepted_at"],
    "invoices": ["id", "number", "kind", "title", "status", "company", "total", "subtotal", "amount_paid", "balance_due", "issue_date", "due_date", "locked"],
    "subscriptions": ["id", "plan", "company", "status", "amount", "quantity", "interval", "mrr", "start_date", "current_period_end"],
    "projects": ["id", "code", "name", "company", "status", "health", "progress", "budget_amount", "budget_hours", "start_date", "due_date"],
    "tasks": ["id", "title", "status", "priority", "type", "due_date", "assignee", "project", "contact", "company", "deal"],
    "events": ["id", "title", "type", "start_at", "end_at", "location", "meeting_url", "contact", "company"],
    "activities": ["id", "type", "subject", "body", "occurred_at", "contact", "company", "deal", "user"],
    "tickets": ["id", "number", "subject", "status", "priority", "channel", "company", "contact", "assignee", "sla_due_at", "created_at"],
    "products": ["id", "name", "sku", "kind", "unit_price", "unit", "vat_rate", "recurring_interval", "active"],
    "time-entries": ["id", "date", "minutes", "description", "billable", "project", "user", "invoice_id"],
    "payments": ["id", "invoice", "amount", "date", "method", "reference"],
    "kb-articles": ["id", "title", "category", "status", "summary"],
    "users": ["id", "name", "email", "role", "title", "is_active"],
}


class ToolError(Exception):
    pass


@dataclass
class ToolContext:
    session: Session
    user: User
    channel: str = "assistant"  # assistant | mcp | automation


@dataclass
class Tool:
    name: str
    description: str
    schema: dict[str, Any]
    handler: Callable[[ToolContext, dict[str, Any]], Any]
    risk: str = READ
    title: str = ""
    summarize: Callable[[dict[str, Any]], str] | None = field(default=None)

    def spec(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "input_schema": self.schema}


TOOLS: dict[str, Tool] = {}


def tool(name: str, title: str, description: str, schema: dict[str, Any], risk: str = READ, summarize: Callable | None = None):
    full_schema = {"type": "object", "properties": schema.get("properties", {}), "required": schema.get("required", []), "additionalProperties": False}

    def decorator(fn: Callable[[ToolContext, dict[str, Any]], Any]) -> Callable:
        TOOLS[name] = Tool(name=name, title=title, description=description, schema=full_schema, handler=fn, risk=risk, summarize=summarize)
        return fn

    return decorator


def _project(items: list[dict[str, Any]], resource: str) -> list[dict[str, Any]]:
    fields = LIST_FIELDS.get(resource)
    if not fields:
        return items
    out = []
    for item in items:
        row = {}
        for f in fields:
            if f not in item:
                continue
            v = item[f]
            if isinstance(v, dict):
                v = v.get("name")
            if v in (None, "", [], {}):
                continue
            row[f] = v
        out.append(row)
    return out


def _link(resource: str, obj_id: int | None) -> str | None:
    paths = {
        "contacts": "contacts", "companies": "companies", "deals": "deals", "quotes": "quotes", "invoices": "invoices",
        "projects": "projects", "tickets": "tickets", "subscriptions": "subscriptions", "tasks": "tasks", "events": "calendar",
        "products": "products", "kb-articles": "kb", "campaigns": "campaigns",
    }
    if obj_id is None or resource not in paths:
        return None
    if resource in ("tasks", "events", "products"):
        return f"/{paths[resource]}"
    return f"/{paths[resource]}/{obj_id}"


def _resolve_stage(session: Session, deal: Deal | None, stage: str | int | None, pipeline_id: int | None = None) -> Stage | None:
    if stage in (None, ""):
        return None
    if isinstance(stage, int) or (isinstance(stage, str) and stage.isdigit()):
        return session.get(Stage, int(stage))
    pid = pipeline_id or (deal.pipeline_id if deal else None)
    stmt = select(Stage)
    if pid:
        stmt = stmt.where(Stage.pipeline_id == pid)
    stages = session.exec(stmt).all()
    target = str(stage).strip().lower()
    for st in stages:
        if st.name.lower() == target:
            return st
    for st in stages:
        if target in st.name.lower():
            return st
    if target in ("gagné", "gagne", "won", "signé"):
        return next((s for s in stages if s.is_won), None)
    if target in ("perdu", "lost"):
        return next((s for s in stages if s.is_lost), None)
    return None


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


@tool(
    "search_crm",
    "Rechercher dans le CRM",
    "Recherche plein texte dans tout le CRM (contacts, entreprises, opportunités, devis, factures, tickets, projets, tâches, produits, articles). "
    "Utilise-le dès que l'utilisateur cite un nom, une entreprise, un numéro de devis/facture ou un sujet sans donner d'identifiant.",
    {"properties": {"query": {"type": "string", "description": "Texte recherché (nom, email, numéro, mot-clé)"}}, "required": ["query"]},
)
def search_crm(ctx: ToolContext, args: dict[str, Any]) -> Any:
    results = analytics.search(ctx.session, args["query"], limit=6)
    for r in results:
        r["link"] = _link(r["type"], r["id"])
    return {"results": results, "count": len(results)}


@tool(
    "list_records",
    "Lister des éléments",
    "Liste et filtre des éléments d'un module du CRM. Filtres au format {champ: valeur} ; suffixes possibles : __gte, __lte, __gt, __lt, __in (valeurs séparées par des virgules), __ne, __contains, __isnull. "
    "Exemples : {\"status\": \"open\"}, {\"due_date__lte\": \"2026-10-31\"}, {\"tags__contains\": \"vip\"}, {\"lifecycle__in\": \"lead,mql\"}. "
    "Tri : champ, préfixé de « - » pour décroissant. Utilise-le pour toute question quantitative ou de liste (ex. « mes deals en cours », « factures en retard »).",
    {
        "properties": {
            "resource": {"type": "string", "enum": AI_RESOURCES, "description": "Module à interroger"},
            "filters": {"type": "object", "description": "Filtres champ -> valeur", "additionalProperties": True},
            "search": {"type": "string", "description": "Recherche texte optionnelle"},
            "sort": {"type": "string", "description": "Tri, ex. -amount ou due_date"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100, "description": "Nombre max d'éléments (défaut 25)"},
        },
        "required": ["resource"],
    },
)
def list_records(ctx: ToolContext, args: dict[str, Any]) -> Any:
    resource = RESOURCES[args["resource"]]
    params: list[tuple[str, Any]] = [(k, v if not isinstance(v, list) else ",".join(map(str, v))) for k, v in (args.get("filters") or {}).items()]
    if args.get("search"):
        params.append(("q", args["search"]))
    if args.get("sort"):
        params.append(("sort", args["sort"]))
    params.append(("limit", int(args.get("limit") or 25)))
    data = resource.list(ctx.session, params, ctx.user)
    items = _project(data["items"], args["resource"])
    return {"resource": args["resource"], "total": data["total"], "returned": len(items), "items": items}


def _related(session: Session, resource: str, obj: dict[str, Any]) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    oid = obj["id"]
    if resource in ("contacts", "companies", "deals"):
        col = {"contacts": "contact_id", "companies": "company_id", "deals": "deal_id"}[resource]
        acts = session.exec(select(Activity).where(getattr(Activity, col) == oid).order_by(Activity.occurred_at.desc()).limit(12)).all()
        extra["timeline"] = [{"type": a.type, "subject": a.subject, "body": (a.body or "")[:400], "at": a.occurred_at.isoformat() if a.occurred_at else None} for a in acts]
        tasks = session.exec(select(Task).where(getattr(Task, col) == oid, Task.status.notin_(["done", "cancelled"]))).all()
        extra["open_tasks"] = [{"id": t.id, "title": t.title, "due_date": t.due_date.isoformat() if t.due_date else None} for t in tasks]
    if resource in ("contacts", "companies"):
        col = "contact_id" if resource == "contacts" else "company_id"
        deals = session.exec(select(Deal).where(getattr(Deal, col) == oid)).all()
        extra["deals"] = [{"id": d.id, "title": d.title, "status": d.status, "value": d.value} for d in deals]
        invoices = session.exec(select(Invoice).where(getattr(Invoice, col) == oid).order_by(Invoice.issue_date.desc()).limit(10)).all()
        extra["invoices"] = [{"id": i.id, "number": i.number or "Brouillon", "status": i.status, "total": i.total, "balance_due": i.balance_due} for i in invoices]
        tickets = session.exec(select(Ticket).where(getattr(Ticket, col) == oid).order_by(Ticket.created_at.desc()).limit(5)).all()
        extra["tickets"] = [{"id": t.id, "number": t.number, "subject": t.subject, "status": t.status} for t in tickets]
        emails = session.exec(select(EmailMessage).where(getattr(EmailMessage, col) == oid).order_by(EmailMessage.sent_at.desc()).limit(5)).all()
        extra["recent_emails"] = [{"direction": e.direction, "subject": e.subject, "at": e.sent_at.isoformat() if e.sent_at else None} for e in emails]
    if resource == "companies":
        contacts = session.exec(select(Contact).where(Contact.company_id == oid)).all()
        extra["contacts"] = [{"id": c.id, "name": c.full_name, "email": c.email, "job_title": c.job_title} for c in contacts]
        subs = session.exec(select(Subscription).where(Subscription.company_id == oid)).all()
        extra["subscriptions"] = [{"id": s.id, "plan": s.plan, "status": s.status, "mrr": s.mrr} for s in subs]
    if resource == "tickets":
        msgs = session.exec(select(TicketMessage).where(TicketMessage.ticket_id == oid).order_by(TicketMessage.created_at)).all()
        extra["messages"] = [{"author": m.author_name or m.author_type, "type": m.author_type, "internal": m.is_internal, "body": m.body[:1500]} for m in msgs]
    return extra


@tool(
    "get_record",
    "Ouvrir une fiche",
    "Récupère la fiche complète d'un élément par son identifiant, avec son contexte (historique, tâches ouvertes, opportunités, factures, tickets, messages...). "
    "Utilise-le avant de résumer, analyser ou modifier un élément précis.",
    {
        "properties": {
            "resource": {"type": "string", "enum": AI_RESOURCES},
            "id": {"type": "integer", "description": "Identifiant de l'élément"},
        },
        "required": ["resource", "id"],
    },
)
def get_record(ctx: ToolContext, args: dict[str, Any]) -> Any:
    data = RESOURCES[args["resource"]].get(ctx.session, int(args["id"]), ctx.user)
    for noisy in ("public_token", "signature", "hash", "prev_hash", "seller"):
        data.pop(noisy, None)
    data["related"] = _related(ctx.session, args["resource"], data)
    data["link"] = _link(args["resource"], data["id"])
    return data


@tool(
    "get_metrics",
    "Indicateurs clés",
    "Renvoie les indicateurs de pilotage : chiffre d'affaires (mois, année), encaissements, créances et retards, MRR/ARR/churn/NRR, pipeline ouvert et pondéré, taux de conversion, leads, tickets. "
    "scope='dashboard' pour la vue d'ensemble, 'saas' pour le détail des abonnements, 'reports' pour les rapports détaillés (ventes par commercial, produits, temps passé, support).",
    {"properties": {"scope": {"type": "string", "enum": ["dashboard", "saas", "reports", "pipeline"], "description": "Périmètre (par défaut : dashboard)"}}},
)
def get_metrics(ctx: ToolContext, args: dict[str, Any]) -> Any:
    scope = args.get("scope") or "dashboard"
    if scope == "saas":
        data = subscriptions.metrics(ctx.session, 12)
        data["series"] = data["series"][-6:]
        return data
    if scope == "reports":
        data = analytics.reports(ctx.session)
        data.pop("saas", None)
        return data
    if scope == "pipeline":
        return analytics.pipeline_summary(ctx.session)
    data = analytics.dashboard(ctx.session, ctx.user)
    return {
        "kpis": data["kpis"],
        "revenue_last_6_months": data["revenue_series"][-6:],
        "pipeline_by_stage": [{k: s[k] for k in ("name", "count", "value", "weighted")} for s in data["pipeline"]["stages"]],
        "deals_at_risk": _project(data["deals_at_risk"], "deals"),
        "my_tasks": _project(data["my_tasks"], "tasks"),
        "upcoming_events": _project(data["upcoming_events"], "events"),
        "renewals": data["renewals"],
    }


@tool(
    "get_pipeline",
    "Voir le pipeline",
    "Liste les pipelines de vente avec leurs étapes (identifiants, probabilités) et le nombre/valeur d'opportunités par étape. Utile avant de créer ou déplacer une opportunité.",
    {"properties": {}, "required": []},
)
def get_pipeline(ctx: ToolContext, args: dict[str, Any]) -> Any:
    out = []
    for p in ctx.session.exec(select(Pipeline).order_by(Pipeline.position)).all():
        summary = analytics.pipeline_summary(ctx.session, p.id)
        out.append({"id": p.id, "name": p.name, "is_default": p.is_default, "stages": [{k: s[k] for k in ("id", "name", "probability", "count", "value", "is_won", "is_lost")} for s in summary["stages"]]})
    return {"pipelines": out}


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def _summ_create(args: dict[str, Any]) -> str:
    data = args.get("data") or {}
    label = data.get("title") or data.get("name") or " ".join(x for x in [data.get("first_name"), data.get("last_name")] if x) or data.get("subject") or data.get("plan") or ""
    return f"Créer {args.get('resource')} : {label}".strip()


@tool(
    "create_record",
    "Créer un élément",
    "Crée un élément dans le CRM (contact, entreprise, opportunité, tâche, événement, ticket, projet, produit, abonnement, activité/note, article, segment, campagne...). "
    "Les liens se font par identifiants (company_id, contact_id, deal_id, project_id, owner_id, assignee_id). Dates au format AAAA-MM-JJ ; date-heures en ISO 8601 avec fuseau. "
    "Recherche d'abord les éléments existants pour éviter les doublons.",
    {
        "properties": {
            "resource": {"type": "string", "enum": WRITABLE_RESOURCES},
            "data": {"type": "object", "description": "Champs de l'élément", "additionalProperties": True},
        },
        "required": ["resource", "data"],
    },
    risk=WRITE,
    summarize=_summ_create,
)
def create_record(ctx: ToolContext, args: dict[str, Any]) -> Any:
    resource = RESOURCES[args["resource"]]
    obj = resource.create(ctx.session, dict(args.get("data") or {}), ctx.user)
    data = dump_one(ctx.session, obj)
    return {"created": args["resource"], "id": obj.id, "item": _project([data], args["resource"])[0], "link": _link(args["resource"], obj.id)}


@tool(
    "update_record",
    "Modifier un élément",
    "Met à jour les champs d'un élément existant (seuls les champs fournis changent). Pour changer l'étape d'une opportunité, préfère move_deal.",
    {
        "properties": {
            "resource": {"type": "string", "enum": WRITABLE_RESOURCES},
            "id": {"type": "integer"},
            "data": {"type": "object", "description": "Champs à modifier", "additionalProperties": True},
        },
        "required": ["resource", "id", "data"],
    },
    risk=WRITE,
    summarize=lambda a: f"Modifier {a.get('resource')} #{a.get('id')} : {', '.join((a.get('data') or {}).keys())}",
)
def update_record(ctx: ToolContext, args: dict[str, Any]) -> Any:
    resource = RESOURCES[args["resource"]]
    obj = resource.update(ctx.session, int(args["id"]), dict(args.get("data") or {}), ctx.user)
    data = dump_one(ctx.session, obj)
    return {"updated": args["resource"], "id": obj.id, "item": _project([data], args["resource"])[0], "link": _link(args["resource"], obj.id)}


@tool(
    "delete_record",
    "Supprimer un élément",
    "Supprime définitivement un élément. À n'utiliser que sur demande explicite de l'utilisateur. Les factures émises ne peuvent pas être supprimées (émettre un avoir).",
    {"properties": {"resource": {"type": "string", "enum": WRITABLE_RESOURCES}, "id": {"type": "integer"}}, "required": ["resource", "id"]},
    risk=SENSITIVE,
    summarize=lambda a: f"Supprimer {a.get('resource')} #{a.get('id')}",
)
def delete_record(ctx: ToolContext, args: dict[str, Any]) -> Any:
    data = RESOURCES[args["resource"]].delete(ctx.session, int(args["id"]), ctx.user)
    return {"deleted": args["resource"], "id": int(args["id"]), "label": data.get("title") or data.get("name") or data.get("number")}


@tool(
    "move_deal",
    "Déplacer une opportunité",
    "Change l'étape d'une opportunité (par nom ou identifiant d'étape), ou la marque gagnée/perdue (stage='Gagné' / 'Perdu', avec lost_reason si perdue).",
    {
        "properties": {
            "deal_id": {"type": "integer"},
            "stage": {"type": "string", "description": "Nom ou identifiant de l'étape cible"},
            "lost_reason": {"type": "string"},
            "next_step": {"type": "string", "description": "Prochaine étape commerciale (optionnel)"},
        },
        "required": ["deal_id", "stage"],
    },
    risk=WRITE,
    summarize=lambda a: f"Passer l'opportunité #{a.get('deal_id')} à l'étape « {a.get('stage')} »",
)
def move_deal(ctx: ToolContext, args: dict[str, Any]) -> Any:
    deal = ctx.session.get(Deal, int(args["deal_id"]))
    if deal is None:
        raise ToolError("Opportunité introuvable.")
    stage = _resolve_stage(ctx.session, deal, args["stage"])
    if stage is None:
        stages = ctx.session.exec(select(Stage).where(Stage.pipeline_id == deal.pipeline_id).order_by(Stage.position)).all()
        raise ToolError("Étape inconnue. Étapes disponibles : " + ", ".join(s.name for s in stages))
    data: dict[str, Any] = {"stage_id": stage.id}
    if args.get("lost_reason"):
        data["lost_reason"] = args["lost_reason"]
    if args.get("next_step"):
        data["next_step"] = args["next_step"]
    RESOURCES["deals"].update(ctx.session, deal.id, data, ctx.user)
    return {"deal_id": deal.id, "title": deal.title, "stage": stage.name, "status": "won" if stage.is_won else "lost" if stage.is_lost else "open", "link": _link("deals", deal.id)}


@tool(
    "log_activity",
    "Journaliser une activité",
    "Ajoute une note, un appel, une réunion ou un email à l'historique d'un contact / d'une entreprise / d'une opportunité (compte-rendu, résumé d'échange).",
    {
        "properties": {
            "type": {"type": "string", "enum": ["note", "call", "meeting", "email"]},
            "subject": {"type": "string"},
            "body": {"type": "string", "description": "Contenu (markdown)"},
            "contact_id": {"type": "integer"},
            "company_id": {"type": "integer"},
            "deal_id": {"type": "integer"},
            "outcome": {"type": "string", "description": "Issue de l'appel (ex. joint, messagerie, pas de réponse)"},
            "duration_minutes": {"type": "integer"},
        },
        "required": ["type", "subject"],
    },
    risk=WRITE,
    summarize=lambda a: f"Ajouter {a.get('type')} : {a.get('subject')}",
)
def log_activity(ctx: ToolContext, args: dict[str, Any]) -> Any:
    obj = RESOURCES["activities"].create(ctx.session, dict(args), ctx.user)
    return {"activity_id": obj.id, "type": obj.type, "subject": obj.subject}


def _quote_lines(session: Session, lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for line in lines or []:
        item = dict(line)
        if item.get("product_id"):
            product = session.get(Product, int(item["product_id"]))
            if product:
                item.setdefault("description", product.name)
                item.setdefault("unit_price", product.unit_price)
                item.setdefault("unit", product.unit)
                item.setdefault("vat_rate", product.vat_rate)
        elif item.get("product"):
            product = session.exec(select(Product).where(Product.name.ilike(f"%{item['product']}%"))).first()
            if product:
                item["product_id"] = product.id
                item.setdefault("description", product.name)
                item.setdefault("unit_price", product.unit_price)
                item.setdefault("unit", product.unit)
                item.setdefault("vat_rate", product.vat_rate)
            item.pop("product", None)
        out.append(item)
    return out


LINE_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["item", "section", "text"], "description": "item (défaut), section (titre) ou text (commentaire)"},
        "product_id": {"type": "integer"},
        "product": {"type": "string", "description": "Nom d'un produit du catalogue (rempli automatiquement prix/unité/TVA)"},
        "description": {"type": "string"},
        "details": {"type": "string"},
        "quantity": {"type": "number"},
        "unit": {"type": "string", "description": "heure, jour, mois, an, forfait, unité, licence, utilisateur"},
        "unit_price": {"type": "number", "description": "Prix unitaire HT en euros"},
        "vat_rate": {"type": "number", "description": "Taux de TVA (20, 10, 5.5, 2.1, 0)"},
        "discount": {"type": "number", "description": "Remise en %"},
    },
    "additionalProperties": False,
}


@tool(
    "create_quote",
    "Créer un devis",
    "Crée un devis (brouillon) pour une entreprise et/ou un contact, avec des lignes (produits du catalogue ou lignes libres, prix HT). "
    "Utilise list_records sur products pour retrouver le catalogue. Le devis reste un brouillon modifiable.",
    {
        "properties": {
            "company_id": {"type": "integer"},
            "contact_id": {"type": "integer"},
            "deal_id": {"type": "integer"},
            "title": {"type": "string"},
            "lines": {"type": "array", "items": LINE_SCHEMA},
            "discount": {"type": "number", "description": "Remise globale en %"},
            "deposit_percent": {"type": "number", "description": "Acompte demandé à la commande (%)"},
            "notes": {"type": "string"},
            "valid_days": {"type": "integer", "description": "Durée de validité en jours"},
        },
        "required": ["lines"],
    },
    risk=WRITE,
    summarize=lambda a: f"Créer un devis « {a.get('title') or 'sans titre'} » ({len(a.get('lines') or [])} ligne(s))",
)
def create_quote(ctx: ToolContext, args: dict[str, Any]) -> Any:
    data = {k: v for k, v in args.items() if k in ("company_id", "contact_id", "deal_id", "title", "discount", "deposit_percent", "notes")}
    data["lines"] = _quote_lines(ctx.session, args.get("lines") or [])
    if args.get("valid_days"):
        data["valid_until"] = (today() + timedelta(days=int(args["valid_days"]))).isoformat()
    quote = RESOURCES["quotes"].create(ctx.session, data, ctx.user)
    return {"quote_id": quote.id, "number": quote.number, "subtotal": quote.subtotal, "tax_total": quote.tax_total, "total": quote.total, "link": _link("quotes", quote.id)}


@tool(
    "create_invoice",
    "Créer une facture (brouillon)",
    "Crée une facture en BROUILLON (non émise, modifiable). L'émission légale se fait ensuite avec issue_invoice après validation par l'utilisateur.",
    {
        "properties": {
            "company_id": {"type": "integer"},
            "contact_id": {"type": "integer"},
            "deal_id": {"type": "integer"},
            "project_id": {"type": "integer"},
            "title": {"type": "string"},
            "lines": {"type": "array", "items": LINE_SCHEMA},
            "discount": {"type": "number"},
            "service_date": {"type": "string", "description": "Date de la prestation AAAA-MM-JJ"},
            "notes": {"type": "string"},
        },
        "required": ["lines"],
    },
    risk=WRITE,
    summarize=lambda a: f"Créer une facture brouillon « {a.get('title') or 'sans titre'} »",
)
def create_invoice(ctx: ToolContext, args: dict[str, Any]) -> Any:
    data = {k: v for k, v in args.items() if k in ("company_id", "contact_id", "deal_id", "project_id", "title", "discount", "service_date", "notes")}
    data["lines"] = _quote_lines(ctx.session, args.get("lines") or [])
    invoice = RESOURCES["invoices"].create(ctx.session, data, ctx.user)
    return {"invoice_id": invoice.id, "status": "draft", "total": invoice.total, "link": _link("invoices", invoice.id)}


@tool(
    "convert_quote",
    "Facturer un devis",
    "Transforme un devis accepté en facture brouillon (ou en facture d'acompte si deposit_percent est fourni).",
    {"properties": {"quote_id": {"type": "integer"}, "deposit_percent": {"type": "number"}}, "required": ["quote_id"]},
    risk=WRITE,
    summarize=lambda a: f"Transformer le devis #{a.get('quote_id')} en facture" + (f" d'acompte ({a['deposit_percent']} %)" if a.get("deposit_percent") else ""),
)
def convert_quote(ctx: ToolContext, args: dict[str, Any]) -> Any:
    quote = ctx.session.get(Quote, int(args["quote_id"]))
    if quote is None:
        raise ToolError("Devis introuvable.")
    invoice = invoicing.quote_to_invoice(ctx.session, quote, ctx.user, deposit_percent=args.get("deposit_percent"))
    return {"invoice_id": invoice.id, "status": invoice.status, "total": invoice.total, "link": _link("invoices", invoice.id)}


@tool(
    "issue_invoice",
    "Émettre une facture",
    "Émet définitivement une facture brouillon : attribution du numéro légal, verrouillage (inaltérable), mentions obligatoires figées. Action irréversible : ne l'utilise que si l'utilisateur le demande explicitement.",
    {"properties": {"invoice_id": {"type": "integer"}}, "required": ["invoice_id"]},
    risk=SENSITIVE,
    summarize=lambda a: f"Émettre définitivement la facture #{a.get('invoice_id')}",
)
def issue_invoice(ctx: ToolContext, args: dict[str, Any]) -> Any:
    invoice = ctx.session.get(Invoice, int(args["invoice_id"]))
    if invoice is None:
        raise ToolError("Facture introuvable.")
    result = invoicing.issue_invoice(ctx.session, invoice, ctx.user)
    return {"invoice_id": invoice.id, "number": invoice.number, "total": invoice.total, "warnings": result["warnings"], "link": _link("invoices", invoice.id)}


@tool(
    "record_payment",
    "Enregistrer un paiement",
    "Enregistre un règlement reçu sur une facture émise (virement, carte, crypto, chèque...).",
    {
        "properties": {
            "invoice_id": {"type": "integer"},
            "amount": {"type": "number", "description": "Montant TTC reçu (défaut : solde restant)"},
            "date": {"type": "string", "description": "AAAA-MM-JJ"},
            "method": {"type": "string", "enum": ["transfer", "card", "crypto", "check", "cash", "stripe", "paypal", "direct_debit", "other"]},
            "reference": {"type": "string"},
            "tx_hash": {"type": "string", "description": "Hash de transaction (paiement crypto)"},
        },
        "required": ["invoice_id"],
    },
    risk=SENSITIVE,
    summarize=lambda a: f"Enregistrer un paiement sur la facture #{a.get('invoice_id')}" + (f" : {a['amount']} €" if a.get("amount") else ""),
)
def record_payment(ctx: ToolContext, args: dict[str, Any]) -> Any:
    invoice = ctx.session.get(Invoice, int(args["invoice_id"]))
    if invoice is None:
        raise ToolError("Facture introuvable.")
    payment = invoicing.record_payment(ctx.session, invoice, args, ctx.user)
    return {"payment_id": payment.id, "invoice": invoice.number, "invoice_status": invoice.status, "balance_due": invoice.balance_due}


@tool(
    "send_email",
    "Envoyer un email",
    "Envoie un email depuis le CRM (SMTP configuré) et l'ajoute à l'historique. Rédige un message clair et professionnel. "
    "Ne contacte jamais une personne qui s'est opposée aux sollicitations (do_not_contact) ou désinscrite. L'utilisateur valide avant l'envoi.",
    {
        "properties": {
            "to": {"type": "array", "items": {"type": "string"}, "description": "Adresses email"},
            "subject": {"type": "string"},
            "body": {"type": "string", "description": "Corps du message (markdown simple)"},
            "contact_id": {"type": "integer"},
            "company_id": {"type": "integer"},
            "deal_id": {"type": "integer"},
        },
        "required": ["to", "subject", "body"],
    },
    risk=SENSITIVE,
    summarize=lambda a: f"Envoyer l'email « {a.get('subject')} » à {', '.join(a.get('to') or [])}",
)
def send_email_tool(ctx: ToolContext, args: dict[str, Any]) -> Any:
    from ..services.mailer import send_email

    for address in args.get("to") or []:
        contact = ctx.session.exec(select(Contact).where(Contact.email == address.lower())).first()
        if contact and (contact.do_not_contact or contact.unsubscribed_at):
            raise ToolError(f"{address} s'est opposé(e) aux sollicitations : envoi bloqué (RGPD).")
    row = send_email(
        ctx.session,
        to=args["to"],
        subject=args["subject"],
        body=args["body"],
        user=ctx.user,
        contact_id=args.get("contact_id"),
        company_id=args.get("company_id"),
        deal_id=args.get("deal_id"),
    )
    return {"email_id": row.id, "status": row.status, "to": row.to}


@tool(
    "reply_ticket",
    "Répondre à un ticket",
    "Ajoute une réponse à un ticket de support (ou une note interne si internal=true) et met à jour son statut si demandé.",
    {
        "properties": {
            "ticket_id": {"type": "integer"},
            "body": {"type": "string"},
            "internal": {"type": "boolean", "description": "Note interne non visible du client"},
            "status": {"type": "string", "enum": ["open", "pending", "on_hold", "resolved", "closed"]},
        },
        "required": ["ticket_id", "body"],
    },
    risk=WRITE,
    summarize=lambda a: f"{'Note interne' if a.get('internal') else 'Réponse'} sur le ticket #{a.get('ticket_id')}",
)
def reply_ticket(ctx: ToolContext, args: dict[str, Any]) -> Any:
    ticket = ctx.session.get(Ticket, int(args["ticket_id"]))
    if ticket is None:
        raise ToolError("Ticket introuvable.")
    RESOURCES["ticket-messages"].create(ctx.session, {"ticket_id": ticket.id, "body": args["body"], "is_internal": bool(args.get("internal")), "author_type": "agent"}, ctx.user)
    if args.get("status"):
        RESOURCES["tickets"].update(ctx.session, ticket.id, {"status": args["status"]}, ctx.user)
    return {"ticket": ticket.number, "status": args.get("status") or ticket.status, "link": _link("tickets", ticket.id)}


@tool(
    "create_task",
    "Créer une tâche",
    "Crée une tâche / relance avec échéance (AAAA-MM-JJ), priorité et liens éventuels vers un contact, une entreprise, une opportunité ou un projet.",
    {
        "properties": {
            "title": {"type": "string"},
            "description": {"type": "string"},
            "due_date": {"type": "string"},
            "due_time": {"type": "string", "description": "HH:MM"},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
            "type": {"type": "string", "enum": ["todo", "call", "email", "meeting", "follow_up", "deadline"]},
            "assignee_id": {"type": "integer"},
            "contact_id": {"type": "integer"},
            "company_id": {"type": "integer"},
            "deal_id": {"type": "integer"},
            "project_id": {"type": "integer"},
        },
        "required": ["title"],
    },
    risk=WRITE,
    summarize=lambda a: f"Créer la tâche « {a.get('title')} »" + (f" pour le {a['due_date']}" if a.get("due_date") else ""),
)
def create_task(ctx: ToolContext, args: dict[str, Any]) -> Any:
    task = RESOURCES["tasks"].create(ctx.session, dict(args), ctx.user)
    return {"task_id": task.id, "title": task.title, "due_date": task.due_date.isoformat() if task.due_date else None}


@tool(
    "schedule_event",
    "Planifier un rendez-vous",
    "Ajoute un événement à l'agenda (réunion, appel, démo...). Dates-heures ISO 8601 avec fuseau (Europe/Paris par défaut, ex. 2026-10-14T14:30:00+02:00).",
    {
        "properties": {
            "title": {"type": "string"},
            "start_at": {"type": "string"},
            "end_at": {"type": "string"},
            "type": {"type": "string", "enum": ["meeting", "call", "demo", "deadline", "focus", "personal", "other"]},
            "location": {"type": "string"},
            "meeting_url": {"type": "string"},
            "description": {"type": "string"},
            "contact_id": {"type": "integer"},
            "company_id": {"type": "integer"},
            "deal_id": {"type": "integer"},
        },
        "required": ["title", "start_at"],
    },
    risk=WRITE,
    summarize=lambda a: f"Planifier « {a.get('title')} » le {a.get('start_at')}",
)
def schedule_event(ctx: ToolContext, args: dict[str, Any]) -> Any:
    event = RESOURCES["events"].create(ctx.session, dict(args), ctx.user)
    return {"event_id": event.id, "title": event.title, "start_at": event.start_at.isoformat()}


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------


def tool_specs() -> list[dict[str, Any]]:
    """Deterministic order: keeps the prompt prefix stable (prompt caching)."""
    return [TOOLS[name].spec() for name in sorted(TOOLS)]


def validate(tool_obj: Tool, args: Any) -> dict[str, Any]:
    if not isinstance(args, dict):
        raise ToolError("Arguments invalides : un objet JSON est attendu.")
    try:
        jsonschema.validate(args, tool_obj.schema)
    except jsonschema.ValidationError as exc:
        raise ToolError(f"Arguments invalides : {exc.message}") from exc
    return args


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def execute(ctx: ToolContext, name: str, args: dict[str, Any]) -> tuple[bool, str, dict[str, Any] | None]:
    """Run a tool. Returns (ok, json text for the model, structured data for the UI)."""
    tool_obj = TOOLS.get(name)
    if tool_obj is None:
        return False, json.dumps({"error": f"Outil inconnu : {name}"}, ensure_ascii=False), None
    try:
        validate(tool_obj, args)
        result = tool_obj.handler(ctx, args)
        if tool_obj.risk != READ:
            audit.record(ctx.session, "ai", ctx.user.id, "tool", None, f"{ctx.channel}: {name}", {"args": args})
            ctx.session.commit()
        text = json.dumps(result, ensure_ascii=False, default=_json_default)
        if len(text) > 60_000:
            text = text[:60_000] + "… (résultat tronqué)"
        return True, text, result if isinstance(result, dict) else {"result": result}
    except ToolError as exc:
        ctx.session.rollback()
        return False, json.dumps({"error": str(exc)}, ensure_ascii=False), None
    except HTTPException as exc:
        ctx.session.rollback()
        detail = exc.detail
        if isinstance(detail, dict):
            detail = detail.get("message", "") + " " + " ".join(detail.get("errors", []))
        return False, json.dumps({"error": str(detail)}, ensure_ascii=False), None
    except Exception as exc:  # noqa: BLE001
        ctx.session.rollback()
        return False, json.dumps({"error": f"Erreur interne : {exc}"}, ensure_ascii=False), None


def needs_approval(name: str, require_approval: bool) -> bool:
    tool_obj = TOOLS.get(name)
    if tool_obj is None:
        return False
    if tool_obj.risk == SENSITIVE:
        return True
    return tool_obj.risk == WRITE and require_approval


def describe_call(name: str, args: dict[str, Any]) -> str:
    tool_obj = TOOLS.get(name)
    if tool_obj and tool_obj.summarize:
        try:
            return tool_obj.summarize(args)
        except Exception:  # noqa: BLE001
            pass
    return tool_obj.title if tool_obj else name

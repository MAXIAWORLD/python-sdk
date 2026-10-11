"""Dashboard KPIs, reports and global search."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import String, cast, or_
from sqlmodel import Session, func, select

from ..models import (
    Activity,
    Company,
    Contact,
    Deal,
    Event,
    Invoice,
    KbArticle,
    Payment,
    Pipeline,
    Product,
    Project,
    Quote,
    Stage,
    Task,
    Ticket,
    TimeEntry,
    User,
    today,
    utcnow,
)
from ..serialize import dump_many, iso
from . import subscriptions

MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, n: int) -> date:
    y, m = d.year, d.month + n
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def _dt(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _pct(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


def revenue_between(session: Session, start: date, end: date) -> float:
    """CA HT facturé (factures + acomptes − avoirs) sur la période [start, end)."""
    value = session.exec(
        select(func.coalesce(func.sum(Invoice.subtotal), 0)).where(Invoice.locked == True, Invoice.issue_date >= start, Invoice.issue_date < end)  # noqa: E712
    ).one()
    return round(float(value or 0), 2)


def cash_between(session: Session, start: date, end: date) -> float:
    value = session.exec(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.date >= start, Payment.date < end)).one()
    return round(float(value or 0), 2)


def revenue_series(session: Session, months: int = 12) -> list[dict[str, Any]]:
    start = _add_months(_month_start(today()), -(months - 1))
    invoices = session.exec(select(Invoice).where(Invoice.locked == True, Invoice.issue_date >= start)).all()  # noqa: E712
    payments = session.exec(select(Payment).where(Payment.date >= start)).all()
    rev: dict[str, float] = defaultdict(float)
    cash: dict[str, float] = defaultdict(float)
    for inv in invoices:
        rev[f"{inv.issue_date.year}-{inv.issue_date.month:02d}"] += inv.subtotal or 0
    for p in payments:
        cash[f"{p.date.year}-{p.date.month:02d}"] += p.amount or 0
    out = []
    for i in range(months):
        d = _add_months(start, i)
        key = f"{d.year}-{d.month:02d}"
        out.append({"month": key, "label": f"{MONTHS_FR[d.month - 1]} {str(d.year)[2:]}", "revenue": round(rev[key], 2), "cash": round(cash[key], 2)})
    return out


def pipeline_summary(session: Session, pipeline_id: int | None = None) -> dict[str, Any]:
    if pipeline_id is None:
        pipe = session.exec(select(Pipeline).order_by(Pipeline.is_default.desc(), Pipeline.position)).first()
        pipeline_id = pipe.id if pipe else None
    if pipeline_id is None:
        return {"stages": [], "open_value": 0, "weighted_value": 0, "open_count": 0}
    stages = session.exec(select(Stage).where(Stage.pipeline_id == pipeline_id).order_by(Stage.position)).all()
    deals = session.exec(select(Deal).where(Deal.pipeline_id == pipeline_id)).all()
    by_stage = []
    open_value = weighted = 0.0
    open_count = 0
    for st in stages:
        ds = [d for d in deals if d.stage_id == st.id]
        value = sum(d.value for d in ds)
        prob = st.probability
        w = sum(d.value * ((d.probability if d.probability is not None else prob) / 100) for d in ds)
        by_stage.append({"id": st.id, "name": st.name, "color": st.color, "count": len(ds), "value": round(value, 2), "weighted": round(w, 2), "probability": prob, "is_won": st.is_won, "is_lost": st.is_lost})
        if not st.is_won and not st.is_lost:
            open_value += value
            weighted += w
            open_count += len(ds)
    return {"pipeline_id": pipeline_id, "stages": by_stage, "open_value": round(open_value, 2), "weighted_value": round(weighted, 2), "open_count": open_count}


def dashboard(session: Session, user: User) -> dict[str, Any]:
    t = today()
    month_start = _month_start(t)
    next_month = _add_months(month_start, 1)
    prev_month = _add_months(month_start, -1)
    # Same day-of-month window for a fair comparison
    prev_same = prev_month + (t - month_start)

    revenue_m = revenue_between(session, month_start, next_month)
    revenue_prev = revenue_between(session, prev_month, prev_same + timedelta(days=1))
    cash_m = cash_between(session, month_start, next_month)
    cash_prev = cash_between(session, prev_month, prev_same + timedelta(days=1))
    year_start = date(t.year, 1, 1)
    revenue_ytd = revenue_between(session, year_start, next_month)

    issued = session.exec(select(Invoice).where(Invoice.locked == True, Invoice.kind != "credit_note", Invoice.status.in_(["issued", "sent", "partial", "overdue"]))).all()  # noqa: E712
    receivables = round(sum(i.balance_due for i in issued), 2)
    overdue = [i for i in issued if i.due_date and i.due_date < t]
    overdue_amount = round(sum(i.balance_due for i in overdue), 2)

    saas = subscriptions.metrics(session, months=12)
    pipe = pipeline_summary(session)

    ninety = utcnow() - timedelta(days=90)
    won = session.exec(select(func.count()).select_from(Deal).where(Deal.status == "won", Deal.closed_at >= ninety)).one()
    lost = session.exec(select(func.count()).select_from(Deal).where(Deal.status == "lost", Deal.closed_at >= ninety)).one()
    win_rate = round(won / (won + lost) * 100, 1) if (won + lost) else None
    won_month = session.exec(select(Deal).where(Deal.status == "won", Deal.closed_at >= _dt(month_start))).all()

    leads_m = session.exec(select(func.count()).select_from(Contact).where(Contact.created_at >= _dt(month_start))).one()
    leads_prev = session.exec(select(func.count()).select_from(Contact).where(Contact.created_at >= _dt(prev_month), Contact.created_at < _dt(prev_same + timedelta(days=1)))).one()

    my_tasks = session.exec(
        select(Task).where(Task.assignee_id == user.id, Task.status.notin_(["done", "cancelled"]), or_(Task.due_date <= t + timedelta(days=7), Task.due_date.is_(None))).order_by(Task.due_date.asc().nulls_last(), Task.priority.desc()).limit(12)
    ).all()
    overdue_tasks = session.exec(select(func.count()).select_from(Task).where(Task.assignee_id == user.id, Task.status.notin_(["done", "cancelled"]), Task.due_date < t)).one()
    events = session.exec(select(Event).where(Event.start_at >= _dt(t), Event.start_at < _dt(t + timedelta(days=7))).order_by(Event.start_at).limit(8)).all()
    tickets_open = session.exec(select(func.count()).select_from(Ticket).where(Ticket.status.in_(["new", "open", "pending", "on_hold"]))).one()
    sla_breached = session.exec(select(func.count()).select_from(Ticket).where(Ticket.status.in_(["new", "open"]), Ticket.sla_due_at < utcnow())).one()
    activities = session.exec(select(Activity).order_by(Activity.occurred_at.desc()).limit(14)).all()

    sources: dict[str, int] = defaultdict(int)
    for src in session.exec(select(Contact.source).where(Contact.created_at >= _dt(_add_months(month_start, -5)))).all():
        sources[src or "Autre"] += 1

    top_clients_rows = session.exec(
        select(Invoice.company_id, func.sum(Invoice.subtotal)).where(Invoice.locked == True, Invoice.issue_date >= _add_months(month_start, -11), Invoice.company_id.isnot(None)).group_by(Invoice.company_id).order_by(func.sum(Invoice.subtotal).desc()).limit(6)  # noqa: E712
    ).all()
    company_names = {c.id: c for c in session.exec(select(Company).where(Company.id.in_([r[0] for r in top_clients_rows]))).all()} if top_clients_rows else {}
    top_clients = [{"id": cid, "name": company_names[cid].name if cid in company_names else "—", "revenue": round(float(total or 0), 2)} for cid, total in top_clients_rows]

    at_risk = session.exec(
        select(Deal).where(Deal.status == "open", or_(Deal.expected_close_date < t, Deal.stage_changed_at < utcnow() - timedelta(days=21))).order_by(Deal.amount.desc()).limit(6)
    ).all()

    return {
        "generated_at": iso(utcnow()),
        "kpis": {
            "revenue_month": revenue_m,
            "revenue_month_delta": _pct(revenue_m, revenue_prev),
            "revenue_ytd": revenue_ytd,
            "cash_month": cash_m,
            "cash_month_delta": _pct(cash_m, cash_prev),
            "receivables": receivables,
            "overdue_amount": overdue_amount,
            "overdue_count": len(overdue),
            "mrr": saas["mrr"],
            "arr": saas["arr"],
            "nrr": saas["nrr"],
            "churn_rate": saas["churn_rate"],
            "customers": saas["customers"],
            "pipeline_open": pipe["open_value"],
            "pipeline_weighted": pipe["weighted_value"],
            "pipeline_count": pipe["open_count"],
            "win_rate": win_rate,
            "won_month_value": round(sum(d.value for d in won_month), 2),
            "won_month_count": len(won_month),
            "leads_month": leads_m,
            "leads_month_delta": _pct(leads_m, leads_prev),
            "tickets_open": tickets_open,
            "sla_breached": sla_breached,
            "tasks_overdue": overdue_tasks,
        },
        "revenue_series": revenue_series(session, 12),
        "mrr_series": saas["series"],
        "pipeline": pipe,
        "lead_sources": sorted(({"source": k, "count": v} for k, v in sources.items()), key=lambda x: -x["count"])[:8],
        "top_clients": top_clients,
        "my_tasks": dump_many(session, list(my_tasks)),
        "upcoming_events": dump_many(session, list(events)),
        "activities": dump_many(session, list(activities)),
        "deals_at_risk": dump_many(session, list(at_risk)),
        "renewals": saas["renewals"][:6],
    }


def reports(session: Session, start: date | None = None, end: date | None = None) -> dict[str, Any]:
    end = end or today() + timedelta(days=1)
    start = start or _add_months(_month_start(today()), -11)
    invoices = session.exec(select(Invoice).where(Invoice.locked == True, Invoice.issue_date >= start, Invoice.issue_date < end)).all()  # noqa: E712

    by_product: dict[str, float] = defaultdict(float)
    for inv in invoices:
        for line in inv.lines or []:
            if (line.get("type") or "item") != "item":
                continue
            by_product[line.get("description") or "—"] += float(line.get("total") or 0) * (1 - (inv.discount or 0) / 100)
    products = sorted(({"name": k[:60], "revenue": round(v, 2)} for k, v in by_product.items()), key=lambda x: -x["revenue"])[:10]

    users = {u.id: u for u in session.exec(select(User)).all()}
    deals = session.exec(select(Deal).where(Deal.created_at >= _dt(start))).all()
    owners: dict[int | None, dict[str, Any]] = {}
    for d in deals:
        o = owners.setdefault(d.owner_id, {"owner_id": d.owner_id, "name": users[d.owner_id].name if d.owner_id in users else "Non assigné", "won": 0, "lost": 0, "open": 0, "won_value": 0.0})
        o[d.status] = o.get(d.status, 0) + 1
        if d.status == "won":
            o["won_value"] += d.value
    for o in owners.values():
        closed = o["won"] + o["lost"]
        o["win_rate"] = round(o["won"] / closed * 100, 1) if closed else None
        o["won_value"] = round(o["won_value"], 2)

    lifecycle_counts = dict(session.exec(select(Contact.lifecycle, func.count()).group_by(Contact.lifecycle)).all())
    funnel_order = [("lead", "Leads"), ("mql", "MQL"), ("sql", "SQL"), ("opportunity", "Opportunités"), ("customer", "Clients"), ("evangelist", "Ambassadeurs")]
    cumulative = 0
    funnel = []
    for key, label in reversed(funnel_order):
        cumulative += int(lifecycle_counts.get(key, 0))
        funnel.append({"stage": key, "label": label, "count": cumulative})
    funnel.reverse()

    entries = session.exec(select(TimeEntry).where(TimeEntry.date >= start, TimeEntry.date < end)).all()
    total_minutes = sum(e.minutes for e in entries)
    billable_minutes = sum(e.minutes for e in entries if e.billable)
    billable_value = sum(e.minutes / 60 * (e.hourly_rate or 0) for e in entries if e.billable)
    per_project: dict[int | None, float] = defaultdict(float)
    for e in entries:
        per_project[e.project_id] += e.minutes / 60
    project_names = {p.id: p.name for p in session.exec(select(Project)).all()}

    tickets = session.exec(select(Ticket).where(Ticket.created_at >= _dt(start))).all()
    first_resp = [(t.first_response_at - t.created_at).total_seconds() / 3600 for t in tickets if t.first_response_at and t.created_at]
    resolution = [(t.resolved_at - t.created_at).total_seconds() / 3600 for t in tickets if t.resolved_at and t.created_at]
    csat = [t.satisfaction for t in tickets if t.satisfaction]

    win_loss_by_month: dict[str, dict[str, float]] = defaultdict(lambda: {"won": 0, "lost": 0, "won_value": 0.0})
    for d in session.exec(select(Deal).where(Deal.closed_at >= _dt(start))).all():
        if not d.closed_at:
            continue
        key = f"{d.closed_at.year}-{d.closed_at.month:02d}"
        win_loss_by_month[key][d.status] = win_loss_by_month[key].get(d.status, 0) + 1
        if d.status == "won":
            win_loss_by_month[key]["won_value"] += d.value

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "revenue_total": round(sum(i.subtotal or 0 for i in invoices), 2),
        "revenue_series": revenue_series(session, 12),
        "revenue_by_product": products,
        "sales_by_owner": sorted(owners.values(), key=lambda o: -o["won_value"]),
        "funnel": funnel,
        "win_loss": [{"month": k, **v} for k, v in sorted(win_loss_by_month.items())],
        "time": {
            "total_hours": round(total_minutes / 60, 1),
            "billable_hours": round(billable_minutes / 60, 1),
            "billable_ratio": round(billable_minutes / total_minutes * 100, 1) if total_minutes else None,
            "billable_value": round(billable_value, 2),
            "by_project": sorted(({"project": project_names.get(k, "Sans projet"), "hours": round(v, 1)} for k, v in per_project.items()), key=lambda x: -x["hours"])[:8],
        },
        "support": {
            "tickets": len(tickets),
            "avg_first_response_h": round(sum(first_resp) / len(first_resp), 1) if first_resp else None,
            "avg_resolution_h": round(sum(resolution) / len(resolution), 1) if resolution else None,
            "csat": round(sum(csat) / len(csat), 2) if csat else None,
        },
        "saas": subscriptions.metrics(session, 12),
    }


STATUS_LABELS = {
    "quotes": {"draft": "Brouillon", "sent": "Envoyé", "viewed": "Consulté", "accepted": "Signé", "declined": "Refusé", "expired": "Expiré", "invoiced": "Facturé"},
    "invoices": {"draft": "Brouillon", "issued": "Émise", "sent": "Envoyée", "partial": "Partiellement payée", "paid": "Payée", "overdue": "En retard", "cancelled": "Annulée"},
    "tickets": {"new": "Nouveau", "open": "Ouvert", "pending": "En attente client", "on_hold": "Suspendu", "resolved": "Résolu", "closed": "Fermé"},
    "projects": {"planned": "Planifié", "active": "En cours", "on_hold": "En pause", "completed": "Terminé", "cancelled": "Annulé"},
    "tasks": {"todo": "À faire", "in_progress": "En cours", "review": "En revue", "done": "Terminé", "cancelled": "Annulé"},
    "deals": {"open": "En cours", "won": "Gagné", "lost": "Perdu"},
}


def _status(kind: str, value: str | None) -> str | None:
    return STATUS_LABELS.get(kind, {}).get(value or "", value)


def _euros(value: float, decimals: int = 0) -> str:
    return f"{value:,.{decimals}f} €".replace(",", "\u202f").replace(".", ",")


SEARCH_TARGETS = [
    ("contacts", Contact, ("first_name", "last_name", "email", "phone", "job_title"), lambda o: o.full_name, lambda o: o.email or o.job_title),
    ("companies", Company, ("name", "domain", "city", "siren"), lambda o: o.name, lambda o: o.city or o.industry),
    ("deals", Deal, ("title", "next_step"), lambda o: o.title, lambda o: _euros(o.value) if o.value else _status("deals", o.status)),
    ("quotes", Quote, ("number", "title"), lambda o: f"{o.number} — {o.title or 'Devis'}", lambda o: f"{_status('quotes', o.status)} · {_euros(o.total, 2)}"),
    ("invoices", Invoice, ("number", "title"), lambda o: f"{o.number or 'Brouillon'} — {o.title or 'Facture'}", lambda o: f"{_status('invoices', o.status)} · {_euros(o.total, 2)}"),
    ("tickets", Ticket, ("number", "subject"), lambda o: f"{o.number} · {o.subject}", lambda o: _status("tickets", o.status)),
    ("projects", Project, ("name", "code"), lambda o: o.name, lambda o: _status("projects", o.status)),
    ("tasks", Task, ("title",), lambda o: o.title, lambda o: _status("tasks", o.status)),
    ("products", Product, ("name", "sku", "category"), lambda o: o.name, lambda o: f"{_euros(o.unit_price, 2)} / {o.unit}"),
    ("kb-articles", KbArticle, ("title", "summary"), lambda o: o.title, lambda o: o.category),
]


def search(session: Session, q: str, limit: int = 5) -> list[dict[str, Any]]:
    q = (q or "").strip()
    if len(q) < 2:
        return []
    results: list[dict[str, Any]] = []
    terms = q.split()[:4]
    for kind, model, fields, title_fn, sub_fn in SEARCH_TARGETS:
        stmt = select(model)
        for term in terms:
            like = f"%{term}%"
            stmt = stmt.where(or_(*[cast(getattr(model, f), String).ilike(like) for f in fields]))
        rows = session.exec(stmt.order_by(model.updated_at.desc()).limit(limit)).all()
        for row in rows:
            results.append({"type": kind, "id": row.id, "title": title_fn(row), "subtitle": sub_fn(row)})
    return results

"""Projects, time tracking (timer, invoicing of time), tasks ordering and calendar feed."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlmodel import Session, select

from ..db import get_session
from ..deps import authenticate_request, get_current_user, require_role, user_from_api_token
from ..models import Event, Invoice, Project, Task, TimeEntry, User, today, utcnow
from ..resources import RESOURCES
from ..serialize import dump_many, dump_one
from ..services.settings import get_section

router = APIRouter(tags=["work"])


@router.get("/projects/{project_id:int}/stats")
def project_stats(project_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Projet introuvable.")
    tasks = session.exec(select(Task).where(Task.project_id == project_id)).all()
    entries = session.exec(select(TimeEntry).where(TimeEntry.project_id == project_id)).all()
    invoices = session.exec(select(Invoice).where(Invoice.project_id == project_id, Invoice.locked == True)).all()  # noqa: E712
    hours = sum(e.minutes for e in entries) / 60
    billable_hours = sum(e.minutes for e in entries if e.billable) / 60
    unbilled = [e for e in entries if e.billable and not e.invoice_id]
    cost = 0.0
    users = {u.id: u for u in session.exec(select(User)).all()}
    for e in entries:
        u = users.get(e.user_id)
        if u and u.hourly_cost:
            cost += e.minutes / 60 * u.hourly_cost
    by_status: dict[str, int] = {}
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1
    done = by_status.get("done", 0)
    progress = round(done / len(tasks) * 100) if tasks else project.progress
    invoiced = round(sum(i.subtotal or 0 for i in invoices), 2)
    per_user: dict[str, float] = {}
    for e in entries:
        name = users[e.user_id].name if e.user_id in users else "?"
        per_user[name] = per_user.get(name, 0) + e.minutes / 60
    return {
        "tasks_total": len(tasks),
        "tasks_by_status": by_status,
        "progress": progress,
        "hours": round(hours, 2),
        "billable_hours": round(billable_hours, 2),
        "unbilled_hours": round(sum(e.minutes for e in unbilled) / 60, 2),
        "unbilled_value": round(sum(e.minutes / 60 * (e.hourly_rate or project.hourly_rate or 0) for e in unbilled), 2),
        "budget_hours": project.budget_hours,
        "budget_amount": project.budget_amount,
        "budget_used_pct": round(hours / project.budget_hours * 100, 1) if project.budget_hours else None,
        "invoiced": invoiced,
        "cost": round(cost, 2),
        "margin": round(invoiced - cost, 2) if invoiced else None,
        "hours_by_user": [{"name": k, "hours": round(v, 1)} for k, v in sorted(per_user.items(), key=lambda x: -x[1])],
    }


@router.post("/projects/{project_id:int}/invoice-time")
def invoice_time(project_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Projet introuvable.")
    stmt = select(TimeEntry).where(TimeEntry.project_id == project_id, TimeEntry.billable == True, TimeEntry.invoice_id.is_(None))  # noqa: E712
    if payload.get("until"):
        stmt = stmt.where(TimeEntry.date <= datetime.fromisoformat(payload["until"]).date())
    entries = session.exec(stmt.order_by(TimeEntry.date)).all()
    if not entries:
        raise HTTPException(409, "Aucun temps facturable non facturé sur ce projet.")
    vat = float(get_section(session, "billing")["default_vat"])
    groups: dict[float, float] = {}
    for e in entries:
        rate = e.hourly_rate or project.hourly_rate or 0
        groups[rate] = groups.get(rate, 0) + e.minutes / 60
    lines: list[dict[str, Any]] = [{"type": "section", "description": f"Projet {project.code or ''} {project.name}".strip()}]
    for rate, hours in groups.items():
        lines.append({"description": "Temps passé (régie)", "details": f"Du {entries[0].date.strftime('%d/%m/%Y')} au {entries[-1].date.strftime('%d/%m/%Y')}", "quantity": round(hours, 2), "unit": "heure", "unit_price": rate, "vat_rate": vat})
    invoice = RESOURCES["invoices"].create(
        session,
        {"title": f"Prestations — {project.name}", "company_id": project.company_id, "project_id": project.id, "deal_id": project.deal_id, "lines": lines, "service_date": entries[0].date.isoformat(), "service_period_end": entries[-1].date.isoformat()},
        user,
    )
    for e in entries:
        e.invoice_id = invoice.id
        session.add(e)
    session.commit()
    return dump_one(session, invoice)


@router.get("/timer")
def current_timer(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    entry = session.exec(select(TimeEntry).where(TimeEntry.user_id == user.id, TimeEntry.started_at.isnot(None), TimeEntry.ended_at.is_(None))).first()
    return {"entry": dump_one(session, entry) if entry else None}


@router.post("/timer/start")
def start_timer(payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    running = session.exec(select(TimeEntry).where(TimeEntry.user_id == user.id, TimeEntry.started_at.isnot(None), TimeEntry.ended_at.is_(None))).first()
    if running:
        _stop(session, running, user)
    entry = RESOURCES["time-entries"].create(
        session,
        {"user_id": user.id, "project_id": payload.get("project_id"), "task_id": payload.get("task_id"), "description": payload.get("description"), "date": today().isoformat(), "started_at": utcnow().isoformat(), "billable": payload.get("billable", True)},
        user,
    )
    return {"entry": dump_one(session, entry)}


def _stop(session: Session, entry: TimeEntry, user: User) -> TimeEntry:
    return RESOURCES["time-entries"].update(session, entry.id, {"ended_at": utcnow().isoformat()}, user)


@router.post("/timer/stop")
def stop_timer(payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    entry = session.exec(select(TimeEntry).where(TimeEntry.user_id == user.id, TimeEntry.started_at.isnot(None), TimeEntry.ended_at.is_(None))).first()
    if entry is None:
        raise HTTPException(409, "Aucun chronomètre en cours.")
    if payload.get("description"):
        entry.description = payload["description"]
    entry = _stop(session, entry, user)
    return {"entry": dump_one(session, entry)}


@router.post("/tasks/reorder")
def reorder_tasks(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    """payload: {status: "...", order: [ids...]} — positions are rewritten for that column."""
    status = payload.get("status")
    for index, task_id in enumerate(payload.get("order") or []):
        task = session.get(Task, int(task_id))
        if task is None:
            continue
        data: dict[str, Any] = {"position": index}
        if status and task.status != status:
            data["status"] = status
        RESOURCES["tasks"].update(session, task.id, data, user, commit=False)
    session.commit()
    return {"ok": True}


def _ics_escape(text: str | None) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_dt(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


@router.get("/calendar.ics")
def calendar_feed(request: Request, key: str | None = None, session: Session = Depends(get_session)):
    """Abonnement iCal (Google Agenda, Apple Calendrier, Outlook) — authentification par jeton : ?key=…"""
    user = (user_from_api_token(session, key, scope="ics") or user_from_api_token(session, key)) if key else authenticate_request(request, session)
    if user is None:
        raise HTTPException(401, "Jeton invalide.")
    # Personal feed: the subscriber's own events and tasks.
    events = session.exec(select(Event).where(Event.user_id == user.id, Event.start_at >= utcnow() - timedelta(days=90)).order_by(Event.start_at)).all()
    tasks = session.exec(select(Task).where(Task.assignee_id == user.id, Task.due_date.isnot(None), Task.status.notin_(["done", "cancelled"]))).all()
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prisme CRM//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Prisme CRM"]
    stamp = _ics_dt(utcnow())
    for ev in events:
        lines += [
            "BEGIN:VEVENT",
            f"UID:prisme-event-{ev.id}@prisme",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{_ics_dt(ev.start_at)}",
            f"DTEND:{_ics_dt(ev.end_at)}",
            f"SUMMARY:{_ics_escape(ev.title)}",
        ]
        if ev.location:
            lines.append(f"LOCATION:{_ics_escape(ev.location)}")
        desc = "\n".join(x for x in [ev.description, ev.meeting_url] if x)
        if desc:
            lines.append(f"DESCRIPTION:{_ics_escape(desc)}")
        lines.append("END:VEVENT")
    for t in tasks:
        d = t.due_date.strftime("%Y%m%d")
        lines += ["BEGIN:VEVENT", f"UID:prisme-task-{t.id}@prisme", f"DTSTAMP:{stamp}", f"DTSTART;VALUE=DATE:{d}", f"SUMMARY:{_ics_escape('✅ ' + t.title)}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar; charset=utf-8")


@router.get("/time-entries/summary")
def time_summary(start: str | None = None, end: str | None = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    s = datetime.fromisoformat(start).date() if start else today() - timedelta(days=today().weekday())
    e = datetime.fromisoformat(end).date() if end else s + timedelta(days=6)
    entries = session.exec(select(TimeEntry).where(TimeEntry.user_id == user.id, TimeEntry.date >= s, TimeEntry.date <= e).order_by(TimeEntry.date)).all()
    days: dict[str, int] = {}
    for entry in entries:
        days[entry.date.isoformat()] = days.get(entry.date.isoformat(), 0) + entry.minutes
    return {"start": s.isoformat(), "end": e.isoformat(), "total_minutes": sum(days.values()), "days": days, "items": dump_many(session, list(entries))}

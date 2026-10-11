"""Background scheduler (runs inside the web server process)."""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

import anyio
from sqlmodel import select

from ..db import session_scope
from ..models import Campaign, Contact, Event, Notification, Setting, Subscription, Task, User, now_local, today, utcnow
from . import automation_engine, invoicing, mailer, rgpd
from .listeners import notify
from .settings import get_section

log = logging.getLogger("prisme.scheduler")


def _once_per_day(session, key: str) -> bool:
    """True the first time it is called on a given local day for `key`."""
    row = session.get(Setting, "scheduler")
    state = dict(row.value) if row and isinstance(row.value, dict) else {}
    stamp = today().isoformat()
    if state.get(key) == stamp:
        return False
    state[key] = stamp
    if row is None:
        row = Setting(key="scheduler", value=state)
    else:
        row.value = state
    session.add(row)
    session.commit()
    return True


def _starts_in(minutes: int) -> str:
    if minutes < 1:
        return "Maintenant"
    if minutes < 60:
        return f"Dans {minutes} min"
    hours, rest = divmod(minutes, 60)
    return f"Dans {hours} h {rest:02d}" if rest else f"Dans {hours} h"


def tick(minute: int) -> None:
    now = now_local()
    with session_scope() as session:
        # Overdue invoices (hourly)
        if minute % 60 == 0 and get_section(session, "billing").get("auto_overdue", True):
            invoicing.mark_overdue(session)

        # Event reminders, deduplicated through the notification link.
        horizon = utcnow() + timedelta(days=1)
        events = session.exec(select(Event).where(Event.start_at > utcnow(), Event.start_at <= horizon, Event.reminder_minutes.isnot(None))).all()
        for ev in events:
            minutes = int((ev.start_at - utcnow()).total_seconds() // 60)
            if minutes > (ev.reminder_minutes or 0):
                continue
            link = f"/calendar?event={ev.id}"
            if session.exec(select(Notification.id).where(Notification.link == link)).first() is None:
                notify(session, ev.user_id, f"🗓️ {_starts_in(minutes)} : {ev.title}", ev.location or ev.meeting_url, link, "info")
                session.commit()

        if now.hour >= 8 and _once_per_day(session, "daily"):
            _daily(session)

    if minute % 5 == 0:
        try:
            with session_scope() as session:
                mailer.sync_imap(session)
        except Exception:  # noqa: BLE001
            log.warning("Synchronisation IMAP impossible", exc_info=True)

    from ..api.marketing import send_campaign_now  # local import: the API layer imports this module

    with session_scope() as session:
        due = session.exec(select(Campaign).where(Campaign.status == "scheduled", Campaign.scheduled_at <= utcnow())).all()
        for campaign in due:
            try:
                send_campaign_now(session, campaign, None)
            except Exception:  # noqa: BLE001
                log.exception("Envoi programmé de la campagne %s impossible", campaign.id)


def _daily(session) -> None:
    from ..api.sales import invoice_subscription  # local import: the API layer imports this module

    # Tasks due today -> notification per assignee
    tasks = session.exec(select(Task).where(Task.due_date == today(), Task.status.notin_(["done", "cancelled"]))).all()
    per_user: dict[int, int] = {}
    for t in tasks:
        if t.assignee_id:
            per_user[t.assignee_id] = per_user.get(t.assignee_id, 0) + 1
    for uid, count in per_user.items():
        notify(session, uid, f"✅ {count} tâche{'s' if count > 1 else ''} à faire aujourd'hui", None, "/tasks", "task")

    # Subscription renewals with auto-invoicing -> draft invoice
    subs = session.exec(select(Subscription).where(Subscription.auto_invoice == True, Subscription.status == "active", Subscription.current_period_end <= today())).all()  # noqa: E712
    admin = session.exec(select(User).where(User.role == "admin").order_by(User.id)).first()
    for sub in subs:
        try:
            invoice_subscription(session, sub, admin)
        except Exception:  # noqa: BLE001
            log.exception("Facturation automatique de l'abonnement %s impossible", sub.id)
    session.commit()

    # RGPD retention (opt-in)
    rules = get_section(session, "rgpd")
    if rules.get("auto_anonymize"):
        for item in rgpd.retention_candidates(session):
            contact = session.get(Contact, item["id"])
            if contact:
                rgpd.anonymize_contact(session, contact, None, "Durée de conservation dépassée (purge automatique)")

    automation_engine.run_scheduled("schedule.daily")
    if today().weekday() == 0:
        automation_engine.run_scheduled("schedule.weekly")


async def run_forever(stop: asyncio.Event) -> None:
    minute = 0
    await asyncio.sleep(5)
    while not stop.is_set():
        try:
            await anyio.to_thread.run_sync(tick, minute)
        except Exception:  # noqa: BLE001
            log.exception("Erreur du planificateur")
        minute += 1
        try:
            await asyncio.wait_for(stop.wait(), timeout=60)
        except asyncio.TimeoutError:
            pass

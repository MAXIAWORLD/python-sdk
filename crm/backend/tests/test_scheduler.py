"""Background scheduler: event reminders fire once, within the event's reminder window."""

from __future__ import annotations

from datetime import timedelta

from sqlmodel import select

from prisme.db import session_scope
from prisme.models import Notification, utcnow
from prisme.services import scheduler


def _iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def test_event_reminders_respect_window_and_fire_once(client):
    me = client.get("/api/auth/me").json()
    soon = client.post("/api/events", json={"title": "Point hebdo", "start_at": _iso(utcnow() + timedelta(minutes=40)), "reminder_minutes": 60, "user_id": me["id"]}).json()
    later = client.post("/api/events", json={"title": "Atelier", "start_at": _iso(utcnow() + timedelta(hours=5)), "reminder_minutes": 30, "user_id": me["id"]}).json()

    scheduler.tick(1)
    scheduler.tick(2)

    with session_scope() as session:
        sent = session.exec(select(Notification).where(Notification.link == f"/calendar?event={soon['id']}")).all()
        assert len(sent) == 1
        assert sent[0].title.startswith("🗓️ Dans 39 min") or sent[0].title.startswith("🗓️ Dans 40 min")
        assert session.exec(select(Notification).where(Notification.link == f"/calendar?event={later['id']}")).first() is None

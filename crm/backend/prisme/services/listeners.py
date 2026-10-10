"""Event listeners: in-app notifications, outgoing webhooks and realtime push to browsers."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import threading
from typing import Any

import httpx
from sqlmodel import select

from ..db import session_scope
from ..models import Company, Deal, Notification, Ticket, User, Webhook, utcnow
from .events import subscribe

log = logging.getLogger("prisme.listeners")

# ---------------------------------------------------------------------------
# Realtime (Server-Sent Events) fan-out
# ---------------------------------------------------------------------------

_clients: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue, int]] = []
_clients_lock = threading.Lock()


def register_client(loop: asyncio.AbstractEventLoop, queue: asyncio.Queue, user_id: int) -> None:
    with _clients_lock:
        _clients.append((loop, queue, user_id))


def unregister_client(queue: asyncio.Queue) -> None:
    with _clients_lock:
        _clients[:] = [c for c in _clients if c[1] is not queue]


def broadcast(message: dict[str, Any], user_id: int | None = None) -> None:
    with _clients_lock:
        targets = list(_clients)
    for loop, queue, uid in targets:
        if user_id is not None and uid != user_id:
            continue
        try:
            loop.call_soon_threadsafe(queue.put_nowait, message)
        except RuntimeError:
            pass


@subscribe
def realtime_listener(item: dict[str, Any]) -> None:
    event = item["event"]
    entity = event.split(".")[0]
    payload = item.get("payload") or {}
    broadcast({"type": "event", "event": event, "entity": entity, "id": payload.get("id"), "user_id": item.get("user_id")})


# ---------------------------------------------------------------------------
# In-app notifications
# ---------------------------------------------------------------------------


def notify(session: Any, user_id: int | None, title: str, body: str | None = None, link: str | None = None, type: str = "info") -> None:
    note = Notification(user_id=user_id, title=title, body=body, link=link, type=type)
    session.add(note)
    session.flush()
    broadcast({"type": "notification", "id": note.id, "title": title, "body": body, "link": link, "kind": type}, user_id)


def _fmt(value: float | None) -> str:
    return f"{value or 0:,.0f} €".replace(",", " ")


@subscribe
def notification_listener(item: dict[str, Any]) -> None:
    event = item["event"]
    payload = item.get("payload") or {}
    actor = item.get("user_id")
    with session_scope() as session:
        if event == "deal.won":
            deal = session.get(Deal, payload.get("id"))
            if deal:
                company = session.get(Company, deal.company_id) if deal.company_id else None
                text = f"{deal.title}" + (f" — {company.name}" if company else "")
                for user in session.exec(select(User).where(User.is_active == True)).all():  # noqa: E712
                    notify(session, user.id, f"🎉 Affaire gagnée : {_fmt(deal.value)}", text, f"/deals/{deal.id}", "deal")
        elif event == "quote.accepted":
            notify(session, None, f"✍️ Devis {payload.get('number')} signé", f"Montant : {_fmt(payload.get('total'))}", f"/quotes/{payload.get('id')}", "success")
        elif event == "quote.viewed":
            notify(session, None, f"👀 Devis {payload.get('number')} consulté par le client", None, f"/quotes/{payload.get('id')}", "info")
        elif event == "invoice.paid":
            notify(session, None, f"💶 Facture {payload.get('number')} payée", _fmt(payload.get("total")), f"/invoices/{payload.get('id')}", "success")
        elif event == "invoice.overdue":
            notify(session, None, f"⏰ Facture {payload.get('number')} en retard", _fmt(payload.get("total")), f"/invoices/{payload.get('id')}", "warning")
        elif event == "ticket.created_detail":
            ticket = session.get(Ticket, payload.get("id"))
            if ticket:
                target = ticket.assignee_id
                notify(session, target, f"🎫 Nouveau ticket {ticket.number}", ticket.subject, f"/tickets/{ticket.id}", "ticket")
        elif event == "form.submitted":
            notify(session, payload.get("owner_id"), f"📥 Nouveau lead : {payload.get('name') or payload.get('email')}", f"Formulaire « {payload.get('form')} »", f"/contacts/{payload.get('contact_id')}", "form")
        elif event == "task.created" and payload.get("data", {}).get("assignee_id") not in (None, actor):
            data = payload["data"]
            notify(session, data["assignee_id"], "📌 Nouvelle tâche assignée", data.get("title"), "/tasks", "task")
        else:
            return
        session.commit()


# ---------------------------------------------------------------------------
# Outgoing webhooks (signed with HMAC-SHA256)
# ---------------------------------------------------------------------------


@subscribe
def webhook_listener(item: dict[str, Any]) -> None:
    event = item["event"]
    with session_scope() as session:
        hooks = session.exec(select(Webhook).where(Webhook.active == True)).all()  # noqa: E712
        targets = [h for h in hooks if "*" in (h.events or []) or event in (h.events or []) or f"{event.split('.')[0]}.*" in (h.events or [])]
        if not targets:
            return
        body = json.dumps({"event": event, "at": item.get("at"), "data": item.get("payload")}, ensure_ascii=False, default=str).encode()
        for hook in targets:
            signature = hmac.new((hook.secret or "").encode(), body, hashlib.sha256).hexdigest()
            try:
                resp = httpx.post(
                    hook.url,
                    content=body,
                    headers={"Content-Type": "application/json", "X-Prisme-Event": event, "X-Prisme-Signature": f"sha256={signature}"},
                    timeout=10,
                )
                hook.last_status = resp.status_code
                hook.failures = 0 if resp.status_code < 400 else (hook.failures or 0) + 1
            except httpx.HTTPError as exc:
                log.warning("Webhook %s en échec : %s", hook.url, exc)
                hook.last_status = 0
                hook.failures = (hook.failures or 0) + 1
            hook.last_called_at = utcnow()
            if hook.failures >= 20:
                hook.active = False
            session.add(hook)
        session.commit()

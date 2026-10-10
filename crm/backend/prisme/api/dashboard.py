"""Dashboard, global search, reports, notifications and realtime stream."""

from __future__ import annotations

import asyncio
import json
from datetime import date

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Notification, User, utcnow
from ..services import analytics
from ..services.listeners import register_client, unregister_client

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return analytics.dashboard(session, user)


@router.get("/search")
def search(q: str = "", session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return {"results": analytics.search(session, q)}


@router.get("/reports")
def reports(start: str | None = None, end: str | None = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return analytics.reports(session, date.fromisoformat(start) if start else None, date.fromisoformat(end) if end else None)


@router.post("/notifications/read-all")
def read_all(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Notification).where(((Notification.user_id == user.id) | (Notification.user_id.is_(None))), Notification.read_at.is_(None))).all()
    for n in rows:
        n.read_at = utcnow()
        session.add(n)
    session.commit()
    return {"updated": len(rows)}


@router.get("/notifications/unread-count")
def unread_count(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Notification.id).where(((Notification.user_id == user.id) | (Notification.user_id.is_(None))), Notification.read_at.is_(None))).all()
    return {"count": len(rows)}


@router.get("/stream")
async def stream(request: Request, user: User = Depends(get_current_user)):
    """Server-Sent Events: live updates (records changed, notifications)."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    register_client(loop, queue, user.id)

    async def events():
        try:
            yield "retry: 5000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(message, ensure_ascii=False, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            unregister_client(queue)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

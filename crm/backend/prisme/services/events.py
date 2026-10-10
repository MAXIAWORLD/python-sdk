"""In-process domain event bus.

`emit()` is called after a successful commit; listeners (automations, webhooks,
notifications, realtime push) run in a background worker thread with their own
database session, so a slow webhook never blocks an API request.
"""

from __future__ import annotations

import logging
import queue
import threading
from collections.abc import Callable
from typing import Any

from ..models import utcnow
from ..serialize import iso

log = logging.getLogger("prisme.events")

Listener = Callable[[dict[str, Any]], None]

_listeners: list[Listener] = []
_local = threading.local()  # automation depth of the code currently running in this thread
_queue: "queue.Queue[dict[str, Any] | None]" = queue.Queue()
_worker: threading.Thread | None = None
_sync = False  # tests: process events inline


def subscribe(fn: Listener) -> Listener:
    if fn not in _listeners:
        _listeners.append(fn)
    return fn


def set_sync(value: bool) -> None:
    global _sync
    _sync = value


def current_depth() -> int:
    return getattr(_local, "depth", 0)


def set_depth(value: int) -> None:
    _local.depth = value


def emit(event: str, payload: dict[str, Any], user_id: int | None = None, depth: int | None = None) -> None:
    item = {"event": event, "payload": payload, "user_id": user_id, "at": iso(utcnow()), "depth": current_depth() if depth is None else depth}
    if _sync or _worker is None:
        _dispatch(item)
    else:
        _queue.put(item)


def queue_event(session: Any, event: str, payload: dict[str, Any], user_id: int | None = None) -> None:
    """Defer an event until the surrounding transaction commits (see flush_events)."""
    session.info.setdefault("pending_events", []).append((event, payload, user_id))


def flush_events(session: Any) -> None:
    for event, payload, user_id in session.info.pop("pending_events", []):
        emit(event, payload, user_id)


def _dispatch(item: dict[str, Any]) -> None:
    for fn in list(_listeners):
        try:
            fn(item)
        except Exception:  # noqa: BLE001 - a listener must never break the bus
            log.exception("Event listener %s failed for %s", getattr(fn, "__name__", fn), item.get("event"))


def _run() -> None:
    while True:
        item = _queue.get()
        if item is None:
            break
        _dispatch(item)


def start_worker() -> None:
    global _worker
    if _worker is not None and _worker.is_alive():
        return
    _worker = threading.Thread(target=_run, name="prisme-events", daemon=True)
    _worker.start()


def stop_worker() -> None:
    global _worker
    if _worker is not None:
        _queue.put(None)
        _worker.join(timeout=5)
        _worker = None

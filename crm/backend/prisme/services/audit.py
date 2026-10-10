"""Audit trail (journalisation des accès et modifications — RGPD art. 32)."""

from __future__ import annotations

from typing import Any

from sqlmodel import Session

from ..models import AuditLog
from ..serialize import jsonable

_SKIP = {"updated_at", "created_at"}


def diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, list[Any]]:
    changes: dict[str, list[Any]] = {}
    for key, new in after.items():
        if key in _SKIP:
            continue
        old = before.get(key)
        if jsonable(old) != jsonable(new):
            changes[key] = [jsonable(old), jsonable(new)]
    return changes


def record(
    session: Session,
    action: str,
    user_id: int | None,
    entity: str | None = None,
    entity_id: int | None = None,
    summary: str | None = None,
    changes: dict[str, Any] | None = None,
) -> None:
    # Never store secret values in the journal.
    safe = {k: v for k, v in (changes or {}).items() if not any(s in k for s in ("password", "secret", "api_key", "signature"))}
    session.add(
        AuditLog(user_id=user_id, action=action, entity=entity, entity_id=entity_id, summary=summary, changes=safe)
    )

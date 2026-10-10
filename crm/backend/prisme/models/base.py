from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from typing import Any, Optional

from sqlalchemy import JSON
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Timezone-aware UTC datetime (stored as UTC, returned aware by SQLModel)."""
    return datetime.now(timezone.utc)


LOCAL_TZ = ZoneInfo(os.getenv("PRISME_TZ", "Europe/Paris"))


def now_local() -> datetime:
    return datetime.now(LOCAL_TZ)


def today() -> date:
    """Business date in the company's time zone (Europe/Paris by default)."""
    return now_local().date()


def new_token() -> str:
    return secrets.token_urlsafe(24)


def JSONField(default_factory: Any = dict, **kwargs: Any) -> Any:
    return Field(default_factory=default_factory, sa_type=JSON, **kwargs)


class Base(SQLModel):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

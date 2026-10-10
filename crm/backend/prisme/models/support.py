"""Support tickets and knowledge base."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field

from .base import Base, JSONField


class Ticket(Base, table=True):
    __tablename__ = "tickets"

    number: str = Field(default="", index=True)
    subject: str
    description: Optional[str] = None
    status: str = Field(default="open", index=True)  # new|open|pending|on_hold|resolved|closed
    priority: str = Field(default="normal", index=True)  # low|normal|high|urgent
    channel: str = "email"  # email|chat|phone|portal|form|social
    category: Optional[str] = None
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    assignee_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    sla_due_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    satisfaction: Optional[int] = None
    tags: list = JSONField(list)


class TicketMessage(Base, table=True):
    __tablename__ = "ticket_messages"

    ticket_id: int = Field(foreign_key="tickets.id", index=True)
    author_type: str = "agent"  # agent|customer|ai|system
    author_name: Optional[str] = None
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    body: str = ""
    is_internal: bool = False
    attachments: list = JSONField(list)


class KbArticle(Base, table=True):
    __tablename__ = "kb_articles"

    title: str
    slug: str = Field(default="", index=True)
    category: Optional[str] = None
    summary: Optional[str] = None
    body: str = ""
    status: str = "draft"  # draft|published
    views: int = 0
    helpful: int = 0
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    tags: list = JSONField(list)

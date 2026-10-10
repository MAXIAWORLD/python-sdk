"""Settings, notifications, documents, automations, webhooks, audit log, AI."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON
from sqlmodel import Field, SQLModel

from .base import Base, JSONField, utcnow


class Setting(SQLModel, table=True):
    __tablename__ = "settings"

    key: str = Field(primary_key=True)
    value: Any = Field(default_factory=dict, sa_type=JSON)
    updated_at: datetime = Field(default_factory=utcnow)


class Notification(Base, table=True):
    __tablename__ = "notifications"

    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    type: str = "info"  # info|success|warning|danger|ai|deal|task|invoice|ticket|form
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    read_at: Optional[datetime] = None


class Document(Base, table=True):
    __tablename__ = "documents"

    name: str
    filename: str  # stored file name inside uploads dir
    mime: Optional[str] = None
    size: int = 0
    folder: Optional[str] = None
    description: Optional[str] = None
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id", index=True)
    ticket_id: Optional[int] = Field(default=None, foreign_key="tickets.id")
    uploaded_by_id: Optional[int] = Field(default=None, foreign_key="users.id")
    tags: list = JSONField(list)


class Automation(Base, table=True):
    __tablename__ = "automations"

    name: str
    description: Optional[str] = None
    active: bool = True
    trigger: dict = JSONField(lambda: {"type": "contact.created", "config": {}})
    conditions: list = JSONField(list)
    actions: list = JSONField(list)
    run_count: int = 0
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")


class AutomationRun(Base, table=True):
    __tablename__ = "automation_runs"

    automation_id: int = Field(foreign_key="automations.id", index=True)
    status: str = "success"  # success|error|skipped
    event: Optional[str] = None
    payload: dict = JSONField(dict)
    log: list = JSONField(list)
    error: Optional[str] = None


class Webhook(Base, table=True):
    __tablename__ = "webhooks"

    name: str
    url: str
    events: list = JSONField(lambda: ["*"])
    secret: Optional[str] = None
    active: bool = True
    last_status: Optional[int] = None
    last_called_at: Optional[datetime] = None
    failures: int = 0


class AuditLog(Base, table=True):
    __tablename__ = "audit_logs"

    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    action: str  # create|update|delete|login|export|ai
    entity: Optional[str] = None
    entity_id: Optional[int] = None
    summary: Optional[str] = None
    changes: dict = JSONField(dict)


class AIProvider(Base, table=True):
    __tablename__ = "ai_providers"

    name: str
    kind: str  # anthropic|openai|mistral|gemini|groq|openrouter|deepseek|xai|ollama|lmstudio|custom
    base_url: Optional[str] = None
    api_key_enc: Optional[str] = None
    default_model: str = ""
    models: list = JSONField(list)
    enabled: bool = True
    is_default: bool = False
    options: dict = JSONField(dict)


class AIConversation(Base, table=True):
    __tablename__ = "ai_conversations"

    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    title: str = "Nouvelle conversation"
    provider_id: Optional[int] = Field(default=None, foreign_key="ai_providers.id")
    model: Optional[str] = None
    system_prompt: Optional[str] = None  # frozen at creation (keeps the prompt prefix stable)
    context: dict = JSONField(dict)
    status: str = "idle"  # idle|running|awaiting_approval|error
    pinned: bool = False
    archived: bool = False
    usage: dict = JSONField(dict)


class AIMessage(Base, table=True):
    __tablename__ = "ai_messages"

    conversation_id: int = Field(foreign_key="ai_conversations.id", index=True)
    role: str  # user|assistant|tool
    content: list = JSONField(list)  # normalized blocks
    raw: Optional[list] = Field(default=None, sa_type=JSON)  # provider-native assistant content (replayed verbatim)
    provider_kind: Optional[str] = None
    model: Optional[str] = None
    stop_reason: Optional[str] = None
    usage: dict = JSONField(dict)

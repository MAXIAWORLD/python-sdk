"""Segments, campaigns, lead-capture forms, emails and templates."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field

from .base import Base, JSONField, new_token


class Segment(Base, table=True):
    __tablename__ = "segments"

    name: str
    description: Optional[str] = None
    entity: str = "contacts"  # contacts|companies
    rules: dict = JSONField(lambda: {"match": "all", "conditions": []})
    color: str = "#5b6cff"


class Campaign(Base, table=True):
    __tablename__ = "campaigns"

    name: str
    channel: str = "email"  # email|linkedin|event|ads|other
    status: str = Field(default="draft", index=True)  # draft|scheduled|sending|sent|paused
    segment_id: Optional[int] = Field(default=None, foreign_key="segments.id")
    subject: Optional[str] = None
    preheader: Optional[str] = None
    body: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    budget: Optional[float] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    stats: dict = JSONField(dict)
    tags: list = JSONField(list)


class CampaignRecipient(Base, table=True):
    __tablename__ = "campaign_recipients"

    campaign_id: int = Field(foreign_key="campaigns.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id")
    email: str
    status: str = "pending"  # pending|sent|failed|opened|clicked|bounced|unsubscribed
    token: str = Field(default_factory=new_token, index=True)
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    error: Optional[str] = None


class Form(Base, table=True):
    __tablename__ = "forms"

    name: str
    slug: str = Field(index=True, unique=True)
    title: Optional[str] = None
    description: Optional[str] = None
    fields: list = JSONField(list)
    submit_label: str = "Envoyer"
    success_message: str = "Merci ! Nous revenons vers vous très vite."
    redirect_url: Optional[str] = None
    active: bool = True
    lifecycle: str = "lead"
    tags_to_add: list = JSONField(list)
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    create_deal: bool = False
    pipeline_id: Optional[int] = Field(default=None, foreign_key="pipelines.id")
    stage_id: Optional[int] = Field(default=None, foreign_key="stages.id")
    notify: bool = True
    submissions: int = 0
    theme: dict = JSONField(dict)


class FormSubmission(Base, table=True):
    __tablename__ = "form_submissions"

    form_id: int = Field(foreign_key="forms.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id")
    data: dict = JSONField(dict)
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    referrer: Optional[str] = None


class EmailTemplate(Base, table=True):
    __tablename__ = "email_templates"

    name: str
    category: Optional[str] = None
    subject: str = ""
    body: str = ""


class EmailMessage(Base, table=True):
    __tablename__ = "emails"

    direction: str = Field(default="out", index=True)  # in|out
    status: str = "sent"  # draft|queued|sent|failed|received
    folder: str = Field(default="sent", index=True)  # inbox|sent|drafts|archive|trash
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    to: list = JSONField(list)
    cc: list = JSONField(list)
    subject: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id")
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id")
    ticket_id: Optional[int] = Field(default=None, foreign_key="tickets.id")
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    message_id: Optional[str] = Field(default=None, index=True)
    in_reply_to: Optional[str] = None
    thread_key: Optional[str] = Field(default=None, index=True)
    sent_at: Optional[datetime] = Field(default=None, index=True)
    read: bool = True
    starred: bool = False
    opened_at: Optional[datetime] = None
    error: Optional[str] = None
    attachments: list = JSONField(list)

"""Users, companies, contacts, activities."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field

from .base import Base, JSONField, utcnow


class User(Base, table=True):
    __tablename__ = "users"

    email: str = Field(index=True, unique=True)
    name: str
    password_hash: str = ""
    role: str = "member"  # admin | manager | member | viewer
    title: Optional[str] = None
    phone: Optional[str] = None
    color: str = "#5b6cff"
    avatar_url: Optional[str] = None
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    signature: Optional[str] = None
    hourly_cost: Optional[float] = None
    preferences: dict = JSONField(dict)
    token_version: int = 0


class ApiToken(Base, table=True):
    __tablename__ = "api_tokens"

    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    prefix: str = ""
    token_hash: str = Field(index=True)
    scopes: list = JSONField(lambda: ["api", "mcp"])
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class Company(Base, table=True):
    __tablename__ = "companies"

    name: str = Field(index=True)
    type: str = Field(default="prospect", index=True)  # prospect|client|partner|supplier|investor|other
    status: str = Field(default="active", index=True)  # active|inactive|churned
    industry: Optional[str] = None
    size: Optional[str] = None
    employees: Optional[int] = None
    annual_revenue: Optional[float] = None
    website: Optional[str] = None
    domain: Optional[str] = Field(default=None, index=True)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    zip: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "France"
    siren: Optional[str] = None
    siret: Optional[str] = None
    vat_number: Optional[str] = None
    legal_form: Optional[str] = None
    delivery_address: Optional[str] = None
    is_public_entity: bool = False  # client public : facturation via Chorus Pro
    linkedin: Optional[str] = None
    twitter: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    source: Optional[str] = None
    health_score: int = 70
    wallet_address: Optional[str] = None
    chain: Optional[str] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    parent_id: Optional[int] = Field(default=None, foreign_key="companies.id")
    tags: list = JSONField(list)
    custom: dict = JSONField(dict)
    last_activity_at: Optional[datetime] = None


class Contact(Base, table=True):
    __tablename__ = "contacts"

    first_name: str = ""
    last_name: str = ""
    email: Optional[str] = Field(default=None, index=True)
    phone: Optional[str] = None
    mobile: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    lifecycle: str = Field(default="lead", index=True)  # lead|mql|sql|opportunity|customer|evangelist|lost
    lead_score: int = 0
    source: Optional[str] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    linkedin: Optional[str] = None
    twitter: Optional[str] = None
    telegram: Optional[str] = None
    wallet_address: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = "fr"
    birthday: Optional[date] = None
    notes: Optional[str] = None
    avatar_url: Optional[str] = None
    tags: list = JSONField(list)
    custom: dict = JSONField(dict)
    # --- RGPD / prospection --------------------------------------------------
    consent_marketing: bool = False  # consentement explicite à la prospection par email
    consent_at: Optional[datetime] = None
    consent_source: Optional[str] = None
    unsubscribed_at: Optional[datetime] = None  # opposition (lien de désinscription)
    do_not_contact: bool = False  # droit d'opposition : aucune sollicitation
    do_not_call: bool = False  # opposition au démarchage téléphonique
    anonymized_at: Optional[datetime] = None  # droit à l'effacement exercé
    last_contacted_at: Optional[datetime] = None

    @property
    def full_name(self) -> str:
        name = f"{self.first_name or ''} {self.last_name or ''}".strip()
        return name or (self.email or f"Contact #{self.id}")


class ConsentLog(Base, table=True):
    """Preuve des consentements / oppositions (RGPD art. 7.1)."""

    __tablename__ = "consent_logs"

    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    email: Optional[str] = None
    channel: str = "email"  # email|phone|sms|all
    action: str = "granted"  # granted|withdrawn
    source: Optional[str] = None  # form:<slug>|unsubscribe|manual|import|api
    wording: Optional[str] = None  # texte présenté au moment du recueil
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")


class Activity(Base, table=True):
    """Timeline entry: notes, calls, meetings, emails and system events."""

    __tablename__ = "activities"

    type: str = Field(default="note", index=True)  # note|call|email|meeting|task|deal|quote|invoice|ticket|system|ai
    subject: Optional[str] = None
    body: Optional[str] = None
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id", index=True)
    ticket_id: Optional[int] = Field(default=None, foreign_key="tickets.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    occurred_at: datetime = Field(default_factory=utcnow, index=True)
    duration_minutes: Optional[int] = None
    outcome: Optional[str] = None
    direction: Optional[str] = None
    pinned: bool = False
    meta: dict = JSONField(dict)

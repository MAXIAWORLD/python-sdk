"""Pipelines, deals, products, quotes, invoices, payments, subscriptions."""

from __future__ import annotations

import datetime as dt
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field

from .base import Base, JSONField, new_token, today, utcnow


class Pipeline(Base, table=True):
    __tablename__ = "pipelines"

    name: str
    kind: str = "sales"  # sales|partnership|services|custom
    position: int = 0
    is_default: bool = False
    color: str = "#5b6cff"


class Stage(Base, table=True):
    __tablename__ = "stages"

    pipeline_id: int = Field(foreign_key="pipelines.id", index=True)
    name: str
    position: int = 0
    probability: int = 10
    color: str = "#8e8e93"
    is_won: bool = False
    is_lost: bool = False
    rotting_days: Optional[int] = None


class Deal(Base, table=True):
    __tablename__ = "deals"

    title: str = Field(index=True)
    pipeline_id: int = Field(foreign_key="pipelines.id", index=True)
    stage_id: int = Field(foreign_key="stages.id", index=True)
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    amount: float = 0  # one-shot value (HT)
    mrr: float = 0  # recurring monthly value (HT)
    currency: str = "EUR"
    probability: Optional[int] = None
    status: str = Field(default="open", index=True)  # open|won|lost
    expected_close_date: Optional[date] = None
    closed_at: Optional[datetime] = None
    lost_reason: Optional[str] = None
    source: Optional[str] = None
    priority: str = "medium"  # low|medium|high
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    description: Optional[str] = None
    position: float = 0
    stage_changed_at: datetime = Field(default_factory=utcnow)
    products: list = JSONField(list)
    tags: list = JSONField(list)
    custom: dict = JSONField(dict)
    ai_score: Optional[int] = None
    ai_insight: Optional[str] = None

    @property
    def value(self) -> float:
        """First-year contract value: one-shot amount + 12 months of MRR."""
        return round((self.amount or 0) + 12 * (self.mrr or 0), 2)


class Product(Base, table=True):
    __tablename__ = "products"

    name: str = Field(index=True)
    sku: Optional[str] = None
    kind: str = "service"  # service|product|subscription|license
    category: Optional[str] = None
    description: Optional[str] = None
    unit_price: float = 0
    unit: str = "unité"
    vat_rate: float = 20.0
    recurring_interval: Optional[str] = None  # month|quarter|year
    cost: Optional[float] = None
    active: bool = True


class Quote(Base, table=True):
    __tablename__ = "quotes"

    number: str = Field(default="", index=True)
    title: Optional[str] = None
    status: str = Field(default="draft", index=True)  # draft|sent|viewed|accepted|declined|expired|invoiced
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id", index=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    issue_date: date = Field(default_factory=today)
    valid_until: Optional[date] = None
    currency: str = "EUR"
    lines: list = JSONField(list)
    discount: float = 0
    subtotal: float = 0
    tax_total: float = 0
    total: float = 0
    deposit_percent: Optional[float] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    public_token: str = Field(default_factory=new_token, index=True)
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    signed_by: Optional[str] = None
    signer_email: Optional[str] = None
    signature: Optional[str] = None  # drawn signature (data URL)
    signature_ip: Optional[str] = None
    signature_user_agent: Optional[str] = None
    signature_hash: Optional[str] = None  # SHA-256 of the quote content at acceptance (proof file)
    nature: str = "services"  # goods|services|mixed
    vat_mention: Optional[str] = None
    seller: dict = JSONField(dict)  # snapshot of the issuer identity when sent
    buyer: dict = JSONField(dict)  # snapshot of the client identity when sent
    invoice_id: Optional[int] = None  # invoice created from this quote (not a FK: invoices already reference quotes)


class Invoice(Base, table=True):
    __tablename__ = "invoices"

    number: str = Field(default="", index=True)
    kind: str = "invoice"  # invoice|credit_note|deposit
    title: Optional[str] = None
    status: str = Field(default="draft", index=True)  # draft|sent|partial|paid|overdue|cancelled
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id", index=True)
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id")
    quote_id: Optional[int] = Field(default=None, foreign_key="quotes.id")
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id")
    subscription_id: Optional[int] = Field(default=None, foreign_key="subscriptions.id")
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    issue_date: date = Field(default_factory=today, index=True)
    due_date: Optional[date] = Field(default=None, index=True)
    currency: str = "EUR"
    lines: list = JSONField(list)
    discount: float = 0
    subtotal: float = 0
    tax_total: float = 0
    total: float = 0
    amount_paid: float = 0
    credited_amount: float = 0  # montant annulé par avoir(s)
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    public_token: str = Field(default_factory=new_token, index=True)
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    reminders_sent: int = 0
    last_reminder_at: Optional[datetime] = None
    # --- Conformité française -------------------------------------------------
    sequence: Optional[int] = Field(default=None, index=True)  # numéro d'ordre continu (attribué à l'émission)
    issued_at: Optional[datetime] = None  # date/heure d'émission (finalisation)
    locked: bool = False  # facture émise = inaltérable (corrections par avoir uniquement)
    nature: str = "services"  # goods|services|mixed (mention obligatoire réforme e-facturation)
    service_date: Optional[date] = None  # date de la vente / de la prestation
    service_period_end: Optional[date] = None
    vat_mention: Optional[str] = None  # ex. "TVA non applicable, art. 293 B du CGI"
    vat_on_debits: bool = False  # option pour le paiement de la TVA d'après les débits
    late_penalty_rate: Optional[str] = None
    early_payment_discount: Optional[str] = None
    recovery_fee: float = 40.0  # indemnité forfaitaire pour frais de recouvrement (B2B)
    seller: dict = JSONField(dict)  # identité du vendeur figée à l'émission
    buyer: dict = JSONField(dict)  # identité du client figée à l'émission
    credit_for_id: Optional[int] = Field(default=None, foreign_key="invoices.id")  # avoir -> facture d'origine
    cancelled_by_id: Optional[int] = None  # facture annulée par cet avoir
    hash: Optional[str] = None  # chaînage d'intégrité SHA-256
    prev_hash: Optional[str] = None
    einvoice_format: Optional[str] = None  # factur-x|ubl|cii
    einvoice_status: Optional[str] = None  # deposited|issued|received|accepted|refused|rejected|paid
    einvoice_ref: Optional[str] = None

    @property
    def balance_due(self) -> float:
        return round((self.total or 0) - (self.amount_paid or 0) - (self.credited_amount or 0), 2)


class Payment(Base, table=True):
    __tablename__ = "payments"

    invoice_id: int = Field(foreign_key="invoices.id", index=True)
    amount: float
    date: dt.date = Field(default_factory=today)
    method: str = "transfer"  # transfer|card|crypto|check|cash|stripe|paypal|direct_debit|other
    reference: Optional[str] = None
    chain: Optional[str] = None
    tx_hash: Optional[str] = None
    notes: Optional[str] = None


class Subscription(Base, table=True):
    __tablename__ = "subscriptions"

    company_id: int = Field(foreign_key="companies.id", index=True)
    contact_id: Optional[int] = Field(default=None, foreign_key="contacts.id")
    product_id: Optional[int] = Field(default=None, foreign_key="products.id")
    deal_id: Optional[int] = Field(default=None, foreign_key="deals.id")
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    plan: str
    status: str = Field(default="active", index=True)  # trialing|active|past_due|paused|canceled
    amount: float = 0  # per interval, per unit (HT)
    quantity: int = 1
    interval: str = "month"  # month|quarter|year
    discount: float = 0  # %
    currency: str = "EUR"
    start_date: date = Field(default_factory=today)
    trial_end: Optional[date] = None
    current_period_end: Optional[date] = None
    canceled_at: Optional[date] = None
    cancel_reason: Optional[str] = None
    auto_invoice: bool = False
    vat_rate: float = 20.0
    notes: Optional[str] = None

    @property
    def mrr(self) -> float:
        if self.status not in ("active", "past_due"):
            return 0.0
        divisor = {"month": 1, "quarter": 3, "year": 12}.get(self.interval or "month", 1)
        gross = (self.amount or 0) * (self.quantity or 1) * (1 - (self.discount or 0) / 100)
        return round(gross / divisor, 2)


class SubscriptionChange(Base, table=True):
    """MRR movement log (new, expansion, contraction, churn, reactivation)."""

    __tablename__ = "subscription_changes"

    subscription_id: int = Field(foreign_key="subscriptions.id", index=True)
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id")
    date: dt.date = Field(default_factory=today, index=True)
    kind: str  # new|expansion|contraction|churn|reactivation
    mrr_delta: float = 0
    mrr_after: float = 0

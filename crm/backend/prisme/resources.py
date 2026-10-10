"""Declaration of every CRM resource and its business rules (hooks)."""

from __future__ import annotations

import re
import secrets
import unicodedata
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, func, select

from .config import settings as env
from .crud import Hooks, Resource
from .models import (
    Activity,
    AIProvider,
    AuditLog,
    Automation,
    AutomationRun,
    Campaign,
    CampaignRecipient,
    Company,
    ConsentLog,
    Contact,
    Deal,
    Document,
    EmailMessage,
    EmailTemplate,
    Event,
    Form,
    FormSubmission,
    Invoice,
    KbArticle,
    Notification,
    Payment,
    Pipeline,
    Product,
    Project,
    Quote,
    Segment,
    Stage,
    Subscription,
    SubscriptionChange,
    Task,
    Ticket,
    TicketMessage,
    TimeEntry,
    User,
    Webhook,
    today,
    utcnow,
)
from .security import encrypt_secret, mask_secret, decrypt_secret
from .serialize import jsonable
from .services import invoicing
from .services.events import queue_event


def slugify(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or secrets.token_hex(3)


def _uid(user: User | None) -> int | None:
    return user.id if user else None


# ---------------------------------------------------------------------------
# Relationship management
# ---------------------------------------------------------------------------


class CompanyHooks(Hooks):
    def prepare(self, session, data, obj, user):
        website = data.get("website")
        if website and not data.get("domain"):
            domain = re.sub(r"^https?://", "", website).split("/")[0].removeprefix("www.")
            data["domain"] = domain.lower()
        siret = (data.get("siret") or "").replace(" ", "")
        if siret and not data.get("siren") and not (obj and obj.siren):
            data["siren"] = siret[:9]
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data

    def before_delete(self, session, obj, user):
        issued = session.exec(select(func.count()).select_from(Invoice).where(Invoice.company_id == obj.id, Invoice.locked == True)).one()  # noqa: E712
        if issued:
            raise HTTPException(
                409,
                "Suppression impossible : des factures émises sont rattachées à cette entreprise "
                "(conservation légale de 10 ans). Passez-la plutôt en statut « inactive ».",
            )
        for model in (Contact, Deal, Project, Ticket, Task, Activity, Event, Document, Quote, Invoice, EmailMessage):
            for row in session.exec(select(model).where(model.company_id == obj.id)).all():
                row.company_id = None
                session.add(row)


class ContactHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if data.get("email"):
            data["email"] = str(data["email"]).strip().lower()
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data

    def before_save(self, session, obj, changes, created, user):
        from .services import rgpd

        if "consent_marketing" in changes:
            if obj.consent_marketing:
                obj.consent_at = obj.consent_at or utcnow()
                obj.consent_source = obj.consent_source or "manual"
                obj.unsubscribed_at = None
            rgpd.log_consent(session, obj, "granted" if obj.consent_marketing else "withdrawn", source="manual" if user else "api", user=user)
        if "unsubscribed_at" in changes and obj.unsubscribed_at:
            obj.consent_marketing = False

    def before_delete(self, session, obj, user):
        for model in (Deal, Task, Activity, Event, Document, Quote, Invoice, EmailMessage, Ticket, FormSubmission, CampaignRecipient, ConsentLog):
            for row in session.exec(select(model).where(model.contact_id == obj.id)).all():
                row.contact_id = None
                session.add(row)


class ActivityHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and user and not data.get("user_id"):
            data["user_id"] = user.id
        return data

    def after_save(self, session, obj, changes, created, user):
        if not created:
            return
        if obj.contact_id and obj.type in ("call", "email", "meeting"):
            contact = session.get(Contact, obj.contact_id)
            if contact:
                contact.last_contacted_at = obj.occurred_at or utcnow()
                session.add(contact)
        if obj.company_id:
            company = session.get(Company, obj.company_id)
            if company:
                company.last_activity_at = utcnow()
                session.add(company)


# ---------------------------------------------------------------------------
# Sales pipeline
# ---------------------------------------------------------------------------


def default_pipeline(session: Session) -> Pipeline:
    pipeline = session.exec(select(Pipeline).order_by(Pipeline.is_default.desc(), Pipeline.position)).first()
    if pipeline is None:
        raise HTTPException(409, "Aucun pipeline configuré.")
    return pipeline


def first_stage(session: Session, pipeline_id: int) -> Stage:
    stage = session.exec(select(Stage).where(Stage.pipeline_id == pipeline_id, Stage.is_won == False, Stage.is_lost == False).order_by(Stage.position)).first()  # noqa: E712
    if stage is None:
        stage = session.exec(select(Stage).where(Stage.pipeline_id == pipeline_id).order_by(Stage.position)).first()
    if stage is None:
        raise HTTPException(409, "Ce pipeline n'a aucune étape.")
    return stage


class DealHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None:
            if not data.get("pipeline_id"):
                data["pipeline_id"] = (
                    session.get(Stage, int(data["stage_id"])).pipeline_id if data.get("stage_id") else default_pipeline(session).id
                )
            if not data.get("stage_id"):
                data["stage_id"] = first_stage(session, int(data["pipeline_id"])).id
            if user and not data.get("owner_id"):
                data["owner_id"] = user.id
        elif data.get("pipeline_id") and int(data["pipeline_id"]) != obj.pipeline_id and not data.get("stage_id"):
            data["stage_id"] = first_stage(session, int(data["pipeline_id"])).id
        if data.get("stage_id"):
            stage = session.get(Stage, int(data["stage_id"]))
            if stage is None:
                raise HTTPException(422, "Étape inconnue.")
            data["pipeline_id"] = stage.pipeline_id
        if data.get("status") in ("won", "lost") and not data.get("stage_id"):
            pid = int(data.get("pipeline_id") or (obj.pipeline_id if obj else default_pipeline(session).id))
            flag = Stage.is_won if data["status"] == "won" else Stage.is_lost
            stage = session.exec(select(Stage).where(Stage.pipeline_id == pid, flag == True)).first()  # noqa: E712
            if stage:
                data["stage_id"] = stage.id
        return data

    def before_save(self, session, obj, changes, created, user):
        if created or "stage_id" in changes:
            stage = session.get(Stage, obj.stage_id)
            obj.stage_changed_at = utcnow()
            if stage is not None:
                if stage.is_won:
                    obj.status = "won"
                    obj.closed_at = obj.closed_at or utcnow()
                elif stage.is_lost:
                    obj.status = "lost"
                    obj.closed_at = obj.closed_at or utcnow()
                else:
                    obj.status = "open"
                    obj.closed_at = None

    def after_save(self, session, obj, changes, created, user):
        if created:
            session.add(Activity(type="deal", subject=f"Opportunité créée : {obj.title}", deal_id=obj.id, company_id=obj.company_id, contact_id=obj.contact_id, user_id=_uid(user)))
            return
        if "stage_id" in changes:
            old_id, new_id = changes["stage_id"]
            old = session.get(Stage, old_id) if old_id else None
            new = session.get(Stage, new_id) if new_id else None
            session.add(
                Activity(
                    type="deal",
                    subject=f"Étape : {old.name if old else '—'} → {new.name if new else '—'}",
                    deal_id=obj.id,
                    company_id=obj.company_id,
                    contact_id=obj.contact_id,
                    user_id=_uid(user),
                    meta={"from": old_id, "to": new_id},
                )
            )
            payload = {"id": obj.id, "title": obj.title, "from_stage": old.name if old else None, "to_stage": new.name if new else None, "amount": obj.amount, "mrr": obj.mrr, "company_id": obj.company_id, "contact_id": obj.contact_id, "owner_id": obj.owner_id}
            queue_event(session, "deal.stage_changed", payload, _uid(user))
            if "status" in changes and obj.status in ("won", "lost"):
                queue_event(session, f"deal.{obj.status}", payload, _uid(user))
                if obj.status == "won" and obj.company_id:
                    company = session.get(Company, obj.company_id)
                    if company and company.type == "prospect":
                        company.type = "client"
                        session.add(company)
                    if obj.contact_id:
                        contact = session.get(Contact, obj.contact_id)
                        if contact and contact.lifecycle not in ("customer", "evangelist"):
                            contact.lifecycle = "customer"
                            session.add(contact)


class PipelineHooks(Hooks):
    def before_delete(self, session, obj, user):
        if session.exec(select(func.count()).select_from(Deal).where(Deal.pipeline_id == obj.id)).one():
            raise HTTPException(409, "Ce pipeline contient des opportunités : déplacez-les avant de le supprimer.")
        for stage in session.exec(select(Stage).where(Stage.pipeline_id == obj.id)).all():
            session.delete(stage)

    def after_save(self, session, obj, changes, created, user):
        if obj.is_default:
            for other in session.exec(select(Pipeline).where(Pipeline.id != obj.id, Pipeline.is_default == True)).all():  # noqa: E712
                other.is_default = False
                session.add(other)


class StageHooks(Hooks):
    def before_delete(self, session, obj, user):
        if session.exec(select(func.count()).select_from(Deal).where(Deal.stage_id == obj.id)).one():
            raise HTTPException(409, "Cette étape contient des opportunités : déplacez-les d'abord.")


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------


class QuoteHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is not None and obj.status == "invoiced" and set(data) - {"notes"}:
            raise HTTPException(409, "Ce devis a été facturé : dupliquez-le pour le modifier.")
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        if data.get("status") == "accepted" and not (obj and obj.accepted_at):
            data["accepted_at"] = utcnow()
        if data.get("status") == "declined" and not (obj and obj.declined_at):
            data["declined_at"] = utcnow()
        return data

    def before_save(self, session, obj, changes, created, user):
        if created:
            invoicing.quote_defaults(session, obj)
        if created or {"lines", "discount"} & set(changes):
            invoicing.apply_totals(session, obj)

    def after_save(self, session, obj, changes, created, user):
        if "status" in changes and obj.status in ("accepted", "declined"):
            queue_event(session, f"quote.{obj.status}", {"id": obj.id, "number": obj.number, "total": obj.total, "company_id": obj.company_id, "deal_id": obj.deal_id}, _uid(user))

    def before_delete(self, session, obj, user):
        if obj.status == "invoiced" or obj.invoice_id:
            raise HTTPException(409, "Ce devis a déjà été facturé et ne peut pas être supprimé.")


INVOICE_LOCKED_EDITABLE = {"einvoice_status", "einvoice_ref"}


class InvoiceHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is not None and obj.locked:
            changed = {k for k, v in data.items() if jsonable(getattr(obj, k, None)) != jsonable(v)}
            forbidden = changed - INVOICE_LOCKED_EDITABLE
            if forbidden:
                raise HTTPException(
                    409,
                    f"La facture {obj.number} est émise : elle n'est plus modifiable (règle d'inaltérabilité). "
                    "Créez un avoir pour la corriger.",
                )
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data

    def before_save(self, session, obj, changes, created, user):
        if obj.locked:
            return
        if created or {"lines", "discount"} & set(changes):
            invoicing.apply_totals(session, obj)
        if created:
            invoicing.invoice_defaults(session, obj)

    def before_delete(self, session, obj, user):
        if obj.locked:
            raise HTTPException(409, "Une facture émise ne peut pas être supprimée (conservation légale). Émettez un avoir.")


class SubscriptionHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if data.get("status") == "canceled" and not data.get("canceled_at") and not (obj and obj.canceled_at):
            data["canceled_at"] = today().isoformat()
        if data.get("status") in ("active", "trialing") and obj and obj.status == "canceled":
            data["canceled_at"] = None
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data

    def before_save(self, session, obj, changes, created, user):
        if not obj.current_period_end:
            months = {"month": 1, "quarter": 3, "year": 12}.get(obj.interval or "month", 1)
            start = obj.trial_end or obj.start_date or today()
            obj.current_period_end = start + timedelta(days=30 * months)
        session.info.setdefault("mrr_before", {})[id(obj)] = 0.0 if created else _mrr_from_changes(obj, changes)

    def after_save(self, session, obj, changes, created, user):
        from .services.subscriptions import record_mrr_change

        before = session.info.get("mrr_before", {}).pop(id(obj), None)
        if before is None:
            return
        record_mrr_change(session, obj, before, obj.mrr)


def _mrr_from_changes(obj: Subscription, changes: dict[str, Any]) -> float | None:
    keys = {"amount", "quantity", "interval", "discount", "status"}
    if not keys & set(changes):
        return None
    snapshot = Subscription(
        company_id=obj.company_id,
        plan=obj.plan,
        amount=changes.get("amount", [obj.amount])[0],
        quantity=changes.get("quantity", [obj.quantity])[0],
        interval=changes.get("interval", [obj.interval])[0],
        discount=changes.get("discount", [obj.discount])[0],
        status=changes.get("status", [obj.status])[0],
    )
    return snapshot.mrr


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------


class ProjectHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data

    def before_save(self, session, obj, changes, created, user):
        if created and not obj.code:
            count = session.exec(select(func.count()).select_from(Project)).one()
            obj.code = f"PRJ-{count + 1:03d}"


class TaskHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and user:
            data.setdefault("created_by_id", user.id)
            if "assignee_id" not in data:
                data["assignee_id"] = user.id
        return data

    def before_save(self, session, obj, changes, created, user):
        if "status" in changes or created:
            if obj.status == "done":
                obj.completed_at = obj.completed_at or utcnow()
            else:
                obj.completed_at = None

    def after_save(self, session, obj, changes, created, user):
        if "status" in changes and obj.status == "done" and not created:
            session.add(Activity(type="task", subject=f"Tâche terminée : {obj.title}", contact_id=obj.contact_id, company_id=obj.company_id, deal_id=obj.deal_id, project_id=obj.project_id, user_id=_uid(user)))
            queue_event(session, "task.completed", {"id": obj.id, "title": obj.title, "project_id": obj.project_id, "deal_id": obj.deal_id}, _uid(user))


class TimeEntryHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None:
            if user and not data.get("user_id"):
                data["user_id"] = user.id
            if not data.get("date"):
                data["date"] = today().isoformat()
        if obj is not None and obj.invoice_id and set(data) - {"description"}:
            raise HTTPException(409, "Ce temps a déjà été facturé.")
        return data

    def before_save(self, session, obj, changes, created, user):
        if obj.started_at and obj.ended_at and (created or {"started_at", "ended_at"} & set(changes)):
            obj.minutes = max(int((obj.ended_at - obj.started_at).total_seconds() // 60), 0)
        if obj.project_id and obj.hourly_rate is None:
            project = session.get(Project, obj.project_id)
            if project and project.hourly_rate:
                obj.hourly_rate = project.hourly_rate
            if project and not obj.company_id:
                obj.company_id = project.company_id


class EventHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and user and not data.get("user_id"):
            data["user_id"] = user.id
        return data

    def before_save(self, session, obj, changes, created, user):
        if obj.start_at and (not obj.end_at or obj.end_at < obj.start_at):
            obj.end_at = obj.start_at + timedelta(hours=1)


# ---------------------------------------------------------------------------
# Support
# ---------------------------------------------------------------------------

SLA_HOURS = {"urgent": 4, "high": 8, "normal": 24, "low": 72}


class TicketHooks(Hooks):
    def before_save(self, session, obj, changes, created, user):
        if created:
            obj.number = obj.number or invoicing.next_ticket_number(session)
        if created or "priority" in changes:
            obj.sla_due_at = (obj.created_at or utcnow()) + timedelta(hours=SLA_HOURS.get(obj.priority, 24))
        if "status" in changes:
            if obj.status in ("resolved", "closed"):
                obj.resolved_at = obj.resolved_at or utcnow()
            else:
                obj.resolved_at = None

    def after_save(self, session, obj, changes, created, user):
        if created:
            if obj.description:
                session.add(TicketMessage(ticket_id=obj.id, author_type="customer", author_name=None, body=obj.description))
            queue_event(session, "ticket.created_detail", {"id": obj.id, "subject": obj.subject, "priority": obj.priority, "company_id": obj.company_id}, _uid(user))
        elif "status" in changes and obj.status in ("resolved", "closed"):
            session.add(Activity(type="ticket", subject=f"Ticket {obj.number} résolu", ticket_id=obj.id, company_id=obj.company_id, contact_id=obj.contact_id, user_id=_uid(user)))

    def before_delete(self, session, obj, user):
        for msg in session.exec(select(TicketMessage).where(TicketMessage.ticket_id == obj.id)).all():
            session.delete(msg)


class TicketMessageHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and user:
            data.setdefault("user_id", user.id)
            data.setdefault("author_name", user.name)
        return data

    def after_save(self, session, obj, changes, created, user):
        if not created:
            return
        ticket = session.get(Ticket, obj.ticket_id)
        if ticket is None:
            return
        if obj.author_type in ("agent", "ai") and not obj.is_internal:
            ticket.first_response_at = ticket.first_response_at or utcnow()
            if ticket.status in ("new", "open"):
                ticket.status = "pending"
        elif obj.author_type == "customer" and ticket.status in ("pending", "resolved"):
            ticket.status = "open"
        ticket.updated_at = utcnow()
        session.add(ticket)


class KbHooks(Hooks):
    def before_save(self, session, obj, changes, created, user):
        if created or "title" in changes:
            if not obj.slug or "title" in changes:
                obj.slug = slugify(obj.title)
        if created and user and not obj.author_id:
            obj.author_id = user.id


# ---------------------------------------------------------------------------
# Marketing & communication
# ---------------------------------------------------------------------------


class FormHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and not data.get("slug"):
            base = slugify(data.get("name") or "formulaire")
            slug, n = base, 1
            while session.exec(select(Form).where(Form.slug == slug)).first():
                n += 1
                slug = f"{base}-{n}"
            data["slug"] = slug
        if obj is None and not data.get("fields"):
            data["fields"] = [
                {"name": "first_name", "label": "Prénom", "type": "text", "required": True, "map_to": "first_name"},
                {"name": "last_name", "label": "Nom", "type": "text", "required": True, "map_to": "last_name"},
                {"name": "email", "label": "Email professionnel", "type": "email", "required": True, "map_to": "email"},
                {"name": "company", "label": "Entreprise", "type": "text", "required": False, "map_to": "company"},
                {"name": "message", "label": "Votre besoin", "type": "textarea", "required": False, "map_to": "message"},
            ]
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data


class CampaignHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is not None and obj.status in ("sending", "sent") and set(data) - {"name", "tags"}:
            raise HTTPException(409, "Campagne déjà envoyée : dupliquez-la pour la modifier.")
        if obj is None and user and not data.get("owner_id"):
            data["owner_id"] = user.id
        return data


class DocumentHooks(Hooks):
    def before_delete(self, session, obj, user):
        path = env.uploads_dir / Path(obj.filename).name
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


class WebhookHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if obj is None and not data.get("secret"):
            data["secret"] = "whsec_" + secrets.token_urlsafe(24)
        return data


class NotificationHooks(Hooks):
    def scope(self, stmt, user):
        if user is None:
            return stmt
        return stmt.where((Notification.user_id == user.id) | (Notification.user_id.is_(None)))


class UserHooks(Hooks):
    def prepare(self, session, data, obj, user):
        if data.get("email"):
            data["email"] = str(data["email"]).strip().lower()
            existing = session.exec(select(User).where(User.email == data["email"])).first()
            if existing and (obj is None or existing.id != obj.id):
                raise HTTPException(409, "Un utilisateur utilise déjà cet email.")
        if obj is not None and user is not None and obj.id == user.id and data.get("role") and data["role"] != obj.role:
            raise HTTPException(409, "Vous ne pouvez pas modifier votre propre rôle.")
        if obj is not None and obj.role == "admin" and data.get("role") not in (None, "admin"):
            admins = session.exec(select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)).one()  # noqa: E712
            if admins <= 1:
                raise HTTPException(409, "Il doit rester au moins un administrateur.")
        password = data.pop("password", None)
        if password:
            from .security import hash_password, password_problems

            problem = password_problems(password)
            if problem:
                raise HTTPException(422, problem)
            data["password_hash"] = hash_password(password)
        return data

    def before_save(self, session, obj, changes, created, user):
        pass

    def before_delete(self, session, obj, user):
        if user is not None and obj.id == user.id:
            raise HTTPException(409, "Vous ne pouvez pas supprimer votre propre compte.")
        raise HTTPException(409, "Pour préserver l'historique, désactivez l'utilisateur plutôt que de le supprimer.")


class AIProviderHooks(Hooks):
    def prepare(self, session, data, obj, user):
        key = data.pop("api_key", None)
        if key is not None and "••••" not in str(key):
            data["api_key_enc"] = encrypt_secret(key) if key else None
        return data

    def after_save(self, session, obj, changes, created, user):
        if obj.is_default:
            for other in session.exec(select(AIProvider).where(AIProvider.id != obj.id, AIProvider.is_default == True)).all():  # noqa: E712
                other.is_default = False
                session.add(other)

    def enrich(self, session, items, objs):
        for item, obj in zip(items, objs):
            key = decrypt_secret(obj.api_key_enc)
            item["api_key_set"] = bool(key)
            item["api_key_preview"] = mask_secret(key)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

RESOURCES: dict[str, Resource] = {}


def _register(resource: Resource) -> Resource:
    RESOURCES[resource.name] = resource
    return resource


_register(Resource("companies", Company, "company", "entreprise", search=("name", "domain", "city", "industry", "email", "siren", "tags"), hooks=CompanyHooks()))
_register(Resource("contacts", Contact, "contact", "contact", search=("first_name", "last_name", "email", "phone", "mobile", "job_title", "city", "tags"), hooks=ContactHooks()))
_register(Resource("activities", Activity, "activity", "activité", search=("subject", "body"), default_sort="-occurred_at", hooks=ActivityHooks()))
_register(Resource("pipelines", Pipeline, "pipeline", "pipeline", default_sort="position", write_role="manager", delete_role="admin", hooks=PipelineHooks()))
_register(Resource("stages", Stage, "stage", "étape", default_sort="position", write_role="manager", delete_role="manager", hooks=StageHooks()))
_register(Resource("deals", Deal, "deal", "opportunité", search=("title", "description", "next_step", "tags"), hooks=DealHooks(), readonly=frozenset({"stage_changed_at", "closed_at"})))
_register(Resource("products", Product, "product", "produit", search=("name", "sku", "category", "description"), default_sort="name", write_role="manager"))
_register(
    Resource(
        "quotes",
        Quote,
        "quote",
        "devis",
        search=("number", "title", "notes"),
        hooks=QuoteHooks(),
        readonly=frozenset({"number", "public_token", "subtotal", "tax_total", "total", "signature", "signature_ip", "signature_user_agent", "signature_hash", "signed_by", "signer_email", "invoice_id", "seller", "buyer", "sent_at", "viewed_at"}),
    )
)
_register(
    Resource(
        "invoices",
        Invoice,
        "invoice",
        "facture",
        search=("number", "title", "notes"),
        default_sort="-issue_date",
        hooks=InvoiceHooks(),
        readonly=frozenset({"number", "sequence", "status", "locked", "issued_at", "hash", "prev_hash", "seller", "buyer", "public_token", "subtotal", "tax_total", "total", "amount_paid", "credited_amount", "credit_for_id", "cancelled_by_id", "sent_at", "viewed_at", "paid_at", "reminders_sent", "last_reminder_at", "einvoice_format", "vat_on_debits"}),
    )
)
_register(Resource("payments", Payment, "payment", "paiement", search=("reference", "tx_hash", "notes"), default_sort="-date", write_role="admin", delete_role="admin", events=False))
_register(Resource("subscriptions", Subscription, "subscription", "abonnement", search=("plan", "notes"), hooks=SubscriptionHooks()))
_register(Resource("subscription-changes", SubscriptionChange, "subscription_change", "mouvement MRR", default_sort="-date", write_role="admin", events=False))
_register(Resource("projects", Project, "project", "projet", search=("name", "code", "description", "tags"), hooks=ProjectHooks()))
_register(Resource("tasks", Task, "task", "tâche", search=("title", "description", "tags"), default_sort="position", hooks=TaskHooks()))
_register(Resource("time-entries", TimeEntry, "time_entry", "temps", search=("description",), default_sort="-date", hooks=TimeEntryHooks()))
_register(Resource("events", Event, "event", "événement", search=("title", "description", "location"), default_sort="start_at", hooks=EventHooks()))
_register(Resource("tickets", Ticket, "ticket", "ticket", search=("number", "subject", "description", "category", "tags"), hooks=TicketHooks(), readonly=frozenset({"number", "sla_due_at"})))
_register(Resource("ticket-messages", TicketMessage, "ticket_message", "message", search=("body",), default_sort="created_at", hooks=TicketMessageHooks()))
_register(Resource("kb-articles", KbArticle, "kb_article", "article", search=("title", "summary", "body", "category", "tags"), hooks=KbHooks()))
_register(Resource("segments", Segment, "segment", "segment", search=("name", "description")))
_register(Resource("campaigns", Campaign, "campaign", "campagne", search=("name", "subject"), hooks=CampaignHooks(), readonly=frozenset({"stats", "sent_at"})))
_register(Resource("campaign-recipients", CampaignRecipient, "campaign_recipient", "destinataire", search=("email",), write_role="admin", events=False, audit=False))
_register(Resource("forms", Form, "form", "formulaire", search=("name", "title"), hooks=FormHooks(), readonly=frozenset({"submissions"})))
_register(Resource("form-submissions", FormSubmission, "form_submission", "réponse", write_role="admin", events=False))
_register(Resource("email-templates", EmailTemplate, "email_template", "modèle", search=("name", "subject", "body", "category"), default_sort="name"))
_register(Resource("emails", EmailMessage, "email", "email", search=("subject", "body_text", "from_email", "from_name"), default_sort="-sent_at", events=False))
_register(Resource("documents", Document, "document", "document", search=("name", "description", "folder", "tags"), hooks=DocumentHooks(), readonly=frozenset({"filename", "mime", "size"})))
_register(Resource("automations", Automation, "automation", "automatisation", search=("name", "description"), write_role="manager", readonly=frozenset({"run_count", "last_run_at", "last_status"})))
_register(Resource("automation-runs", AutomationRun, "automation_run", "exécution", write_role="admin", events=False, audit=False))
_register(Resource("webhooks", Webhook, "webhook", "webhook", search=("name", "url"), read_role="admin", write_role="admin", delete_role="admin", hooks=WebhookHooks(), events=False))
_register(Resource("notifications", Notification, "notification", "notification", hooks=NotificationHooks(), read_role="viewer", write_role="viewer", delete_role="viewer", events=False, audit=False))
_register(Resource("users", User, "user", "utilisateur", search=("name", "email", "title"), default_sort="name", write_role="admin", delete_role="admin", hooks=UserHooks(), readonly=frozenset({"last_login_at", "token_version"})))
_register(Resource("ai-providers", AIProvider, "ai_provider", "fournisseur IA", search=("name", "kind"), read_role="member", write_role="admin", delete_role="admin", hooks=AIProviderHooks(), events=False))
_register(Resource("consent-logs", ConsentLog, "consent_log", "preuve de consentement", search=("email", "source"), write_role="admin", events=False, audit=False))
_register(Resource("audit-logs", AuditLog, "audit_log", "journal", search=("summary", "entity", "action"), read_role="admin", write_role="admin", events=False, audit=False))


# Read-only resources: writes go through dedicated endpoints.
READ_ONLY = {"payments", "subscription-changes", "campaign-recipients", "form-submissions", "automation-runs", "consent-logs", "audit-logs"}

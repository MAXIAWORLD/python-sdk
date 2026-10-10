"""Public endpoints (no login): online quote signature, invoice view, lead forms, unsubscribe."""

from __future__ import annotations

import hashlib
import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlmodel import Session, select

from ..db import get_session
from ..models import Activity, CampaignRecipient, Company, Contact, Form, FormSubmission, Invoice, KbArticle, Quote, utcnow
from ..resources import RESOURCES
from ..serialize import dump, iso
from ..services import einvoice, invoicing, pdf, rgpd
from ..services.events import emit
from ..services.settings import get_section
from ..services.totals import compute

router = APIRouter(prefix="/public", tags=["public"])

_hits: dict[str, list[float]] = defaultdict(list)


def _throttle(request: Request, bucket: str, limit: int = 20, window: int = 600) -> None:
    key = f"{bucket}:{request.client.host if request.client else 'x'}"
    now = time.time()
    _hits[key] = [t for t in _hits[key] if now - t < window]
    if len(_hits[key]) >= limit:
        raise HTTPException(429, "Trop de requêtes, réessayez plus tard.")
    _hits[key].append(now)


def _branding(session: Session) -> dict[str, Any]:
    company = get_section(session, "company")
    branding = get_section(session, "branding")
    rules = get_section(session, "rgpd")
    return {
        "app_name": branding.get("app_name") or "Prisme",
        "accent": branding.get("accent"),
        "company": company.get("name"),
        "legal_name": company.get("legal_name") or company.get("name"),
        "logo_url": branding.get("logo_url") or company.get("logo_url"),
        "email": company.get("email"),
        "phone": company.get("phone"),
        "website": company.get("website"),
        "privacy_url": rules.get("privacy_url"),
        "dpo_email": rules.get("dpo_email"),
    }


@router.get("/branding")
def branding(session: Session = Depends(get_session)):
    return _branding(session)


def _doc_payload(session: Session, doc: Quote | Invoice) -> dict[str, Any]:
    seller = (doc.seller if getattr(doc, "seller", None) else None) or invoicing.seller_snapshot(session)
    buyer = (doc.buyer if getattr(doc, "buyer", None) else None) or invoicing.buyer_snapshot(session, doc.company_id, doc.contact_id)
    result = compute(doc.lines or [], doc.discount or 0, franchise=(seller.get("vat_regime") == "franchise"))
    data = {k: v for k, v in dump(doc).items() if k not in ("public_token", "signature_ip", "signature_user_agent", "hash", "prev_hash", "owner_id")}
    data.update(seller=seller, buyer=buyer, lines=result["lines"], vat_breakdown=result["vat_breakdown"], lines_total=result["lines_total"], discount_amount=result["discount_amount"], branding=_branding(session))
    return data


# ---------------------------------------------------------------------------
# Quotes
# ---------------------------------------------------------------------------


def _quote_by_token(session: Session, token: str) -> Quote:
    quote = session.exec(select(Quote).where(Quote.public_token == token)).first()
    if quote is None or quote.status == "draft":
        raise HTTPException(404, "Devis introuvable ou non disponible.")
    return quote


@router.get("/quotes/{token}")
def view_quote(token: str, session: Session = Depends(get_session)):
    quote = _quote_by_token(session, token)
    if quote.status == "sent":
        quote.status = "viewed"
        quote.viewed_at = utcnow()
        session.add(quote)
        session.commit()
        emit("quote.viewed", {"id": quote.id, "number": quote.number, "company_id": quote.company_id})
    data = _doc_payload(session, quote)
    data["signature"] = quote.signature if quote.accepted_at else None
    return data


@router.get("/quotes/{token}/pdf")
def quote_pdf(token: str, session: Session = Depends(get_session)):
    quote = _quote_by_token(session, token)
    return Response(pdf.render_quote(session, quote), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="Devis-{quote.number}.pdf"'})


@router.post("/quotes/{token}/accept")
def accept_quote(token: str, request: Request, payload: dict = Body(...), session: Session = Depends(get_session)):
    _throttle(request, "quote-accept", 10)
    quote = _quote_by_token(session, token)
    if quote.status in ("accepted", "invoiced"):
        raise HTTPException(409, "Ce devis a déjà été accepté.")
    if quote.status in ("declined", "expired"):
        raise HTTPException(409, "Ce devis n'est plus valable.")
    if quote.valid_until and quote.valid_until < utcnow().date():
        quote.status = "expired"
        session.add(quote)
        session.commit()
        raise HTTPException(409, "Ce devis a expiré. Contactez-nous pour une nouvelle proposition.")
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    if len(name) < 3 or "@" not in email:
        raise HTTPException(422, "Nom complet et email requis pour signer.")
    if not payload.get("agree"):
        raise HTTPException(422, "Vous devez accepter le devis et les conditions.")
    signature = payload.get("signature") or ""
    if signature and (not signature.startswith("data:image/png;base64,") or len(signature) > 400_000):
        raise HTTPException(422, "Signature invalide.")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "").split(",")[0].strip()
    ua = (request.headers.get("user-agent") or "")[:300]
    now = utcnow()
    evidence = "|".join([quote.number, f"{quote.total:.2f}", str(quote.lines), name, email, ip, ua, iso(now) or "", hashlib.sha256(signature.encode()).hexdigest()])
    quote.status = "accepted"
    quote.accepted_at = now
    quote.signed_by = name
    quote.signer_email = email
    quote.signature = signature or None
    quote.signature_ip = ip
    quote.signature_user_agent = ua
    quote.signature_hash = hashlib.sha256(evidence.encode()).hexdigest()
    session.add(quote)
    invoicing.log_activity(session, quote, "quote", f"Devis {quote.number} signé en ligne par {name}", None)
    session.commit()
    emit("quote.accepted", {"id": quote.id, "number": quote.number, "total": quote.total, "company_id": quote.company_id, "deal_id": quote.deal_id})
    return {"ok": True, "accepted_at": iso(now), "signature_hash": quote.signature_hash}


@router.post("/quotes/{token}/decline")
def decline_quote(token: str, request: Request, payload: dict = Body(default={}), session: Session = Depends(get_session)):
    _throttle(request, "quote-decline", 10)
    quote = _quote_by_token(session, token)
    if quote.status in ("accepted", "invoiced"):
        raise HTTPException(409, "Ce devis a déjà été accepté.")
    quote.status = "declined"
    quote.declined_at = utcnow()
    reason = (payload.get("reason") or "").strip()[:500]
    session.add(quote)
    invoicing.log_activity(session, quote, "quote", f"Devis {quote.number} refusé par le client" + (f" : {reason}" if reason else ""), None)
    session.commit()
    emit("quote.declined", {"id": quote.id, "number": quote.number, "reason": reason, "company_id": quote.company_id, "deal_id": quote.deal_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


def _invoice_by_token(session: Session, token: str) -> Invoice:
    invoice = session.exec(select(Invoice).where(Invoice.public_token == token)).first()
    if invoice is None or not invoice.locked:
        raise HTTPException(404, "Facture introuvable.")
    return invoice


@router.get("/invoices/{token}")
def view_invoice(token: str, session: Session = Depends(get_session)):
    invoice = _invoice_by_token(session, token)
    if not invoice.viewed_at:
        invoice.viewed_at = utcnow()
        session.add(invoice)
        session.commit()
    return _doc_payload(session, invoice)


@router.get("/invoices/{token}/pdf")
def invoice_pdf(token: str, session: Session = Depends(get_session)):
    invoice = _invoice_by_token(session, token)
    return Response(einvoice.generate_facturx_pdf(session, invoice), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{invoice.number}.pdf"'})


# ---------------------------------------------------------------------------
# Lead capture forms
# ---------------------------------------------------------------------------


def _form(session: Session, slug: str) -> Form:
    form = session.exec(select(Form).where(Form.slug == slug, Form.active == True)).first()  # noqa: E712
    if form is None:
        raise HTTPException(404, "Formulaire introuvable.")
    return form


def _notice(session: Session) -> str:
    company = get_section(session, "company")
    rules = get_section(session, "rgpd")
    contact = rules.get("dpo_email") or company.get("email") or "notre service client"
    return (rules.get("form_notice") or "").format(company=rules.get("controller_name") or company.get("legal_name") or company.get("name") or "l'entreprise", contact=contact)


@router.get("/forms/{slug}")
def get_form(slug: str, session: Session = Depends(get_session)):
    form = _form(session, slug)
    return {
        "slug": form.slug,
        "title": form.title or form.name,
        "description": form.description,
        "fields": form.fields,
        "submit_label": form.submit_label,
        "theme": form.theme,
        "notice": _notice(session),
        "consent_label": "J'accepte de recevoir des informations commerciales par email (désinscription possible à tout moment).",
        "branding": _branding(session),
    }


@router.post("/forms/{slug}")
def submit_form(slug: str, request: Request, payload: dict = Body(...), session: Session = Depends(get_session)):
    _throttle(request, f"form:{slug}", 15)
    form = _form(session, slug)
    if payload.get("_hp"):  # honeypot field
        return {"ok": True, "message": form.success_message}
    values: dict[str, Any] = payload.get("values") or {}
    for field in form.fields or []:
        if field.get("required") and not str(values.get(field["name"], "")).strip():
            raise HTTPException(422, f"Le champ « {field.get('label') or field['name']} » est obligatoire.")
    mapped: dict[str, Any] = {}
    extra_notes = []
    for field in form.fields or []:
        value = values.get(field["name"])
        if value in (None, ""):
            continue
        target = field.get("map_to") or ""
        if target in ("first_name", "last_name", "email", "phone", "mobile", "job_title", "city", "country", "linkedin"):
            mapped[target] = str(value).strip()
        else:
            extra_notes.append(f"{field.get('label') or field['name']} : {value}")
    email = (mapped.get("email") or "").lower()
    if not email or "@" not in email:
        raise HTTPException(422, "Adresse email invalide.")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "").split(",")[0].strip()
    ua = (request.headers.get("user-agent") or "")[:300]
    contact = session.exec(select(Contact).where(Contact.email == email)).first()
    company_name = next((str(values.get(f["name"])).strip() for f in form.fields or [] if f.get("map_to") == "company" and values.get(f["name"])), None)
    company = None
    if company_name:
        company = session.exec(select(Company).where(Company.name == company_name)).first() or RESOURCES["companies"].create(session, {"name": company_name, "source": f"Formulaire {form.name}", "owner_id": form.owner_id}, None)
    consent = bool(payload.get("consent"))
    if contact is None:
        contact = RESOURCES["contacts"].create(
            session,
            {**mapped, "email": email, "lifecycle": form.lifecycle or "lead", "source": f"Formulaire : {form.name}", "owner_id": form.owner_id, "company_id": company.id if company else None, "tags": list(form.tags_to_add or []), "notes": "\n".join(extra_notes) or None},
            None,
        )
    else:
        tags = sorted(set((contact.tags or []) + list(form.tags_to_add or [])))
        RESOURCES["contacts"].update(session, contact.id, {"tags": tags, **({"company_id": company.id} if company and not contact.company_id else {})}, None)
    if consent:
        contact = session.get(Contact, contact.id)
        contact.consent_marketing = True
        contact.consent_at = utcnow()
        contact.consent_source = f"form:{form.slug}"
        contact.unsubscribed_at = None
        session.add(contact)
        rgpd.log_consent(session, contact, "granted", source=f"form:{form.slug}", wording="J'accepte de recevoir des informations commerciales par email.", ip=ip, user_agent=ua)
    session.add(FormSubmission(form_id=form.id, contact_id=contact.id, data=values, ip=ip, user_agent=ua, referrer=(request.headers.get("referer") or "")[:300]))
    session.add(Activity(type="note", subject=f"Formulaire « {form.name} » soumis", body="\n".join(extra_notes) or None, contact_id=contact.id, company_id=contact.company_id))
    form.submissions = (form.submissions or 0) + 1
    session.add(form)
    session.commit()
    if form.create_deal:
        RESOURCES["deals"].create(session, {"title": f"{company_name or contact.full_name} — {form.name}", "contact_id": contact.id, "company_id": contact.company_id, "pipeline_id": form.pipeline_id, "stage_id": form.stage_id, "source": f"Formulaire : {form.name}", "owner_id": form.owner_id}, None)
    emit("form.submitted", {"form_id": form.id, "form": form.name, "contact_id": contact.id, "name": contact.full_name, "email": email, "owner_id": form.owner_id})
    return {"ok": True, "message": form.success_message, "redirect_url": form.redirect_url}


# ---------------------------------------------------------------------------
# Unsubscribe (LCEN / CNIL : opposition simple et gratuite)
# ---------------------------------------------------------------------------


@router.get("/unsubscribe/{token}")
def unsubscribe_info(token: str, session: Session = Depends(get_session)):
    recipient = session.exec(select(CampaignRecipient).where(CampaignRecipient.token == token)).first()
    return {"valid": recipient is not None, "email": _mask_email(recipient.email) if recipient else None, "branding": _branding(session)}


@router.post("/unsubscribe/{token}")
def unsubscribe(token: str, request: Request, session: Session = Depends(get_session)):
    recipient = session.exec(select(CampaignRecipient).where(CampaignRecipient.token == token)).first()
    if recipient is None:
        raise HTTPException(404, "Lien de désinscription invalide.")
    recipient.status = "unsubscribed"
    session.add(recipient)
    contact = session.get(Contact, recipient.contact_id) if recipient.contact_id else None
    if contact:
        contact.unsubscribed_at = utcnow()
        contact.consent_marketing = False
        session.add(contact)
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "").split(",")[0].strip()
        rgpd.log_consent(session, contact, "withdrawn", source="unsubscribe", ip=ip, user_agent=(request.headers.get("user-agent") or "")[:300])
    session.commit()
    return {"ok": True}


def _mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    return (local[:2] + "•••@" + domain) if len(local) > 2 else ("•••@" + domain)


# ---------------------------------------------------------------------------
# Help center (published knowledge base)
# ---------------------------------------------------------------------------


@router.get("/kb")
def public_kb(q: str | None = None, session: Session = Depends(get_session)):
    stmt = select(KbArticle).where(KbArticle.status == "published")
    if q:
        stmt = stmt.where(KbArticle.title.ilike(f"%{q}%") | KbArticle.body.ilike(f"%{q}%"))
    rows = session.exec(stmt.order_by(KbArticle.category, KbArticle.title)).all()
    return {"items": [{"slug": a.slug, "title": a.title, "category": a.category, "summary": a.summary} for a in rows], "branding": _branding(session)}


@router.get("/kb/{slug}")
def public_kb_article(slug: str, session: Session = Depends(get_session)):
    article = session.exec(select(KbArticle).where(KbArticle.slug == slug, KbArticle.status == "published")).first()
    if article is None:
        raise HTTPException(404, "Article introuvable.")
    article.views = (article.views or 0) + 1
    session.add(article)
    session.commit()
    return {"title": article.title, "category": article.category, "body": article.body, "updated_at": iso(article.updated_at), "branding": _branding(session)}

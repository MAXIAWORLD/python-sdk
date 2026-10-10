"""Sales & billing endpoints: pipeline board, quotes, invoices, payments, subscriptions."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user, require_role
from ..models import Company, Contact, Deal, Invoice, Payment, Pipeline, Quote, Stage, Subscription, User, today, utcnow
from ..resources import RESOURCES
from ..serialize import dump, dump_many, dump_one
from ..services import einvoice, invoicing, mailer, pdf, subscriptions
from ..services.events import emit
from ..services.settings import get_section, public_url

router = APIRouter(tags=["sales"])


# ---------------------------------------------------------------------------
# Pipeline board
# ---------------------------------------------------------------------------


@router.get("/deals/board")
def deals_board(pipeline_id: int | None = None, owner_id: int | None = None, q: str | None = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    pipelines = session.exec(select(Pipeline).order_by(Pipeline.position)).all()
    if not pipelines:
        return {"pipelines": [], "pipeline": None, "stages": []}
    pipeline = next((p for p in pipelines if p.id == pipeline_id), None) or next((p for p in pipelines if p.is_default), pipelines[0])
    stages = session.exec(select(Stage).where(Stage.pipeline_id == pipeline.id).order_by(Stage.position)).all()
    stmt = select(Deal).where(Deal.pipeline_id == pipeline.id)
    if owner_id:
        stmt = stmt.where(Deal.owner_id == owner_id)
    if q:
        stmt = stmt.where(Deal.title.ilike(f"%{q}%"))
    deals = session.exec(stmt.order_by(Deal.position, Deal.updated_at.desc())).all()
    items = dump_many(session, list(deals))
    now = utcnow()
    for item, deal in zip(items, deals):
        item["days_in_stage"] = (now - deal.stage_changed_at).days if deal.stage_changed_at else 0
    columns = []
    for st in stages:
        cards = [i for i in items if i["stage_id"] == st.id]
        prob = st.probability / 100
        columns.append(
            {
                **dump(st),
                "deals": cards,
                "count": len(cards),
                "value": round(sum(c["value"] for c in cards), 2),
                "weighted": round(sum(c["value"] * ((c["probability"] if c["probability"] is not None else st.probability) / 100) for c in cards), 2) if prob is not None else 0,
            }
        )
    return {"pipelines": dump_many(session, list(pipelines), expand=False), "pipeline": dump(pipeline), "stages": columns}


@router.post("/deals/{deal_id:int}/move")
def move_deal(deal_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    stage_id = int(payload["stage_id"])
    position = float(payload.get("position", 0))
    data: dict[str, Any] = {"position": position}
    deal = RESOURCES["deals"].get_obj(session, deal_id, user)
    if deal.stage_id != stage_id:
        data["stage_id"] = stage_id
    if payload.get("lost_reason"):
        data["lost_reason"] = payload["lost_reason"]
    RESOURCES["deals"].update(session, deal_id, data, user)
    return RESOURCES["deals"].get(session, deal_id, user)


@router.post("/pipelines/{pipeline_id:int}/stages/reorder")
def reorder_stages(pipeline_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    for index, stage_id in enumerate(payload.get("order") or []):
        stage = session.get(Stage, int(stage_id))
        if stage and stage.pipeline_id == pipeline_id:
            stage.position = index
            session.add(stage)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Quotes
# ---------------------------------------------------------------------------


def _quote(session: Session, quote_id: int) -> Quote:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(404, "Devis introuvable.")
    return quote


@router.get("/quotes/{quote_id:int}/pdf")
def quote_pdf(quote_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    quote = _quote(session, quote_id)
    data = pdf.render_quote(session, quote)
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="Devis-{quote.number}.pdf"'})


@router.post("/quotes/{quote_id:int}/send")
def send_quote(quote_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    quote = _quote(session, quote_id)
    contact = session.get(Contact, quote.contact_id) if quote.contact_id else None
    to = payload.get("to") or ([contact.email] if contact and contact.email else [])
    if not to:
        raise HTTPException(422, "Aucune adresse email pour ce devis : ajoutez un contact avec un email.")
    quote.seller = invoicing.seller_snapshot(session)
    quote.buyer = invoicing.buyer_snapshot(session, quote.company_id, quote.contact_id)
    link = f"{public_url(session)}/p/quote/{quote.public_token}"
    company = get_section(session, "company")
    subject = payload.get("subject") or f"Devis {quote.number} — {company.get('name') or ''}".strip(" —")
    body = payload.get("body") or (
        f"Bonjour{(' ' + contact.first_name) if contact and contact.first_name else ''},\n\n"
        f"Veuillez trouver ci-joint notre devis **{quote.number}**{(' — ' + quote.title) if quote.title else ''}, "
        f"d'un montant de **{pdf.fr_money(quote.total, quote.currency)} TTC**.\n\n"
        f"Vous pouvez le consulter et le signer en ligne en quelques secondes : [Voir et signer le devis]({link})\n\n"
        f"Ce devis est valable jusqu'au {pdf.fr_date(quote.valid_until)}.\n\nBien cordialement,\n{user.name}"
    )
    attachment = (f"Devis-{quote.number}.pdf", pdf.render_quote(session, quote), "application/pdf")
    mailer.send_email(session, to=to, subject=subject, body=body, attachments=[attachment], user=user, contact_id=quote.contact_id, company_id=quote.company_id, deal_id=quote.deal_id, commit=False)
    quote.sent_at = utcnow()
    if quote.status == "draft":
        quote.status = "sent"
    session.add(quote)
    invoicing.log_activity(session, quote, "quote", f"Devis {quote.number} envoyé à {', '.join(to)}", user)
    session.commit()
    emit("quote.sent", {"id": quote.id, "number": quote.number}, user.id)
    return dump_one(session, quote)


@router.post("/quotes/{quote_id:int}/mark-sent")
def mark_quote_sent(quote_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    quote = _quote(session, quote_id)
    quote.seller = invoicing.seller_snapshot(session)
    quote.buyer = invoicing.buyer_snapshot(session, quote.company_id, quote.contact_id)
    quote.sent_at = quote.sent_at or utcnow()
    if quote.status == "draft":
        quote.status = "sent"
    session.add(quote)
    session.commit()
    return dump_one(session, quote)


@router.post("/quotes/{quote_id:int}/convert")
def convert_quote(quote_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    quote = _quote(session, quote_id)
    invoice = invoicing.quote_to_invoice(session, quote, user, deposit_percent=payload.get("deposit_percent"))
    return dump_one(session, invoice)


@router.post("/quotes/{quote_id:int}/duplicate")
def duplicate_quote(quote_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    quote = _quote(session, quote_id)
    data = {k: getattr(quote, k) for k in ("title", "company_id", "contact_id", "deal_id", "currency", "lines", "discount", "deposit_percent", "notes", "terms", "nature")}
    data["lines"] = [dict(line, id=None) for line in quote.lines or []]
    new = RESOURCES["quotes"].create(session, data, user)
    return dump_one(session, new)


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


def _invoice(session: Session, invoice_id: int) -> Invoice:
    invoice = session.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(404, "Facture introuvable.")
    return invoice


@router.get("/invoices/{invoice_id:int}/checks")
def invoice_checks(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    invoice = _invoice(session, invoice_id)
    errors, warnings = invoicing.legal_checks(session, invoice)
    return {"errors": errors, "warnings": warnings}


@router.post("/invoices/{invoice_id:int}/issue")
def issue(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    result = invoicing.issue_invoice(session, invoice, user)
    data = dump_one(session, invoice)
    data["warnings"] = result["warnings"]
    return data


@router.get("/invoices/{invoice_id:int}/pdf")
def invoice_pdf(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    invoice = _invoice(session, invoice_id)
    data = einvoice.generate_facturx_pdf(session, invoice)
    name = invoice.number or f"brouillon-{invoice.id}"
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{name}.pdf"'})


@router.get("/invoices/{invoice_id:int}/facturx.xml")
def invoice_xml(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    invoice = _invoice(session, invoice_id)
    if not invoice.locked:
        raise HTTPException(409, "Émettez la facture pour générer son XML Factur-X.")
    xml = einvoice.generate_xml(session, invoice)
    return Response(xml, media_type="application/xml", headers={"Content-Disposition": f'attachment; filename="{invoice.number}-factur-x.xml"'})


@router.post("/invoices/{invoice_id:int}/send")
def send_invoice(invoice_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    if not invoice.locked:
        invoicing.issue_invoice(session, invoice, user)
        session.refresh(invoice)
    contact = session.get(Contact, invoice.contact_id) if invoice.contact_id else None
    company = session.get(Company, invoice.company_id) if invoice.company_id else None
    to = payload.get("to") or [x for x in [(contact.email if contact else None) or (company.email if company else None)] if x]
    if not to:
        raise HTTPException(422, "Aucune adresse email de facturation : renseignez l'email du contact ou de l'entreprise.")
    link = f"{public_url(session)}/p/invoice/{invoice.public_token}"
    label = "avoir" if invoice.kind == "credit_note" else "facture"
    subject = payload.get("subject") or f"{label.capitalize()} {invoice.number} — {get_section(session, 'company').get('name') or ''}".strip(" —")
    body = payload.get("body") or (
        f"Bonjour{(' ' + contact.first_name) if contact and contact.first_name else ''},\n\n"
        f"Veuillez trouver ci-joint notre {label} **{invoice.number}** d'un montant de **{pdf.fr_money(invoice.total, invoice.currency)} TTC**"
        + (f", payable avant le **{pdf.fr_date(invoice.due_date)}**" if invoice.due_date and invoice.kind != "credit_note" else "")
        + f".\n\nVous pouvez aussi la consulter en ligne : [Voir la {label}]({link})\n\nBien cordialement,\n{user.name}"
    )
    attachment = (f"{invoice.number}.pdf", einvoice.generate_facturx_pdf(session, invoice), "application/pdf")
    mailer.send_email(session, to=to, subject=subject, body=body, attachments=[attachment], user=user, contact_id=invoice.contact_id, company_id=invoice.company_id, deal_id=invoice.deal_id, commit=False)
    invoice.sent_at = utcnow()
    if invoice.status == "issued":
        invoice.status = "sent"
    session.add(invoice)
    invoicing.log_activity(session, invoice, "invoice", f"{label.capitalize()} {invoice.number} envoyée à {', '.join(to)}", user)
    session.commit()
    return dump_one(session, invoice)


@router.post("/invoices/{invoice_id:int}/mark-sent")
def mark_invoice_sent(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    if not invoice.locked:
        raise HTTPException(409, "Émettez d'abord la facture.")
    invoice.sent_at = invoice.sent_at or utcnow()
    if invoice.status == "issued":
        invoice.status = "sent"
    session.add(invoice)
    session.commit()
    return dump_one(session, invoice)


@router.post("/invoices/{invoice_id:int}/remind")
def remind_invoice(invoice_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    if not invoice.locked or invoice.status in ("paid", "cancelled"):
        raise HTTPException(409, "Cette facture n'est pas à relancer.")
    contact = session.get(Contact, invoice.contact_id) if invoice.contact_id else None
    company = session.get(Company, invoice.company_id) if invoice.company_id else None
    to = payload.get("to") or [x for x in [(contact.email if contact else None) or (company.email if company else None)] if x]
    if not to:
        raise HTTPException(422, "Aucune adresse email pour la relance.")
    late_days = (today() - invoice.due_date).days if invoice.due_date else 0
    link = f"{public_url(session)}/p/invoice/{invoice.public_token}"
    body = payload.get("body") or (
        f"Bonjour{(' ' + contact.first_name) if contact and contact.first_name else ''},\n\n"
        f"Sauf erreur de notre part, la facture **{invoice.number}** d'un montant de **{pdf.fr_money(invoice.balance_due, invoice.currency)}** "
        + (f"est échue depuis {late_days} jour{'s' if late_days > 1 else ''} (échéance du {pdf.fr_date(invoice.due_date)})." if late_days > 0 else f"arrive à échéance le {pdf.fr_date(invoice.due_date)}.")
        + f"\n\nNous vous remercions de bien vouloir procéder à son règlement. [Consulter la facture]({link})\n\n"
        + ("Pour rappel, tout retard de paiement entraîne l'application de pénalités de retard ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).\n\n" if late_days > 0 else "")
        + f"Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nBien cordialement,\n{user.name}"
    )
    attachment = (f"{invoice.number}.pdf", einvoice.generate_facturx_pdf(session, invoice), "application/pdf")
    mailer.send_email(session, to=to, subject=payload.get("subject") or f"Rappel — facture {invoice.number}", body=body, attachments=[attachment], user=user, contact_id=invoice.contact_id, company_id=invoice.company_id, commit=False)
    invoice.reminders_sent = (invoice.reminders_sent or 0) + 1
    invoice.last_reminder_at = utcnow()
    session.add(invoice)
    session.commit()
    return dump_one(session, invoice)


@router.get("/invoices/{invoice_id:int}/payments")
def invoice_payments(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Payment).where(Payment.invoice_id == invoice_id).order_by(Payment.date)).all()
    return {"items": dump_many(session, list(rows), expand=False)}


@router.post("/invoices/{invoice_id:int}/payments", status_code=201)
def add_payment(invoice_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    payment = invoicing.record_payment(session, invoice, payload, user)
    return {"payment": dump(payment), "invoice": dump_one(session, invoice)}


@router.delete("/invoices/{invoice_id:int}/payments/{payment_id:int}")
def remove_payment(invoice_id: int, payment_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    invoice = _invoice(session, invoice_id)
    payment = session.get(Payment, payment_id)
    if payment is None or payment.invoice_id != invoice.id:
        raise HTTPException(404, "Paiement introuvable.")
    invoicing.delete_payment(session, invoice, payment, user)
    return dump_one(session, invoice)


@router.post("/invoices/{invoice_id:int}/credit-note")
def credit_note(invoice_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    credit = invoicing.create_credit_note(session, invoice, user, full=bool(payload.get("full", True)), reason=payload.get("reason"))
    return dump_one(session, credit)


@router.post("/invoices/{invoice_id:int}/duplicate")
def duplicate_invoice(invoice_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    invoice = _invoice(session, invoice_id)
    data = {k: getattr(invoice, k) for k in ("title", "company_id", "contact_id", "deal_id", "project_id", "currency", "discount", "notes", "terms", "nature")}
    data["lines"] = [dict(line, id=None) for line in invoice.lines or []]
    data["kind"] = "invoice" if invoice.kind == "credit_note" else invoice.kind
    new = RESOURCES["invoices"].create(session, data, user)
    return dump_one(session, new)


@router.get("/invoices/integrity")
def integrity(session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    return invoicing.verify_chain(session)


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------


@router.get("/subscriptions/metrics")
def subscription_metrics(months: int = 12, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return subscriptions.metrics(session, max(3, min(months, 36)))


def invoice_subscription(session: Session, sub: Subscription, user: User | None) -> Invoice:
    months = {"month": 1, "quarter": 3, "year": 12}.get(sub.interval or "month", 1)
    period_start = sub.current_period_end or today()
    period_end = period_start + timedelta(days=30 * months - 1)
    label = {"month": "mensuel", "quarter": "trimestriel", "year": "annuel"}.get(sub.interval, "")
    data = {
        "title": f"Abonnement {sub.plan} — {pdf.fr_date(period_start)} au {pdf.fr_date(period_end)}",
        "company_id": sub.company_id,
        "contact_id": sub.contact_id,
        "subscription_id": sub.id,
        "nature": "services",
        "service_date": period_start.isoformat(),
        "service_period_end": period_end.isoformat(),
        "lines": [{"description": f"Abonnement {sub.plan} ({label})", "quantity": sub.quantity, "unit": "licence" if sub.quantity > 1 else "mois", "unit_price": sub.amount, "vat_rate": sub.vat_rate, "discount": sub.discount}],
    }
    invoice = RESOURCES["invoices"].create(session, data, user)
    sub.current_period_end = period_end + timedelta(days=1)
    session.add(sub)
    session.commit()
    return invoice


@router.post("/subscriptions/{sub_id:int}/invoice")
def invoice_sub(sub_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    sub = session.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(404, "Abonnement introuvable.")
    invoice = invoice_subscription(session, sub, user)
    return dump_one(session, invoice)

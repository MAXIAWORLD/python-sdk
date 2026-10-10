"""Segments, email campaigns (with mandatory unsubscribe link) and templates."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user, require_role
from ..models import Campaign, CampaignRecipient, Contact, EmailTemplate, Segment, User, utcnow
from ..serialize import dump, dump_many, dump_one
from ..services import mailer, rgpd, segments
from ..services.automation_engine import render
from ..services.settings import get_section, public_url

router = APIRouter(tags=["marketing"])


@router.post("/segments/preview")
def preview_segment(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    entity = payload.get("entity") or "contacts"
    rules = payload.get("rules") or {}
    rows = segments.members(session, entity, rules, limit=25)
    return {"count": segments.count(session, entity, rules), "sample": dump_many(session, rows)}


@router.get("/segments/{segment_id:int}/members")
def segment_members(segment_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    segment = session.get(Segment, segment_id)
    if segment is None:
        raise HTTPException(404, "Segment introuvable.")
    rows = segments.members(session, segment.entity, segment.rules, limit=500)
    return {"count": segments.count(session, segment.entity, segment.rules), "items": dump_many(session, rows)}


@router.get("/segments/fields")
def segment_fields(user: User = Depends(get_current_user)):
    return {"operators": segments.OPERATORS, "contact_fields": sorted(segments.CONTACT_FIELDS) + ["has_open_deal"] + [f"company.{f}" for f in sorted(segments.COMPANY_FIELDS)], "company_fields": sorted(segments.COMPANY_FIELDS)}


def _recipients(session: Session, campaign: Campaign) -> tuple[list[Contact], list[dict[str, Any]]]:
    if not campaign.segment_id:
        raise HTTPException(422, "Choisissez un segment de destinataires.")
    segment = session.get(Segment, campaign.segment_id)
    if segment is None or segment.entity != "contacts":
        raise HTTPException(422, "Le segment doit cibler des contacts.")
    allowed, excluded = [], []
    for contact in segments.members(session, "contacts", segment.rules):
        ok, reason = rgpd.can_receive_marketing(session, contact)
        if ok:
            allowed.append(contact)
        else:
            excluded.append({"id": contact.id, "name": contact.full_name, "reason": reason})
    return allowed, excluded


@router.get("/campaigns/{campaign_id:int}/audience")
def campaign_audience(campaign_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(404, "Campagne introuvable.")
    allowed, excluded = _recipients(session, campaign)
    return {"count": len(allowed), "excluded_count": len(excluded), "excluded": excluded[:100], "sample": [{"id": c.id, "name": c.full_name, "email": c.email} for c in allowed[:20]]}


def _personalize(campaign: Campaign, contact: Contact) -> tuple[str, str]:
    ctx = {"contact": {"first_name": contact.first_name or "", "last_name": contact.last_name or "", "full_name": contact.full_name, "email": contact.email, "job_title": contact.job_title or ""}}
    return render(campaign.subject or "", ctx), render(campaign.body or "", ctx)


def _footer(session: Session, link: str) -> str:
    company = get_section(session, "company")
    rules = get_section(session, "rgpd")
    privacy = f' · <a href="{rules["privacy_url"]}" style="color:#8a8fa6">Politique de confidentialité</a>' if rules.get("privacy_url") else ""
    return (
        f"Vous recevez cet email de la part de {company.get('name') or 'notre société'}. "
        f'<a href="{link}" style="color:#8a8fa6">Se désinscrire</a>{privacy}'
    )


def send_campaign_now(session: Session, campaign: Campaign, user: User | None) -> dict[str, Any]:
    if campaign.status in ("sending", "sent"):
        raise HTTPException(409, "Campagne déjà envoyée.")
    if not mailer.smtp_ready(session):
        raise HTTPException(409, "Configurez l'envoi d'emails (Paramètres › Emails) avant d'envoyer une campagne.")
    allowed, excluded = _recipients(session, campaign)
    campaign.status = "sending"
    session.add(campaign)
    session.commit()
    base = public_url(session)
    sent = failed = 0
    for contact in allowed:
        recipient = CampaignRecipient(campaign_id=campaign.id, contact_id=contact.id, email=contact.email or "")
        session.add(recipient)
        session.flush()
        link = f"{base}/u/{recipient.token}"
        subject, body = _personalize(campaign, contact)
        try:
            mailer.send_email(
                session,
                to=[contact.email],
                subject=subject or campaign.name,
                body=body,
                preheader=campaign.preheader,
                footer_extra=_footer(session, link),
                headers={"List-Unsubscribe": f"<{link}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
                contact_id=contact.id,
                company_id=contact.company_id,
                log_activity=True,
                commit=False,
            )
            recipient.status = "sent"
            recipient.sent_at = utcnow()
            sent += 1
        except HTTPException as exc:
            recipient.status = "failed"
            recipient.error = str(exc.detail)[:300]
            failed += 1
        session.add(recipient)
        session.commit()
    campaign.status = "sent"
    campaign.sent_at = utcnow()
    campaign.stats = {**(campaign.stats or {}), "recipients": len(allowed), "sent": sent, "failed": failed, "excluded": len(excluded)}
    session.add(campaign)
    session.commit()
    return dump(campaign)


@router.post("/campaigns/{campaign_id:int}/send")
def send_campaign(campaign_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(404, "Campagne introuvable.")
    if payload.get("scheduled_at"):
        from ..crud import coerce

        campaign.status = "scheduled"
        campaign.scheduled_at = coerce(Campaign, "scheduled_at", payload["scheduled_at"])
        session.add(campaign)
        session.commit()
        return dump_one(session, campaign)
    return send_campaign_now(session, campaign, user)


@router.post("/campaigns/{campaign_id:int}/test")
def test_campaign(campaign_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(404, "Campagne introuvable.")
    fake = Contact(first_name=user.name.split(" ")[0], last_name=" ".join(user.name.split(" ")[1:]), email=payload.get("to") or user.email)
    subject, body = _personalize(campaign, fake)
    mailer.send_email(session, to=[payload.get("to") or user.email], subject=f"[TEST] {subject}", body=body, preheader=campaign.preheader, footer_extra=_footer(session, f"{public_url(session)}/u/test"), log_activity=False)
    return {"ok": True}


@router.post("/email-templates/{template_id:int}/render")
def render_template(template_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    template = session.get(EmailTemplate, template_id)
    if template is None:
        raise HTTPException(404, "Modèle introuvable.")
    ctx: dict[str, Any] = {"user": {"name": user.name, "email": user.email}}
    if payload.get("contact_id"):
        contact = session.get(Contact, int(payload["contact_id"]))
        if contact:
            ctx["contact"] = {"first_name": contact.first_name, "last_name": contact.last_name, "full_name": contact.full_name, "email": contact.email}
    return {"subject": render(template.subject, ctx), "body": render(template.body, ctx)}


@router.get("/campaigns/{campaign_id:int}/recipients")
def campaign_recipients(campaign_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign_id).order_by(CampaignRecipient.id)).all()
    return {"items": dump_many(session, list(rows))}

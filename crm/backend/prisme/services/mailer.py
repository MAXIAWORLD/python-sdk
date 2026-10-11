"""Outgoing email (SMTP) with a branded HTML layout, and IMAP inbox synchronisation."""

from __future__ import annotations

import email
import email.policy
import html
import imaplib
import logging
import re
import smtplib
import ssl
from datetime import timezone
from email.message import EmailMessage as MimeMessage
from email.utils import make_msgid, parseaddr, parsedate_to_datetime
from typing import Any

import markdown as md
from fastapi import HTTPException
from sqlmodel import Session, select

from ..models import Activity, Contact, EmailMessage, User, utcnow
from .settings import get_section

log = logging.getLogger("prisme.mail")


def to_html(text: str | None) -> str:
    """Markdown/plain text -> safe-ish HTML for emails."""
    if not text:
        return ""
    if re.search(r"<(p|div|br|table|h\d|ul|ol|a)\b", text, re.I):
        return text
    return md.markdown(html.escape(text, quote=False), extensions=["nl2br", "sane_lists"])


def to_text(value: str | None) -> str:
    if not value:
        return ""
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</p>", "\n\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    return html.unescape(value).strip()


def layout(session: Session, body_html: str, *, preheader: str | None = None, footer_extra: str | None = None) -> str:
    company = get_section(session, "company")
    branding = get_section(session, "branding")
    accent = branding.get("accent") or "#5b6cff"
    name = company.get("name") or branding.get("app_name") or "Prisme"
    legal = " · ".join(
        x
        for x in [
            company.get("legal_name") or company.get("name"),
            " ".join(y for y in [company.get("address"), company.get("zip"), company.get("city")] if y),
            f"SIREN {company['siren']}" if company.get("siren") else None,
        ]
        if x
    )
    pre = f'<div style="display:none;max-height:0;overflow:hidden">{html.escape(preheader)}</div>' if preheader else ""
    extra = f'<p style="margin:8px 0 0">{footer_extra}</p>' if footer_extra else ""
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f4f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#111427">
{pre}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f9;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(17,20,39,.06)">
<tr><td style="height:5px;background:linear-gradient(90deg,{accent},#8b5cf6,#22d3ee)"></td></tr>
<tr><td style="padding:28px 32px 4px;font-size:18px;font-weight:700;color:{accent}">{html.escape(name)}</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.6;color:#2a2e45">{body_html}</td></tr>
</table>
<div style="max-width:600px;font-size:11px;line-height:1.5;color:#8a8fa6;padding:16px 24px">{html.escape(legal)}{extra}</div>
</td></tr></table></body></html>"""


def smtp_ready(session: Session) -> bool:
    cfg = get_section(session, "email")
    return bool(cfg.get("smtp_host") and (cfg.get("from_email") or cfg.get("smtp_user")))


def send_email(
    session: Session,
    *,
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
    user: User | None = None,
    contact_id: int | None = None,
    company_id: int | None = None,
    deal_id: int | None = None,
    ticket_id: int | None = None,
    preheader: str | None = None,
    footer_extra: str | None = None,
    headers: dict[str, str] | None = None,
    raw_html: bool = False,
    log_activity: bool = True,
    commit: bool = True,
    sender_name: str | None = None,
    sender_email: str | None = None,
) -> EmailMessage:
    cfg = get_section(session, "email")
    recipients = [addr.strip() for addr in to if addr and addr.strip()]
    if not recipients:
        raise HTTPException(422, "Aucun destinataire.")
    if not smtp_ready(session):
        raise HTTPException(409, "L'envoi d'emails n'est pas configuré (Paramètres › Emails › SMTP).")
    from_email = sender_email or cfg.get("from_email") or cfg.get("smtp_user")
    from_name = sender_name or cfg.get("from_name") or get_section(session, "company").get("name") or "Prisme"
    if user and user.signature and not raw_html:
        body = f"{body}\n\n{user.signature}"
    body_html = body if raw_html else layout(session, to_html(body), preheader=preheader, footer_extra=footer_extra)

    msg = MimeMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = ", ".join(recipients)
    if cc:
        msg["Cc"] = ", ".join(cc)
    if cfg.get("reply_to"):
        msg["Reply-To"] = cfg["reply_to"]
    message_id = make_msgid(domain=(from_email or "prisme.local").split("@")[-1])
    msg["Message-ID"] = message_id
    for key, value in (headers or {}).items():
        msg[key] = value
    msg.set_content(to_text(body_html) or subject)
    msg.add_alternative(body_html, subtype="html")
    for filename, data, mime in attachments or []:
        maintype, _, subtype = (mime or "application/octet-stream").partition("/")
        msg.add_attachment(data, maintype=maintype, subtype=subtype or "octet-stream", filename=filename)

    row = EmailMessage(
        direction="out",
        folder="sent",
        status="sent",
        from_email=from_email,
        from_name=from_name,
        to=recipients,
        cc=cc or [],
        subject=subject,
        body_text=to_text(body_html)[:20000],
        body_html=body_html,
        contact_id=contact_id,
        company_id=company_id,
        deal_id=deal_id,
        ticket_id=ticket_id,
        user_id=user.id if user else None,
        message_id=message_id,
        sent_at=utcnow(),
        attachments=[{"name": a[0], "size": len(a[1])} for a in attachments or []],
    )
    try:
        _smtp_send(cfg, msg, recipients + (cc or []) + ([from_email] if cfg.get("bcc_self") else []))
    except Exception as exc:  # noqa: BLE001
        row.status = "failed"
        row.error = str(exc)[:500]
        session.add(row)
        session.commit()
        raise HTTPException(502, f"Échec de l'envoi : {exc}") from exc
    session.add(row)
    if log_activity and (contact_id or company_id or deal_id):
        session.add(
            Activity(
                type="email",
                subject=f"Email envoyé : {subject}",
                body=to_text(body_html)[:2000],
                contact_id=contact_id,
                company_id=company_id,
                deal_id=deal_id,
                ticket_id=ticket_id,
                user_id=user.id if user else None,
                direction="out",
            )
        )
        if contact_id:
            contact = session.get(Contact, contact_id)
            if contact:
                contact.last_contacted_at = utcnow()
                session.add(contact)
    if commit:
        session.commit()
        session.refresh(row)
    return row


def _smtp_send(cfg: dict[str, Any], msg: MimeMessage, recipients: list[str]) -> None:
    host, port = cfg["smtp_host"], int(cfg.get("smtp_port") or 587)
    security = cfg.get("smtp_security") or "starttls"
    context = ssl.create_default_context()
    if security == "ssl":
        server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=30, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
    try:
        server.ehlo()
        if security == "starttls":
            server.starttls(context=context)
            server.ehlo()
        if cfg.get("smtp_user") and cfg.get("smtp_password"):
            server.login(cfg["smtp_user"], cfg["smtp_password"])
        server.send_message(msg, to_addrs=recipients)
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001
            pass


def test_smtp(session: Session, to: str) -> None:
    send_email(session, to=[to], subject="Test d'envoi — Prisme CRM", body="Bravo 🎉 la configuration SMTP fonctionne.", log_activity=False)


def sync_imap(session: Session, limit: int = 50) -> int:
    cfg = get_section(session, "email")
    if not (cfg.get("imap_enabled") and cfg.get("imap_host") and cfg.get("imap_user") and cfg.get("imap_password")):
        return 0
    imported = 0
    conn = imaplib.IMAP4_SSL(cfg["imap_host"], int(cfg.get("imap_port") or 993), ssl_context=ssl.create_default_context())
    try:
        conn.login(cfg["imap_user"], cfg["imap_password"])
        conn.select(cfg.get("imap_folder") or "INBOX", readonly=True)
        typ, data = conn.search(None, "ALL")
        if typ != "OK":
            return 0
        ids = data[0].split()[-limit:]
        for num in ids:
            typ, msg_data = conn.fetch(num, "(RFC822)")
            if typ != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                continue
            parsed = email.message_from_bytes(msg_data[0][1], policy=email.policy.default)
            message_id = (parsed.get("Message-ID") or "").strip()
            if message_id and session.exec(select(EmailMessage).where(EmailMessage.message_id == message_id)).first():
                continue
            from_name, from_addr = parseaddr(parsed.get("From", ""))
            body_part = parsed.get_body(preferencelist=("html", "plain"))
            body = body_part.get_content() if body_part else ""
            is_html = bool(body_part and body_part.get_content_type() == "text/html")
            contact = session.exec(select(Contact).where(Contact.email == (from_addr or "").lower())).first() if from_addr else None
            try:
                sent_at = parsedate_to_datetime(parsed.get("Date")).astimezone(timezone.utc) if parsed.get("Date") else utcnow()
            except (TypeError, ValueError):
                sent_at = utcnow()
            row = EmailMessage(
                direction="in",
                folder="inbox",
                status="received",
                from_email=(from_addr or "").lower(),
                from_name=from_name,
                to=[a for _, a in email.utils.getaddresses([parsed.get("To", "")])],
                subject=str(parsed.get("Subject") or "(sans objet)"),
                body_html=body if is_html else None,
                body_text=to_text(body) if is_html else body,
                contact_id=contact.id if contact else None,
                company_id=contact.company_id if contact else None,
                message_id=message_id or None,
                in_reply_to=parsed.get("In-Reply-To"),
                sent_at=sent_at,
                read=False,
            )
            session.add(row)
            if contact:
                session.add(Activity(type="email", subject=f"Email reçu : {row.subject}", body=(row.body_text or "")[:2000], contact_id=contact.id, company_id=contact.company_id, direction="in", occurred_at=sent_at))
            imported += 1
        session.commit()
    finally:
        try:
            conn.logout()
        except Exception:  # noqa: BLE001
            pass
    return imported

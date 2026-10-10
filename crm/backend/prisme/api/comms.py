"""Email composer, inbox synchronisation and document storage."""

from __future__ import annotations

import mimetypes
import secrets
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from ..config import settings as env
from ..db import get_session
from ..deps import authenticate_request, require_role
from ..models import Contact, Document, User
from ..resources import RESOURCES
from ..serialize import dump_one
from ..services import mailer
from ..services.settings import get_section

router = APIRouter(tags=["comms"])

MAX_UPLOAD = 25 * 1024 * 1024
ALLOWED_EXT = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".txt", ".csv", ".md", ".doc", ".docx", ".xls", ".xlsx",
    ".ppt", ".pptx", ".odt", ".ods", ".zip", ".json", ".xml", ".mp4", ".mov", ".mp3", ".key", ".pages", ".numbers",
}


@router.post("/emails/send")
def compose(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    to = payload.get("to") or []
    if isinstance(to, str):
        to = [x.strip() for x in to.replace(";", ",").split(",") if x.strip()]
    for address in to:
        contact = session.exec(select(Contact).where(Contact.email == address.lower())).first()
        if contact and contact.do_not_contact:
            raise HTTPException(409, f"{address} s'est opposé(e) à toute sollicitation (RGPD).")
    contact_id = payload.get("contact_id")
    if not contact_id and len(to) == 1:
        match = session.exec(select(Contact).where(Contact.email == to[0].lower())).first()
        contact_id = match.id if match else None
    row = mailer.send_email(
        session,
        to=to,
        cc=payload.get("cc") or None,
        subject=payload.get("subject") or "(sans objet)",
        body=payload.get("body") or "",
        user=user,
        contact_id=contact_id,
        company_id=payload.get("company_id"),
        deal_id=payload.get("deal_id"),
        ticket_id=payload.get("ticket_id"),
    )
    return dump_one(session, row)


@router.post("/emails/sync")
def sync(session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    cfg = get_section(session, "email")
    if not cfg.get("imap_enabled"):
        raise HTTPException(409, "La synchronisation IMAP n'est pas activée (Paramètres › Emails).")
    try:
        count = mailer.sync_imap(session)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Connexion IMAP impossible : {exc}") from exc
    return {"imported": count}


@router.post("/documents/upload", status_code=201)
async def upload(
    file: UploadFile = File(...),
    name: str | None = Form(None),
    folder: str | None = Form(None),
    company_id: int | None = Form(None),
    contact_id: int | None = Form(None),
    deal_id: int | None = Form(None),
    project_id: int | None = Form(None),
    ticket_id: int | None = Form(None),
    session: Session = Depends(get_session),
    user: User = Depends(require_role("member")),
):
    original = Path(file.filename or "fichier").name
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"Type de fichier non autorisé ({ext or 'inconnu'}).")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Fichier trop volumineux (25 Mo maximum).")
    stored = f"{secrets.token_hex(12)}{ext}"
    (env.uploads_dir / stored).write_bytes(data)
    doc = Document(
        name=name or original,
        filename=stored,
        mime=file.content_type or mimetypes.guess_type(original)[0],
        size=len(data),
        folder=folder,
        company_id=company_id,
        contact_id=contact_id,
        deal_id=deal_id,
        project_id=project_id,
        ticket_id=ticket_id,
        uploaded_by_id=user.id,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    item = dump_one(session, doc)
    item["url"] = f"/api/files/{doc.filename}"
    return item


@router.get("/files/{filename}")
def download(filename: str, request: Request, session: Session = Depends(get_session)):
    safe = Path(filename).name
    # Logos are public (shown on quotes, invoices and emails); everything else needs a login.
    if not safe.startswith("logo-") and authenticate_request(request, session) is None:
        raise HTTPException(401, "Authentification requise.")
    path = env.uploads_dir / safe
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable.")
    from sqlmodel import select

    doc = session.exec(select(Document).where(Document.filename == safe)).first()
    download_name = doc.name if doc else safe
    media = (doc.mime if doc else None) or mimetypes.guess_type(safe)[0] or "application/octet-stream"
    inline = media.startswith("image/") or media == "application/pdf"
    response = FileResponse(path, media_type=media, filename=download_name, content_disposition_type="inline" if inline else "attachment")
    # Uploaded files never execute in the app origin (e.g. scripts inside SVG).
    response.headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@router.post("/branding/logo", status_code=201)
async def upload_logo(file: UploadFile = File(...), session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    ext = Path(file.filename or "logo.png").suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        raise HTTPException(415, "Logo : PNG, JPG, WebP ou SVG.")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(413, "Logo trop volumineux (3 Mo maximum).")
    stored = f"logo-{secrets.token_hex(6)}{ext}"
    (env.uploads_dir / stored).write_bytes(data)
    url = f"/api/files/{stored}"
    from ..services.settings import update_section

    update_section(session, "company", {"logo_url": url})
    update_section(session, "branding", {"logo_url": url})
    return {"url": url}


__all__ = ["RESOURCES"]

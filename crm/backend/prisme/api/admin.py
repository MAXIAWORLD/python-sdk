"""Settings, RGPD tools, import/export (CSV, FEC, backup), automations catalog, MCP connection info."""

from __future__ import annotations

import json
import shutil
import sys
from datetime import date

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlmodel import Session

from ..ai import tools as ai_tools
from ..config import settings as env
from ..db import get_session
from ..deps import get_current_user, require_role
from ..models import Automation, Contact, User, today
from ..resources import RESOURCES
from ..serialize import dump
from ..services import audit, automation_engine, io, mailer, rgpd
from ..services.settings import DEFAULTS, get_public_section, get_section, update_section

router = APIRouter(tags=["admin"])

PUBLIC_SECTIONS = {"company", "billing", "branding", "general"}
ADMIN_SECTIONS = set(DEFAULTS) - {"counters"}


@router.get("/settings")
def all_settings(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    sections = ADMIN_SECTIONS if user.role == "admin" else PUBLIC_SECTIONS | {"ai", "rgpd"}
    data = {name: get_public_section(session, name) for name in sorted(sections)}
    if "rgpd" in data and not data["rgpd"].get("register"):
        data["rgpd"]["register"] = rgpd.DEFAULT_REGISTER
    return data


@router.patch("/settings/{section}")
def patch_settings(section: str, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    if section not in ADMIN_SECTIONS:
        raise HTTPException(404, "Section inconnue.")
    if section == "billing" and payload.get("payment_days") is not None and int(payload["payment_days"]) > 60:
        raise HTTPException(422, "Le délai de paiement entre professionnels ne peut excéder 60 jours (art. L441-10 du Code de commerce).")
    if section == "company" and payload.get("siren"):
        from ..services.invoicing import siren_is_valid

        if not siren_is_valid(str(payload["siren"])):
            raise HTTPException(422, "Numéro SIREN invalide (9 chiffres, clé de contrôle).")
    result = update_section(session, section, payload)
    audit.record(session, "settings", user.id, "settings", None, section, {k: "…" for k in payload})
    session.commit()
    return result


@router.post("/settings/email/test")
def test_email(payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    mailer.test_smtp(session, payload.get("to") or user.email)
    return {"ok": True}


@router.get("/settings/mcp")
def mcp_info(request: Request, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    base = str(request.base_url).rstrip("/")
    backend_dir = str(env.static_dir.parent.parent / "backend") if "frontend" in str(env.static_dir) else "<dossier>/crm/backend"
    uv = shutil.which("uv") or "uv"
    return {
        "http_url": f"{base}/mcp",
        "enabled": get_section(session, "mcp").get("enabled", True),
        "claude_code_http": f'claude mcp add --transport http prisme {base}/mcp --header "Authorization: Bearer <VOTRE_JETON>"',
        "claude_code_stdio": f"claude mcp add prisme -- {uv} --directory {backend_dir} run prisme mcp",
        "claude_desktop": {
            "mcpServers": {
                "prisme": {"command": uv, "args": ["--directory", backend_dir, "run", "prisme", "mcp"], "env": {"PRISME_DATA_DIR": str(env.data_dir), "PRISME_MCP_USER": user.email}}
            }
        },
        "claude_desktop_remote": {
            "mcpServers": {"prisme": {"command": "npx", "args": ["-y", "mcp-remote", f"{base}/mcp", "--header", "Authorization: Bearer <VOTRE_JETON>"]}}
        },
        "python": sys.executable,
        "data_dir": str(env.data_dir),
        "tools": sorted(ai_tools.TOOLS),
    }


# ---------------------------------------------------------------------------
# RGPD
# ---------------------------------------------------------------------------


@router.get("/rgpd/contacts/{contact_id:int}/export")
def rgpd_export(contact_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(404, "Contact introuvable.")
    data = rgpd.export_contact(session, contact)
    audit.record(session, "export", user.id, "contact", contact.id, "Export RGPD (droit d'accès / portabilité)")
    session.commit()
    body = json.dumps(data, ensure_ascii=False, indent=2, default=str).encode()
    return Response(body, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="donnees-contact-{contact.id}.json"'})


@router.post("/rgpd/contacts/{contact_id:int}/anonymize")
def rgpd_anonymize(contact_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(404, "Contact introuvable.")
    if contact.anonymized_at:
        raise HTTPException(409, "Ce contact est déjà anonymisé.")
    rgpd.anonymize_contact(session, contact, user, payload.get("reason") or "Droit à l'effacement")
    return dump(contact)


@router.get("/rgpd/retention")
def rgpd_retention(session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    rules = get_section(session, "rgpd")
    return {"years": rules.get("prospect_retention_years"), "items": rgpd.retention_candidates(session)}


@router.post("/rgpd/retention/purge")
def rgpd_purge(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    ids = {int(i) for i in payload.get("ids") or []}
    eligible = {c["id"] for c in rgpd.retention_candidates(session)}
    done = 0
    for cid in ids & eligible:
        contact = session.get(Contact, cid)
        if contact:
            rgpd.anonymize_contact(session, contact, user, "Durée de conservation dépassée")
            done += 1
    return {"anonymized": done}


# ---------------------------------------------------------------------------
# Import / export
# ---------------------------------------------------------------------------


@router.post("/import/{entity}/preview")
async def import_preview(entity: str, file: UploadFile = File(...), user: User = Depends(require_role("member"))):
    if entity not in io.IMPORT_FIELDS:
        raise HTTPException(404, "Import non disponible pour ce module.")
    headers, rows = io.parse_csv(await file.read())
    return {"headers": headers, "rows": rows[:10], "total": len(rows), "mapping": io.guess_mapping(entity, headers), "fields": list(io.IMPORT_FIELDS[entity])}


@router.post("/import/{entity}")
async def import_run(entity: str, file: UploadFile = File(...), mapping: str = Form("{}"), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    if entity not in io.IMPORT_FIELDS:
        raise HTTPException(404, "Import non disponible pour ce module.")
    headers, rows = io.parse_csv(await file.read())
    columns = json.loads(mapping or "{}") or io.guess_mapping(entity, headers)
    result = io.import_rows(session, entity, rows[:20000], columns, user)
    audit.record(session, "import", user.id, entity, None, f"{result['created']} créés, {result['updated']} mis à jour")
    session.commit()
    return result


@router.get("/export/{resource}.csv")
def export_resource(resource: str, request: Request, session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    if resource not in RESOURCES or resource in ("users", "ai-providers", "webhooks", "audit-logs"):
        raise HTTPException(404, "Export non disponible.")
    params = [(k, v) for k, v in request.query_params.multi_items() if k not in ("limit", "offset")] + [("limit", 0)]
    data = RESOURCES[resource].list(session, params, user)
    flat = []
    for item in data["items"]:
        row = {}
        for key, value in item.items():
            if isinstance(value, dict) and f"{key}_id" in item:
                row[key] = value.get("name")  # expanded relation -> its label
            elif isinstance(value, list) and all(isinstance(v, (str, int, float)) for v in value):
                row[key] = ", ".join(str(v) for v in value)
            elif isinstance(value, (dict, list)):
                row[key] = json.dumps(value, ensure_ascii=False, default=str)
            else:
                row[key] = value
        flat.append(row)
    audit.record(session, "export", user.id, resource, None, f"Export CSV ({len(flat)} lignes)")
    session.commit()
    return Response(io.export_csv(flat), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{resource}-{today().isoformat()}.csv"'})


@router.get("/export/fec")
def export_fec(start: str, end: str, session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    filename, data = io.export_fec(session, date.fromisoformat(start), date.fromisoformat(end))
    audit.record(session, "export", user.id, "fec", None, f"Export FEC {start} → {end}")
    session.commit()
    return Response(data, media_type="text/plain; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/export/backup")
def export_backup(session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    data = io.backup(session)
    audit.record(session, "export", user.id, "backup", None, "Sauvegarde complète JSON")
    session.commit()
    return Response(data, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="prisme-sauvegarde-{today().isoformat()}.json"'})


# ---------------------------------------------------------------------------
# Automations
# ---------------------------------------------------------------------------


@router.get("/automations/catalog")
def automation_catalog(user: User = Depends(get_current_user)):
    return {"triggers": automation_engine.TRIGGERS, "actions": automation_engine.ACTIONS}


# Test runs use a record that is in the state the trigger describes (e.g. an overdue invoice for "invoice.overdue").
TEST_SAMPLE_FILTERS: dict[str, list[tuple[str, str]]] = {
    "invoice.issued": [("locked", "true")],
    "invoice.paid": [("status", "paid")],
    "invoice.overdue": [("status", "overdue")],
    "quote.viewed": [("status", "viewed")],
    "quote.accepted": [("status", "accepted")],
    "quote.declined": [("status", "declined")],
    "deal.won": [("status", "won")],
    "deal.lost": [("status", "lost")],
    "task.completed": [("status", "done")],
}


@router.post("/automations/{automation_id:int}/test")
def automation_test(automation_id: int, payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("manager"))):
    automation = session.get(Automation, automation_id)
    if automation is None:
        raise HTTPException(404, "Automatisation introuvable.")
    event = (automation.trigger or {}).get("type") or "manual"
    sample = payload.get("payload") or {}
    if not sample.get("id"):
        entity = automation_engine.trigger_entity(event)
        resource = automation_engine.ENTITY_RESOURCE.get(entity or "")
        if resource:
            wanted = [("sort", "-updated_at"), ("limit", 1)]
            latest = RESOURCES[resource].list(session, wanted + TEST_SAMPLE_FILTERS.get(event, []), user)["items"]
            latest = latest or RESOURCES[resource].list(session, wanted, user)["items"]
            if latest:
                sample = {"id": latest[0]["id"], "data": latest[0], "contact_id": latest[0].get("id") if entity == "contact" else None}
    run = automation_engine.execute(session, automation, event, sample, user.id, dry_run=not payload.get("live"))
    return {"status": run.status, "log": run.log}

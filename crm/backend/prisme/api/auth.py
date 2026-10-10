"""Authentication, first-run setup, profile and API tokens."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlmodel import Session, func, select

from ..config import settings as env
from ..db import get_session
from ..deps import authenticate_request, get_current_user
from ..models import ApiToken, User, utcnow
from ..security import (
    SESSION_COOKIE,
    create_session_token,
    generate_api_token,
    hash_password,
    password_problems,
    verify_password,
)
from ..serialize import dump, dump_many
from ..services import audit
from ..services.settings import get_public_section, update_section

router = APIRouter(prefix="/auth", tags=["auth"])

_attempts: dict[str, list[float]] = defaultdict(list)


def _rate_limit(key: str) -> None:
    now = time.time()
    window = [t for t in _attempts[key] if now - t < 900]
    _attempts[key] = window
    if len(window) >= 10:
        raise HTTPException(429, "Trop de tentatives. Réessayez dans 15 minutes.")
    window.append(now)


def _set_cookie(response: Response, request: Request, user: User) -> None:
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(user.id, user.token_version),
        max_age=env.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def _me(user: User) -> dict[str, Any]:
    return dump(user)


@router.get("/status")
def status(request: Request, session: Session = Depends(get_session)):
    users = session.exec(select(func.count()).select_from(User)).one()
    user = None
    try:
        user = authenticate_request(request, session)
    except HTTPException:
        user = None
    branding = get_public_section(session, "branding")
    company = get_public_section(session, "company")
    return {
        "setup_required": users == 0,
        "user": _me(user) if user else None,
        "branding": {"app_name": branding.get("app_name") or "Prisme", "accent": branding.get("accent"), "logo_url": branding.get("logo_url") or company.get("logo_url"), "company": company.get("name")},
    }


@router.post("/setup")
def setup(request: Request, response: Response, payload: dict = Body(...), session: Session = Depends(get_session)):
    if session.exec(select(func.count()).select_from(User)).one() > 0:
        raise HTTPException(409, "L'installation a déjà été effectuée.")
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not name or "@" not in email:
        raise HTTPException(422, "Nom et email valides requis.")
    problem = password_problems(password)
    if problem:
        raise HTTPException(422, problem)
    user = User(name=name, email=email, password_hash=hash_password(password), role="admin", title=payload.get("title"), last_login_at=utcnow())
    session.add(user)
    session.commit()
    session.refresh(user)
    company_name = (payload.get("company_name") or "").strip()
    if company_name:
        update_section(session, "company", {"name": company_name, "legal_name": company_name})
    from ..seed import ensure_defaults, seed_demo

    ensure_defaults(session)
    if payload.get("load_demo"):
        seed_demo(session, user)
    audit.record(session, "setup", user.id, "user", user.id, "Installation initiale")
    session.commit()
    _set_cookie(response, request, user)
    return {"user": _me(user)}


@router.post("/login")
def login(request: Request, response: Response, payload: dict = Body(...), session: Session = Depends(get_session)):
    email = (payload.get("email") or "").strip().lower()
    _rate_limit(f"{request.client.host if request.client else 'x'}:{email}")
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not user.is_active or not verify_password(payload.get("password") or "", user.password_hash):
        raise HTTPException(401, "Email ou mot de passe incorrect.")
    user.last_login_at = utcnow()
    session.add(user)
    audit.record(session, "login", user.id, "user", user.id, request.client.host if request.client else None)
    session.commit()
    _set_cookie(response, request, user)
    return {"user": _me(user)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _me(user)


@router.patch("/me")
def update_me(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    for key in ("name", "title", "phone", "color", "avatar_url", "signature", "preferences"):
        if key in payload:
            setattr(user, key, payload[key])
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return _me(user)


@router.post("/password")
def change_password(request: Request, response: Response, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if not verify_password(payload.get("current") or "", user.password_hash):
        raise HTTPException(403, "Mot de passe actuel incorrect.")
    problem = password_problems(payload.get("new") or "")
    if problem:
        raise HTTPException(422, problem)
    user.password_hash = hash_password(payload["new"])
    user.token_version = (user.token_version or 0) + 1  # logs out other sessions
    session.add(user)
    audit.record(session, "password", user.id, "user", user.id, "Changement de mot de passe")
    session.commit()
    _set_cookie(response, request, user)
    return {"ok": True}


@router.get("/tokens")
def list_tokens(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(ApiToken).where(ApiToken.user_id == user.id).order_by(ApiToken.created_at.desc())).all()
    return {"items": dump_many(session, list(rows), expand=False)}


@router.post("/tokens", status_code=201)
def create_token(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    token, prefix, token_hash = generate_api_token()
    scopes = [s for s in (payload.get("scopes") or ["api", "mcp"]) if s in ("api", "mcp")]
    row = ApiToken(user_id=user.id, name=(payload.get("name") or "Jeton API").strip()[:80], prefix=prefix, token_hash=token_hash, scopes=scopes or ["api", "mcp"])
    session.add(row)
    audit.record(session, "token", user.id, "api_token", None, f"Création du jeton « {row.name} »")
    session.commit()
    session.refresh(row)
    return {"token": token, "item": dump(row)}


@router.delete("/tokens/{token_id:int}")
def delete_token(token_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    row = session.get(ApiToken, token_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Jeton introuvable.")
    session.delete(row)
    audit.record(session, "token", user.id, "api_token", token_id, f"Révocation du jeton « {row.name} »")
    session.commit()
    return {"ok": True}

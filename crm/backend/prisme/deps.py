"""FastAPI dependencies: authentication (cookie session or API token) and roles."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from .db import get_session
from .models import ApiToken, User, utcnow
from .security import SESSION_COOKIE, decode_session_token, hash_api_token

ROLE_LEVEL = {"viewer": 0, "member": 1, "manager": 2, "admin": 3}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def user_from_api_token(session: Session, token: str, scope: str = "api") -> User | None:
    row = session.exec(select(ApiToken).where(ApiToken.token_hash == hash_api_token(token))).first()
    if row is None:
        return None
    if row.expires_at and row.expires_at < utcnow():
        return None
    if scope not in (row.scopes or []):
        return None
    user = session.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    now = utcnow()
    if row.last_used_at is None or (now - row.last_used_at).total_seconds() > 300:
        row.last_used_at = now
        session.add(row)
        session.commit()
    return user


def authenticate_request(request: Request, session: Session) -> User | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return user_from_api_token(session, auth[7:].strip())
    cookie = request.cookies.get(SESSION_COOKIE)
    if not cookie:
        return None
    payload = decode_session_token(cookie)
    if not payload:
        return None
    user = session.get(User, int(payload["sub"]))
    if user is None or not user.is_active or payload.get("ver", 0) != user.token_version:
        return None
    # CSRF protection for cookie-authenticated writes: browsers cannot add this
    # custom header on cross-site requests without a CORS preflight we never grant.
    if request.method not in SAFE_METHODS and request.headers.get("x-requested-with") != "prisme":
        raise HTTPException(403, "Requête refusée (protection CSRF).")
    return user


def get_current_user(request: Request, session: Session = Depends(get_session)) -> User:
    user = authenticate_request(request, session)
    if user is None:
        raise HTTPException(401, "Authentification requise.")
    request.state.user = user
    return user


def has_role(user: User, minimum: str) -> bool:
    return ROLE_LEVEL.get(user.role, 0) >= ROLE_LEVEL[minimum]


def require_role(minimum: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_role(user, minimum):
            raise HTTPException(403, "Droits insuffisants pour cette action.")
        return user

    return dependency


CurrentUser = Depends(get_current_user)

"""Password hashing, session tokens, API tokens and at-rest encryption of secrets."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken

from .config import settings

# --- Passwords (scrypt, stdlib) -------------------------------------------------

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


def password_problems(password: str) -> str | None:
    """Recommandations CNIL (délibération 2022-100) simplifiées : 12 caractères et 3 types."""
    if len(password) < 12:
        return "Le mot de passe doit contenir au moins 12 caractères."
    classes = sum(
        [
            any(c.islower() for c in password),
            any(c.isupper() for c in password),
            any(c.isdigit() for c in password),
            any(not c.isalnum() for c in password),
        ]
    )
    if classes < 3:
        return "Utilisez au moins 3 types de caractères (minuscules, majuscules, chiffres, symboles)."
    return None


# --- Session tokens (JWT in an HttpOnly cookie) ---------------------------------

SESSION_COOKIE = "prisme_session"


def create_session_token(user_id: int, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "ver": token_version, "iat": now, "exp": now + timedelta(days=settings.session_days)}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_session_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# --- API tokens (for the REST API and the MCP endpoint) -------------------------

API_TOKEN_PREFIX = "prs_"


def generate_api_token() -> tuple[str, str, str]:
    """Return (plain token, display prefix, sha256 hash). Only the hash is stored."""
    token = API_TOKEN_PREFIX + secrets.token_urlsafe(32)
    return token, token[:10], hash_api_token(token)


def hash_api_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- Encryption of stored secrets (AI keys, SMTP passwords...) -------------------


def _fernet() -> Fernet:
    key = hashlib.sha256(("prisme-secrets:" + settings.secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "••••"
    return value[:4] + "••••" + value[-4:]

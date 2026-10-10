"""Runtime configuration, read from environment variables (all optional).

PRISME_DATA_DIR      Dossier des données (base SQLite, fichiers, clé secrète).
PRISME_DATABASE_URL  URL SQLAlchemy (ex. postgresql+psycopg://user:pass@host/db).
PRISME_SECRET_KEY    Clé secrète (sinon générée et stockée dans DATA_DIR/secret.key).
PRISME_HOST / PRISME_PORT  Adresse d'écoute du serveur web.
PRISME_PUBLIC_URL    URL publique (liens de devis/factures/formulaires dans les emails).
PRISME_MCP_USER      Email de l'utilisateur utilisé par le serveur MCP en mode stdio.
"""

from __future__ import annotations

import os
import secrets
from functools import cached_property
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent


def _default_data_dir() -> Path:
    # Running from the source tree (crm/backend/prisme) -> crm/data
    source_root = PACKAGE_DIR.parent
    if (source_root / "pyproject.toml").exists() and source_root.parent.name == "crm":
        return source_root.parent / "data"
    return Path.home() / ".prisme"


class Settings:
    @cached_property
    def data_dir(self) -> Path:
        path = Path(os.getenv("PRISME_DATA_DIR") or _default_data_dir()).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        (path / "uploads").mkdir(exist_ok=True)
        return path

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @cached_property
    def database_url(self) -> str:
        url = os.getenv("PRISME_DATABASE_URL") or os.getenv("DATABASE_URL")
        if url:
            if url.startswith("postgres://"):
                url = "postgresql+psycopg://" + url[len("postgres://") :]
            return url
        return f"sqlite:///{self.data_dir / 'prisme.db'}"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @cached_property
    def secret_key(self) -> str:
        env = os.getenv("PRISME_SECRET_KEY")
        if env:
            return env
        key_file = self.data_dir / "secret.key"
        if key_file.exists():
            return key_file.read_text().strip()
        key = secrets.token_urlsafe(48)
        key_file.write_text(key)
        try:
            key_file.chmod(0o600)
        except OSError:
            pass
        return key

    @property
    def host(self) -> str:
        return os.getenv("PRISME_HOST", "127.0.0.1")

    @property
    def port(self) -> int:
        return int(os.getenv("PRISME_PORT", "8000"))

    @property
    def public_url_env(self) -> str | None:
        return os.getenv("PRISME_PUBLIC_URL")

    @property
    def static_dir(self) -> Path:
        env = os.getenv("PRISME_STATIC_DIR")
        if env:
            return Path(env)
        bundled = PACKAGE_DIR / "static"
        if (bundled / "index.html").exists():
            return bundled
        return PACKAGE_DIR.parent.parent / "frontend" / "dist"

    @property
    def session_days(self) -> int:
        return int(os.getenv("PRISME_SESSION_DAYS", "30"))

    @property
    def mcp_user(self) -> str | None:
        return os.getenv("PRISME_MCP_USER")

    @property
    def disable_scheduler(self) -> bool:
        return os.getenv("PRISME_DISABLE_SCHEDULER", "0") == "1"


settings = Settings()

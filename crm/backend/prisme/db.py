"""Database engine, sessions and lightweight schema migration."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

log = logging.getLogger("prisme.db")

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = settings.database_url
        kwargs: dict = {
            "pool_pre_ping": True,
            "json_serializer": lambda obj: json.dumps(obj, ensure_ascii=False, default=str),
        }
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        _engine = create_engine(url, **kwargs)
        if url.startswith("sqlite"):

            @event.listens_for(_engine, "connect")
            def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - driver hook
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA synchronous=NORMAL")
                cur.execute("PRAGMA foreign_keys=OFF")
                cur.execute("PRAGMA busy_timeout=30000")
                cur.close()

    return _engine


def reset_engine() -> None:
    """Used by tests to point at a fresh database."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def get_session() -> Iterator[Session]:
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _auto_migrate(engine)


def _auto_migrate(engine: Engine) -> None:
    """Add columns that exist on the models but not yet in the database.

    Keeps upgrades painless without a migration framework: new nullable columns
    (or columns with simple defaults) are appended with ALTER TABLE.
    """
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            current = {c["name"] for c in insp.get_columns(table.name)}
            for column in table.columns:
                if column.name in current:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                default_sql = ""
                default = column.default.arg if column.default is not None and not callable(column.default.arg) else None
                if isinstance(default, bool):
                    default_sql = f" DEFAULT {1 if default else 0}"
                elif isinstance(default, (int, float)):
                    default_sql = f" DEFAULT {default}"
                elif isinstance(default, str):
                    escaped = default.replace("'", "''")
                    default_sql = f" DEFAULT '{escaped}'"
                log.info("Migration: ajout de la colonne %s.%s", table.name, column.name)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default_sql}'))

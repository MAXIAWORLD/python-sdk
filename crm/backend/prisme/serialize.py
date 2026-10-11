"""JSON serialization of ORM rows, with batched expansion of foreign keys."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from functools import lru_cache
from typing import Any

from sqlmodel import Session, SQLModel, select

HIDDEN_FIELDS = {"password_hash", "token_hash", "api_key_enc", "token_version"}

EXTRA_PROPS: dict[str, list[str]] = {
    "Contact": ["full_name"],
    "Subscription": ["mrr"],
    "Invoice": ["balance_due"],
    "Deal": ["value"],
}


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"


def jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return iso(value)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def dump(obj: SQLModel, exclude: set[str] | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {}
    hidden = HIDDEN_FIELDS | (exclude or set())
    for column in obj.__table__.columns:  # type: ignore[attr-defined]
        if column.name in hidden:
            continue
        data[column.name] = jsonable(getattr(obj, column.name))
    for prop in EXTRA_PROPS.get(type(obj).__name__, []):
        data[prop] = jsonable(getattr(obj, prop))
    return data


def summary(obj: Any) -> dict[str, Any]:
    """Compact representation used when a row is embedded in another one."""
    name = type(obj).__name__
    base: dict[str, Any] = {"id": obj.id}
    if name == "User":
        base.update(name=obj.name, email=obj.email, color=obj.color, avatar_url=obj.avatar_url)
    elif name == "Contact":
        base.update(name=obj.full_name, email=obj.email, avatar_url=obj.avatar_url, company_id=obj.company_id, job_title=obj.job_title)
    elif name == "Company":
        base.update(name=obj.name, logo_url=obj.logo_url, domain=obj.domain, type=obj.type)
    elif name == "Stage":
        base.update(name=obj.name, color=obj.color, probability=obj.probability, is_won=obj.is_won, is_lost=obj.is_lost)
    elif name == "Product":
        base.update(name=obj.name, unit_price=obj.unit_price, unit=obj.unit, vat_rate=obj.vat_rate)
    elif name == "Project":
        base.update(name=obj.name, color=obj.color, status=obj.status)
    elif name == "Deal":
        base.update(name=obj.title, status=obj.status, amount=obj.amount, mrr=obj.mrr)
    elif name == "Ticket":
        base.update(name=f"{obj.number} · {obj.subject}", status=obj.status)
    elif name in ("Invoice", "Quote"):
        base.update(name=obj.number or "Brouillon", status=obj.status, total=obj.total)
    elif name == "Subscription":
        base.update(name=obj.plan, status=obj.status)
    else:
        for attr in ("name", "title", "subject", "number", "plan", "email"):
            if hasattr(obj, attr) and getattr(obj, attr):
                base["name"] = getattr(obj, attr)
                break
    return base


@lru_cache(maxsize=None)
def table_models() -> dict[str, type[SQLModel]]:
    """Every table model, by table name."""
    from . import models  # noqa: F401

    mapping: dict[str, type[SQLModel]] = {}
    for cls in SQLModel.__subclasses__():
        _collect(cls, mapping)
    return mapping


def _collect(cls: type, mapping: dict[str, type[SQLModel]]) -> None:
    table = getattr(cls, "__table__", None)
    if table is not None:
        mapping[table.name] = cls  # type: ignore[assignment]
    for sub in cls.__subclasses__():
        _collect(sub, mapping)


@lru_cache(maxsize=None)
def fk_map(model: type[SQLModel]) -> dict[str, type[SQLModel]]:
    tables = table_models()
    result: dict[str, type[SQLModel]] = {}
    for column in model.__table__.columns:  # type: ignore[attr-defined]
        for fk in column.foreign_keys:
            target = tables.get(fk.column.table.name)
            if target is not None and column.name.endswith("_id"):
                result[column.name] = target
    return result


def dump_many(session: Session, objs: list[SQLModel], expand: bool = True) -> list[dict[str, Any]]:
    dicts = [dump(o) for o in objs]
    if not objs or not expand:
        return dicts
    model = type(objs[0])
    for column, target in fk_map(model).items():
        ids = {getattr(o, column) for o in objs if getattr(o, column, None)}
        if not ids:
            for d in dicts:
                d[column[:-3]] = None
            continue
        rows = session.exec(select(target).where(target.id.in_(ids))).all()  # type: ignore[attr-defined]
        lookup = {r.id: summary(r) for r in rows}
        for d in dicts:
            d[column[:-3]] = lookup.get(d.get(column))
    return dicts


def dump_one(session: Session, obj: SQLModel, expand: bool = True) -> dict[str, Any]:
    return dump_many(session, [obj], expand)[0]

"""Dynamic segments: rule sets evaluated as SQL filters on contacts or companies."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Date, DateTime, String, and_, cast, or_
from sqlmodel import Session, func, select

from ..crud import coerce
from ..models import Company, Contact, Deal, utcnow

OPERATORS = {
    "eq": "est égal à",
    "ne": "est différent de",
    "contains": "contient",
    "not_contains": "ne contient pas",
    "gt": "supérieur à",
    "gte": "supérieur ou égal à",
    "lt": "inférieur à",
    "lte": "inférieur ou égal à",
    "in": "fait partie de",
    "is_empty": "est vide",
    "is_not_empty": "n'est pas vide",
    "has_tag": "a le tag",
    "not_has_tag": "n'a pas le tag",
    "within_days": "dans les N derniers jours",
    "older_than_days": "il y a plus de N jours",
    "is_true": "est vrai",
    "is_false": "est faux",
}

CONTACT_FIELDS = {
    "first_name", "last_name", "email", "job_title", "department", "lifecycle", "lead_score", "source", "owner_id",
    "city", "country", "language", "tags", "consent_marketing", "do_not_contact", "created_at", "last_contacted_at", "company_id",
}
COMPANY_FIELDS = {"type", "status", "industry", "size", "employees", "city", "country", "health_score", "tags", "created_at", "owner_id", "source", "annual_revenue"}


def _is_temporal(column: Any) -> bool:
    return isinstance(getattr(column.type, "impl", column.type), (DateTime, Date))


def _expr(model: Any, field: str, op: str, value: Any) -> Any:
    if field.startswith("company.") and model is Contact:
        sub_field = field.split(".", 1)[1]
        if sub_field not in COMPANY_FIELDS:
            raise HTTPException(422, f"Champ inconnu : {field}")
        sub = select(Company.id).where(_expr(Company, sub_field, op, value))
        return Contact.company_id.in_(sub)
    if field == "has_open_deal" and model is Contact:
        sub = select(Deal.contact_id).where(Deal.status == "open", Deal.contact_id.isnot(None))
        return Contact.id.in_(sub) if op != "is_false" else Contact.id.notin_(sub)
    allowed = CONTACT_FIELDS if model is Contact else COMPANY_FIELDS
    if field not in allowed:
        raise HTTPException(422, f"Champ inconnu : {field}")
    attr = getattr(model, field)
    column = model.__table__.columns[field]
    if op in ("eq", "ne", "gt", "gte", "lt", "lte") and value not in (None, ""):
        value = coerce(model, field, value) if not isinstance(value, (list, dict)) else value
    if op == "eq":
        return attr == value
    if op == "ne":
        return or_(attr != value, attr.is_(None))
    if op == "contains":
        return cast(attr, String).ilike(f"%{value}%")
    if op == "not_contains":
        return or_(~cast(attr, String).ilike(f"%{value}%"), attr.is_(None))
    if op in ("gt", "gte", "lt", "lte"):
        if value in (None, ""):
            raise ValueError("valeur manquante")
        bound = value if isinstance(value, (int, float, datetime, date)) or _is_temporal(column) else float(value)
        return {"gt": attr > bound, "gte": attr >= bound, "lt": attr < bound, "lte": attr <= bound}[op]
    if op == "in":
        values = value if isinstance(value, list) else [v.strip() for v in str(value).split(",") if v.strip()]
        return attr.in_(values)
    if op == "is_empty":
        return or_(attr.is_(None), cast(attr, String) == "", cast(attr, String) == "[]")
    if op == "is_not_empty":
        return and_(attr.isnot(None), cast(attr, String) != "", cast(attr, String) != "[]")
    if op == "has_tag":
        return cast(attr, String).like(f'%"{value}"%')
    if op == "not_has_tag":
        return or_(~cast(attr, String).like(f'%"{value}"%'), attr.is_(None))
    if op == "within_days":
        return attr >= utcnow() - timedelta(days=int(value))
    if op == "older_than_days":
        return or_(attr < utcnow() - timedelta(days=int(value)), attr.is_(None))
    if op == "is_true":
        return attr == True  # noqa: E712
    if op == "is_false":
        return or_(attr == False, attr.is_(None))  # noqa: E712
    raise HTTPException(422, f"Opérateur inconnu : {op}")


def build_query(entity: str, rules: dict[str, Any]) -> Any:
    model = Contact if entity == "contacts" else Company
    conditions = [c for c in (rules or {}).get("conditions", []) if c.get("field") and c.get("op")]
    exprs = []
    for c in conditions:
        try:
            exprs.append(_expr(model, c["field"], c["op"], c.get("value")))
        except (TypeError, ValueError) as exc:
            raise HTTPException(422, f"Condition incomplète ou invalide sur « {c['field']} » : vérifiez la valeur saisie.") from exc
    stmt = select(model)
    if model is Contact:
        stmt = stmt.where(Contact.anonymized_at.is_(None))
    if exprs:
        stmt = stmt.where(or_(*exprs) if (rules or {}).get("match") == "any" else and_(*exprs))
    return stmt


def count(session: Session, entity: str, rules: dict[str, Any]) -> int:
    stmt = build_query(entity, rules)
    return int(session.exec(select(func.count()).select_from(stmt.subquery())).one())


def members(session: Session, entity: str, rules: dict[str, Any], limit: int | None = None) -> list[Any]:
    stmt = build_query(entity, rules)
    if limit:
        stmt = stmt.limit(limit)
    return list(session.exec(stmt).all())

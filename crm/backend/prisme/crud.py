"""Generic resource engine shared by the REST API, the AI assistant and the MCP server.

Every business entity is declared once as a `Resource` (model + search fields +
hooks). The same create/update/delete code path — validation, business hooks,
audit trail and domain events — runs whether the change comes from the web UI,
an API token, the in-app assistant or Claude through MCP.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import JSON, String, and_, func, or_
from sqlalchemy import cast as sa_cast
from sqlmodel import Session, SQLModel, select

from .db import get_session
from .deps import get_current_user, has_role
from .models import User, utcnow
from .serialize import dump, dump_many, dump_one, fk_map, jsonable, table_models
from .services import audit
from .services.events import emit, flush_events

RESERVED_PARAMS = {"q", "limit", "offset", "sort", "expand", "fields"}
PROTECTED_FIELDS = {"id", "created_at", "updated_at"}
MAX_LIMIT = 1000


class Hooks:
    """Override any of these in a subclass to add business rules to a resource."""

    def prepare(self, session: Session, data: dict[str, Any], obj: Any | None, user: User | None) -> dict[str, Any]:
        return data

    def before_save(self, session: Session, obj: Any, changes: dict[str, Any], created: bool, user: User | None) -> None:
        pass

    def after_save(self, session: Session, obj: Any, changes: dict[str, Any], created: bool, user: User | None) -> None:
        pass

    def before_delete(self, session: Session, obj: Any, user: User | None) -> None:
        pass

    def after_delete(self, session: Session, data: dict[str, Any], user: User | None) -> None:
        pass

    def scope(self, stmt: Any, user: User | None) -> Any:
        return stmt

    def enrich(self, session: Session, items: list[dict[str, Any]], objs: list[Any]) -> None:
        pass


LABELS: dict[type[SQLModel], str] = {}  # model -> French label, filled by Resource


def detach_references(session: Session, obj: SQLModel) -> None:
    """Clear references to a record about to be deleted (foreign keys are not enforced on SQLite).

    Optional references are set to NULL; a mandatory one blocks the deletion with a clear message.
    """
    target = type(obj)
    for model in table_models().values():
        for column, ref in fk_map(model).items():
            if ref is not target:
                continue
            rows = session.exec(select(model).where(getattr(model, column) == obj.id)).all()  # type: ignore[attr-defined]
            if not rows:
                continue
            if not model.__table__.columns[column].nullable:  # type: ignore[attr-defined]
                label = LABELS.get(model, model.__tablename__)
                raise HTTPException(409, f"Suppression impossible : {len(rows)} {label}(s) y sont rattaché(e)s. Supprimez-les ou réaffectez-les d'abord.")
            for row in rows:
                setattr(row, column, None)
                session.add(row)


@dataclass
class Resource:
    name: str  # URL segment, e.g. "contacts"
    model: type[SQLModel]
    entity: str  # singular name used in events, e.g. "contact"
    label: str  # French label for messages, e.g. "contact"
    search: tuple[str, ...] = ()
    default_sort: str = "-updated_at"
    read_role: str = "viewer"
    write_role: str = "member"
    delete_role: str = "member"
    readonly: frozenset[str] = frozenset()
    hooks: Hooks = field(default_factory=Hooks)
    audit: bool = True
    events: bool = True

    def __post_init__(self) -> None:
        LABELS.setdefault(self.model, self.label)

    # ------------------------------------------------------------------ helpers
    @property
    def columns(self) -> dict[str, Any]:
        return {c.name: c for c in self.model.__table__.columns}  # type: ignore[attr-defined]

    def writable_fields(self) -> set[str]:
        return set(self.columns) - PROTECTED_FIELDS - set(self.readonly) - {"password_hash", "token_hash", "api_key_enc"}

    # --------------------------------------------------------------------- read
    def query(self, session: Session, params: dict[str, Any] | Iterable[tuple[str, str]], user: User | None) -> tuple[list[Any], int]:
        items = list(params.items()) if isinstance(params, dict) else list(params)
        stmt = select(self.model)
        stmt = self.hooks.scope(stmt, user)
        stmt = apply_filters(stmt, self.model, items)
        q = next((str(v) for k, v in items if k == "q" and v not in (None, "")), None)
        if q and self.search:
            stmt = apply_search(stmt, self.model, self.search, q)
        total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
        sort = next((str(v) for k, v in items if k == "sort" and v), self.default_sort)
        stmt = apply_sort(stmt, self.model, sort)
        limit = _int(next((v for k, v in items if k == "limit"), None), 50)
        offset = _int(next((v for k, v in items if k == "offset"), None), 0)
        if limit <= 0 or limit > MAX_LIMIT:
            limit = MAX_LIMIT
        stmt = stmt.offset(max(offset, 0)).limit(limit)
        return list(session.exec(stmt).all()), int(total)

    def list(self, session: Session, params: Any, user: User | None, expand: bool = True) -> dict[str, Any]:
        objs, total = self.query(session, params, user)
        data = dump_many(session, objs, expand=expand)
        self.hooks.enrich(session, data, objs)
        return {"items": data, "total": total}

    def get_obj(self, session: Session, obj_id: int, user: User | None = None) -> Any:
        stmt = self.hooks.scope(select(self.model).where(self.model.id == obj_id), user)  # type: ignore[attr-defined]
        obj = session.exec(stmt).first()
        if obj is None:
            raise HTTPException(404, f"{self.label.capitalize()} introuvable (#{obj_id}).")
        return obj

    def get(self, session: Session, obj_id: int, user: User | None) -> dict[str, Any]:
        obj = self.get_obj(session, obj_id, user)
        data = dump_one(session, obj)
        self.hooks.enrich(session, [data], [obj])
        return data

    # -------------------------------------------------------------------- write
    def clean(self, data: dict[str, Any]) -> dict[str, Any]:
        allowed = self.writable_fields()
        out: dict[str, Any] = {}
        for key, value in (data or {}).items():
            if key not in allowed:
                continue
            out[key] = coerce(self.model, key, value)
        return out

    def create(self, session: Session, data: dict[str, Any], user: User | None, *, commit: bool = True) -> Any:
        data = self.hooks.prepare(session, dict(data or {}), None, user)
        clean = self.clean(data)
        try:
            obj = self.model.model_validate(clean)
        except ValidationError as exc:
            raise HTTPException(422, _validation_message(exc)) from exc
        changes = {k: [None, jsonable(v)] for k, v in clean.items()}
        self.hooks.before_save(session, obj, changes, True, user)
        session.add(obj)
        session.flush()
        self.hooks.after_save(session, obj, changes, True, user)
        if self.audit:
            audit.record(session, "create", user.id if user else None, self.entity, obj.id, _title(obj))
        if commit:
            session.commit()
            session.refresh(obj)
            if self.events:
                emit(f"{self.entity}.created", {"id": obj.id, "data": dump(obj)}, user.id if user else None)
            flush_events(session)
        return obj

    def update(self, session: Session, obj_id: int, data: dict[str, Any], user: User | None, *, commit: bool = True) -> Any:
        obj = self.get_obj(session, obj_id, user)
        data = self.hooks.prepare(session, dict(data or {}), obj, user)
        clean = self.clean(data)
        before = dump(obj)
        for key, value in clean.items():
            setattr(obj, key, value)
        if hasattr(obj, "updated_at"):
            obj.updated_at = utcnow()
        changes = audit.diff(before, dump(obj))
        self.hooks.before_save(session, obj, changes, False, user)
        changes = audit.diff(before, dump(obj))
        session.add(obj)
        session.flush()
        self.hooks.after_save(session, obj, changes, False, user)
        if self.audit and changes:
            audit.record(session, "update", user.id if user else None, self.entity, obj.id, _title(obj), changes)
        if commit:
            session.commit()
            session.refresh(obj)
            if self.events and changes:
                emit(f"{self.entity}.updated", {"id": obj.id, "data": dump(obj), "changes": changes}, user.id if user else None)
            flush_events(session)
        return obj

    def delete(self, session: Session, obj_id: int, user: User | None, *, commit: bool = True) -> dict[str, Any]:
        obj = self.get_obj(session, obj_id, user)
        self.hooks.before_delete(session, obj, user)
        detach_references(session, obj)
        data = dump(obj)
        session.delete(obj)
        session.flush()
        self.hooks.after_delete(session, data, user)
        if self.audit:
            audit.record(session, "delete", user.id if user else None, self.entity, obj_id, _title(obj))
        if commit:
            session.commit()
            if self.events:
                emit(f"{self.entity}.deleted", {"id": obj_id, "data": data}, user.id if user else None)
            flush_events(session)
        return data


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


def to_utc(value: datetime) -> datetime:
    """Naive values are interpreted as UTC; aware values are converted to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@lru_cache(maxsize=None)
def _adapter(model: type[SQLModel], field_name: str) -> TypeAdapter | None:
    info = model.model_fields.get(field_name)
    if info is None or info.annotation is None:
        return None
    try:
        return TypeAdapter(info.annotation)
    except Exception:  # noqa: BLE001
        return None


def coerce(model: type[SQLModel], field_name: str, value: Any) -> Any:
    if value == "" and field_name not in ("first_name", "last_name", "body", "name", "title"):
        info = model.model_fields.get(field_name)
        if info is not None and not info.is_required() and info.default is None:
            return None
    adapter = _adapter(model, field_name)
    if adapter is None:
        return value
    try:
        result = adapter.validate_python(value)
    except ValidationError as exc:
        raise HTTPException(422, f"Valeur invalide pour « {field_name} » : {value!r}") from exc
    if isinstance(result, datetime):
        result = to_utc(result)
    return result


def _cast_param(column: Any, raw: str) -> Any:
    try:
        py_type = column.type.python_type
    except NotImplementedError:
        return raw
    if py_type is bool:
        return raw.lower() in ("1", "true", "yes", "oui", "on")
    if py_type is int:
        return int(raw)
    if py_type is float:
        return float(raw)
    if py_type is datetime:
        return to_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    if py_type is date:
        return date.fromisoformat(raw[:10])
    return raw


def apply_filters(stmt: Any, model: type[SQLModel], params: list[tuple[str, Any]]) -> Any:
    columns = {c.name: c for c in model.__table__.columns}  # type: ignore[attr-defined]
    for key, raw in params:
        if key in RESERVED_PARAMS or raw is None:
            continue
        name, _, op = key.partition("__")
        column = columns.get(name)
        if column is None:
            continue
        attr = getattr(model, name)
        raw = str(raw)
        try:
            if op in ("", "eq"):
                stmt = stmt.where(attr.is_(None)) if raw == "null" else stmt.where(attr == _cast_param(column, raw))
            elif op == "ne":
                stmt = stmt.where(attr.isnot(None)) if raw == "null" else stmt.where(or_(attr != _cast_param(column, raw), attr.is_(None)))
            elif op in ("in", "nin"):
                values = [_cast_param(column, v) for v in raw.split(",") if v != ""]
                if values:
                    stmt = stmt.where(attr.in_(values) if op == "in" else attr.notin_(values))
            elif op == "gt":
                stmt = stmt.where(attr > _cast_param(column, raw))
            elif op == "gte":
                stmt = stmt.where(attr >= _cast_param(column, raw))
            elif op == "lt":
                stmt = stmt.where(attr < _cast_param(column, raw))
            elif op == "lte":
                stmt = stmt.where(attr <= _cast_param(column, raw))
            elif op == "isnull":
                stmt = stmt.where(attr.is_(None) if raw.lower() in ("1", "true") else attr.isnot(None))
            elif op == "contains":
                if isinstance(column.type, JSON):
                    stmt = stmt.where(sa_cast(attr, String).like(f'%"{raw}"%'))
                else:
                    stmt = stmt.where(attr.ilike(f"%{raw}%"))
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, f"Filtre invalide « {key}={raw} »") from exc
    return stmt


def apply_search(stmt: Any, model: type[SQLModel], fields: tuple[str, ...], q: str) -> Any:
    terms = [t for t in q.strip().split() if t][:6]
    clauses = []
    for term in terms:
        like = f"%{term}%"
        ors = []
        for f in fields:
            attr = getattr(model, f, None)
            if attr is None:
                continue
            column = model.__table__.columns.get(f)  # type: ignore[attr-defined]
            if column is not None and isinstance(column.type, JSON):
                ors.append(sa_cast(attr, String).ilike(like))
            else:
                ors.append(attr.ilike(like))
        if ors:
            clauses.append(or_(*ors))
    return stmt.where(and_(*clauses)) if clauses else stmt


def apply_sort(stmt: Any, model: type[SQLModel], sort: str) -> Any:
    columns = {c.name for c in model.__table__.columns}  # type: ignore[attr-defined]
    order = []
    for part in sort.split(","):
        part = part.strip()
        if not part:
            continue
        desc = part.startswith("-")
        name = part.lstrip("-+")
        if name not in columns:
            continue
        attr = getattr(model, name)
        order.append(attr.desc().nulls_last() if desc else attr.asc().nulls_last())
    if not order:
        order.append(model.id.desc())  # type: ignore[attr-defined]
    elif "id" not in {p.lstrip("-+") for p in sort.split(",")}:
        order.append(model.id.desc())  # type: ignore[attr-defined]
    return stmt.order_by(*order)


def _title(obj: Any) -> str:
    for attr in ("full_name", "name", "title", "subject", "number", "plan", "email"):
        value = getattr(obj, attr, None)
        if value:
            return str(value)
    return f"#{obj.id}"


def _validation_message(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors()[:3]:
        loc = ".".join(str(x) for x in err.get("loc", ()))
        parts.append(f"{loc} : {err.get('msg')}")
    return "Données invalides — " + " ; ".join(parts)


# ---------------------------------------------------------------------------
# REST router factory
# ---------------------------------------------------------------------------


def make_router(resource: Resource, extra: Callable[[APIRouter], None] | None = None) -> APIRouter:
    router = APIRouter(prefix=f"/{resource.name}", tags=[resource.name])

    def check(user: User, role: str) -> None:
        if not has_role(user, role):
            raise HTTPException(403, "Droits insuffisants pour cette action.")

    if extra is not None:
        extra(router)  # custom routes first so they win over /{id}

    @router.get("")
    def list_items(request: Request, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
        check(user, resource.read_role)
        expand = request.query_params.get("expand", "1") not in ("0", "false")
        return resource.list(session, request.query_params.multi_items(), user, expand=expand)

    @router.post("", status_code=201)
    def create_item(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
        check(user, resource.write_role)
        obj = resource.create(session, payload, user)
        return resource.get(session, obj.id, user)

    @router.post("/bulk")
    def bulk(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
        action = payload.get("action")
        ids = [int(i) for i in payload.get("ids", [])][:500]
        if action == "delete":
            check(user, resource.delete_role)
            for obj_id in ids:
                resource.delete(session, obj_id, user)
            return {"deleted": len(ids)}
        if action == "update":
            check(user, resource.write_role)
            data = payload.get("data") or {}
            for obj_id in ids:
                resource.update(session, obj_id, data, user)
            return {"updated": len(ids)}
        raise HTTPException(400, "Action groupée inconnue.")

    @router.get("/{obj_id:int}")
    def get_item(obj_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
        check(user, resource.read_role)
        return resource.get(session, obj_id, user)

    @router.patch("/{obj_id:int}")
    def update_item(obj_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
        check(user, resource.write_role)
        resource.update(session, obj_id, payload, user)
        return resource.get(session, obj_id, user)

    @router.delete("/{obj_id:int}")
    def delete_item(obj_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
        check(user, resource.delete_role)
        resource.delete(session, obj_id, user)
        return {"ok": True}

    return router

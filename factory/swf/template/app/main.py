"""Spec-driven API engine. MANAGED by swf (overwritten on regen).

Business logic goes in app/hooks/<entity>.py, data model in app/schema.json.
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import importlib
import io
import json
import logging
import os
import queue
import re
import sqlite3
import threading
import time
import urllib.request
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response

BASE = Path(__file__).parent
SPEC = json.loads((BASE / "schema.json").read_text())
ENTITIES = {e["name"]: e for e in SPEC["entities"]}
SQL_TYPES = {"int": "INTEGER", "ref": "INTEGER", "bool": "INTEGER", "float": "REAL"}
SYS_COLS = ("id", "created_at", "updated_at")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
log = logging.getLogger("app")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(message)s")
_migrated: set[str] = set()
REQS: defaultdict[tuple, list] = defaultdict(lambda: [0, 0.0])  # (method, route, status) -> [count, seconds]
HOOKS_STATS = {"ok": 0, "failed": 0, "dropped": 0}
_events: queue.Queue = queue.Queue(maxsize=1000)
_worker_started = threading.Lock()
_worker: threading.Thread | None = None


def _deliver(evt: dict) -> None:
    url = os.environ.get("WEBHOOK_URL", "")
    if not url.startswith(("http://", "https://")):
        return
    body = json.dumps(evt, default=str).encode()
    sig = hmac.new(os.environ.get("WEBHOOK_SECRET", "").encode(), body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(url, body, {"content-type": "application/json", "x-signature-sha256": sig})  # noqa: S310
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=5):  # noqa: S310 (scheme checked above)
                HOOKS_STATS["ok"] += 1
                return
        except OSError:
            time.sleep(0.2 * 2**attempt)
    HOOKS_STATS["failed"] += 1
    log.warning(json.dumps({"webhook": "failed", "event": evt["event"]}))


def _work() -> None:
    while True:
        evt = _events.get()
        try:
            _deliver(evt)
        finally:
            _events.task_done()


def emit(event: str, entity: str, item: dict) -> None:
    """Async webhook (worker thread, 3 retries, HMAC-SHA256 signature). No-op without WEBHOOK_URL."""
    global _worker
    if not os.environ.get("WEBHOOK_URL"):
        return
    with _worker_started:
        if _worker is None:
            _worker = threading.Thread(target=_work, daemon=True, name="webhooks")
            _worker.start()
    try:
        _events.put_nowait({"event": f"{entity}.{event}", "at": now(), "data": item})
    except queue.Full:
        HOOKS_STATS["dropped"] += 1


def db_path() -> str:
    return os.environ.get("DATABASE_PATH", str(BASE.parent / "data" / "app.db"))


def migrate(con: sqlite3.Connection) -> None:
    """Idempotent, additive migrations: new entities/fields appear without data loss."""
    for e in SPEC["entities"]:
        n = e["name"]
        con.execute(f'CREATE TABLE IF NOT EXISTS "{n}" (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, updated_at TEXT)')
        have = {r[1] for r in con.execute(f'PRAGMA table_info("{n}")')}
        for f in e["fields"]:
            if f["name"] in have:
                continue
            ref = f' REFERENCES "{f["ref"]}"(id) ON DELETE SET NULL' if f["type"] == "ref" else ""
            con.execute(f'ALTER TABLE "{n}" ADD COLUMN "{f["name"]}" {SQL_TYPES.get(f["type"], "TEXT")}{ref}')
    con.commit()


@contextmanager
def db():
    path = db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    try:
        if path not in _migrated:
            migrate(con)
            _migrated.add(path)
        yield con
        con.commit()
    except sqlite3.IntegrityError as exc:
        con.rollback()
        raise HTTPException(422, f"integrity error: {exc}") from exc
    finally:
        con.close()


def hook(entity: str, name: str):
    try:
        mod = importlib.import_module(f"app.hooks.{entity}")
    except ModuleNotFoundError:
        return None
    return getattr(mod, name, None)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def coerce(f: dict, v):
    if v is None or v == "":
        return None
    t = f["type"]
    try:
        if t in ("int", "ref"):
            if isinstance(v, bool) or (isinstance(v, float) and not v.is_integer()):
                raise ValueError
            return int(v)
        if t == "float":
            if isinstance(v, bool):
                raise ValueError
            return float(v)
        if t == "bool":
            s = str(v).lower()
            if s in ("1", "true", "yes", "on"):
                return 1
            if s in ("0", "false", "no", "off"):
                return 0
            raise ValueError
        if t == "date":
            return date.fromisoformat(str(v)).isoformat()
        if t == "datetime":
            return datetime.fromisoformat(str(v)).isoformat()
        v = str(v)
        if t == "email" and not EMAIL_RE.match(v):
            raise ValueError
        if t == "enum" and v not in f["values"]:
            raise ValueError
        if len(v) > f.get("max", 10_000):
            raise ValueError
        return v
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, f"invalid {t} for '{f['name']}'") from exc


def clean(ent: dict, data, partial: bool) -> dict:
    if not isinstance(data, dict):
        raise HTTPException(422, "JSON object expected")
    fields = {f["name"]: f for f in ent["fields"]}
    unknown = sorted(set(data) - set(fields))
    if unknown:
        raise HTTPException(422, f"unknown fields: {unknown}")
    out = {k: coerce(fields[k], v) for k, v in data.items()}
    for f in ent["fields"]:
        if not partial and f["name"] not in out:
            out[f["name"]] = coerce(f, f.get("default"))
        if f.get("required") and f["name"] in out and out[f["name"]] is None:
            raise HTTPException(422, f"'{f['name']}' is required")
    return out


def to_dict(ent: dict, r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    for f in ent["fields"]:
        if f["type"] == "bool" and d.get(f["name"]) is not None:
            d[f["name"]] = bool(d[f["name"]])
    return d


app = FastAPI(title=SPEC.get("title", SPEC["name"]), version=SPEC.get("version", "0.1.0"))


@app.middleware("http")
async def guard_and_log(request: Request, call_next):
    t0 = time.perf_counter()
    key = os.environ.get("API_KEY", "")
    protected = request.url.path.startswith("/api/") or request.url.path == "/metrics"
    given = request.headers.get("x-api-key") or request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if key and protected and not hmac.compare_digest(given, key):
        resp = JSONResponse({"detail": "unauthorized"}, status_code=401)
    else:
        resp = await call_next(request)
    dt = time.perf_counter() - t0
    ms = round(dt * 1000, 1)
    route = getattr(request.scope.get("route"), "path", "unmatched")
    m = REQS[(request.method, route, resp.status_code)]
    m[0] += 1
    m[1] += dt
    log.info(json.dumps({"m": request.method, "p": request.url.path, "s": resp.status_code, "ms": ms}))
    return resp


@app.get("/health")
def health():
    with db() as con:
        con.execute("SELECT 1")
    return {"status": "ok", "app": SPEC["name"], "version": SPEC.get("version")}


@app.get("/metrics")
def metrics():
    """Prometheus text format: requests, latency, errors, webhooks, rows per entity, DB size."""
    out = ["# TYPE app_requests_total counter", "# TYPE app_request_seconds_sum counter"]
    for (meth, route, status), (n, secs) in sorted(REQS.items()):
        lbl = f'method="{meth}",route="{route}",status="{status}"'
        out += [f"app_requests_total{{{lbl}}} {n}", f"app_request_seconds_sum{{{lbl}}} {secs:.6f}"]
    out.append("# TYPE app_webhooks_total counter")
    out += [f'app_webhooks_total{{result="{k}"}} {v}' for k, v in HOOKS_STATS.items()]
    out.append(f"app_webhook_queue {_events.qsize()}")
    with db() as con:
        for n in ENTITIES:
            count = con.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0]  # noqa: S608
            out.append(f'app_rows{{entity="{n}"}} {count}')
    path = Path(db_path())
    out.append(f"app_db_bytes {path.stat().st_size if path.exists() else 0}")
    return Response("\n".join(out) + "\n", media_type="text/plain; version=0.0.4")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/api/_schema")
def schema():
    return SPEC


def register(ent: dict) -> None:
    n = ent["name"]
    fields = {f["name"]: f for f in ent["fields"]}
    searchable = [k for k, f in fields.items() if f["type"] in ("str", "text", "email")]
    tag = [ent.get("label", n)]

    def fetch(con, item_id: int) -> dict:
        item = to_dict(ent, con.execute(f'SELECT * FROM "{n}" WHERE id = ?', (item_id,)).fetchone())  # noqa: S608
        if item is None:
            raise HTTPException(404, f"{n} {item_id} not found")
        return item

    def where(params) -> tuple[str, list]:
        clauses, args = [], []
        for k, v in params.items():
            if k in fields:
                clauses.append(f'"{k}" = ?')
                args.append(coerce(fields[k], v))
        q = params.get("q")
        if q and searchable:
            clauses.append("(" + " OR ".join(f'"{s}" LIKE ?' for s in searchable) + ")")
            args += [f"%{q}%"] * len(searchable)
        return (" WHERE " + " AND ".join(clauses)) if clauses else "", args

    @app.get(f"/api/{n}", tags=tag)
    def list_items(request: Request, limit: int = 50, offset: int = 0, order: str = "-id"):
        col = order.lstrip("-")
        if col not in fields and col not in SYS_COLS:
            raise HTTPException(422, f"cannot order by '{col}'")
        w, args = where(request.query_params)
        direction = "DESC" if order.startswith("-") else "ASC"
        with db() as con:
            total = con.execute(f'SELECT COUNT(*) FROM "{n}"{w}', args).fetchone()[0]  # noqa: S608
            rows = con.execute(
                f'SELECT * FROM "{n}"{w} ORDER BY "{col}" {direction} LIMIT ? OFFSET ?',  # noqa: S608
                [*args, max(1, min(limit, 500)), max(0, offset)],
            ).fetchall()
        return {"total": total, "items": [to_dict(ent, r) for r in rows]}

    @app.get(f"/api/{n}.csv", tags=tag, response_class=PlainTextResponse)
    def export_csv(request: Request):
        w, args = where(request.query_params)
        with db() as con:
            rows = con.execute(f'SELECT * FROM "{n}"{w} ORDER BY id', args).fetchall()  # noqa: S608
        buf = io.StringIO()
        out = csv.writer(buf)
        cols = [*SYS_COLS, *fields]
        out.writerow(cols)
        for r in rows:
            out.writerow([r[c] for c in cols])
        return PlainTextResponse(buf.getvalue(), media_type="text/csv")

    @app.get(f"/api/{n}/_stats", tags=tag)
    def stats(by: str):
        if by not in fields:
            raise HTTPException(422, f"unknown field '{by}'")
        nums = [k for k, f in fields.items() if f["type"] in ("int", "float")]
        sums = "".join(f', SUM("{k}") AS "sum_{k}"' for k in nums)
        with db() as con:
            rows = con.execute(f'SELECT "{by}" AS key, COUNT(*) AS count{sums} FROM "{n}" GROUP BY "{by}"').fetchall()  # noqa: S608
        return {"by": by, "groups": [dict(r) for r in rows]}

    @app.get(f"/api/{n}/{{item_id}}", tags=tag)
    def get_item(item_id: int):
        with db() as con:
            return fetch(con, item_id)

    @app.post(f"/api/{n}", status_code=201, tags=tag)
    def create_item(data: dict = Body(...)):
        vals = clean(ent, data, partial=False)
        if h := hook(n, "before_create"):
            vals = h(vals) or vals
        vals.update(created_at=now(), updated_at=now())
        cols = ", ".join(f'"{k}"' for k in vals)
        with db() as con:
            cur = con.execute(f'INSERT INTO "{n}" ({cols}) VALUES ({", ".join("?" * len(vals))})', list(vals.values()))  # noqa: S608
            item = fetch(con, cur.lastrowid)
        if h := hook(n, "after_create"):
            h(item)
        emit("created", n, item)
        return item

    @app.patch(f"/api/{n}/{{item_id}}", tags=tag)
    def update_item(item_id: int, data: dict = Body(...)):
        vals = clean(ent, data, partial=True)
        with db() as con:
            current = fetch(con, item_id)
            if h := hook(n, "before_update"):
                vals = h(vals, current) or vals
            vals["updated_at"] = now()
            sets = ", ".join(f'"{k}" = ?' for k in vals)
            con.execute(f'UPDATE "{n}" SET {sets} WHERE id = ?', [*vals.values(), item_id])  # noqa: S608
            item = fetch(con, item_id)
        emit("updated", n, item)
        return item

    @app.delete(f"/api/{n}/{{item_id}}", status_code=204, tags=tag)
    def delete_item(item_id: int):
        with db() as con:
            item = fetch(con, item_id)
            if h := hook(n, "before_delete"):
                h(item)
            con.execute(f'DELETE FROM "{n}" WHERE id = ?', (item_id,))  # noqa: S608
        emit("deleted", n, item)


for _ent in SPEC["entities"]:
    register(_ent)

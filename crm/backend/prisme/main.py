"""FastAPI application: REST API, MCP endpoint, background jobs and the web interface (SPA)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.routing import Route

from . import __version__
from .api import build_router
from .config import settings
from .db import init_db

log = logging.getLogger("prisme")

PLACEHOLDER = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Prisme CRM</title>
<style>body{font-family:system-ui;background:#0b0e1a;color:#e8eaf6;display:grid;place-items:center;height:100vh;margin:0}
code{background:#1b2036;padding:2px 8px;border-radius:6px}</style></head><body><div>
<h1>Prisme CRM — API démarrée ✅</h1><p>L'interface web n'est pas encore construite.</p>
<p>Lancez <code>npm install && npm run build</code> dans <code>crm/frontend</code>, ou utilisez <code>./start.sh</code>.</p>
<p>Documentation de l'API : <a style="color:#8ea2ff" href="/api/docs">/api/docs</a></p></div></body></html>"""


def create_app() -> FastAPI:
    from .mcp_server import MCPHttp
    from .services import listeners  # noqa: F401  (register event listeners)
    from .services import automation_engine  # noqa: F401
    from .services.events import start_worker, stop_worker
    from .services.scheduler import run_forever

    mcp_http = MCPHttp()

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        from .db import session_scope
        from .seed import ensure_defaults

        with session_scope() as session:
            ensure_defaults(session)
        start_worker()
        stop = asyncio.Event()
        task = None if settings.disable_scheduler else asyncio.create_task(run_forever(stop))
        async with mcp_http.manager.run():
            log.info("Prisme %s prêt — données : %s", __version__, settings.data_dir)
            yield
        stop.set()
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        stop_worker()

    app = FastAPI(
        title="Prisme CRM",
        version=__version__,
        description="API du CRM Prisme. Authentification : cookie de session ou en-tête `Authorization: Bearer <jeton API>`.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        body = detail if isinstance(detail, dict) else {"message": detail}
        body.setdefault("detail", detail if not isinstance(detail, dict) else detail.get("message"))
        return JSONResponse(body, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
        if not request.url.path.startswith("/f/"):
            response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        return response

    app.include_router(build_router())
    # Exact path (no redirect): MCP clients POST to /mcp directly.
    app.router.routes.append(Route("/mcp", endpoint=mcp_http, methods=["GET", "POST", "DELETE"]))

    static_dir: Path = settings.static_dir
    index = static_dir / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith(("api/", "mcp")):
            raise FastAPIHTTPException(404)
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and static_dir.resolve() in candidate.parents:
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if "/assets/" in f"/{path}" else {}
            return FileResponse(candidate, headers=headers)
        if index.exists():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        return HTMLResponse(PLACEHOLDER)

    return app


app = create_app()

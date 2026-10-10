from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..crud import make_router
from ..deps import get_current_user
from ..models import User
from ..resources import READ_ONLY, RESOURCES
from . import admin, ai, auth, comms, dashboard, marketing, public, sales, work


def build_router() -> APIRouter:
    api = APIRouter(prefix="/api")
    for module in (auth, public, dashboard, sales, work, marketing, comms, admin, ai):
        api.include_router(module.router)
    for name, resource in RESOURCES.items():
        router = make_router(resource)
        if name in READ_ONLY:
            # Writes for these resources go through dedicated, rule-enforcing endpoints.
            keep_delete = name == "form-submissions"
            router.routes = [r for r in router.routes if getattr(r, "methods", set()) <= {"GET", "HEAD"} or (keep_delete and "DELETE" in r.methods)]
        api.include_router(router)

    @api.get("/health", tags=["system"])
    def health():
        return {"status": "ok"}

    @api.api_route("/{path:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"], include_in_schema=False)
    def not_found(path: str, user: User = Depends(get_current_user)):
        raise HTTPException(404, "Route API inconnue.")

    return api


__all__ = ["build_router"]

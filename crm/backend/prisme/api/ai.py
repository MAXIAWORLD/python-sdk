"""AI assistant API: providers, conversations (SSE streaming), approvals and quick generations."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from ..ai import agent, quick, tools
from ..ai.providers import PRESETS, ProviderConfig, ProviderError, build
from ..ai.providers.anthropic_provider import AnthropicProvider
from ..ai.providers.openai_compat import OpenAICompatProvider
from ..db import get_session
from ..deps import get_current_user, require_role
from ..models import AIConversation, AIMessage, AIProvider, User, utcnow
from ..security import decrypt_secret
from ..serialize import dump, dump_many
from ..services.settings import get_section

router = APIRouter(prefix="/ai", tags=["ai"])


def _sse(gen: AsyncIterator[dict[str, Any]]) -> StreamingResponse:
    async def body():
        try:
            async for event in gen:
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(body(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/presets")
def presets(user: User = Depends(get_current_user)):
    return {"presets": PRESETS}


@router.get("/status")
def status(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    providers = session.exec(select(AIProvider).where(AIProvider.enabled == True)).all()  # noqa: E712
    default = agent.default_provider(session)
    ai = get_section(session, "ai")
    return {
        "configured": bool(providers),
        "default_provider": {"id": default.id, "name": default.name, "kind": default.kind, "model": default.default_model} if default else None,
        "providers": [{"id": p.id, "name": p.name, "kind": p.kind, "default_model": p.default_model, "models": p.models} for p in providers],
        "assistant_name": ai.get("assistant_name") or "Iris",
        "require_approval": ai.get("require_approval", True),
        "mcp_enabled": get_section(session, "mcp").get("enabled", True),
    }


@router.get("/tools")
def list_tools(user: User = Depends(get_current_user)):
    return {"tools": [{"name": t.name, "title": t.title, "description": t.description, "risk": t.risk} for t in (tools.TOOLS[n] for n in sorted(tools.TOOLS))]}


@router.post("/providers/test")
async def test_provider(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    if payload.get("provider_id"):
        row = session.get(AIProvider, int(payload["provider_id"]))
        if row is None:
            raise HTTPException(404, "Fournisseur introuvable.")
        provider = build(row, payload.get("model"))
    else:
        kind = payload.get("kind") or "anthropic"
        config = ProviderConfig(kind=kind, model=payload.get("model") or PRESETS.get(kind, {}).get("default_model", ""), api_key=payload.get("api_key"), base_url=payload.get("base_url") or None, options={"effort": "low", "max_tokens": 2000})
        provider = AnthropicProvider(config) if kind == "anthropic" else OpenAICompatProvider(config)
    text = ""
    try:
        async for event in provider.stream(system="Tu es un test de connexion.", messages=[{"role": "user", "content": [{"type": "text", "text": "Réponds uniquement : « Connexion réussie ✅ »"}]}], tools=[]):
            if event["type"] == "text":
                text += event["text"]
    except ProviderError as exc:
        return {"ok": False, "message": str(exc)}
    return {"ok": True, "message": text.strip()[:200] or "Connexion réussie"}


@router.get("/providers/{provider_id:int}/models")
async def provider_models(provider_id: int, session: Session = Depends(get_session), user: User = Depends(require_role("admin"))):
    row = session.get(AIProvider, provider_id)
    if row is None:
        raise HTTPException(404, "Fournisseur introuvable.")
    try:
        models = await build(row).list_models()
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    row.models = models[:300]
    session.add(row)
    session.commit()
    return {"models": row.models}


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


def _conv(session: Session, conv_id: int, user: User) -> AIConversation:
    conv = session.get(AIConversation, conv_id)
    if conv is None or conv.user_id != user.id:
        raise HTTPException(404, "Conversation introuvable.")
    return conv


def _conv_dump(conv: AIConversation) -> dict[str, Any]:
    data = dump(conv, exclude={"system_prompt"})
    data["context"] = {k: v for k, v in (conv.context or {}).items() if k != "pii"}
    return data


@router.get("/conversations")
def conversations(archived: bool = False, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(
        select(AIConversation).where(AIConversation.user_id == user.id, AIConversation.archived == archived).order_by(AIConversation.pinned.desc(), AIConversation.updated_at.desc()).limit(200)
    ).all()
    return {"items": [_conv_dump(c) for c in rows]}


@router.post("/conversations", status_code=201)
def create_conversation(payload: dict = Body(default={}), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    provider_id = payload.get("provider_id")
    model = payload.get("model")
    if provider_id:
        row = session.get(AIProvider, int(provider_id))
        if row is None:
            raise HTTPException(404, "Fournisseur introuvable.")
        model = model or row.default_model
    conv = AIConversation(user_id=user.id, title=payload.get("title") or "Nouvelle conversation", provider_id=provider_id, model=model, context={"origin": payload.get("context")} if payload.get("context") else {})
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return _conv_dump(conv)


@router.get("/conversations/{conv_id:int}")
def get_conversation(conv_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    conv = _conv(session, conv_id, user)
    rows = session.exec(select(AIMessage).where(AIMessage.conversation_id == conv.id).order_by(AIMessage.id)).all()
    messages = []
    for m in rows:
        content = m.content or []
        if m.role == "user":
            content = [dict(b, text=_strip_context(b.get("text", ""))) if b.get("type") == "text" else b for b in content]
        if m.role == "tool":
            content = [{k: v for k, v in b.items() if k != "content"} | {"ok": not b.get("is_error"), "preview": _preview(b.get("content"))} for b in content]
        messages.append({"id": m.id, "role": m.role, "content": content, "model": m.model, "created_at": dump(m)["created_at"]})
    return {**_conv_dump(conv), "messages": messages}


def _strip_context(text: str) -> str:
    if text.startswith("[Nous sommes le") and "]\n\n" in text:
        return text.split("]\n\n", 1)[1]
    return text


def _preview(content: str | None) -> Any:
    try:
        data = json.loads(content or "{}")
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict):
        return {k: data[k] for k in ("link", "number", "title", "status", "total", "error", "count", "returned") if k in data}
    return None


@router.patch("/conversations/{conv_id:int}")
def update_conversation(conv_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    conv = _conv(session, conv_id, user)
    for key in ("title", "pinned", "archived", "model", "provider_id"):
        if key in payload:
            setattr(conv, key, payload[key])
    conv.updated_at = utcnow()
    session.add(conv)
    session.commit()
    return _conv_dump(conv)


@router.delete("/conversations/{conv_id:int}")
def delete_conversation(conv_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    conv = _conv(session, conv_id, user)
    for m in session.exec(select(AIMessage).where(AIMessage.conversation_id == conv.id)).all():
        session.delete(m)
    session.delete(conv)
    session.commit()
    return {"ok": True}


@router.post("/conversations/{conv_id:int}/messages")
def send_message(conv_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    conv = _conv(session, conv_id, user)
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(422, "Message vide.")
    if conv.status == "running" and conv.updated_at and (utcnow() - conv.updated_at).total_seconds() < 5:
        raise HTTPException(409, "Une réponse est déjà en cours.")
    return _sse(agent.run_turn(conv.id, user.id, message=message, context=payload.get("context")))


@router.post("/conversations/{conv_id:int}/approve")
def approve(conv_id: int, payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    conv = _conv(session, conv_id, user)
    decisions = {str(k): bool(v) for k, v in (payload.get("decisions") or {}).items()}
    return _sse(agent.run_turn(conv.id, user.id, decisions=decisions))


@router.post("/quick")
def quick_generate(payload: dict = Body(...), session: Session = Depends(get_session), user: User = Depends(require_role("member"))):
    kind = payload.get("kind") or ""
    if kind not in quick.KINDS:
        raise HTTPException(400, "Type de génération inconnu.")
    prompt = quick.build_prompt(session, user, kind, payload.get("params") or {})
    from ..ai.prompts import quick_system_prompt

    system = quick_system_prompt(session)
    effort = "medium" if kind in ("deal_coach", "lead_qualify", "daily_briefing") else "low"

    async def gen():
        try:
            async for chunk in agent.generate((user.id, payload.get("provider_id")), system, prompt, effort=effort):
                yield {"type": "text", "text": chunk}
        except (ProviderError, agent.AgentError) as exc:
            yield {"type": "error", "message": str(exc)}
            return
        yield {"type": "done"}

    return _sse(gen())


__all__ = ["decrypt_secret", "dump_many"]

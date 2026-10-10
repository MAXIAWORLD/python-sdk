"""Agent loop: streams model output, runs CRM tools, pauses for human approval.

The conversation history is append-only (frozen system prompt, fixed tool list,
assistant turns replayed verbatim to the provider that produced them) so prompt
caching works and Claude's thinking blocks stay valid across turns.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import anyio
from sqlmodel import Session, select

from ..db import session_scope
from ..models import AIConversation, AIMessage, AIProvider, User, now_local, utcnow
from ..services.settings import get_section
from . import prompts, tools
from .privacy import Pseudonymizer
from .providers import ProviderError, build

log = logging.getLogger("prisme.ai")

MAX_STEPS = 12
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


class AgentError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers (DB work runs in worker threads, one session per call)
# ---------------------------------------------------------------------------


def default_provider(session: Session) -> AIProvider | None:
    return session.exec(
        select(AIProvider).where(AIProvider.enabled == True).order_by(AIProvider.is_default.desc(), AIProvider.id)  # noqa: E712
    ).first()


def _history(session: Session, conv_id: int) -> list[dict[str, Any]]:
    rows = session.exec(select(AIMessage).where(AIMessage.conversation_id == conv_id).order_by(AIMessage.id)).all()
    return [{"id": r.id, "role": r.role, "content": r.content or [], "raw": r.raw, "provider_kind": r.provider_kind} for r in rows]


def _context_line(context: dict[str, Any] | None) -> str:
    now = now_local()
    stamp = f"{WEEKDAYS[now.weekday()]} {now.strftime('%d/%m/%Y, %H:%M')} (heure de Paris)"
    parts = [f"[Nous sommes le {stamp}."]
    if context and context.get("type") and context.get("id"):
        label = f" « {context['label']} »" if context.get("label") else ""
        parts.append(f" L'utilisateur consulte la fiche {context['type']} #{context['id']}{label}.")
    elif context and context.get("page"):
        parts.append(f" L'utilisateur est sur la page « {context['page']} ».")
    return "".join(parts) + "]\n\n"


def _pending_calls(history: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    for msg in reversed(history):
        if msg["role"] == "tool":
            return None, []
        if msg["role"] == "assistant":
            calls = [b for b in msg["content"] if b.get("type") == "tool_call" and b.get("status") in ("pending", "auto")]
            return (msg, calls) if calls else (None, [])
    return None, []


def _mask_history(history: list[dict[str, Any]], pseudo: Pseudonymizer) -> list[dict[str, Any]]:
    masked = []
    for msg in history:
        m = dict(msg)
        if msg["role"] in ("user", "tool"):
            content = []
            for b in msg["content"]:
                b = dict(b)
                if b.get("type") == "text":
                    b["text"] = pseudo.mask(b.get("text", ""))
                elif b.get("type") == "tool_result":
                    b["content"] = pseudo.mask(b.get("content", ""))
                content.append(b)
            m["content"] = content
        masked.append(m)
    return masked


def _short(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not data:
        return None
    keep = {}
    for key in ("link", "id", "number", "title", "status", "total", "count", "returned", "created", "updated", "deleted", "stage", "invoice", "quote_id", "invoice_id", "task_id", "event_id", "deal_id", "warnings"):
        if key in data:
            keep[key] = data[key]
    return keep


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


async def run_turn(
    conv_id: int,
    user_id: int,
    *,
    message: str | None = None,
    context: dict[str, Any] | None = None,
    decisions: dict[str, bool] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    # ---- load state
    def load() -> dict[str, Any]:
        with session_scope() as session:
            conv = session.get(AIConversation, conv_id)
            user = session.get(User, user_id)
            if conv is None or user is None or conv.user_id != user.id:
                raise AgentError("Conversation introuvable.")
            provider_row = session.get(AIProvider, conv.provider_id) if conv.provider_id else default_provider(session)
            if provider_row is None:
                raise AgentError("Aucun fournisseur d'IA n'est configuré. Ajoutez une clé API dans Paramètres › Intelligence artificielle, ou pilotez le CRM depuis Claude Desktop / Claude Code via MCP (votre abonnement Claude).")
            if not conv.system_prompt:
                conv.system_prompt = prompts.assistant_system_prompt(session, user)
            conv.provider_id = provider_row.id
            conv.model = conv.model or provider_row.default_model
            conv.status = "running"
            session.add(conv)
            session.commit()
            ai_cfg = get_section(session, "ai")
            return {
                "system": conv.system_prompt,
                "provider_id": provider_row.id,
                "model": conv.model,
                "kind": provider_row.kind,
                "require_approval": bool(ai_cfg.get("require_approval", True)),
                "mask": bool(ai_cfg.get("mask_personal_data")),
                "effort": ai_cfg.get("effort") or "medium",
                "pii": (conv.context or {}).get("pii") or {},
                "title": conv.title,
            }

    try:
        state = await anyio.to_thread.run_sync(load)
    except AgentError as exc:
        yield {"type": "error", "message": str(exc)}
        return

    pseudo = Pseudonymizer(state["pii"]) if state["mask"] else None

    # ---- resume pending approvals, or deny them if the user moved on
    pending_events = await anyio.to_thread.run_sync(_settle_pending, conv_id, user_id, decisions, message is not None)
    for ev in pending_events:
        yield ev

    # ---- new user message
    if message is not None:
        def save_user() -> str | None:
            with session_scope() as session:
                session.add(AIMessage(conversation_id=conv_id, role="user", content=[{"type": "text", "text": _context_line(context) + message}]))
                conv = session.get(AIConversation, conv_id)
                new_title = None
                if conv and conv.title in ("Nouvelle conversation", "", None):
                    new_title = message.strip().split("\n")[0][:70]
                    conv.title = new_title
                if conv and context:
                    conv.context = {**(conv.context or {}), "last": context}
                session.add(conv)
                session.commit()
                return new_title

        title = await anyio.to_thread.run_sync(save_user)
        if title:
            yield {"type": "title", "title": title}

    def load_provider():
        with session_scope() as session:
            row = session.get(AIProvider, state["provider_id"])
            return build(row, state["model"], {"effort": state["effort"]})

    provider = await anyio.to_thread.run_sync(load_provider)
    specs = tools.tool_specs()
    usage_total = {"input_tokens": 0, "output_tokens": 0}

    for _step in range(MAX_STEPS):
        history = await anyio.to_thread.run_sync(lambda: _load_history(conv_id))
        if pseudo:
            history = _mask_history(history, pseudo)
        final: dict[str, Any] | None = None
        try:
            async for event in provider.stream(system=state["system"], messages=history, tools=specs):
                if event["type"] in ("text", "thinking"):
                    text = pseudo.unmask(event["text"]) if pseudo else event["text"]
                    yield {"type": event["type"], "text": text}
                elif event["type"] == "final":
                    final = event
        except ProviderError as exc:
            await anyio.to_thread.run_sync(_set_status, conv_id, "error")
            yield {"type": "error", "message": str(exc)}
            return
        except Exception as exc:  # noqa: BLE001
            log.exception("AI provider failure")
            await anyio.to_thread.run_sync(_set_status, conv_id, "error")
            yield {"type": "error", "message": f"Erreur inattendue du fournisseur d'IA : {exc}"}
            return
        if final is None:
            yield {"type": "error", "message": "Réponse vide du fournisseur d'IA."}
            return

        for key in usage_total:
            usage_total[key] += int(final.get("usage", {}).get(key, 0) or 0)

        calls = [b for b in final["content"] if b.get("type") == "tool_call"]
        approval_needed = [c for c in calls if tools.needs_approval(c["name"], state["require_approval"])]
        for c in calls:
            if pseudo:
                c["input"] = pseudo.unmask(c.get("input") or {})
            c["status"] = "pending" if c in approval_needed else ("auto" if approval_needed else "running")
            c["title"] = tools.describe_call(c["name"], c.get("input") or {})
            c["risk"] = tools.TOOLS[c["name"]].risk if c["name"] in tools.TOOLS else "read"

        display_content = [dict(b, text=pseudo.unmask(b["text"])) if (pseudo and b.get("type") in ("text", "thinking")) else b for b in final["content"]]
        await anyio.to_thread.run_sync(
            _save_assistant, conv_id, display_content, final.get("raw"), state["kind"], final.get("model") or state["model"], final.get("stop_reason"), final.get("usage") or {}, pseudo.mapping if pseudo else None
        )

        if not calls:
            break

        for c in calls:
            yield {"type": "tool_call", "id": c["id"], "name": c["name"], "title": c["title"], "input": c.get("input"), "risk": c["risk"], "status": c["status"]}

        if approval_needed:
            await anyio.to_thread.run_sync(_set_status, conv_id, "awaiting_approval")
            yield {"type": "approval_required", "calls": [{"id": c["id"], "name": c["name"], "title": c["title"], "input": c.get("input"), "risk": c["risk"]} for c in approval_needed]}
            yield {"type": "done", "usage": usage_total, "awaiting_approval": True}
            return

        results = await anyio.to_thread.run_sync(_execute_calls, conv_id, user_id, calls, {c["id"]: True for c in calls})
        for r in results:
            yield r
    else:
        yield {"type": "text", "text": "\n\n_J'ai atteint le nombre maximal d'étapes pour cette demande._"}

    await anyio.to_thread.run_sync(_set_status, conv_id, "idle", usage_total)
    yield {"type": "done", "usage": usage_total}


def _load_history(conv_id: int) -> list[dict[str, Any]]:
    with session_scope() as session:
        return _history(session, conv_id)


def _set_status(conv_id: int, status: str, usage: dict[str, int] | None = None) -> None:
    with session_scope() as session:
        conv = session.get(AIConversation, conv_id)
        if conv is None:
            return
        conv.status = status
        conv.updated_at = utcnow()
        if usage:
            total = dict(conv.usage or {})
            for k, v in usage.items():
                total[k] = int(total.get(k, 0)) + int(v or 0)
            conv.usage = total
        session.add(conv)
        session.commit()


def _save_assistant(conv_id: int, content: list[dict[str, Any]], raw: list[dict[str, Any]] | None, kind: str, model: str, stop: str | None, usage: dict[str, Any], pii: dict[str, str] | None) -> None:
    with session_scope() as session:
        session.add(AIMessage(conversation_id=conv_id, role="assistant", content=content, raw=raw, provider_kind=kind, model=model, stop_reason=stop, usage=usage))
        conv = session.get(AIConversation, conv_id)
        if conv is not None:
            conv.updated_at = utcnow()
            if pii is not None:
                conv.context = {**(conv.context or {}), "pii": pii}
            session.add(conv)
        session.commit()


def _execute_calls(conv_id: int, user_id: int, calls: list[dict[str, Any]], decisions: dict[str, bool]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    with session_scope() as session:
        user = session.get(User, user_id)
        ctx = tools.ToolContext(session=session, user=user, channel="assistant")
        for call in calls:
            approved = decisions.get(call["id"], call.get("status") == "auto")
            if not approved:
                text = json.dumps({"error": "Action refusée par l'utilisateur. Ne la relance pas sans nouvelle demande."}, ensure_ascii=False)
                results.append({"type": "tool_result", "tool_call_id": call["id"], "name": call["name"], "content": text, "is_error": True})
                events.append({"type": "tool_result", "id": call["id"], "name": call["name"], "ok": False, "denied": True, "summary": "Action refusée"})
                continue
            args = call.get("input") or {}
            if "__invalid_json__" in args:
                ok, text, data = False, json.dumps({"INVALID_JSON": args["__invalid_json__"]}), None
            else:
                ok, text, data = tools.execute(ctx, call["name"], args)
            results.append({"type": "tool_result", "tool_call_id": call["id"], "name": call["name"], "content": text, "is_error": not ok})
            short = _short(data)
            events.append({"type": "tool_result", "id": call["id"], "name": call["name"], "ok": ok, "data": short, "error": None if ok else json.loads(text).get("error")})
        session.add(AIMessage(conversation_id=conv_id, role="tool", content=results))
        # Update statuses on the assistant message for the UI
        msg = session.exec(select(AIMessage).where(AIMessage.conversation_id == conv_id, AIMessage.role == "assistant").order_by(AIMessage.id.desc())).first()
        if msg is not None:
            status = {e["id"]: ("denied" if e.get("denied") else "done" if e["ok"] else "error") for e in events}
            msg.content = [dict(b, status=status.get(b.get("id"), b.get("status"))) if b.get("type") == "tool_call" else b for b in (msg.content or [])]
            session.add(msg)
        session.commit()
    return events


def _settle_pending(conv_id: int, user_id: int, decisions: dict[str, bool] | None, new_message: bool) -> list[dict[str, Any]]:
    with session_scope() as session:
        history = _history(session, conv_id)
    msg, calls = _pending_calls(history)
    if not calls:
        return []
    if decisions is None and not new_message:
        return []
    final_decisions = {c["id"]: (c.get("status") == "auto") or bool((decisions or {}).get(c["id"])) for c in calls}
    if new_message and decisions is None:
        final_decisions = {c["id"]: c.get("status") == "auto" for c in calls}
    return _execute_calls(conv_id, user_id, calls, final_decisions)


# ---------------------------------------------------------------------------
# Background agent (automations) and one-shot generations
# ---------------------------------------------------------------------------

BACKGROUND_BLOCKED = {"delete_record", "issue_invoice", "record_payment"}


def run_background_agent(session: Session, user: User | None, instructions: str, context: dict[str, Any]) -> str:
    provider_row = default_provider(session)
    if provider_row is None:
        return "Aucun fournisseur d'IA configuré."
    if user is None:
        return "Aucun utilisateur pour exécuter l'agent."
    system = prompts.background_system_prompt(session)
    entity = context.get("entity") or {}
    briefing = json.dumps(
        {"événement": context.get("event"), "élément": entity, "contact": context.get("contact"), "entreprise": context.get("company")},
        ensure_ascii=False,
        default=str,
    )[:12000]
    messages: list[dict[str, Any]] = [{"role": "user", "content": [{"type": "text", "text": f"{_context_line(None)}Consigne : {instructions}\n\nDonnées de l'événement :\n{briefing}"}]}]
    provider = build(provider_row, None, {"effort": "low"})
    specs = [t for t in tools.tool_specs() if t["name"] not in BACKGROUND_BLOCKED]
    ctx = tools.ToolContext(session=session, user=user, channel="automation")

    async def loop() -> str:
        last_text = ""
        for _ in range(8):
            final = None
            async for event in provider.stream(system=system, messages=messages, tools=specs):
                if event["type"] == "final":
                    final = event
            if final is None:
                return "Réponse vide."
            messages.append({"role": "assistant", "content": final["content"], "raw": final.get("raw"), "provider_kind": provider_row.kind})
            last_text = "".join(b.get("text", "") for b in final["content"] if b.get("type") == "text") or last_text
            calls = [b for b in final["content"] if b.get("type") == "tool_call"]
            if not calls:
                return last_text or "Terminé."
            results = []
            for call in calls:
                if call["name"] in BACKGROUND_BLOCKED:
                    ok, text = False, json.dumps({"error": "Action interdite en automatisation."})
                else:
                    ok, text, _ = tools.execute(ctx, call["name"], call.get("input") or {})
                results.append({"type": "tool_result", "tool_call_id": call["id"], "name": call["name"], "content": text, "is_error": not ok})
            messages.append({"role": "tool", "content": results})
        return last_text or "Nombre maximal d'étapes atteint."

    try:
        return asyncio.run(loop())
    except ProviderError as exc:
        return f"Erreur IA : {exc}"


async def generate(session_factory_user: tuple[int, int | None], system: str, prompt: str, *, effort: str = "low") -> AsyncIterator[str]:
    user_id, provider_id = session_factory_user

    def load():
        with session_scope() as session:
            row = session.get(AIProvider, provider_id) if provider_id else default_provider(session)
            if row is None:
                raise AgentError("Aucun fournisseur d'IA configuré (Paramètres › Intelligence artificielle).")
            return build(row, None, {"effort": effort})

    provider = await anyio.to_thread.run_sync(load)
    async for event in provider.stream(system=system, messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}], tools=[]):
        if event["type"] == "text":
            yield event["text"]

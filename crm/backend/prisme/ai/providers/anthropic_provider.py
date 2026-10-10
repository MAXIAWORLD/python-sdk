"""Claude through the official Anthropic SDK (streaming, tool use, adaptive thinking)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from .base import Provider, ProviderError

DEFAULT_MODEL = "claude-opus-5-5"
KNOWN_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"]

# Models that take `thinking: {type: "adaptive"}` + `output_config.effort`.
ADAPTIVE_PREFIXES = (
    "claude-fable-5", "claude-mythos-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6",
)
# Models accepting server-side refusal fallbacks in their "default" form (Claude API only).
FALLBACK_MODELS = ("claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5")
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _supports_adaptive(model: str) -> bool:
    return model.startswith(ADAPTIVE_PREFIXES)


def _to_anthropic(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = msg["role"]
        if role == "user":
            text = "".join(b.get("text", "") for b in msg["content"] if b.get("type") == "text")
            out.append({"role": "user", "content": [{"type": "text", "text": text or "…"}]})
        elif role == "assistant":
            if msg.get("raw") and msg.get("provider_kind") == "anthropic":
                # Replay Claude's own blocks verbatim (thinking signatures, tool_use ids).
                out.append({"role": "assistant", "content": msg["raw"]})
                continue
            blocks: list[dict[str, Any]] = []
            for b in msg["content"]:
                if b.get("type") == "text" and b.get("text"):
                    blocks.append({"type": "text", "text": b["text"]})
                elif b.get("type") == "tool_call":
                    blocks.append({"type": "tool_use", "id": b["id"], "name": b["name"], "input": b.get("input") or {}})
            out.append({"role": "assistant", "content": blocks or [{"type": "text", "text": "…"}]})
        elif role == "tool":
            results = [
                {"type": "tool_result", "tool_use_id": b["tool_call_id"], "content": b.get("content") or "", "is_error": bool(b.get("is_error"))}
                for b in msg["content"]
                if b.get("type") == "tool_result"
            ]
            if results:
                out.append({"role": "user", "content": results})
    return out


class AnthropicProvider(Provider):
    kind = "anthropic"

    def _client(self) -> anthropic.AsyncAnthropic:
        if not self.config.api_key:
            raise ProviderError("Aucune clé API Anthropic configurée (Paramètres › IA).")
        kwargs: dict[str, Any] = {"api_key": self.config.api_key, "max_retries": 2}
        if self.config.base_url:
            kwargs["base_url"] = self.config.base_url
        return anthropic.AsyncAnthropic(**kwargs)

    async def list_models(self) -> list[str]:
        client = self._client()
        try:
            page = await client.models.list(limit=100)
            return [m.id for m in page.data]
        except anthropic.APIError as exc:
            raise ProviderError(_friendly(exc)) from exc

    async def stream(self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
        client = self._client()
        model = self.config.model or DEFAULT_MODEL
        opts = self.config.options or {}
        custom_endpoint = bool(self.config.base_url)
        tool_defs = []
        for t in tools:
            spec = {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
            if not custom_endpoint:
                # Stream tool inputs as they are generated; inputs are validated before execution.
                spec["eager_input_streaming"] = True
            tool_defs.append(spec)
        params: dict[str, Any] = {
            "model": model,
            "max_tokens": int(opts.get("max_tokens") or 64000),
            "system": [{"type": "text", "text": system}],
            "messages": _to_anthropic(messages),
            "cache_control": {"type": "ephemeral"},
        }
        if tool_defs:
            params["tools"] = tool_defs
        if _supports_adaptive(model):
            params["thinking"] = {"type": "adaptive", "display": "summarized"}
            params["output_config"] = {"effort": opts.get("effort") or "medium"}
        use_fallback = model in FALLBACK_MODELS and not custom_endpoint and opts.get("fallbacks", True)

        try:
            if use_fallback:
                manager = client.beta.messages.stream(**params, betas=[FALLBACK_BETA], fallbacks="default")
            else:
                manager = client.messages.stream(**params)
            async with manager as stream:
                async for event in stream:
                    etype = getattr(event, "type", None)
                    if etype == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            yield {"type": "text", "text": delta.text}
                        elif delta.type == "thinking_delta" and delta.thinking:
                            yield {"type": "thinking", "text": delta.thinking}
                final = await stream.get_final_message()
        except ValueError as exc:
            # Tool input JSON the SDK could not parse at all (eager streaming): retry the turn.
            raise ProviderError(f"Réponse de l'outil illisible, nouvelle tentative conseillée ({exc}).") from exc
        except anthropic.APIError as exc:
            raise ProviderError(_friendly(exc)) from exc

        raw = [block.to_dict() for block in final.content]
        content: list[dict[str, Any]] = []
        for block in final.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                content.append({"type": "text", "text": block.text})
            elif btype == "thinking" and getattr(block, "thinking", ""):
                content.append({"type": "thinking", "text": block.thinking})
            elif btype == "tool_use":
                tool_input = block.input if isinstance(block.input, dict) else _parse(block.input)
                content.append({"type": "tool_call", "id": block.id, "name": block.name, "input": tool_input})
        stop = final.stop_reason or "end_turn"
        if stop == "refusal":
            content = [b for b in content if b["type"] != "tool_call"]
            content.append({"type": "text", "text": "\n\n_Je ne peux pas traiter cette demande (refus de sécurité du modèle)._"})
        if stop == "max_tokens":
            # A truncated tool input parses as a valid partial object: never run it.
            content = [b for b in content if b["type"] != "tool_call"]
            content.append({"type": "text", "text": "\n\n_Réponse tronquée (limite de longueur atteinte)._"})
        usage = final.usage
        yield {
            "type": "final",
            "content": content,
            "raw": raw if stop not in ("refusal", "max_tokens") else None,
            "stop_reason": stop,
            "model": getattr(final, "model", model),
            "usage": {
                "input_tokens": getattr(usage, "input_tokens", 0) or 0,
                "output_tokens": getattr(usage, "output_tokens", 0) or 0,
                "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
                "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
            },
        }


def _parse(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}


def _friendly(exc: anthropic.APIError) -> str:
    if isinstance(exc, anthropic.AuthenticationError):
        return "Clé API Anthropic invalide ou révoquée."
    if isinstance(exc, anthropic.PermissionDeniedError):
        return "Cette clé API n'a pas accès à ce modèle."
    if isinstance(exc, anthropic.NotFoundError):
        return "Modèle Claude introuvable : vérifiez son identifiant."
    if isinstance(exc, anthropic.RateLimitError):
        return "Limite de débit Anthropic atteinte : réessayez dans quelques instants."
    if isinstance(exc, anthropic.BadRequestError):
        return f"Requête refusée par l'API Claude : {exc.message}"
    if isinstance(exc, anthropic.APIConnectionError):
        return "Impossible de joindre l'API Anthropic (connexion réseau)."
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return "L'API Anthropic est momentanément indisponible."
    return f"Erreur de l'API Claude : {exc}"

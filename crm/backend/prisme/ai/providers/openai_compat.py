"""OpenAI-compatible chat completions (OpenAI, Mistral, Gemini, Groq, OpenRouter, DeepSeek, xAI, Ollama, LM Studio...)."""

from __future__ import annotations

import json
import secrets
from collections.abc import AsyncIterator
from typing import Any

import openai

from .base import Provider, ProviderError

PRESETS: dict[str, dict[str, Any]] = {
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1", "models": ["gpt-5", "gpt-5-mini"], "needs_key": True},
    "mistral": {"label": "Mistral AI 🇫🇷", "base_url": "https://api.mistral.ai/v1", "models": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"], "needs_key": True},
    "gemini": {"label": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/", "models": ["gemini-2.5-pro", "gemini-2.5-flash"], "needs_key": True},
    "groq": {"label": "Groq", "base_url": "https://api.groq.com/openai/v1", "models": ["llama-3.3-70b-versatile"], "needs_key": True},
    "openrouter": {"label": "OpenRouter", "base_url": "https://openrouter.ai/api/v1", "models": [], "needs_key": True},
    "deepseek": {"label": "DeepSeek", "base_url": "https://api.deepseek.com/v1", "models": ["deepseek-chat", "deepseek-reasoner"], "needs_key": True},
    "xai": {"label": "xAI (Grok)", "base_url": "https://api.x.ai/v1", "models": [], "needs_key": True},
    "ollama": {"label": "Ollama (local, gratuit)", "base_url": "http://localhost:11434/v1", "models": ["qwen3", "llama3.3", "mistral-small3.2"], "needs_key": False},
    "lmstudio": {"label": "LM Studio (local)", "base_url": "http://localhost:1234/v1", "models": [], "needs_key": False},
    "custom": {"label": "Compatible OpenAI (personnalisé)", "base_url": "", "models": [], "needs_key": False},
}


def _to_openai(system: str, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for msg in messages:
        role = msg["role"]
        if role == "user":
            out.append({"role": "user", "content": "".join(b.get("text", "") for b in msg["content"] if b.get("type") == "text") or "…"})
        elif role == "assistant":
            text = "".join(b.get("text", "") for b in msg["content"] if b.get("type") == "text")
            calls = [
                {"id": b["id"], "type": "function", "function": {"name": b["name"], "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False)}}
                for b in msg["content"]
                if b.get("type") == "tool_call"
            ]
            entry: dict[str, Any] = {"role": "assistant", "content": text or None}
            if calls:
                entry["tool_calls"] = calls
            out.append(entry)
        elif role == "tool":
            for b in msg["content"]:
                if b.get("type") == "tool_result":
                    out.append({"role": "tool", "tool_call_id": b["tool_call_id"], "content": b.get("content") or ""})
    return out


class OpenAICompatProvider(Provider):
    kind = "openai_compat"

    def _client(self) -> openai.AsyncOpenAI:
        preset = PRESETS.get(self.config.kind, PRESETS["custom"])
        base_url = self.config.base_url or preset["base_url"]
        if not base_url:
            raise ProviderError("URL de l'API manquante pour ce fournisseur.")
        if preset.get("needs_key") and not self.config.api_key:
            raise ProviderError(f"Aucune clé API configurée pour {preset['label']}.")
        return openai.AsyncOpenAI(api_key=self.config.api_key or "not-needed", base_url=base_url, max_retries=2, timeout=600)

    async def list_models(self) -> list[str]:
        client = self._client()
        try:
            page = await client.models.list()
            return sorted(m.id for m in page.data)
        except openai.APIError as exc:
            raise ProviderError(_friendly(exc)) from exc

    async def stream(self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
        client = self._client()
        opts = self.config.options or {}
        params: dict[str, Any] = {
            "model": self.config.model,
            "messages": _to_openai(system, messages),
            "stream": True,
        }
        if tools and opts.get("tools", True):
            params["tools"] = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}} for t in tools]
        max_tokens = int(opts.get("max_tokens") or 8192)
        if self.config.kind == "openai":
            params["max_completion_tokens"] = max_tokens
            params["stream_options"] = {"include_usage": True}
        else:
            params["max_tokens"] = max_tokens
        if opts.get("temperature") is not None:
            params["temperature"] = float(opts["temperature"])

        text_parts: list[str] = []
        thinking_parts: list[str] = []
        calls: dict[int, dict[str, Any]] = {}
        finish = "stop"
        usage: dict[str, int] = {}
        try:
            stream = await client.chat.completions.create(**params)
            async for chunk in stream:
                if getattr(chunk, "usage", None):
                    usage = {"input_tokens": chunk.usage.prompt_tokens or 0, "output_tokens": chunk.usage.completion_tokens or 0}
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta
                if delta is not None:
                    reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
                    if isinstance(reasoning, str) and reasoning:
                        thinking_parts.append(reasoning)
                        yield {"type": "thinking", "text": reasoning}
                    if delta.content:
                        text_parts.append(delta.content)
                        yield {"type": "text", "text": delta.content}
                    for tc in delta.tool_calls or []:
                        idx = tc.index if tc.index is not None else len(calls)
                        slot = calls.setdefault(idx, {"id": None, "name": "", "arguments": ""})
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function is not None:
                            if tc.function.name:
                                slot["name"] = tc.function.name
                            if tc.function.arguments:
                                slot["arguments"] += tc.function.arguments
                if choice.finish_reason:
                    finish = choice.finish_reason
        except openai.APIError as exc:
            raise ProviderError(_friendly(exc)) from exc

        content: list[dict[str, Any]] = []
        if thinking_parts:
            content.append({"type": "thinking", "text": "".join(thinking_parts)})
        if text_parts:
            content.append({"type": "text", "text": "".join(text_parts)})
        if finish != "length":
            for idx in sorted(calls):
                slot = calls[idx]
                if not slot["name"]:
                    continue
                try:
                    args = json.loads(slot["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {"__invalid_json__": slot["arguments"]}
                content.append({"type": "tool_call", "id": slot["id"] or f"call_{secrets.token_hex(6)}", "name": slot["name"], "input": args})
        else:
            content.append({"type": "text", "text": "\n\n_Réponse tronquée (limite de longueur atteinte)._"})
        yield {"type": "final", "content": content, "raw": None, "stop_reason": finish, "model": self.config.model, "usage": usage}


def _friendly(exc: openai.APIError) -> str:
    if isinstance(exc, openai.AuthenticationError):
        return "Clé API invalide ou révoquée."
    if isinstance(exc, openai.NotFoundError):
        return "Modèle ou URL introuvable : vérifiez l'identifiant du modèle et l'URL de l'API."
    if isinstance(exc, openai.RateLimitError):
        return "Limite de débit atteinte chez le fournisseur : réessayez dans quelques instants."
    if isinstance(exc, openai.APIConnectionError):
        return "Impossible de joindre le fournisseur d'IA (le serveur local est-il démarré ?)."
    if isinstance(exc, openai.BadRequestError):
        return f"Requête refusée par le fournisseur : {getattr(exc, 'message', exc)}"
    return f"Erreur du fournisseur d'IA : {exc}"

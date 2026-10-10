from __future__ import annotations

from typing import Any

from ...models import AIProvider
from ...security import decrypt_secret
from .anthropic_provider import DEFAULT_MODEL as CLAUDE_DEFAULT
from .anthropic_provider import KNOWN_MODELS as CLAUDE_MODELS
from .anthropic_provider import AnthropicProvider
from .base import Provider, ProviderConfig, ProviderError
from .openai_compat import PRESETS as OPENAI_PRESETS
from .openai_compat import OpenAICompatProvider

PRESETS: dict[str, dict[str, Any]] = {
    "anthropic": {"label": "Anthropic — Claude", "base_url": "", "models": CLAUDE_MODELS, "needs_key": True, "default_model": CLAUDE_DEFAULT},
    **{k: {**v, "default_model": (v["models"][0] if v["models"] else "")} for k, v in OPENAI_PRESETS.items()},
}


def build(row: AIProvider, model: str | None = None, options: dict[str, Any] | None = None) -> Provider:
    config = ProviderConfig(
        kind=row.kind,
        model=model or row.default_model or PRESETS.get(row.kind, {}).get("default_model", ""),
        api_key=decrypt_secret(row.api_key_enc),
        base_url=row.base_url or None,
        options={**(row.options or {}), **(options or {})},
    )
    if row.kind == "anthropic":
        return AnthropicProvider(config)
    return OpenAICompatProvider(config)


__all__ = ["PRESETS", "Provider", "ProviderConfig", "ProviderError", "build"]

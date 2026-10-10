"""Provider-neutral conversation format and streaming interface.

Normalized message (stored in `ai_messages`):
  user      : content = [{"type": "text", "text": ...}]
  assistant : content = [{"type": "text"|"thinking", "text": ...},
                         {"type": "tool_call", "id", "name", "input", "status"}]
              raw     = provider-native content, replayed verbatim to the same provider
  tool      : content = [{"type": "tool_result", "tool_call_id", "name", "content", "is_error"}]

`Provider.stream()` yields dict events:
  {"type": "text", "text": delta}
  {"type": "thinking", "text": delta}
  {"type": "final", "content": [...normalized...], "raw": [...]|None,
   "stop_reason": str, "usage": {...}}
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any


class ProviderError(Exception):
    """User-facing provider error (message already in French)."""


@dataclass
class ProviderConfig:
    kind: str
    model: str
    api_key: str | None = None
    base_url: str | None = None
    options: dict[str, Any] = field(default_factory=dict)


class Provider(ABC):
    kind: str = "base"

    def __init__(self, config: ProviderConfig):
        self.config = config

    @abstractmethod
    def stream(self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
        ...

    @abstractmethod
    async def list_models(self) -> list[str]:
        ...


def text_of(blocks: list[dict[str, Any]]) -> str:
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")

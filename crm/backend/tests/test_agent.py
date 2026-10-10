"""Agent loop with a scripted provider: tool calls, approval pause/resume, persistence."""

from __future__ import annotations

import json

from prisme.ai import agent
from prisme.ai.providers.base import Provider, ProviderConfig


class ScriptedProvider(Provider):
    kind = "fake"
    script: list[list[dict]] = []

    async def list_models(self):
        return ["fake"]

    async def stream(self, *, system, messages, tools):
        assert system and tools, "system prompt and tools must be sent"
        turn = ScriptedProvider.script.pop(0)
        for block in turn:
            if block["type"] == "text":
                yield {"type": "text", "text": block["text"]}
        yield {"type": "final", "content": turn, "raw": None, "stop_reason": "tool_use" if any(b["type"] == "tool_call" for b in turn) else "end_turn", "usage": {"input_tokens": 10, "output_tokens": 5}}


def _events(response):
    out = []
    for line in response.iter_lines():
        if line.startswith("data: "):
            out.append(json.loads(line[6:]))
    return out


def test_agent_tool_loop_with_approval(client, monkeypatch):
    client.post("/api/ai-providers", json={"name": "Fake", "kind": "custom", "base_url": "http://fake.local/v1", "default_model": "fake", "is_default": True})
    monkeypatch.setattr(agent, "build", lambda row, model=None, options=None: ScriptedProvider(ProviderConfig(kind="fake", model="fake")))
    ScriptedProvider.script = [
        [{"type": "text", "text": "Je cherche… "}, {"type": "tool_call", "id": "call_1", "name": "search_crm", "input": {"query": "Solaris"}}],
        [{"type": "text", "text": "Je crée la tâche."}, {"type": "tool_call", "id": "call_2", "name": "create_task", "input": {"title": "Relancer Solaris Labs"}}],
        [{"type": "text", "text": "C'est fait ✅"}],
    ]
    conv = client.post("/api/ai/conversations", json={}).json()
    with client.stream("POST", f"/api/ai/conversations/{conv['id']}/messages", json={"message": "Crée une tâche pour relancer Solaris", "context": {"page": "Tableau de bord"}}) as r:
        events = _events(r)
    kinds = [e["type"] for e in events]
    assert "tool_result" in kinds  # read tool executed automatically
    assert events[-1]["type"] == "done" and events[-1].get("awaiting_approval") is True
    approval = next(e for e in events if e["type"] == "approval_required")
    assert approval["calls"][0]["name"] == "create_task"

    with client.stream("POST", f"/api/ai/conversations/{conv['id']}/approve", json={"decisions": {"call_2": True}}) as r:
        events = _events(r)
    results = [e for e in events if e["type"] == "tool_result"]
    assert results and results[0]["ok"] is True
    assert "".join(e["text"] for e in events if e["type"] == "text") == "C'est fait ✅"
    tasks = client.get("/api/tasks", params={"q": "Relancer Solaris Labs"}).json()
    assert tasks["total"] == 1

    detail = client.get(f"/api/ai/conversations/{conv['id']}").json()
    roles = [m["role"] for m in detail["messages"]]
    assert roles == ["user", "assistant", "tool", "assistant", "tool", "assistant"]
    assert detail["title"].startswith("Crée une tâche")
    assert detail["messages"][0]["content"][0]["text"] == "Crée une tâche pour relancer Solaris"


def test_agent_denied_action(client, monkeypatch):
    monkeypatch.setattr(agent, "build", lambda row, model=None, options=None: ScriptedProvider(ProviderConfig(kind="fake", model="fake")))
    ScriptedProvider.script = [
        [{"type": "tool_call", "id": "call_9", "name": "delete_record", "input": {"resource": "contacts", "id": 1}}],
        [{"type": "text", "text": "D'accord, je ne supprime rien."}],
    ]
    conv = client.post("/api/ai/conversations", json={}).json()
    with client.stream("POST", f"/api/ai/conversations/{conv['id']}/messages", json={"message": "Supprime le contact 1"}) as r:
        events = _events(r)
    assert any(e["type"] == "approval_required" for e in events)
    with client.stream("POST", f"/api/ai/conversations/{conv['id']}/approve", json={"decisions": {"call_9": False}}) as r:
        events = _events(r)
    assert any(e["type"] == "tool_result" and e.get("denied") for e in events)
    assert client.get("/api/contacts/1").status_code == 200

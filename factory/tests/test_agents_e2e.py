"""LLM path end-to-end through the REAL claude_agent_sdk, with a scripted stand-in for the `claude` binary (0 tokens)."""

import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("claude_agent_sdk")
from swf import cli  # noqa: E402

FAKE = Path(__file__).with_name("fake_claude.py")
SPEC = {
    "name": "gym",
    "title": "Salle de sport",
    "entities": [
        {"name": "member", "fields": [{"name": "name", "type": "str", "required": True}, {"name": "email", "type": "email"}]},
        {"name": "subscription", "fields": [
            {"name": "member_id", "type": "ref", "ref": "member", "required": True},
            {"name": "plan", "type": "enum", "values": ["mensuel", "annuel"]},
            {"name": "amount", "type": "float"},
        ]},
    ],
}
HOOK = '''from fastapi import HTTPException

TEST_SAMPLE: dict = {"amount": 30.0}


def before_create(data: dict) -> dict:
    if (data.get("amount") or 0) <= 0:
        raise HTTPException(422, "amount must be > 0")
    return data
'''
CUSTOM = '''from tests.test_api import client, make  # noqa: F401


def test_amount_positive(client):  # noqa: F811
    m = make(client, "member")
    assert client.post("/api/subscription", json={"member_id": m["id"], "amount": 0}).status_code == 422
'''
SCENARIO = [
    {"when": "product+architecture agent", "write": {"spec.json": json.dumps(SPEC)}, "cost": 0.004},
    {"when": "You plan a feature", "write": {".factory/tasks.json": json.dumps([{"entity": "subscription", "instruction": "amount > 0"}])}, "cost": 0.003},
    {"when": "You implement business rules", "write": {
        "app/hooks/subscription.py": HOOK, "tests/test_custom_subscription.py": CUSTOM, "app/main.py": "HACKED"}, "cost": 0.02},
    {"when": "You fix a failing", "write": {"tests/test_custom_member.py": "def test_fixed():\n    assert True\n"}, "cost": 0.01},
]


def run(capsys, *args) -> dict:
    rc = cli.main(list(args))
    out = json.loads(capsys.readouterr().out)
    out["rc"] = rc
    return out


def test_llm_pipeline_through_real_sdk(tmp_path, monkeypatch, capsys):
    log = tmp_path / "argv.jsonl"
    wrapper = tmp_path / "claude"
    wrapper.write_text(f"#!/bin/sh\nexec {sys.executable} {FAKE} \"$@\"\n")
    wrapper.chmod(0o755)
    monkeypatch.setenv("SWF_LLM", "1")
    monkeypatch.setenv("SWF_CLAUDE_CLI", str(wrapper))
    monkeypatch.setenv("FAKE_CLAUDE_LOG", str(log))
    monkeypatch.setenv("FAKE_CLAUDE_SCENARIO", json.dumps(SCENARIO))
    proj = tmp_path / "gym"

    # 1. free request -> product agent spec -> generated, validated app
    out = run(capsys, "new", "Une appli pour ma salle de sport", "--out", str(proj))
    assert out["spec_source"] == "llm:product" and out["ok"] and out["rc"] == 0, out

    # 2. broken custom test -> fixer agent -> green
    (proj / "tests/test_custom_member.py").write_text("def test_broken():\n    assert False\n")
    out = run(capsys, "fix", str(proj))
    assert out["ok"] and out["llm_fixes"] == 1, out

    # 3. feature: planner -> coder (scoped) -> validated; out-of-scope write denied
    main_before = (proj / "app/main.py").read_text()
    out = run(capsys, "feature", str(proj), "Un abonnement doit avoir un montant positif")
    assert out["ok"] and out["coders"][0]["ok"], out
    assert (proj / "app/main.py").read_text() == main_before
    assert "amount must be > 0" in (proj / "app/hooks/subscription.py").read_text()

    # 4. cost ledger
    cost = run(capsys, "cost", str(proj))
    assert cost["calls"] == 4 and cost["by_role"] == {"product": 0.004, "fixer": 0.01, "planner": 0.003, "coder": 0.02}

    # 5. what the real SDK actually passed to the CLI
    calls = [json.loads(line) for line in log.read_text().splitlines()]
    by_role = {c[c.index("--system-prompt") + 1].split(" ")[3]: c for c in calls}
    coder = next(c for c in calls if "implement business rules" in c[c.index("--system-prompt") + 1])
    product = next(c for c in calls if "product+architecture" in c[c.index("--system-prompt") + 1])
    assert len(by_role) == 4
    for c in calls:
        assert c[c.index("--permission-mode") + 1] == "dontAsk"
        assert "--max-budget-usd" in c and "--max-turns" in c
    assert product[product.index("--model") + 1] == "haiku"
    assert coder[coder.index("--model") + 1] == "sonnet"
    tools = coder[coder.index("--allowedTools") + 1].split(",")
    assert "Edit(app/hooks/subscription.py)" in tools and not {"Edit", "Write", "Bash"} & set(tools)

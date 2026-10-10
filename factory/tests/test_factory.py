import asyncio
import json
import sys
import types
from pathlib import Path

import pytest

from swf import agents, cli, deploy, generator, pipeline
from swf import spec as specmod


def crm() -> dict:
    return cli.match_preset("crm prospects")[1]


def test_spec_validation_errors():
    with pytest.raises(specmod.SpecError, match="ref must name"):
        specmod.validate({"name": "x-app", "entities": [{"name": "a", "fields": [{"name": "b", "type": "ref", "ref": "zz"}]}]})
    with pytest.raises(specmod.SpecError, match="reserved"):
        specmod.validate({"name": "x-app", "entities": [{"name": "a", "fields": [{"name": "id", "type": "str"}]}]})
    cyc = {
        "name": "x-app",
        "entities": [
            {"name": "a", "fields": [{"name": "b_id", "type": "ref", "ref": "b", "required": True}]},
            {"name": "b", "fields": [{"name": "a_id", "type": "ref", "ref": "a", "required": True}]},
        ],
    }
    with pytest.raises(specmod.SpecError, match="cycle"):
        specmod.validate(cyc)


def test_summary_is_compact():
    s = crm()
    assert len(specmod.summary(s)) < len(json.dumps(s)) / 3
    assert "deal(" in specmod.summary(s)


def test_preset_matching():
    assert cli.match_preset("gestion des tickets SAV")[0] == "helpdesk"
    assert cli.match_preset("suivi du stock entrepôt")[0] == "inventory"
    assert cli.match_preset("anything else")[0] == "crm"
    assert "keywords" not in cli.match_preset("crm")[1]


def test_generate_incremental_and_protected(tmp_path):
    rep = generator.generate(crm(), tmp_path)
    assert "app/main.py" in rep["created"] and "app/hooks/deal.py" in rep["created"]
    hook = tmp_path / "app/hooks/deal.py"
    hook.write_text("# custom\n")
    (tmp_path / "app/main.py").write_text("# local edit\n")
    rep = generator.generate(crm(), tmp_path)
    assert hook.read_text() == "# custom\n"
    assert rep["updated"] == ["app/main.py"] and rep["overwrote_local_edits"] == ["app/main.py"]
    assert list((tmp_path / ".factory/backup").rglob("main.py"))
    assert generator.generate(crm(), tmp_path)["updated"] == []


def test_new_end_to_end_offline(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("SWF_LLM", raising=False)
    rc = cli.main(["new", "Un CRM pour mes ventes", "--out", str(tmp_path / "p"), "--name", "Demo CRM"])
    out = json.loads(capsys.readouterr().out)
    assert rc == 0 and out["ok"], out
    assert [s["name"] for s in out["steps"]] == ["lint+security", "tests", "smoke"]
    assert json.loads((tmp_path / "p/app/schema.json").read_text())["name"] == "demo-crm"


def test_pipeline_reports_short_failure_tail(tmp_path):
    generator.generate(crm(), tmp_path)
    (tmp_path / "tests/test_custom_company.py").write_text("def test_x():\n    assert 1 == 2\n")
    steps = pipeline.run(tmp_path, log=False)
    bad = pipeline.first_failure(steps)
    assert bad.name == "tests" and "assert 1 == 2" in bad.tail
    assert len(bad.tail.splitlines()) <= pipeline.TAIL


def test_deploy_dry_run(tmp_path, capsys):
    generator.generate(crm(), tmp_path)
    res = deploy.deploy(tmp_path, "docker", 9000, dry=True)
    assert res["status"] == "deployed"
    assert "docker run -d --name crm" in capsys.readouterr().out
    assert deploy.rollback(tmp_path, dry=True)["status"] == "no-previous-release"


def test_llm_commands_refuse_when_disabled(monkeypatch, tmp_path):
    monkeypatch.delenv("SWF_LLM", raising=False)
    with pytest.raises(SystemExit, match="SWF_LLM"):
        cli.main(["fix", str(tmp_path)])


def test_run_role_scopes_tools_caches_and_logs_cost(tmp_path, monkeypatch):
    generator.generate(crm(), tmp_path)
    calls = []

    class ResultMessage:
        def __init__(self):
            self.is_error, self.result, self.total_cost_usd, self.usage, self.num_turns = False, "DONE", 0.0123, {"input_tokens": 10}, 2

    async def query(prompt, options):
        calls.append((prompt, options))
        yield ResultMessage()

    class Opts:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    fake = types.SimpleNamespace(ClaudeAgentOptions=Opts, ResultMessage=ResultMessage, query=query)
    monkeypatch.setitem(sys.modules, "claude_agent_sdk", fake)
    write = ["app/hooks/deal.py"]
    r1 = asyncio.run(agents.run_role("coder", "rule", tmp_path, write, ["python -m pytest -x -q"]))
    r2 = asyncio.run(agents.run_role("coder", "rule", tmp_path, write))
    assert r1["ok"] and r2["cached"] and len(calls) == 1
    prompt, opts = calls[0]
    assert opts.permission_mode == "dontAsk" and opts.model == "sonnet" and opts.max_budget_usd == 0.60
    assert "Edit(app/hooks/deal.py)" in opts.allowed_tools and "Bash(python -m pytest -x -q)" in opts.allowed_tools
    assert not any(t in ("Edit", "Write", "Bash") for t in opts.allowed_tools)
    assert "SPEC:" in prompt and len(prompt) < 2000
    assert agents.cost(tmp_path) == {"calls": 1, "total_usd": 0.0123, "by_role": {"coder": 0.0123}}
    (tmp_path / write[0]).write_text("# changed\n")
    asyncio.run(agents.run_role("coder", "rule", tmp_path, write))
    assert len(calls) == 2  # cache invalidated by editable-file change


def test_snapshot_restore(tmp_path):
    generator.generate(crm(), tmp_path)
    hook = Path(tmp_path / "app/hooks/deal.py")
    before = hook.read_text()
    snap = agents.snapshot(tmp_path)
    hook.write_text("broken")
    agents.restore(tmp_path, snap)
    assert hook.read_text() == before


@pytest.mark.parametrize(
    ("request_text", "entities"),
    [
        ("Gérer une école de musique : élèves, professeurs, cours et paiements", ["ecole", "eleve", "professeur", "cours", "paiement"]),
        ("Cabinet médical avec patients, rendez-vous et factures", ["patient", "rendez_vous", "facture"]),
        ("Track vehicles, drivers and missions", ["vehicle", "driver", "mission"]),
    ],
)
def test_free_text_composer(request_text, entities):
    spec, source = cli.offline_spec(request_text)
    assert source == "composed:offline"
    assert [e["name"] for e in specmod.validate(spec)["entities"]] == entities


def test_free_text_prefers_strong_preset():
    assert cli.offline_spec("CRM pour suivre prospects et ventes")[1] == "preset:crm"


def test_monitor_rolls_back_after_failures(tmp_path, monkeypatch):
    generator.generate(crm(), tmp_path)
    sp = tmp_path / ".factory/deploy.json"
    sp.write_text(json.dumps({"history": [{"tag": "a", "target": "local", "port": 1, "at": "a"}, {"tag": "b", "target": "local", "port": 1, "at": "b"}]}))
    calls = []
    monkeypatch.setattr(deploy, "wait_http", lambda *a, **k: False)
    monkeypatch.setattr(deploy, "_local_up", lambda *a, **k: calls.append(a[1]))
    res = deploy.monitor(tmp_path, interval=0, max_failures=2, cycles=2)
    assert res["rollbacks"] == 1 and calls == ["a"]
    assert "rolled-back" in (tmp_path / ".factory/monitor.jsonl").read_text()


def test_alerthook_critical_triggers_rollback(tmp_path, monkeypatch):
    import threading
    import urllib.request

    generator.generate(crm(), tmp_path)
    assert (tmp_path / "monitoring/alerts.yml").exists() and (tmp_path / "docker-compose.monitoring.yml").exists()
    monkeypatch.setattr(deploy, "rollback", lambda p: {"status": "rolled-back"})
    port = pipeline.free_port()
    res = {}
    t = threading.Thread(target=lambda: res.update(deploy.alerthook(tmp_path, port, max_requests=2)))
    t.start()
    pipeline.wait_http(f"http://127.0.0.1:{port}/", 0.5)  # let the server bind
    for sev in ("warning", "critical"):
        body = json.dumps({"status": "firing", "alerts": [{"status": "firing", "labels": {"alertname": "X", "severity": sev}}]}).encode()
        for _ in range(20):
            try:
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/alert", body), timeout=2)
                break
            except OSError:
                import time

                time.sleep(0.1)
    t.join(5)
    assert res == {"received": 2, "rollbacks": 1}

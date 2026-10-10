"""LLM layer (Claude Agent SDK). OFF by default: set SWF_LLM=1 to spend tokens.

Token discipline: stable role prompts (prompt-cache friendly) + tiny context pack (spec summary,
file list, 60-line failure tail) + per-role model/turn/$ caps + result cache + path-scoped write tools.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from . import spec as specmod


@dataclass(frozen=True)
class Role:
    model: str
    max_turns: int
    budget_usd: float
    prompt: str


_COMMON = "Be terse. Read only files you need. No explanations in output: act via tools, then reply 'DONE' or 'FAIL: <reason>'."
ROLES = {
    "product": Role(
        "haiku", 4, 0.10,
        "You are a product+architecture agent. Turn a business request into a swf spec JSON written to the given path. "
        "Schema: {name: slug, title, entities:[{name: snake, label, fields:[{name: snake, type: str|text|email|int|float|bool|"
        "date|datetime|enum|ref, required?, values?(enum), ref?(entity)}]}]}. Reserved field names: id, created_at, updated_at. "
        "Prefer few entities, enums for statuses/stages, ref for relations. " + _COMMON,
    ),
    "planner": Role(
        "haiku", 6, 0.15,
        "You plan a feature on a swf app. Edit app/schema.json if the data model must change. Then write .factory/tasks.json: "
        '[{"entity": "<name>", "instruction": "<business rule to implement in hooks>"}] (empty list if none). ' + _COMMON,
    ),
    "coder": Role(
        "sonnet", 12, 0.60,
        "You implement business rules for ONE entity of a swf app (FastAPI). Edit only app/hooks/<entity>.py and "
        "tests/test_custom_<entity>.py. Hooks: before_create(data)->data, before_update(data, current)->data, "
        "after_create(item), before_delete(item); reject with HTTPException(422, msg). Keep TEST_SAMPLE valid. "
        "Run only: python -m pytest -x -q tests/test_custom_<entity>.py. " + _COMMON,
    ),
    "fixer": Role(
        "sonnet", 10, 0.50,
        "You fix a failing validation step of a swf app with the smallest possible diff. Never edit app/main.py, "
        "app/static/*, tests/test_api.py (managed). " + _COMMON,
    ),
    "security": Role(
        "haiku", 6, 0.15,
        "You are a security reviewer. Review only app/hooks/*.py and app/schema.json for injection, authz, PII and data-loss "
        "risks. Write findings to .factory/security.md (max 15 lines, 'OK' if none). " + _COMMON,
    ),
}
EDITABLE = {"planner": ["app/schema.json", ".factory/tasks.json"], "fixer": ["app/hooks/**", "tests/test_custom_*", "app/schema.json"]}


def enabled() -> bool:
    return os.environ.get("SWF_LLM") == "1"


def _model(role: str) -> str:
    return os.environ.get(f"SWF_MODEL_{role.upper()}", ROLES[role].model)


def context_pack(project: Path, extra: str = "") -> str:
    sp = project / "app" / "schema.json"
    parts = []
    if sp.exists():
        parts.append("SPEC:\n" + specmod.summary(json.loads(sp.read_text())))
    hooks = sorted(str(p.relative_to(project)) for p in (project / "app" / "hooks").glob("*.py")) if sp.exists() else []
    if hooks:
        parts.append("EDITABLE FILES: " + " ".join(hooks))
    if extra:
        parts.append(extra)
    return "\n\n".join(parts)


def _ledger(project: Path, row: dict) -> None:
    p = project / ".factory" / "ledger.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as fh:
        fh.write(json.dumps(row) + "\n")


def _fingerprint(project: Path, paths: list[str]) -> str:
    h = hashlib.sha256()
    for pat in paths:
        for f in sorted(project.glob(pat)):
            if f.is_file():
                h.update(f.read_bytes())
    return h.hexdigest()[:16]


async def run_role(role: str, task: str, project: Path, write: list[str], bash: list[str] | None = None) -> dict:
    """One bounded agent call. Cached on (role, task, context, editable-file contents)."""
    from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

    r = ROLES[role]
    ctx = context_pack(project)
    key = hashlib.sha256(f"{role}|{_model(role)}|{task}|{ctx}|{_fingerprint(project, write)}".encode()).hexdigest()[:24]
    cache = project / ".factory" / "cache" / f"{key}.json"
    if cache.exists():
        return {**json.loads(cache.read_text()), "cached": True}
    tools = ["Read", "Glob", "Grep", *(f"Edit({p})" for p in write), *(f"Write({p})" for p in write)]
    tools += [f"Bash({c})" for c in bash or []]
    opts = ClaudeAgentOptions(
        system_prompt=r.prompt,
        model=_model(role),
        max_turns=r.max_turns,
        max_budget_usd=float(os.environ.get("SWF_BUDGET_" + role.upper(), r.budget_usd)),
        allowed_tools=tools,
        permission_mode="dontAsk",  # anything not in allowed_tools is denied: hard scope per agent
        cwd=str(project),
        setting_sources=[],
        cli_path=os.environ.get("SWF_CLAUDE_CLI") or None,
    )
    t0, out = time.time(), {"role": role, "ok": False, "cost_usd": 0.0, "result": ""}
    async for msg in query(prompt=f"{ctx}\n\nTASK:\n{task}", options=opts):
        if isinstance(msg, ResultMessage):
            out.update(
                ok=not msg.is_error and "FAIL" not in (msg.result or "")[:20],
                cost_usd=msg.total_cost_usd or 0.0,
                result=(msg.result or "")[:500],
                usage=msg.usage,
                turns=msg.num_turns,
            )
    out["secs"] = round(time.time() - t0, 1)
    _ledger(project, {k: v for k, v in out.items() if k != "result"} | {"model": _model(role), "at": time.strftime("%FT%T")})
    if out["ok"]:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(out, default=str))
    return out


# ---------- snapshots: code rollback without git ----------
PROTECTED = ["app/schema.json", "app/hooks", "tests"]


def snapshot(project: Path) -> Path:
    snap = project / ".factory" / "snapshots" / time.strftime("%Y%m%d-%H%M%S")
    for rel in PROTECTED:
        src = project / rel
        if src.is_dir():
            shutil.copytree(src, snap / rel, ignore=shutil.ignore_patterns("__pycache__"), dirs_exist_ok=True)
        elif src.exists():
            (snap / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, snap / rel)
    return snap


def restore(project: Path, snap: Path) -> None:
    for rel in PROTECTED:
        src, dst = snap / rel, project / rel
        if src.is_dir():
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src, dst)
        elif src.exists():
            shutil.copy2(src, dst)


# ---------- high-level agent operations ----------
def make_spec(request: str, project: Path) -> dict:
    """Product agent runs in the project root (shared ledger/cache) and may only write spec.json."""
    project.mkdir(parents=True, exist_ok=True)
    tmp = project / "spec.json"
    res = asyncio.run(run_role("product", f"Business request: {request}\nWrite the spec to: spec.json", project, ["spec.json"]))
    if not tmp.exists():
        raise RuntimeError(f"product agent wrote no spec: {res.get('result')}")
    dst = project / ".factory" / "spec.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp.replace(dst)
    return specmod.load(dst)


async def _implement(project: Path, tasks: list[dict]) -> list[dict]:
    """Independent entities -> parallel agents (each sees only its own 2 files)."""
    jobs = [
        run_role(
            "coder",
            f"Entity: {t['entity']}\nRule: {t['instruction']}",
            project,
            [f"app/hooks/{t['entity']}.py", f"tests/test_custom_{t['entity']}.py"],
            [f"python -m pytest -x -q tests/test_custom_{t['entity']}.py"],
        )
        for t in tasks
    ]
    return await asyncio.gather(*jobs)


def plan_and_implement(project: Path, request: str) -> list[dict]:
    asyncio.run(run_role("planner", f"Feature request: {request}", project, EDITABLE["planner"]))
    tf = project / ".factory" / "tasks.json"
    tasks = json.loads(tf.read_text()) if tf.exists() else []
    return asyncio.run(_implement(project, tasks)) if tasks else []


def fix(project: Path, step_name: str, tail: str) -> dict:
    task = f"Failing step: {step_name}\nOutput tail:\n{tail}"
    return asyncio.run(run_role("fixer", task, project, EDITABLE["fixer"], ["python -m pytest:*", "python -m ruff check:*"]))


def security_review(project: Path) -> dict:
    return asyncio.run(run_role("security", "Review now.", project, [".factory/security.md"]))


def cost(project: Path) -> dict:
    p = project / ".factory" / "ledger.jsonl"
    rows = [json.loads(line) for line in p.read_text().splitlines()] if p.exists() else []
    by: dict[str, float] = {}
    for r in rows:
        by[r["role"]] = round(by.get(r["role"], 0) + r.get("cost_usd", 0), 4)
    return {"calls": len(rows), "total_usd": round(sum(by.values()), 4), "by_role": by}

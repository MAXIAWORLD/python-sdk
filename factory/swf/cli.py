"""swf — software factory orchestrator. Output: one compact JSON object per command (cheap for agents to read)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict
from pathlib import Path

from . import agents, deploy, generator, pipeline
from . import spec as specmod

PRESETS = Path(__file__).parent / "presets"


def presets() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted(PRESETS.glob("*.json"))}


def match_preset(request: str) -> tuple[str, dict]:
    text = request.lower()
    scored = sorted(((sum(k in text for k in s.get("keywords", [])), n, s) for n, s in presets().items()), reverse=True)
    score, name, spec = scored[0]
    if score == 0:
        name, spec = "crm", presets()["crm"]
    spec = {k: v for k, v in spec.items() if k != "keywords"}
    return name, spec


def slug(text: str, default: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40].strip("-")
    return s if specmod.SLUG.match(s or "") else default


def resolve_spec(request: str, out_dir: Path, preset: str | None, name: str | None) -> tuple[dict, str]:
    if preset:
        spec, source = {k: v for k, v in presets()[preset].items() if k != "keywords"}, f"preset:{preset}"
    elif agents.enabled():
        spec, source = agents.make_spec(request, out_dir / ".factory" / "spec.json"), "llm:product"
    else:
        p, spec = match_preset(request)
        source = f"preset:{p} (offline; SWF_LLM=1 for a tailored spec)"
    if name:
        spec["name"], spec["title"] = slug(name, spec["name"]), name
    return specmod.validate(spec), source


def build_loop(project: Path, docker: bool, attempts: int) -> dict:
    """validate -> (LLM fix -> regen -> validate)* ; restore snapshot if fixes don't converge."""
    steps = pipeline.run(project, docker=docker)
    fixes = []
    snap = None
    while not pipeline.ok(steps) and agents.enabled() and len(fixes) < attempts:
        snap = snap or agents.snapshot(project)
        bad = pipeline.first_failure(steps)
        fixes.append(agents.fix(project, bad.name, bad.tail))
        generator.generate(specmod.load(project / "app" / "schema.json"), project)
        steps = pipeline.run(project, docker=docker)
    if not pipeline.ok(steps) and snap:
        agents.restore(project, snap)
        generator.generate(specmod.load(project / "app" / "schema.json"), project)
    return {"ok": pipeline.ok(steps), "steps": [asdict(s) for s in steps], "llm_fixes": len(fixes), "restored": bool(snap) and not pipeline.ok(steps)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="swf", description="Autonomous software factory")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("new", help="business request -> validated project")
    a.add_argument("request")
    a.add_argument("--out", required=True)
    a.add_argument("--preset", choices=sorted(presets()))
    a.add_argument("--name")
    a.add_argument("--docker", action="store_true")
    a.add_argument("--attempts", type=int, default=2)
    a = sub.add_parser("spec", help="business request -> spec.json")
    a.add_argument("request")
    a.add_argument("-o", "--out", default="spec.json")
    a = sub.add_parser("gen", help="spec.json -> project (incremental)")
    a.add_argument("spec")
    a.add_argument("--out", required=True)
    a = sub.add_parser("validate", help="lint+security, tests, smoke[, docker build]")
    a.add_argument("project")
    a.add_argument("--docker", action="store_true")
    a = sub.add_parser("feature", help="LLM: add a feature (planner -> parallel coders -> validate/fix)")
    a.add_argument("project")
    a.add_argument("request")
    a.add_argument("--attempts", type=int, default=2)
    a = sub.add_parser("fix", help="LLM: fix loop until green")
    a.add_argument("project")
    a.add_argument("--attempts", type=int, default=3)
    for name in ("review", "rollback", "status", "cost"):
        a = sub.add_parser(name)
        a.add_argument("project")
        if name == "rollback":
            a.add_argument("--dry-run", action="store_true")
    a = sub.add_parser("deploy")
    a.add_argument("project")
    a.add_argument("--target", choices=["docker", "local"], default="docker")
    a.add_argument("--port", type=int, default=8000)
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--skip-validate", action="store_true")
    sub.add_parser("presets")
    args = ap.parse_args(argv)

    def need_llm() -> None:
        if not agents.enabled():
            raise SystemExit(json.dumps({"error": "LLM disabled. export SWF_LLM=1 (spends tokens)."}))

    out: dict
    if args.cmd == "presets":
        out = {n: specmod.summary(s) for n, s in presets().items()}
    elif args.cmd == "spec":
        spec, source = resolve_spec(args.request, Path(args.out).resolve().parent, None, None)
        Path(args.out).write_text(json.dumps(spec, indent=2, ensure_ascii=False))
        out = {"spec": args.out, "source": source, "summary": specmod.summary(spec)}
    elif args.cmd == "gen":
        rep = generator.generate(specmod.load(args.spec), args.out)
        out = {k: (v if k != "unchanged" else len(v)) for k, v in rep.items()}
    elif args.cmd == "new":
        project = Path(args.out).resolve()
        spec, source = resolve_spec(args.request, project, args.preset, args.name)
        rep = generator.generate(spec, project)
        out = {"project": str(project), "spec_source": source, "files": len(rep["created"]) + len(rep["updated"])}
        out |= build_loop(project, args.docker, args.attempts)
    elif args.cmd == "validate":
        steps = pipeline.run(args.project, docker=args.docker)
        out = {"ok": pipeline.ok(steps), "steps": [asdict(s) for s in steps]}
    elif args.cmd == "feature":
        need_llm()
        project = Path(args.project).resolve()
        snap = agents.snapshot(project)
        coders = agents.plan_and_implement(project, args.request)
        generator.generate(specmod.load(project / "app" / "schema.json"), project)
        out = {"coders": [{k: c.get(k) for k in ("ok", "cost_usd", "cached")} for c in coders], "snapshot": str(snap)}
        out |= build_loop(project, False, args.attempts)
        if not out["ok"]:
            agents.restore(project, snap)
            generator.generate(specmod.load(project / "app" / "schema.json"), project)
            out["restored"] = True
    elif args.cmd == "fix":
        need_llm()
        out = build_loop(Path(args.project).resolve(), False, args.attempts)
    elif args.cmd == "review":
        need_llm()
        out = agents.security_review(Path(args.project).resolve())
    elif args.cmd == "deploy":
        if not args.skip_validate and not args.dry_run:
            steps = pipeline.run(args.project, docker=False)
            if not pipeline.ok(steps):
                print(json.dumps({"status": "blocked", "failed": asdict(pipeline.first_failure(steps))}))
                return 1
        try:
            out = deploy.deploy(args.project, args.target, args.port, args.dry_run)
        except deploy.DeployError as exc:
            out = {"status": "failed", "error": str(exc), "note": "nothing promoted; previous release untouched"}
    elif args.cmd == "rollback":
        out = deploy.rollback(args.project, dry=args.dry_run)
    elif args.cmd == "status":
        out = deploy.status(args.project)
    else:
        out = agents.cost(Path(args.project).resolve())
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
    return 0 if out.get("ok", True) and out.get("status") not in ("failed-rolled-back", "failed") else 1


if __name__ == "__main__":
    sys.exit(main())

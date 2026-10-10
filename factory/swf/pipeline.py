"""Validation loop: lint+security -> tests -> smoke -> (docker build). Fail-fast, JSONL logs, short tails."""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

TAIL = 60  # lines of failure output handed to a fixer agent: caps tokens


@dataclass
class Step:
    name: str
    ok: bool
    secs: float
    tail: str = ""


def _tail(text: str, n: int = TAIL) -> str:
    return "\n".join(text.strip().splitlines()[-n:])


def _run(name: str, cmd: list[str], cwd: Path, timeout: int = 600) -> Step:
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)  # noqa: S603
        ok = p.returncode == 0
        return Step(name, ok, round(time.time() - t0, 2), "" if ok else _tail(p.stdout + p.stderr))
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        return Step(name, False, round(time.time() - t0, 2), str(exc))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_http(url: str, timeout: float = 20) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:  # noqa: S310
                if r.status == 200:
                    return True
        except OSError:
            time.sleep(0.3)
    return False


def smoke(cwd: Path) -> Step:
    t0 = time.time()
    port = free_port()
    with tempfile.TemporaryDirectory() as tmp:
        env = {**os.environ, "DATABASE_PATH": str(Path(tmp) / "smoke.db"), "API_KEY": ""}
        cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)]
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)  # noqa: S603
        try:
            base = f"http://127.0.0.1:{port}"
            ok = wait_http(base + "/health")
            if ok:
                schema = json.load(urllib.request.urlopen(base + "/api/_schema", timeout=5))  # noqa: S310
                for e in schema["entities"]:
                    ok = ok and wait_http(f"{base}/api/{e['name']}", 5)
                ok = ok and wait_http(base + "/", 5)
        finally:
            proc.terminate()
            try:
                out = proc.communicate(timeout=5)[0] or ""
            except subprocess.TimeoutExpired:
                proc.kill()
                out = ""
    return Step("smoke", ok, round(time.time() - t0, 2), "" if ok else _tail(out))


def run(project: str | Path, docker: bool = False, log: bool = True) -> list[Step]:
    cwd = Path(project).resolve()
    py = sys.executable
    plan = [
        lambda: _run("lint+security", [py, "-m", "ruff", "check", "."], cwd),
        lambda: _run("tests", [py, "-m", "pytest", "-x", "-q", "--no-header", "-p", "no:cacheprovider", "-W", "ignore::DeprecationWarning"], cwd),
        lambda: smoke(cwd),
    ]
    if docker:
        if shutil.which("docker"):
            plan.append(lambda: _run("docker-build", ["docker", "build", "-q", "-t", f"{cwd.name}:validate", "."], cwd, 900))
        else:
            plan.append(lambda: Step("docker-build", False, 0, "docker not installed"))
    steps: list[Step] = []
    for fn in plan:
        s = fn()
        steps.append(s)
        if not s.ok:
            break
    if log:
        d = cwd / ".factory" / "runs"
        d.mkdir(parents=True, exist_ok=True)
        with (d / f"{time.strftime('%Y%m%d-%H%M%S')}.jsonl").open("w") as fh:
            for s in steps:
                fh.write(json.dumps(asdict(s)) + "\n")
    return steps


def ok(steps: list[Step]) -> bool:
    return bool(steps) and all(s.ok for s in steps)


def first_failure(steps: list[Step]) -> Step | None:
    return next((s for s in steps if not s.ok), None)

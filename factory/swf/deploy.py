"""Deploy with health-gated promotion and automatic rollback. Targets: docker | local."""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

from .pipeline import wait_http


class DeployError(RuntimeError):
    pass


def _state(project: Path) -> tuple[Path, dict]:
    p = project / ".factory" / "deploy.json"
    return p, (json.loads(p.read_text()) if p.exists() else {"history": []})


def _save(p: Path, st: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(st, indent=1))


def _sh(cmd: list[str], dry: bool, cwd: Path, check: bool = True) -> int:
    print("$ " + " ".join(cmd))
    if dry:
        return 0
    rc = subprocess.run(cmd, cwd=cwd).returncode  # noqa: S603
    if check and rc:
        raise DeployError(f"command failed ({rc}): {' '.join(cmd)}")
    return rc


def _name(project: Path) -> str:
    return json.loads((project / "app" / "schema.json").read_text())["name"]


def _docker_up(project: Path, tag: str, port: int, dry: bool) -> None:
    name = _name(project)
    _sh(["docker", "rm", "-f", name], dry, project, check=False)
    cmd = ["docker", "run", "-d", "--name", name, "--restart", "unless-stopped", "-p", f"{port}:8000", "-v", f"{name}-data:/app/data"]
    if os.environ.get("API_KEY"):
        cmd += ["-e", "API_KEY"]
    _sh([*cmd, tag], dry, project)


def _release_dir(project: Path, tag: str) -> Path:
    return project / ".factory" / "releases" / tag


def _local_release(project: Path, tag: str) -> None:
    """Immutable copy of app/ so rollback restarts the exact previous code."""
    dst = _release_dir(project, tag)
    shutil.copytree(project / "app", dst / "app", ignore=shutil.ignore_patterns("__pycache__"))
    for old in sorted((project / ".factory" / "releases").iterdir())[:-10]:
        shutil.rmtree(old, ignore_errors=True)


def _local_up(project: Path, tag: str, port: int, dry: bool) -> int:
    pidf = project / ".factory" / "local.pid"
    _local_down(project)
    cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)]
    print("$ " + " ".join(cmd))
    if dry:
        return 0
    env = {**os.environ, "DATABASE_PATH": os.environ.get("DATABASE_PATH", str(project / "data" / "app.db"))}
    logf = (project / ".factory" / "local.log").open("a")
    cwd = _release_dir(project, tag)
    proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=logf, stderr=subprocess.STDOUT, start_new_session=True)  # noqa: S603
    pidf.write_text(str(proc.pid))
    return proc.pid


def _local_down(project: Path) -> None:
    pidf = project / ".factory" / "local.pid"
    if not pidf.exists():
        return
    try:
        pid = int(pidf.read_text())
        os.killpg(pid, signal.SIGTERM)
        for _ in range(50):  # wait for real exit: avoids health-checking the old process
            time.sleep(0.1)
            os.killpg(pid, 0)
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, ValueError, PermissionError):
        pass
    pidf.unlink(missing_ok=True)


def _local_alive(project: Path) -> bool:
    pidf = project / ".factory" / "local.pid"
    try:
        os.kill(int(pidf.read_text()), 0)
        return True
    except (FileNotFoundError, ProcessLookupError, ValueError):
        return False


def deploy(project: str | Path, target: str = "docker", port: int = 8000, dry: bool = False) -> dict:
    project = Path(project).resolve()
    sp, st = _state(project)
    version = time.strftime("%Y%m%d%H%M%S")
    url = f"http://127.0.0.1:{port}/health"
    if target == "docker":
        tag = f"{_name(project)}:{version}"
        base = ["--build-arg", f"BASE_IMAGE={os.environ['BASE_IMAGE']}"] if os.environ.get("BASE_IMAGE") else []
        _sh(["docker", "build", *base, "-t", tag, "."], dry, project)
        _docker_up(project, tag, port, dry)
    elif target == "local":
        tag = version
        if not dry:
            _local_release(project, tag)
        _local_up(project, tag, port, dry)
    else:
        raise DeployError(f"unknown target {target}")
    healthy = dry or (wait_http(url, 40) and (target != "local" or _local_alive(project)))
    if healthy:
        st["history"].append({"tag": tag, "target": target, "port": port, "at": version})
        st["history"] = st["history"][-10:]
        if not dry:
            _save(sp, st)
        return {"status": "deployed", "tag": tag, "url": url.removesuffix("/health")}
    prev = rollback(project, dry=dry, _drop_current=False)
    return {"status": "failed-rolled-back", "tag": tag, "restored": prev.get("tag")}


def rollback(project: str | Path, dry: bool = False, _drop_current: bool = True) -> dict:
    """Restore the previous healthy release (docker image tag or local code is unchanged → restart)."""
    project = Path(project).resolve()
    sp, st = _state(project)
    hist = st["history"]
    if _drop_current and hist:
        hist.pop()
    if not hist:
        if not dry:
            _local_down(project)
        return {"status": "no-previous-release"}
    prev = hist[-1]
    if prev["target"] == "docker":
        _docker_up(project, prev["tag"], prev["port"], dry)
    else:
        _local_up(project, prev["tag"], prev["port"], dry)
    if not dry:
        _save(sp, st)
    return {"status": "rolled-back", **prev}


def status(project: str | Path) -> dict:
    project = Path(project).resolve()
    _, st = _state(project)
    cur = st["history"][-1] if st["history"] else None
    up = bool(cur) and wait_http(f"http://127.0.0.1:{cur['port']}/health", 2)
    return {"current": cur, "healthy": up, "releases": len(st["history"])}

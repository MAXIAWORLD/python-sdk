#!/usr/bin/env python3
"""Stand-in for the `claude` CLI speaking the stream-json protocol used by claude-agent-sdk.

Scenario (env FAKE_CLAUDE_SCENARIO, JSON): [{"when": "<substring of system prompt>", "write": {path: content}, "cost": 0.01}]
Emulates permission_mode=dontAsk: writes outside --allowedTools Edit()/Write() patterns are denied.
Every invocation's argv is appended to env FAKE_CLAUDE_LOG.
"""

import fnmatch
import json
import os
import sys
from pathlib import Path

argv = sys.argv[1:]
if argv[:1] in (["-v"], ["--version"]):
    print("2.1.296 (Claude Code)")
    sys.exit(0)


def opt(name: str) -> str:
    return argv[argv.index(name) + 1] if name in argv else ""


with open(os.environ["FAKE_CLAUDE_LOG"], "a") as fh:
    fh.write(json.dumps(argv) + "\n")

system, allowed = opt("--system-prompt"), [t for t in opt("--allowedTools").split(",") if t]
patterns = [t[t.index("(") + 1 : -1] for t in allowed if t.startswith(("Edit(", "Write("))]
scenario = json.loads(os.environ.get("FAKE_CLAUDE_SCENARIO", "[]"))
rule = next((r for r in scenario if r["when"] in system), {"write": {}, "cost": 0})


def out(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


done = False
for line in sys.stdin:
    msg = json.loads(line)
    if msg.get("type") == "control_request":
        out({"type": "control_response", "response": {"subtype": "success", "request_id": msg["request_id"], "response": {}}})
    elif msg.get("type") == "user" and not done:
        denied = []
        for path, content in rule["write"].items():
            if opt("--permission-mode") == "dontAsk" and not any(fnmatch.fnmatch(path, p) for p in patterns):
                denied.append({"tool_name": "Write", "tool_input": {"file_path": path}})
                continue
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            Path(path).write_text(content)
        out({"type": "assistant", "message": {"role": "assistant", "model": opt("--model"), "content": [{"type": "text", "text": "DONE"}]}})
        out({
            "type": "result", "subtype": "success", "duration_ms": 5, "duration_api_ms": 4, "is_error": False, "num_turns": 1,
            "session_id": "fake", "result": "DONE", "total_cost_usd": rule.get("cost", 0),
            "usage": {"input_tokens": 900, "output_tokens": 120, "cache_read_input_tokens": 700}, "permission_denials": denied,
        })
        done = True
        if os.environ.get("FAKE_CLAUDE_ONESHOT", "1") == "1":
            break

"""Deterministic spec -> project generator. Zero LLM tokens. Incremental via content hashes."""

from __future__ import annotations

import hashlib
import json
import shutil
import time
from pathlib import Path

from . import spec as specmod

TEMPLATE = Path(__file__).parent / "template"

HOOK_STUB = '''"""Business rules for `{name}`. PROTECTED: swf never overwrites this file."""

from fastapi import HTTPException  # noqa: F401  (raise HTTPException(422, "...") to reject)

# Valid payload overrides for generic tests when rules below reject default samples.
TEST_SAMPLE: dict = {{}}


def before_create(data: dict) -> dict:
    return data


def before_update(data: dict, current: dict) -> dict:
    return data
'''

TEST_STUB = '''"""Custom tests for `{name}`. PROTECTED: swf never overwrites this file."""

from tests.test_api import client, make  # noqa: F401


def test_{name}_smoke(client):  # noqa: F811
    assert make(client, "{name}")["id"] > 0
'''


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def readme(spec: dict) -> str:
    rows = "\n".join(
        f"| `{e['name']}` | {e['label']} | " + ", ".join(f"{f['name']}{'*' if f.get('required') else ''}:{f['type']}" for f in e["fields"]) + " |"
        for e in spec["entities"]
    )
    return f"""# {spec['title']}

Généré par l'usine `swf` depuis `app/schema.json` (v{spec['version']}).

## Démarrer
```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --reload          # http://localhost:8000  (UI) · /docs (OpenAPI)
python -m swf validate .               # lint+sécurité, tests, smoke
docker compose up -d --build           # prod (API_KEY=... pour protéger /api)
```

## Modèle
| Entité | Libellé | Champs (* requis) |
|---|---|---|
{rows}

## API (par entité `E`)
`GET /api/E?q=&<champ>=&limit=&offset=&order=-id` · `POST /api/E` · `GET|PATCH|DELETE /api/E/{{id}}` · `GET /api/E.csv` · `GET /api/E/_stats?by=<champ>` · `GET /health` · `GET /api/_schema`

## Maintenance
- Modèle : éditer `app/schema.json` puis `python -m swf gen app/schema.json --out .` (migrations additives automatiques).
- Règles métier : `app/hooks/<entité>.py` · tests : `tests/test_custom_<entité>.py` (jamais écrasés).
- Déployer : `python -m swf deploy . --target docker` · revenir : `python -m swf rollback .`
"""


def generate(spec: dict, out: str | Path) -> dict:
    spec = specmod.validate(spec)
    out = Path(out)
    meta = out / ".factory"
    meta.mkdir(parents=True, exist_ok=True)
    mpath = meta / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {}
    report: dict[str, list[str]] = {"created": [], "updated": [], "unchanged": [], "protected": [], "overwrote_local_edits": []}

    files: dict[str, bytes] = {
        str(p.relative_to(TEMPLATE)): p.read_bytes()
        for p in sorted(TEMPLATE.rglob("*"))
        if p.is_file() and "__pycache__" not in p.parts
    }
    files["app/schema.json"] = (json.dumps(spec, indent=2, ensure_ascii=False) + "\n").encode()
    files["README.md"] = readme(spec).encode()

    for rel, data in files.items():
        dst = out / rel
        new = _sha(data)
        if dst.exists():
            old = _sha(dst.read_bytes())
            if old == new:
                report["unchanged"].append(rel)
                manifest[rel] = new
                continue
            if rel in manifest and manifest[rel] != old:
                bak = meta / "backup" / time.strftime("%Y%m%d-%H%M%S") / rel
                bak.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dst, bak)
                report["overwrote_local_edits"].append(rel)
            report["updated"].append(rel)
        else:
            report["created"].append(rel)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
        manifest[rel] = new

    protected = {"app/hooks/__init__.py": "", "tests/__init__.py": ""}
    for e in spec["entities"]:
        protected[f"app/hooks/{e['name']}.py"] = HOOK_STUB.format(name=e["name"])
        protected[f"tests/test_custom_{e['name']}.py"] = TEST_STUB.format(name=e["name"])
    for rel, text in protected.items():
        dst = out / rel
        if not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(text)
            report["created"].append(rel)
        else:
            report["protected"].append(rel)

    mpath.write_text(json.dumps(manifest, indent=1, sort_keys=True))
    return report

"""Spec = single source of truth. Validated, normalized, summarized (for cheap LLM context)."""

from __future__ import annotations

import json
import re
from pathlib import Path

TYPES = {"str", "text", "email", "int", "float", "bool", "date", "datetime", "enum", "ref"}
RESERVED = {"id", "created_at", "updated_at"}
IDENT = re.compile(r"^[a-z][a-z0-9_]{0,40}$")
SLUG = re.compile(r"^[a-z][a-z0-9-]{1,40}$")


class SpecError(ValueError):
    pass


def load(path: str | Path) -> dict:
    return validate(json.loads(Path(path).read_text()))


def validate(spec: dict) -> dict:
    errs: list[str] = []
    if not isinstance(spec, dict):
        raise SpecError("spec must be a JSON object")
    if not SLUG.match(str(spec.get("name", ""))):
        errs.append("name: slug required (a-z0-9-)")
    ents = spec.get("entities")
    if not isinstance(ents, list) or not ents:
        raise SpecError("; ".join([*errs, "entities: non-empty list required"]))
    names = [e.get("name") for e in ents]
    for e in ents:
        n = e.get("name", "?")
        if not IDENT.match(str(n)):
            errs.append(f"{n}: invalid entity name")
        if names.count(n) > 1:
            errs.append(f"{n}: duplicate entity")
        fields = e.get("fields") or []
        if not fields:
            errs.append(f"{n}: fields required")
        fnames = [f.get("name") for f in fields]
        for f in fields:
            fn, t = f.get("name", "?"), f.get("type")
            where = f"{n}.{fn}"
            if not IDENT.match(str(fn)) or fn in RESERVED:
                errs.append(f"{where}: invalid/reserved field name")
            if fnames.count(fn) > 1:
                errs.append(f"{where}: duplicate field")
            if t not in TYPES:
                errs.append(f"{where}: type must be one of {sorted(TYPES)}")
            if t == "enum" and not (
                isinstance(f.get("values"), list) and f["values"] and all(isinstance(v, str) for v in f["values"])
            ):
                errs.append(f"{where}: enum needs non-empty string 'values'")
            if t == "ref" and f.get("ref") not in names:
                errs.append(f"{where}: ref must name an entity")
        e.setdefault("label", n.replace("_", " ").title() + "s")
        for f in fields:
            f.setdefault("label", str(f.get("name", "")).removesuffix("_id").replace("_", " ").capitalize())
    if not errs:
        cycle = _required_ref_cycle(ents)
        if cycle:
            errs.append(f"required ref cycle: {' -> '.join(cycle)}")
    if errs:
        raise SpecError("; ".join(errs))
    spec.setdefault("title", spec["name"].replace("-", " ").title())
    spec.setdefault("version", "0.1.0")
    return spec


def _required_ref_cycle(ents: list[dict]) -> list[str] | None:
    graph = {e["name"]: [f["ref"] for f in e["fields"] if f["type"] == "ref" and f.get("required")] for e in ents}
    state: dict[str, int] = {}

    def dfs(n: str, path: list[str]) -> list[str] | None:
        state[n] = 1
        for m in graph[n]:
            if state.get(m) == 1:
                return [*path, n, m]
            if m not in state and (c := dfs(m, [*path, n])):
                return c
        state[n] = 2
        return None

    for n in graph:
        if n not in state and (c := dfs(n, [])):
            return c
    return None


def summary(spec: dict) -> str:
    """Compact one-line-per-entity view: ~10x fewer tokens than the JSON."""
    out = [f"{spec['name']}: {spec.get('title', '')}"]
    for e in spec["entities"]:
        parts = []
        for f in e["fields"]:
            t = f["type"]
            if t == "enum":
                t = "enum[" + "|".join(f["values"]) + "]"
            elif t == "ref":
                t = "->" + f["ref"]
            parts.append(f"{f['name']}:{t}{'!' if f.get('required') else ''}")
        out.append(f"{e['name']}({', '.join(parts)})")
    return "\n".join(out)

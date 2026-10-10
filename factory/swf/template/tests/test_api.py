"""Generic contract tests derived from app/schema.json. MANAGED by swf (overwritten on regen).

Per-entity custom tests: tests/test_custom_<entity>.py. Valid sample overrides: TEST_SAMPLE in app/hooks/<entity>.py.
"""

import importlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SPEC = json.loads((Path(__file__).parents[1] / "app" / "schema.json").read_text())
ENTS = {e["name"]: e for e in SPEC["entities"]}
SAMPLE = {
    "str": "Alpha",
    "text": "Lorem ipsum",
    "email": "a@example.com",
    "int": 3,
    "float": 1.5,
    "bool": True,
    "date": "2026-01-02",
    "datetime": "2026-01-02T03:04:05",
}
BAD = {"int": "x", "float": "x", "bool": "maybe", "date": "2026-13-40", "datetime": "nope", "email": "nope", "enum": "__nope__"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "t.db"))
    monkeypatch.delenv("API_KEY", raising=False)
    from app.main import app

    return TestClient(app)


def override(name: str) -> dict:
    try:
        return dict(getattr(importlib.import_module(f"app.hooks.{name}"), "TEST_SAMPLE", {}))
    except ModuleNotFoundError:
        return {}


def payload(client, name: str) -> dict:
    p = {}
    for f in ENTS[name]["fields"]:
        if f["type"] == "enum":
            p[f["name"]] = f["values"][0]
        elif f["type"] == "ref":
            if f.get("required"):
                p[f["name"]] = make(client, f["ref"])["id"]
        else:
            p[f["name"]] = SAMPLE[f["type"]]
    p.update(override(name))
    return p


def make(client, name: str) -> dict:
    r = client.post(f"/api/{name}", json=payload(client, name))
    assert r.status_code == 201, r.text
    return r.json()


def test_health_ui_schema(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/").status_code == 200
    assert client.get("/api/_schema").json()["name"] == SPEC["name"]


@pytest.mark.parametrize("name", ENTS)
def test_crud_roundtrip(client, name):
    item = make(client, name)
    assert client.get(f"/api/{name}/{item['id']}").json()["id"] == item["id"]
    lst = client.get(f"/api/{name}").json()
    assert lst["total"] >= 1
    f = next((f for f in ENTS[name]["fields"] if f["type"] in ("str", "text")), None)
    if f:
        r = client.patch(f"/api/{name}/{item['id']}", json={f["name"]: "Zeta"})
        assert r.status_code == 200, r.text
        assert r.json()[f["name"]] == "Zeta"
        assert client.get(f"/api/{name}", params={"q": "Zet"}).json()["total"] >= 1
    assert client.get(f"/api/{name}.csv").text.startswith("id,")
    assert client.delete(f"/api/{name}/{item['id']}").status_code == 204
    assert client.get(f"/api/{name}/{item['id']}").status_code == 404


@pytest.mark.parametrize("name", ENTS)
def test_validation(client, name):
    assert client.post(f"/api/{name}", json={"__unknown__": 1}).status_code == 422
    for f in ENTS[name]["fields"]:
        if f.get("required"):
            p = payload(client, name)
            p.pop(f["name"])
            assert client.post(f"/api/{name}", json=p).status_code == 422, f["name"]
        if f["type"] in BAD:
            p = payload(client, name)
            p[f["name"]] = BAD[f["type"]]
            assert client.post(f"/api/{name}", json=p).status_code == 422, f["name"]


@pytest.mark.parametrize("name", [n for n, e in ENTS.items() if any(f["type"] == "enum" for f in e["fields"])])
def test_stats(client, name):
    make(client, name)
    by = next(f["name"] for f in ENTS[name]["fields"] if f["type"] == "enum")
    assert client.get(f"/api/{name}/_stats", params={"by": by}).json()["groups"]


def test_api_key(client, monkeypatch):
    monkeypatch.setenv("API_KEY", "s3cret")
    first = SPEC["entities"][0]["name"]
    assert client.get(f"/api/{first}").status_code == 401
    assert client.get(f"/api/{first}", headers={"x-api-key": "s3cret"}).status_code == 200
    assert client.get("/health").status_code == 200

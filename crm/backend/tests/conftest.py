from __future__ import annotations

import os
import tempfile

import pytest

_TMP = tempfile.mkdtemp(prefix="prisme-test-")
os.environ["PRISME_DATA_DIR"] = _TMP
os.environ["PRISME_DISABLE_SCHEDULER"] = "1"
os.environ.setdefault("PRISME_SECRET_KEY", "test-secret-key-for-the-prisme-test-suite-0123456789")

from fastapi.testclient import TestClient  # noqa: E402

from prisme.main import app  # noqa: E402
from prisme.services import events  # noqa: E402

HEADERS = {"X-Requested-With": "prisme"}
ADMIN = {"name": "Admin Test", "email": "admin@test.fr", "password": "Prisme-Test-2026!", "company_name": "Test SAS", "load_demo": True}


@pytest.fixture(scope="session")
def client():
    events.set_sync(True)
    with TestClient(app) as c:
        r = c.post("/api/auth/setup", json=ADMIN, headers=HEADERS)
        assert r.status_code == 200, r.text
        c.headers.update(HEADERS)
        yield c

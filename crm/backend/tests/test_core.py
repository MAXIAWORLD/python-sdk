"""End-to-end checks of the critical flows (auth, CRUD, French invoicing, RGPD, AI tools, MCP)."""

from __future__ import annotations

from datetime import date, timedelta


def test_auth_and_csrf(client):
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["role"] == "admin"
    # Cookie-authenticated writes without the custom header are refused (CSRF).
    r = client.post("/api/contacts", json={"first_name": "X"}, headers={"X-Requested-With": ""})
    assert r.status_code == 403


def test_crud_contact_and_search(client):
    r = client.post("/api/contacts", json={"first_name": "Jeanne", "last_name": "Testeuse", "email": "Jeanne.Testeuse@Example.COM", "tags": ["vip"]})
    assert r.status_code == 201, r.text
    contact = r.json()
    assert contact["email"] == "jeanne.testeuse@example.com"
    assert contact["full_name"] == "Jeanne Testeuse"
    found = client.get("/api/contacts", params={"q": "Jeanne Testeuse"}).json()
    assert found["total"] == 1
    tagged = client.get("/api/contacts", params={"tags__contains": "vip", "limit": 500}).json()
    assert any(c["id"] == contact["id"] for c in tagged["items"])
    upd = client.patch(f"/api/contacts/{contact['id']}", json={"lifecycle": "sql", "consent_marketing": True})
    assert upd.json()["lifecycle"] == "sql" and upd.json()["consent_at"]
    consents = client.get("/api/consent-logs", params={"contact_id": contact["id"]}).json()
    assert consents["total"] == 1


def test_deal_pipeline_flow(client):
    board = client.get("/api/deals/board").json()
    stages = board["stages"]
    company = client.post("/api/companies", json={"name": "Flux Test SARL", "website": "https://www.flux-test.fr"}).json()
    assert company["domain"] == "flux-test.fr"
    deal = client.post("/api/deals", json={"title": "Test deal", "company_id": company["id"], "mrr": 100}).json()
    assert deal["stage_id"] == stages[0]["id"] and deal["value"] == 1200
    won = next(s for s in stages if s["is_won"])
    moved = client.post(f"/api/deals/{deal['id']}/move", json={"stage_id": won["id"], "position": 0}).json()
    assert moved["status"] == "won" and moved["closed_at"]
    company_after = client.get(f"/api/companies/{company['id']}").json()
    assert company_after["type"] == "client"


def test_french_invoicing_rules(client):
    company = client.post("/api/companies", json={"name": "Client Facture SAS", "address": "1 rue Test", "zip": "75001", "city": "Paris", "siren": "552100554"}).json()
    quote = client.post("/api/quotes", json={"company_id": company["id"], "title": "Mission", "lines": [{"description": "Conseil", "quantity": 2, "unit": "jour", "unit_price": 1000, "vat_rate": 20}]}).json()
    assert quote["number"].startswith("DEV-") and quote["total"] == 2400
    invoice = client.post(f"/api/quotes/{quote['id']}/convert", json={}).json()
    assert invoice["status"] == "draft" and invoice["number"] == ""
    issued = client.post(f"/api/invoices/{invoice['id']}/issue")
    assert issued.status_code == 200, issued.text
    issued = issued.json()
    year = date.today().year
    assert issued["number"].startswith(f"FA-{year}-") and issued["locked"] is True
    assert issued["seller"]["siren"] and issued["buyer"]["siren"] == "552100554"
    # Immutable once issued
    assert client.patch(f"/api/invoices/{invoice['id']}", json={"title": "Modif"}).status_code == 409
    assert client.delete(f"/api/invoices/{invoice['id']}").status_code == 409
    # Continuous numbering: the next one gets the following number
    second = client.post("/api/invoices", json={"company_id": company["id"], "lines": [{"description": "Suite", "quantity": 1, "unit_price": 100}]}).json()
    nxt = client.post(f"/api/invoices/{second['id']}/issue").json()
    assert nxt["sequence"] == issued["sequence"] + 1
    # Payment then credit note
    paid = client.post(f"/api/invoices/{invoice['id']}/payments", json={"amount": 1000, "method": "transfer"}).json()
    assert paid["invoice"]["status"] == "partial"
    credit = client.post(f"/api/invoices/{second['id']}/credit-note", json={"reason": "Erreur"}).json()
    assert credit["number"].startswith(f"AV-{year}-") and credit["total"] < 0
    assert client.get(f"/api/invoices/{second['id']}").json()["status"] == "cancelled"
    # PDF / Factur-X
    pdf = client.get(f"/api/invoices/{invoice['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    xml = client.get(f"/api/invoices/{invoice['id']}/facturx.xml")
    assert xml.status_code == 200 and b"CrossIndustryInvoice" in xml.content
    assert client.get("/api/invoices/integrity").json()["ok"] is True


def test_payment_terms_cap(client):
    r = client.patch("/api/settings/billing", json={"payment_days": 90})
    assert r.status_code == 422


def test_public_quote_signature(client):
    company = client.get("/api/companies", params={"limit": 1}).json()["items"][0]
    quote = client.post("/api/quotes", json={"company_id": company["id"], "lines": [{"description": "Licence", "quantity": 1, "unit_price": 500}]}).json()
    client.post(f"/api/quotes/{quote['id']}/mark-sent")
    token = client.get(f"/api/quotes/{quote['id']}").json()["public_token"]
    view = client.get(f"/api/public/quotes/{token}")
    assert view.status_code == 200 and view.json()["status"] == "viewed"
    ok = client.post(f"/api/public/quotes/{token}/accept", json={"name": "Marie Client", "email": "marie@client.fr", "agree": True})
    assert ok.status_code == 200 and ok.json()["signature_hash"]
    assert client.get(f"/api/quotes/{quote['id']}").json()["status"] == "accepted"


def test_public_form_and_unsubscribe(client):
    form = client.post("/api/forms", json={"name": "Contact test"}).json()
    r = client.post(f"/api/public/forms/{form['slug']}", json={"values": {"first_name": "Léo", "last_name": "Form", "email": "leo.form@exemple.org", "company": "Form Co"}, "consent": True})
    assert r.status_code == 200, r.text
    contact = client.get("/api/contacts", params={"email": "leo.form@exemple.org"}).json()["items"][0]
    assert contact["consent_marketing"] is True and contact["company"]["name"] == "Form Co"


def test_rgpd_export_and_anonymize(client):
    contact = client.post("/api/contacts", json={"first_name": "Effacer", "last_name": "Moi", "email": "effacer@exemple.org", "phone": "0601020304"}).json()
    export = client.get(f"/api/rgpd/contacts/{contact['id']}/export")
    assert export.status_code == 200 and export.json()["contact"]["email"] == "effacer@exemple.org"
    anon = client.post(f"/api/rgpd/contacts/{contact['id']}/anonymize", json={}).json()
    assert anon["email"] is None and anon["anonymized_at"] and anon["do_not_contact"] is True


def test_subscription_mrr_movements(client):
    company = client.get("/api/companies", params={"limit": 1}).json()["items"][0]
    sub = client.post("/api/subscriptions", json={"company_id": company["id"], "plan": "Test", "amount": 100, "quantity": 2}).json()
    assert sub["mrr"] == 200
    client.patch(f"/api/subscriptions/{sub['id']}", json={"quantity": 3})
    client.patch(f"/api/subscriptions/{sub['id']}", json={"status": "canceled"})
    changes = client.get("/api/subscription-changes", params={"subscription_id": sub["id"], "sort": "id"}).json()["items"]
    assert [c["kind"] for c in changes] == ["new", "expansion", "churn"]


def test_ai_tools_registry_without_llm(client):
    from prisme.ai import tools
    from prisme.db import session_scope
    from prisme.models import User

    with session_scope() as session:
        user = session.get(User, 1)
        ctx = tools.ToolContext(session=session, user=user)
        ok, text, data = tools.execute(ctx, "list_records", {"resource": "deals", "filters": {"status": "open"}, "limit": 5})
        assert ok and data["returned"] <= 5
        ok, text, data = tools.execute(ctx, "create_task", {"title": "Rappeler le client", "due_date": (date.today() + timedelta(days=1)).isoformat()})
        assert ok and data["task_id"]
        ok, text, _ = tools.execute(ctx, "list_records", {"resource": "nope"})
        assert not ok and "invalides" in text
        assert tools.needs_approval("send_email", False) is True
        assert tools.needs_approval("create_task", True) is True
        assert tools.needs_approval("search_crm", True) is False


def test_mcp_http_endpoint(client):
    token = client.post("/api/auth/tokens", json={"name": "Claude", "scopes": ["mcp"]}).json()["token"]
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json, text/event-stream", "Content-Type": "application/json", "MCP-Protocol-Version": "2025-11-25"}
    init = client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}}})
    assert init.status_code == 200, init.text
    listed = client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    assert listed.status_code == 200, listed.text
    names = {t["name"] for t in listed.json()["result"]["tools"]}
    assert {"search_crm", "create_quote", "issue_invoice"} <= names
    called = client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_metrics", "arguments": {"scope": "saas"}}})
    assert called.status_code == 200 and "mrr" in called.json()["result"]["content"][0]["text"]
    denied = client.post("/mcp", headers={**headers, "Authorization": "Bearer wrong"}, json={"jsonrpc": "2.0", "id": 4, "method": "tools/list", "params": {}})
    assert denied.status_code == 401


def test_won_automation_creates_a_single_project(client):
    company = client.post("/api/companies", json={"name": "Idempotence SAS"}).json()
    deal = client.post("/api/deals", json={"title": "Rebond", "company_id": company["id"], "amount": 5000}).json()
    stages = client.get("/api/deals/board").json()["stages"]
    won = next(s for s in stages if s["is_won"])
    first = stages[0]
    for stage in (won, first, won):  # won, re-opened, won again
        assert client.post(f"/api/deals/{deal['id']}/move", json={"stage_id": stage["id"], "position": 0}).status_code == 200
    projects = client.get("/api/projects", params={"deal_id": deal["id"]}).json()
    assert projects["total"] == 1


def test_deleting_a_deal_detaches_its_records(client):
    deal = client.post("/api/deals", json={"title": "Éphémère"}).json()
    task = client.post("/api/tasks", json={"title": "Suivi", "deal_id": deal["id"]}).json()
    assert client.delete(f"/api/deals/{deal['id']}").status_code == 200
    assert client.get(f"/api/tasks/{task['id']}").json()["deal_id"] is None

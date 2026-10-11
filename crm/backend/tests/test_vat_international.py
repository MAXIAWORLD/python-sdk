"""VAT for foreign customers: invoice mentions, Factur-X categories (XSD-valid) and unknown countries."""

from __future__ import annotations

from prisme.db import session_scope
from prisme.models import Invoice
from prisme.services import einvoice


def _invoice_for(client, *, name: str, country: str, vat_number: str | None, nature: str, rate: float = 0) -> dict:
    company = client.post("/api/companies", json={"name": name, "address": "1 Main Street", "zip": "1000", "city": "Ville", "country": country, "vat_number": vat_number}).json()
    lines = [{"description": "Prestation", "quantity": 2, "unit": "jour", "unit_price": 700, "vat_rate": rate}]
    return client.post("/api/invoices", json={"company_id": company["id"], "lines": lines, "nature": nature}).json()


def _xml(invoice_id: int) -> str:
    with session_scope() as session:
        return einvoice.generate_xml(session, session.get(Invoice, invoice_id), check=True).decode()


def test_eu_services_reverse_charge(client):
    inv = _invoice_for(client, name="Berlin Digital GmbH", country="Allemagne", vat_number="DE123456789", nature="services")
    assert inv["vat_mention"].startswith("Autoliquidation")
    issued = client.post(f"/api/invoices/{inv['id']}/issue")
    assert issued.status_code == 200, issued.text
    xml = _xml(inv["id"])
    assert "<ram:CategoryCode>AE</ram:CategoryCode>" in xml and "VATEX-EU-AE" in xml


def test_eu_goods_intra_community_supply(client):
    inv = _invoice_for(client, name="Milano Hardware SRL", country="Italie", vat_number="IT12345678901", nature="goods")
    assert "262 ter I" in inv["vat_mention"]
    assert client.post(f"/api/invoices/{inv['id']}/issue").status_code == 200
    xml = _xml(inv["id"])
    assert "<ram:CategoryCode>K</ram:CategoryCode>" in xml
    assert "ShipToTradeParty" in xml and "<ram:CountryID>IT</ram:CountryID>" in xml


def test_non_eu_services_and_unknown_country(client):
    inv = _invoice_for(client, name="Tokyo Games KK", country="Japon", vat_number=None, nature="services")
    assert "259-1" in inv["vat_mention"]
    assert client.post(f"/api/invoices/{inv['id']}/issue").status_code == 200
    assert "<ram:CategoryCode>G</ram:CategoryCode>" in _xml(inv["id"])

    unknown = _invoice_for(client, name="Mystère SA", country="Narnia", vat_number=None, nature="services")
    checks = client.get(f"/api/invoices/{unknown['id']}/checks").json()
    assert any("Pays du client non reconnu" in e for e in checks["errors"])


def test_domestic_invoice_has_no_exemption_mention(client):
    inv = _invoice_for(client, name="Lyon Conseil SAS", country="France", vat_number="FR32123456782", nature="services", rate=20)
    assert not inv["vat_mention"]
    assert inv["tax_total"] == 280

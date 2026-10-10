"""PDF rendering (PDF/A-3B) of quotes, invoices and credit notes with French legal mentions."""

from __future__ import annotations

import base64
import io
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fpdf import FPDF, FontFace
from fpdf.enums import OutputIntentSubType, TableBordersLayout, XPos, YPos
from fpdf.output import PDFICCProfile

from ..config import settings as env
from .settings import get_section
from .totals import compute

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
ICC_PATH = Path(__import__("fpdf").__file__).parent / "data" / "color_profiles" / "sRGB2014.icc"

INK = (17, 20, 39)
MUTED = (99, 106, 128)
FAINT = (148, 153, 170)
LINE = (226, 229, 238)
SOFT = (246, 247, 251)

NATURE_LABEL = {"services": "Prestation de services", "goods": "Livraison de biens", "mixed": "Livraison de biens et prestation de services"}
METHOD_LABEL = {"transfer": "Virement", "card": "Carte bancaire", "crypto": "Crypto-actifs", "check": "Chèque", "cash": "Espèces", "stripe": "Stripe", "paypal": "PayPal", "direct_debit": "Prélèvement", "other": "Autre"}


# ---------------------------------------------------------------------------
# French formatting
# ---------------------------------------------------------------------------


def fr_number(value: float, decimals: int = 2) -> str:
    text = f"{abs(value):,.{decimals}f}".replace(",", " ").replace(".", ",")
    return ("-" if value < 0 else "") + text


def fr_money(value: float | None, currency: str = "EUR") -> str:
    symbol = {"EUR": "€", "USD": "$", "GBP": "£", "CHF": "CHF"}.get(currency or "EUR", currency)
    return f"{fr_number(value or 0)} {symbol}"


def fr_qty(value: float | None) -> str:
    value = value or 0
    if float(value).is_integer():
        return fr_number(value, 0)
    return fr_number(value, 2).rstrip("0").rstrip(",")


def fr_date(value: date | datetime | str | None) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        value = date.fromisoformat(value[:10])
    return value.strftime("%d/%m/%Y")


def _hex(color: str | None) -> tuple[int, int, int]:
    color = (color or "#5b6cff").lstrip("#")
    if len(color) != 6:
        color = "5b6cff"
    return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)


def _mix(rgb: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    """Blend a color with white (amount = share of the color)."""
    return tuple(int(255 - (255 - c) * amount) for c in rgb)  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class _Doc(FPDF):
    footer_lines: list[str]
    accent: tuple[int, int, int]

    def footer(self) -> None:  # noqa: D401 - fpdf hook
        self.set_y(-24)
        self.set_draw_color(*LINE)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(1.6)
        self.set_font("Inter", "", 6.6)
        self.set_text_color(*FAINT)
        for line in self.footer_lines:
            self.multi_cell(self.epw, 3.1, line, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(-8)
        self.set_font("Inter", "", 7)
        self.cell(0, 4, f"Page {self.page_no()}/{{nb}}", align="R")


def _new_doc(title: str, accent: tuple[int, int, int], footer_lines: list[str]) -> _Doc:
    pdf = _Doc(orientation="P", unit="mm", format="A4", enforce_compliance="PDFA_3B")
    pdf.accent = accent
    pdf.footer_lines = footer_lines
    pdf.set_margins(16, 14, 16)
    pdf.set_auto_page_break(auto=True, margin=30)
    pdf.add_font("Inter", "", str(FONT_DIR / "Inter_400Regular.ttf"))
    pdf.add_font("Inter", "B", str(FONT_DIR / "Inter_600SemiBold.ttf"))
    pdf.add_font("Inter", "I", str(FONT_DIR / "Inter_400Regular_Italic.ttf"))
    pdf.add_font("InterBold", "", str(FONT_DIR / "Inter_700Bold.ttf"))
    pdf.add_font("InterMedium", "", str(FONT_DIR / "Inter_500Medium.ttf"))
    pdf.add_output_intent(
        OutputIntentSubType.PDFA,
        "sRGB",
        "IEC 61966-2-1:1999",
        "http://www.color.org",
        PDFICCProfile(contents=ICC_PATH.read_bytes(), n=3, alternate="DeviceRGB"),
        "sRGB2014 (v2)",
    )
    pdf.set_title(title)
    pdf.set_creator("Prisme CRM")
    pdf.set_producer("Prisme CRM (fpdf2)")
    pdf.set_lang("fr-FR")
    pdf.alias_nb_pages()
    pdf.add_page()
    return pdf


def _logo_bytes(logo_url: str | None) -> bytes | None:
    if not logo_url:
        return None
    if logo_url.startswith("data:image"):
        try:
            return base64.b64decode(logo_url.split(",", 1)[1])
        except (ValueError, IndexError):
            return None
    marker = "/api/files/"
    if marker in logo_url:
        name = logo_url.split(marker, 1)[1].split("?")[0].split("/")[-1]
        path = env.uploads_dir / Path(name).name
        if path.exists():
            return path.read_bytes()
    return None


def _flatten_image(data: bytes) -> io.BytesIO:
    """PDF/A friendly image: drop alpha channel onto white."""
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="PNG")
    out.seek(0)
    return out


def _seller_lines(seller: dict[str, Any]) -> list[str]:
    lines = []
    if seller.get("address"):
        lines.append(seller["address"])
    city = " ".join(x for x in [seller.get("zip"), seller.get("city")] if x)
    if city:
        lines.append(city + ("" if (seller.get("country_code") or "FR") == "FR" else f" — {seller.get('country')}"))
    ids = []
    if seller.get("siren"):
        ids.append(f"SIREN {seller['siren']}")
    if seller.get("vat_number"):
        ids.append(f"TVA {seller['vat_number']}")
    if ids:
        lines.append(" · ".join(ids))
    contact = " · ".join(x for x in [seller.get("email"), seller.get("phone")] if x)
    if contact:
        lines.append(contact)
    return lines


def _buyer_lines(buyer: dict[str, Any]) -> list[str]:
    lines = []
    if buyer.get("contact_name"):
        lines.append(f"À l'attention de {buyer['contact_name']}")
    if buyer.get("address"):
        lines.append(buyer["address"])
    city = " ".join(x for x in [buyer.get("zip"), buyer.get("city")] if x)
    if city:
        lines.append(city)
    if buyer.get("country") and (buyer.get("country_code") or "FR") != "FR":
        lines.append(buyer["country"])
    ids = []
    if buyer.get("siren"):
        ids.append(f"SIREN {buyer['siren']}")
    if buyer.get("vat_number"):
        ids.append(f"TVA {buyer['vat_number']}")
    if ids:
        lines.append(" · ".join(ids))
    if buyer.get("delivery_address"):
        lines.append(f"Livraison : {buyer['delivery_address']}")
    return lines


def _legal_identity(seller: dict[str, Any]) -> str:
    parts = [seller.get("name") or ""]
    if seller.get("legal_form"):
        parts.append(seller["legal_form"] + (f" au capital de {seller['capital']} €" if seller.get("capital") else ""))
    address = ", ".join(x for x in [seller.get("address"), " ".join(y for y in [seller.get("zip"), seller.get("city")] if y)] if x)
    if address:
        parts.append(f"Siège : {address}")
    if seller.get("siren"):
        rcs = f"RCS {seller['rcs_city']} {seller['siren']}" if seller.get("rcs_city") else f"SIREN {seller['siren']}"
        parts.append(rcs)
    if seller.get("rm"):
        parts.append(f"RM {seller['rm']}")
    if seller.get("vat_number"):
        parts.append(f"TVA intracom. {seller['vat_number']}")
    if seller.get("ape"):
        parts.append(f"APE {seller['ape']}")
    return " — ".join(p for p in parts if p)


def _draw_header(pdf: _Doc, seller: dict[str, Any], doc_label: str, number: str, subtitle: list[str]) -> None:
    top = pdf.get_y()
    logo = _logo_bytes(seller.get("logo_url"))
    if logo:
        try:
            pdf.image(_flatten_image(logo), x=pdf.l_margin, y=top, h=14)
            pdf.set_y(top + 16)
        except Exception:  # noqa: BLE001 - a broken logo must not break the invoice
            logo = None
    if not logo:
        pdf.set_font("InterBold", "", 17)
        pdf.set_text_color(*pdf.accent)
        pdf.cell(110, 9, seller.get("trade_name") or seller.get("name") or "", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Inter", "", 8.2)
    pdf.set_text_color(*MUTED)
    for line in _seller_lines(seller):
        pdf.cell(110, 4.1, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    left_bottom = pdf.get_y()

    # Title block (right)
    x = pdf.w - pdf.r_margin - 72
    pdf.set_xy(x, top)
    pdf.set_font("InterBold", "", 20)
    pdf.set_text_color(*INK)
    pdf.cell(72, 10, doc_label, align="R", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_x(x)
    pdf.set_font("InterMedium", "", 10)
    pdf.set_text_color(*pdf.accent)
    pdf.cell(72, 6, number, align="R", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_font("Inter", "", 8.2)
    pdf.set_text_color(*MUTED)
    for line in subtitle:
        pdf.set_x(x)
        pdf.cell(72, 4.3, line, align="R", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_y(max(left_bottom, pdf.get_y()) + 6)


def _draw_parties(pdf: _Doc, buyer: dict[str, Any], buyer_title: str) -> None:
    y = pdf.get_y()
    box_w = 92
    x = pdf.w - pdf.r_margin - box_w
    lines = _buyer_lines(buyer)
    height = 12 + 4.3 * len(lines)
    pdf.set_fill_color(*SOFT)
    pdf.set_draw_color(*LINE)
    pdf.rect(x, y, box_w, height, style="DF", round_corners=True, corner_radius=3)
    pdf.set_xy(x + 5, y + 4)
    pdf.set_font("Inter", "B", 6.8)
    pdf.set_text_color(*FAINT)
    pdf.cell(box_w - 10, 3.5, buyer_title.upper(), new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_x(x + 5)
    pdf.set_font("Inter", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(box_w - 10, 5.5, buyer.get("name") or "—", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_font("Inter", "", 8.2)
    pdf.set_text_color(*MUTED)
    for line in lines:
        pdf.set_x(x + 5)
        pdf.cell(box_w - 10, 4.3, line, new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_y(y + height + 6)


def _draw_meta(pdf: _Doc, items: list[tuple[str, str]]) -> None:
    items = [(k, v) for k, v in items if v]
    if not items:
        return
    y = pdf.get_y()
    col_w = pdf.epw / len(items)
    for i, (label, value) in enumerate(items):
        x = pdf.l_margin + i * col_w
        pdf.set_xy(x, y)
        pdf.set_font("Inter", "B", 6.6)
        pdf.set_text_color(*FAINT)
        pdf.cell(col_w - 2, 3.6, label.upper(), new_x=XPos.LEFT, new_y=YPos.NEXT)
        pdf.set_x(x)
        pdf.set_font("InterMedium", "", 8.6)
        pdf.set_text_color(*INK)
        pdf.multi_cell(col_w - 3, 4.3, value, align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_y(y + 12)


def _draw_lines(pdf: _Doc, lines: list[dict[str, Any]], currency: str, show_discount: bool) -> None:
    head_fill = _mix(pdf.accent, 0.1)
    headings_style = FontFace(family="Inter", emphasis="BOLD", size_pt=7.2, color=_mix(pdf.accent, 0.95), fill_color=head_fill)
    widths = (78, 15, 17, 22, 13, 13, 26) if show_discount else (88, 15, 17, 24, 0, 13, 27)
    headers = ["Désignation", "Qté", "Unité", "PU HT", "Remise", "TVA", "Total HT"]
    cols = [i for i, w in enumerate(widths) if w]
    pdf.set_font("Inter", "", 8.2)
    pdf.set_text_color(*INK)
    pdf.set_draw_color(*LINE)
    with pdf.table(
        col_widths=[widths[i] for i in cols],
        text_align=[("LEFT" if i in (0, 2) else "RIGHT") for i in cols],
        headings_style=headings_style,
        borders_layout=TableBordersLayout.HORIZONTAL_LINES,
        line_height=4.6,
        padding=(2.2, 1.6, 2.2, 1.6),
        first_row_as_headings=True,
        repeat_headings=1,
        width=pdf.epw,
    ) as table:
        head = table.row()
        for i in cols:
            head.cell(headers[i])
        for line in lines:
            kind = line.get("type") or "item"
            row = table.row()
            if kind == "section":
                row.cell(line.get("description") or "", colspan=len(cols), style=FontFace(family="Inter", emphasis="BOLD", size_pt=8.6, color=INK, fill_color=SOFT))
                continue
            if kind == "text":
                row.cell(line.get("description") or "", colspan=len(cols), style=FontFace(family="Inter", emphasis="ITALICS", size_pt=7.8, color=MUTED))
                continue
            label = line.get("description") or ""
            if line.get("details"):
                label += "\n" + str(line["details"])
            values = {
                0: label,
                1: fr_qty(line.get("quantity")),
                2: line.get("unit") or "",
                3: fr_money(line.get("unit_price"), currency),
                4: f"{fr_number(line.get('discount') or 0, 0)} %" if line.get("discount") else "—",
                5: f"{fr_number(line.get('vat_rate') or 0, 1).replace(',0', '')} %",
                6: fr_money(line.get("total"), currency),
            }
            for i in cols:
                row.cell(values[i])
    pdf.ln(4)


def _draw_totals(pdf: _Doc, rows: list[tuple[str, str, bool]]) -> None:
    w_label, w_value = 52, 34
    x = pdf.w - pdf.r_margin - w_label - w_value
    if pdf.get_y() + 8 * len(rows) > pdf.h - 34:
        pdf.add_page()
    for label, value, strong in rows:
        pdf.set_x(x)
        if strong:
            y = pdf.get_y() + 1
            pdf.set_fill_color(*_mix(pdf.accent, 0.12))
            pdf.rect(x, y, w_label + w_value, 9, style="F", round_corners=True, corner_radius=2.4)
            pdf.set_xy(x, y + 1.2)
            pdf.set_font("InterBold", "", 10)
            pdf.set_text_color(*INK)
            pdf.cell(w_label, 6.6, "  " + label)
            pdf.set_text_color(*pdf.accent)
            pdf.cell(w_value - 2, 6.6, value, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2.4)
        else:
            pdf.set_font("Inter", "", 8.6)
            pdf.set_text_color(*MUTED)
            pdf.cell(w_label, 5.6, "  " + label)
            pdf.set_text_color(*INK)
            pdf.cell(w_value - 2, 5.6, value, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)


def _paragraph(pdf: _Doc, title: str | None, text: str | None, size: float = 7.8) -> None:
    if not text:
        return
    if pdf.get_y() > pdf.h - 45:
        pdf.add_page()
    if title:
        pdf.set_font("Inter", "B", 7)
        pdf.set_text_color(*FAINT)
        pdf.cell(0, 4, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Inter", "", size)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(0, 3.9, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2.5)


def _payment_box(pdf: _Doc, seller: dict[str, Any], reference: str, extra: str | None) -> None:
    rows = []
    if seller.get("iban"):
        rows.append(("IBAN", seller["iban"]))
    if seller.get("bic"):
        rows.append(("BIC", seller["bic"]))
    if seller.get("bank_name"):
        rows.append(("Banque", seller["bank_name"]))
    rows.append(("Référence à rappeler", reference))
    if pdf.get_y() + 10 + 4.6 * len(rows) > pdf.h - 32:
        pdf.add_page()
    y = pdf.get_y()
    height = 9 + 4.6 * len(rows) + (4.4 if extra else 0)
    pdf.set_draw_color(*_mix(pdf.accent, 0.35))
    pdf.set_fill_color(*_mix(pdf.accent, 0.05))
    pdf.rect(pdf.l_margin, y, 100, height, style="DF", round_corners=True, corner_radius=3)
    pdf.set_xy(pdf.l_margin + 4, y + 3)
    pdf.set_font("Inter", "B", 7)
    pdf.set_text_color(*pdf.accent)
    pdf.cell(90, 4, "RÈGLEMENT", new_x=XPos.LEFT, new_y=YPos.NEXT)
    for label, value in rows:
        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("Inter", "", 7.8)
        pdf.set_text_color(*MUTED)
        pdf.cell(34, 4.6, label)
        pdf.set_font("InterMedium", "", 7.8)
        pdf.set_text_color(*INK)
        pdf.cell(58, 4.6, value, new_x=XPos.LEFT, new_y=YPos.NEXT)
    if extra:
        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("Inter", "", 7.4)
        pdf.set_text_color(*MUTED)
        pdf.cell(92, 4.4, extra)
    pdf.set_y(y + height + 5)


def render_invoice(session: Any, invoice: Any) -> bytes:
    from ..models import Invoice, Payment
    from sqlmodel import select

    from .invoicing import buyer_snapshot, seller_snapshot

    company = get_section(session, "company")
    branding = get_section(session, "branding")
    accent = _hex(branding.get("accent"))
    seller = invoice.seller if invoice.locked and invoice.seller else seller_snapshot(session)
    buyer = invoice.buyer if invoice.locked and invoice.buyer else buyer_snapshot(session, invoice.company_id, invoice.contact_id)
    currency = invoice.currency or "EUR"
    is_credit = invoice.kind == "credit_note"
    label = "AVOIR" if is_credit else ("FACTURE D'ACOMPTE" if invoice.kind == "deposit" else "FACTURE")
    number = invoice.number if invoice.locked else "BROUILLON — non émise"
    footer = []
    if not is_credit:
        footer.append(
            (invoice.late_penalty_rate or "")
            + f" Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : {fr_money(invoice.recovery_fee or 40, currency)} (art. D441-5 du Code de commerce). "
            + (invoice.early_payment_discount or "")
        )
    footer.append(_legal_identity(seller))
    if seller.get("mediator"):
        footer.append(f"Médiateur de la consommation : {seller['mediator']}")
    if seller.get("insurance"):
        footer.append(f"Assurance professionnelle : {seller['insurance']}")
    pdf = _new_doc(f"{label.title()} {invoice.number or ''}".strip(), accent, footer)
    pdf.set_author(seller.get("name") or "")
    pdf.set_subject(f"{label.title()} {invoice.number}")

    subtitle = [f"Émise le {fr_date(invoice.issue_date)}"]
    if invoice.due_date and not is_credit:
        subtitle.append(f"Échéance : {fr_date(invoice.due_date)}")
    _draw_header(pdf, seller, label, number, subtitle)
    _draw_parties(pdf, buyer, "Facturé à")

    meta: list[tuple[str, str]] = []
    if invoice.service_date:
        period = fr_date(invoice.service_date)
        if invoice.service_period_end:
            period = f"du {fr_date(invoice.service_date)} au {fr_date(invoice.service_period_end)}"
        meta.append(("Date de la prestation" if invoice.nature != "goods" else "Date de livraison", period))
    meta.append(("Nature de l'opération", NATURE_LABEL.get(invoice.nature or "services", "Prestation de services")))
    if invoice.payment_terms and not is_credit:
        meta.append(("Conditions", invoice.payment_terms))
    if is_credit and invoice.credit_for_id:
        original = session.get(Invoice, invoice.credit_for_id)
        if original:
            meta.append(("Facture d'origine", f"{original.number} du {fr_date(original.issue_date)}"))
    _draw_meta(pdf, meta)

    if invoice.title:
        pdf.set_font("Inter", "B", 10)
        pdf.set_text_color(*INK)
        pdf.multi_cell(0, 5.5, invoice.title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2)

    result = compute(invoice.lines or [], invoice.discount or 0, franchise=(seller.get("vat_regime") == "franchise"))
    show_discount = any((line.get("discount") or 0) for line in result["lines"] if (line.get("type") or "item") == "item")
    _draw_lines(pdf, result["lines"], currency, show_discount)

    rows: list[tuple[str, str, bool]] = [("Total HT", fr_money(result["lines_total"], currency), False)]
    if invoice.discount:
        rows.append((f"Remise globale ({fr_number(invoice.discount, 0)} %)", fr_money(-result["discount_amount"], currency), False))
        rows.append(("Total HT net", fr_money(invoice.subtotal, currency), False))
    for b in result["vat_breakdown"]:
        rate_label = f"{fr_number(b['rate'], 1).replace(',0', '')} %"
        rows.append((f"TVA {rate_label} sur {fr_money(b['base'], currency)}", fr_money(b["amount"], currency), False))
    rows.append(("Total TTC" if not is_credit else "Total de l'avoir TTC", fr_money(invoice.total, currency), True))
    if not is_credit and (invoice.amount_paid or invoice.credited_amount):
        if invoice.amount_paid:
            rows.append(("Déjà réglé", fr_money(-invoice.amount_paid, currency), False))
        if invoice.credited_amount:
            rows.append(("Avoir(s) imputé(s)", fr_money(-invoice.credited_amount, currency), False))
        rows.append(("Net à payer", fr_money(invoice.balance_due, currency), True))
    _draw_totals(pdf, rows)

    mentions = []
    if invoice.vat_mention or seller.get("vat_regime") == "franchise":
        mentions.append(invoice.vat_mention or "TVA non applicable, art. 293 B du CGI")
    if invoice.vat_on_debits or company.get("vat_on_debits"):
        mentions.append("Option pour le paiement de la TVA d'après les débits.")
    if mentions:
        _paragraph(pdf, None, "\n".join(mentions), 8)

    if not is_credit and invoice.status != "paid":
        _payment_box(pdf, seller, invoice.number or "—", f"À régler avant le {fr_date(invoice.due_date)}" if invoice.due_date else None)

    if invoice.locked and not is_credit:
        payments = session.exec(select(Payment).where(Payment.invoice_id == invoice.id).order_by(Payment.date)).all()
        if payments:
            text = "\n".join(
                f"{fr_date(p.date)} — {fr_money(p.amount, currency)} ({METHOD_LABEL.get(p.method, p.method)}{' · ' + p.reference if p.reference else ''})"
                for p in payments
            )
            _paragraph(pdf, "Paiements reçus", text)

    _paragraph(pdf, "Notes", invoice.notes)
    _paragraph(pdf, "Conditions", invoice.terms)
    if invoice.locked and invoice.hash:
        _paragraph(pdf, None, f"Empreinte d'intégrité (SHA-256) : {invoice.hash}", 6.4)
    return bytes(pdf.output())


def render_quote(session: Any, quote: Any) -> bytes:
    from .invoicing import buyer_snapshot, seller_snapshot

    branding = get_section(session, "branding")
    accent = _hex(branding.get("accent"))
    seller = quote.seller or seller_snapshot(session)
    buyer = quote.buyer or buyer_snapshot(session, quote.company_id, quote.contact_id)
    currency = quote.currency or "EUR"
    footer = [_legal_identity(seller)]
    if seller.get("mediator"):
        footer.append(f"Médiateur de la consommation : {seller['mediator']}")
    if seller.get("insurance"):
        footer.append(f"Assurance professionnelle : {seller['insurance']}")
    pdf = _new_doc(f"Devis {quote.number}", accent, footer)
    pdf.set_author(seller.get("name") or "")
    pdf.set_subject(f"Devis {quote.number}")
    _draw_header(
        pdf,
        seller,
        "DEVIS",
        quote.number or "",
        [f"Établi le {fr_date(quote.issue_date)}", f"Valable jusqu'au {fr_date(quote.valid_until)}"],
    )
    _draw_parties(pdf, buyer, "Destinataire")
    _draw_meta(
        pdf,
        [
            ("Nature de l'opération", NATURE_LABEL.get(quote.nature or "services", "Prestation de services")),
            ("Validité", fr_date(quote.valid_until)),
            ("Acompte", f"{fr_number(quote.deposit_percent, 0)} % à la commande" if quote.deposit_percent else ""),
        ],
    )
    if quote.title:
        pdf.set_font("Inter", "B", 10)
        pdf.set_text_color(*INK)
        pdf.multi_cell(0, 5.5, quote.title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2)
    result = compute(quote.lines or [], quote.discount or 0, franchise=(seller.get("vat_regime") == "franchise"))
    show_discount = any((line.get("discount") or 0) for line in result["lines"] if (line.get("type") or "item") == "item")
    _draw_lines(pdf, result["lines"], currency, show_discount)
    rows: list[tuple[str, str, bool]] = [("Total HT", fr_money(result["lines_total"], currency), False)]
    if quote.discount:
        rows.append((f"Remise globale ({fr_number(quote.discount, 0)} %)", fr_money(-result["discount_amount"], currency), False))
        rows.append(("Total HT net", fr_money(result["subtotal"], currency), False))
    for b in result["vat_breakdown"]:
        rate_label = f"{fr_number(b['rate'], 1).replace(',0', '')} %"
        rows.append((f"TVA {rate_label} sur {fr_money(b['base'], currency)}", fr_money(b["amount"], currency), False))
    rows.append(("Total TTC", fr_money(result["total"], currency), True))
    if quote.deposit_percent:
        rows.append((f"Acompte à la commande ({fr_number(quote.deposit_percent, 0)} %)", fr_money(result["total"] * quote.deposit_percent / 100, currency), False))
    _draw_totals(pdf, rows)
    if seller.get("vat_regime") == "franchise":
        _paragraph(pdf, None, "TVA non applicable, art. 293 B du CGI", 8)
    _paragraph(pdf, "Notes", quote.notes)
    _paragraph(pdf, "Conditions", quote.terms)

    # Signature block ("Bon pour accord")
    if pdf.get_y() > pdf.h - 75:
        pdf.add_page()
    y = pdf.get_y() + 2
    x = pdf.w - pdf.r_margin - 92
    pdf.set_draw_color(*LINE)
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(x, y, 92, 42, style="D", round_corners=True, corner_radius=3)
    pdf.set_xy(x + 5, y + 4)
    pdf.set_font("Inter", "B", 7)
    pdf.set_text_color(*FAINT)
    pdf.cell(80, 4, "BON POUR ACCORD", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_x(x + 5)
    pdf.set_font("Inter", "", 7.6)
    pdf.set_text_color(*MUTED)
    if quote.accepted_at and quote.signed_by:
        pdf.cell(80, 4.2, f"Accepté électroniquement le {quote.accepted_at.strftime('%d/%m/%Y à %H:%M')} UTC", new_x=XPos.LEFT, new_y=YPos.NEXT)
        pdf.set_x(x + 5)
        pdf.cell(80, 4.2, f"par {quote.signed_by}" + (f" ({quote.signer_email})" if quote.signer_email else ""), new_x=XPos.LEFT, new_y=YPos.NEXT)
        if quote.signature and quote.signature.startswith("data:image"):
            try:
                pdf.image(_flatten_image(base64.b64decode(quote.signature.split(",", 1)[1])), x=x + 5, y=pdf.get_y() + 1, h=16)
            except Exception:  # noqa: BLE001
                pass
        pdf.set_xy(x + 5, y + 36)
        pdf.set_font("Inter", "", 5.6)
        pdf.cell(82, 3, f"Preuve SHA-256 : {(quote.signature_hash or '')[:48]}…")
    else:
        pdf.cell(80, 4.2, "Date, nom, qualité du signataire et signature", new_x=XPos.LEFT, new_y=YPos.NEXT)
        pdf.set_x(x + 5)
        pdf.cell(80, 4.2, "précédée de la mention « Bon pour accord »", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_y(y + 48)
    return bytes(pdf.output())

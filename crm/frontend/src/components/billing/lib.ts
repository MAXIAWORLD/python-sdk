/**
 * Billing helpers shared by quotes and invoices:
 * client-side mirror of `services/totals.py`, French decimal input, statuses, links and identities.
 */
import { addDays } from "date-fns";
import { toast } from "sonner";
import { UNITS } from "@/lib/constants";
import { date, daysFromNow, isoDate, money, toDate } from "@/lib/format";
import type { Invoice, LineItem, Party, Quote } from "@/lib/types";
import { uid } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Settings (GET /settings)                                                   */
/* -------------------------------------------------------------------------- */

export interface CompanyIdentity extends Party {
  legal_name?: string;
  rcs_city?: string;
  ape?: string;
  website?: string;
  logo_url?: string;
  vat_regime?: string;
  vat_on_debits?: boolean;
  mediator?: string;
  insurance?: string;
}

export interface BillingDefaults {
  quote_prefix: string;
  invoice_prefix: string;
  credit_prefix: string;
  default_vat: number;
  payment_days: number;
  quote_validity_days: number;
  default_nature: string;
  late_penalty_rate: string;
  early_payment_discount: string;
  recovery_fee: number;
  payment_methods: string;
  quote_terms?: string | null;
  invoice_terms?: string | null;
}

export interface SettingsResponse {
  company?: CompanyIdentity;
  billing?: BillingDefaults;
  general?: { public_url?: string };
  /** Only returned to administrators. */
  email?: { smtp_host?: string };
}

export const FALLBACK_BILLING: BillingDefaults = {
  quote_prefix: "DEV",
  invoice_prefix: "FA",
  credit_prefix: "AV",
  default_vat: 20,
  payment_days: 30,
  quote_validity_days: 30,
  default_nature: "services",
  late_penalty_rate: "",
  early_payment_discount: "",
  recovery_fee: 40,
  payment_methods: "Virement bancaire",
};

/* -------------------------------------------------------------------------- */
/* Totals — same rules as services/totals.py                                  */
/* -------------------------------------------------------------------------- */

export type LineKind = NonNullable<LineItem["type"]>;

export interface TotalsOptions {
  franchise?: boolean;
  defaultVat?: number;
}

export interface VatRow {
  rate: number;
  base: number;
  amount: number;
}

export interface DocTotals {
  lines: LineItem[];
  linesTotal: number;
  discountAmount: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  breakdown: VatRow[];
}

/** Round to the cent, half away from zero (Decimal ROUND_HALF_UP), without float noise. */
export function round2(value: number): number {
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  return (Math.sign(value) * Math.round(scaled)) / 100 || 0;
}

function num(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const lineKind = (line: LineItem): LineKind => line.type ?? "item";

export function normalizeLine(raw: LineItem, { franchise = false, defaultVat = 20 }: TotalsOptions = {}): LineItem {
  const type = lineKind(raw);
  const base: LineItem = { id: raw.id ?? uid(), type, description: raw.description ?? "", details: raw.details || null };
  if (type !== "item") return base;
  const quantity = num(raw.quantity, 1);
  const unit_price = num(raw.unit_price, 0);
  const discount = num(raw.discount, 0);
  const vat_rate = franchise ? 0 : num(raw.vat_rate, defaultVat);
  return { ...base, product_id: raw.product_id ?? null, quantity, unit: raw.unit || "unité", unit_price, discount, vat_rate, total: round2(quantity * unit_price * (1 - discount / 100)) };
}

export function computeTotals(lines: LineItem[], discount = 0, opts: TotalsOptions = {}): DocTotals {
  const normalized = lines.map((l) => normalizeLine(l, opts));
  const factor = 1 - (discount || 0) / 100;
  const bases = new Map<number, number>();
  let gross = 0;
  for (const line of normalized) {
    if (line.type !== "item") continue;
    const rate = line.vat_rate ?? 0;
    bases.set(rate, (bases.get(rate) ?? 0) + (line.total ?? 0));
    gross += line.total ?? 0;
  }
  const breakdown = [...bases.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, sum]) => {
      const base = round2(sum * factor);
      return { rate, base, amount: round2((base * rate) / 100) };
    });
  const subtotal = round2(breakdown.reduce((s, b) => s + b.base, 0));
  const taxTotal = round2(breakdown.reduce((s, b) => s + b.amount, 0));
  const linesTotal = round2(gross);
  return { lines: normalized, linesTotal, discountAmount: round2(linesTotal - subtotal), subtotal, taxTotal, total: round2(subtotal + taxTotal), breakdown };
}

/** Sum of the item lines that follow each section (until the next section). */
export function sectionSubtotals(lines: LineItem[], opts: TotalsOptions = {}) {
  const out: Record<string, number> = {};
  let current: string | null = null;
  for (const line of lines) {
    const kind = lineKind(line);
    if (kind === "section") {
      current = line.id ?? null;
      if (current) out[current] = 0;
    } else if (kind === "item" && current) {
      out[current] = round2(out[current] + (normalizeLine(line, opts).total ?? 0));
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                      */
/* -------------------------------------------------------------------------- */

export function blankLine(type: LineKind, defaultVat = 20): LineItem {
  if (type !== "item") return { id: uid(), type, description: "" };
  return { id: uid(), type: "item", product_id: null, description: "", details: null, quantity: 1, unit: "unité", unit_price: 0, discount: 0, vat_rate: defaultVat };
}

export interface ProductLike {
  id: number;
  name?: unknown;
  description?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  vat_rate?: unknown;
}

export function lineFromProduct(row: ProductLike, defaultVat = 20): Partial<LineItem> {
  return {
    product_id: row.id,
    description: String(row.name ?? ""),
    details: typeof row.description === "string" && row.description.trim() ? row.description : null,
    unit: String(row.unit ?? "unité"),
    unit_price: num(row.unit_price, 0),
    vat_rate: num(row.vat_rate, defaultVat),
  };
}

/** Lines ready for the API (ids kept, derived totals dropped — the server recomputes them). */
export function linesPayload(lines: LineItem[]): LineItem[] {
  return lines.map((line) => {
    const rest = { ...line };
    delete rest.total;
    return rest;
  });
}

export function withIds(lines: LineItem[] | null | undefined): LineItem[] {
  return (lines ?? []).map((l) => (l.id ? l : { ...l, id: uid() }));
}

/** Stable representation used to detect unsaved changes. */
export function comparableLines(lines: LineItem[]) {
  return lines.map((l) =>
    lineKind(l) === "item"
      ? [l.id, "item", l.product_id ?? null, l.description ?? "", l.details || null, num(l.quantity, 1), l.unit || "unité", num(l.unit_price, 0), num(l.discount, 0), l.vat_rate ?? null]
      : [l.id, l.type, l.description ?? "", l.details || null],
  );
}

export function unitOptions(current?: string | null) {
  return current && !UNITS.includes(current) ? [...UNITS, current] : UNITS;
}

/* -------------------------------------------------------------------------- */
/* French numbers                                                             */
/* -------------------------------------------------------------------------- */

export function parseDecimal(text: string): number | null {
  const s = text.replace(/[\s  ]/g, "").replace(/,/g, ".");
  if (!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const decimalFormats = new Map<string, Intl.NumberFormat>();
export function formatDecimal(value: number, maxDecimals = 2, minDecimals = 0) {
  const key = `${maxDecimals}-${minDecimals}`;
  let f = decimalFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: maxDecimals, minimumFractionDigits: Math.min(minDecimals, maxDecimals) });
    decimalFormats.set(key, f);
  }
  return f.format(value);
}

export const vatLabel = (rate: number) => `${formatDecimal(rate, 2)} %`;

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

export const todayIso = () => isoDate();

export function inDays(days: number, from?: string | null) {
  return isoDate(addDays(toDate(from) ?? new Date(), days));
}

export function daysBetween(from?: string | null, to?: string | null) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

/** A sent quote whose validity date has passed is shown as expired. */
export function quoteDisplayStatus(q: Pick<Quote, "status" | "valid_until">) {
  if ((q.status === "sent" || q.status === "viewed") && q.valid_until && (daysFromNow(q.valid_until) ?? 0) < 0) return "expired";
  return q.status;
}

export const OUTSTANDING_STATUSES = ["issued", "sent", "partial", "overdue"];

export function isOutstanding(inv: Pick<Invoice, "locked" | "kind" | "status">) {
  return inv.locked && inv.kind !== "credit_note" && OUTSTANDING_STATUSES.includes(inv.status);
}

/** Days past the due date for an unpaid issued invoice (0 when not late). */
export function lateDays(inv: Pick<Invoice, "locked" | "kind" | "status" | "due_date">) {
  if (!isOutstanding(inv) || !inv.due_date) return 0;
  return Math.max(0, -(daysFromNow(inv.due_date) ?? 0));
}

/* -------------------------------------------------------------------------- */
/* Links, clipboard, hashes                                                   */
/* -------------------------------------------------------------------------- */

export const quotePublicUrl = (token: string) => `${window.location.origin}/p/quote/${token}`;
export const invoicePublicUrl = (token: string) => `${window.location.origin}/p/invoice/${token}`;

export async function copyText(text: string, message = "Copié dans le presse-papiers", description?: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast.success(message, description ? { description } : undefined);
}

export function shortHash(hash?: string | null, head = 10, tail = 6) {
  if (!hash) return "—";
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/* -------------------------------------------------------------------------- */
/* Identities                                                                 */
/* -------------------------------------------------------------------------- */

export function formatSiren(value?: string | null) {
  const d = (value ?? "").replace(/\s/g, "");
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 14) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return d;
}

export function addressLines(p?: { address?: string | null; zip?: string | null; city?: string | null; country?: string | null } | null) {
  if (!p) return [];
  const city = [p.zip, p.city].filter(Boolean).join(" ");
  return [p.address, city, p.country && !/^france$/i.test(String(p.country)) ? p.country : null].filter((x): x is string => !!x && !!String(x).trim());
}

export function sellerMissing(company?: CompanyIdentity | null) {
  if (!company) return [];
  const missing: string[] = [];
  if (!(company.legal_name || company.name)) missing.push("raison sociale");
  if (!(company.address && company.zip && company.city)) missing.push("adresse");
  if (!company.siren) missing.push("SIREN");
  if (company.vat_regime !== "franchise" && !company.vat_number) missing.push("n° de TVA");
  return missing;
}

/* -------------------------------------------------------------------------- */
/* Default emails (same wording as the server templates)                      */
/* -------------------------------------------------------------------------- */

export interface SendDefaults {
  to: string;
  subject: string;
  body: string;
}

interface MailContext {
  to?: string | null;
  firstName?: string | null;
  sender: string;
  company?: string | null;
  publicUrl: string;
}

const hello = (firstName?: string | null) => `Bonjour${firstName ? ` ${firstName}` : ""},`;
const fr = (d?: string | null) => date(d, "dd/MM/yyyy");

export function quoteEmail(q: Quote, ctx: MailContext): SendDefaults {
  const link = `${ctx.publicUrl}/p/quote/${q.public_token}`;
  return {
    to: ctx.to ?? "",
    subject: [`Devis ${q.number}`, ctx.company].filter(Boolean).join(" — "),
    body: [
      hello(ctx.firstName),
      `Veuillez trouver ci-joint notre devis **${q.number}**${q.title ? ` — ${q.title}` : ""}, d'un montant de **${money(q.total, q.currency)} TTC**.`,
      `Vous pouvez le consulter et le signer en ligne en quelques secondes : [Voir et signer le devis](${link})`,
      q.valid_until ? `Ce devis est valable jusqu'au ${fr(q.valid_until)}.` : null,
      `Bien cordialement,\n${ctx.sender}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function invoiceEmail(inv: Invoice, ctx: MailContext): SendDefaults {
  const label = inv.kind === "credit_note" ? "avoir" : "facture";
  const link = `${ctx.publicUrl}/p/invoice/${inv.public_token}`;
  const due = inv.due_date && inv.kind !== "credit_note" ? `, payable avant le **${fr(inv.due_date)}**` : "";
  return {
    to: ctx.to ?? "",
    subject: [`${label === "avoir" ? "Avoir" : "Facture"} ${inv.number}`, ctx.company].filter(Boolean).join(" — "),
    body: [
      hello(ctx.firstName),
      `Veuillez trouver ci-joint notre ${label} **${inv.number}** d'un montant de **${money(inv.total, inv.currency)} TTC**${due}.`,
      `Vous pouvez aussi ${label === "avoir" ? "le" : "la"} consulter en ligne : [Voir ${label === "avoir" ? "l'avoir" : "la facture"}](${link})`,
      `Bien cordialement,\n${ctx.sender}`,
    ].join("\n\n"),
  };
}

export function reminderEmail(inv: Invoice, ctx: MailContext): SendDefaults {
  const link = `${ctx.publicUrl}/p/invoice/${inv.public_token}`;
  const late = lateDays(inv);
  return {
    to: ctx.to ?? "",
    subject: `Rappel — facture ${inv.number}`,
    body: [
      hello(ctx.firstName),
      `Sauf erreur de notre part, la facture **${inv.number}** d'un montant de **${money(inv.balance_due, inv.currency)}** ${late > 0 ? `est échue depuis ${late} jour${late > 1 ? "s" : ""} (échéance du ${fr(inv.due_date)})` : `arrive à échéance le ${fr(inv.due_date)}`}.`,
      `Nous vous remercions de bien vouloir procéder à son règlement. [Consulter la facture](${link})`,
      late > 0 ? "Pour rappel, tout retard de paiement entraîne l'application de pénalités de retard ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce)." : null,
      "Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.",
      `Bien cordialement,\n${ctx.sender}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

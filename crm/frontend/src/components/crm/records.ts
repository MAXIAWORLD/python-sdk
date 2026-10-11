import { daysFromNow, isoDate } from "@/lib/format";
import { SCHEMAS } from "@/lib/schemas";
import type { Invoice, Subscription } from "@/lib/types";

/** Only the form fields of a record — what an edit dialog should start from (no expansions, no read-only keys). */
export function schemaValues(resource: string, record: object): Record<string, unknown> {
  const row = record as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of SCHEMAS[resource]?.fields ?? []) if (f.name in row) out[f.name] = row[f.name];
  return out;
}

/** Whole days elapsed since a date (never negative). */
export function daysSince(value?: string | null) {
  const d = daysFromNow(value);
  return d === null ? null : Math.max(0, -d);
}

/** Query string for the quote / invoice editors (`/quotes/new?deal_id=…`). */
export function newDocPath(base: "/quotes/new" | "/invoices/new", params: Record<string, number | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function isOverdue(inv: Invoice, today = isoDate()) {
  if (!inv.locked || inv.kind === "credit_note" || inv.balance_due <= 0.005) return false;
  return inv.status === "overdue" || (!!inv.due_date && inv.due_date < today);
}

export interface BillingSummary {
  /** CA HT des factures émises depuis le début du mois, il y a 11 mois (même fenêtre que le tableau de bord). */
  revenue12m: number;
  invoicedTtc: number;
  paid: number;
  outstanding: number;
  outstandingCount: number;
  overdue: number;
  overdueCount: number;
  issuedCount: number;
}

/** Billing figures of a client from its invoices (issued invoices only; credit notes reduce the totals). */
export function billingSummary(invoices: Invoice[]): BillingSummary {
  const now = new Date();
  const since = isoDate(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const today = isoDate(now);
  const out: BillingSummary = { revenue12m: 0, invoicedTtc: 0, paid: 0, outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, issuedCount: 0 };
  for (const inv of invoices) {
    if (!inv.locked) continue;
    out.issuedCount++;
    out.invoicedTtc += inv.total;
    out.paid += inv.amount_paid;
    if (inv.issue_date >= since) out.revenue12m += inv.subtotal;
    if (inv.kind !== "credit_note" && inv.balance_due > 0.005) {
      out.outstanding += inv.balance_due;
      out.outstandingCount++;
      if (isOverdue(inv, today)) {
        out.overdue += inv.balance_due;
        out.overdueCount++;
      }
    }
  }
  return out;
}

export function totalMrr(subscriptions: Subscription[]) {
  return subscriptions.reduce((s, x) => s + (x.mrr || 0), 0);
}

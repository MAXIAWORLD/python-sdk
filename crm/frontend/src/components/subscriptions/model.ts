import { addDays } from "date-fns";
import type { Option } from "@/lib/constants";
import { isoDate, toDate } from "@/lib/format";
import type { Ref, Subscription } from "@/lib/types";

/** Shape of `GET /subscriptions/metrics` (services/subscriptions.py). */
export interface MrrPoint {
  month: string;
  mrr: number;
  new: number;
  expansion: number;
  reactivation: number;
  contraction: number;
  churn: number;
}

export interface PlanBreakdown {
  plan: string;
  mrr: number;
  count: number;
}

export interface SubscriptionMetrics {
  mrr: number;
  arr: number;
  active_subscriptions: number;
  customers: number;
  trialing: number;
  arpa: number;
  churn_rate: number;
  logo_churn_rate: number;
  nrr: number;
  series: MrrPoint[];
  plans: PlanBreakdown[];
  renewals: { id: number; plan: string; company_id: number; date: string; amount: number }[];
}

/** One row of the MRR movement log (`/subscription-changes`). */
export interface MrrChange {
  id: number;
  created_at: string;
  subscription_id: number;
  company_id?: number | null;
  date: string;
  kind: "new" | "expansion" | "contraction" | "churn" | "reactivation";
  mrr_delta: number;
  mrr_after: number;
  subscription?: Ref | null;
  company?: Ref | null;
}

export const MOVEMENT_KINDS: Option[] = [
  { value: "new", label: "Nouveau", tone: "blue" },
  { value: "expansion", label: "Expansion", tone: "green" },
  { value: "reactivation", label: "Réactivation", tone: "teal" },
  { value: "contraction", label: "Contraction", tone: "orange" },
  { value: "churn", label: "Churn", tone: "red" },
];

export const INTERVAL_MONTHS: Record<string, number> = { month: 1, quarter: 3, year: 12 };

/** "mois", "trimestre", "an" — used after a slash: « 149 € / mois ». */
export const INTERVAL_UNIT: Record<string, string> = { month: "mois", quarter: "trimestre", year: "an" };

export const CANCEL_REASONS = ["Prix trop élevé", "Passage à un concurrent", "Fonctionnalités insuffisantes", "Besoin couvert / projet terminé", "Restrictions budgétaires", "Insatisfaction (qualité, support)", "Fusion, rachat ou cessation", "Autre"];

/** Billed amount for one period, excl. VAT (price × quantity − discount). */
export function periodAmount(sub: Pick<Subscription, "amount" | "quantity" | "discount">) {
  return round2((sub.amount || 0) * (sub.quantity || 1) * (1 - (sub.discount || 0) / 100));
}

/** Monthly value whatever the status (MRR once the subscription is billable). */
export function monthlyValue(sub: Pick<Subscription, "amount" | "quantity" | "discount" | "interval">) {
  return round2(periodAmount(sub) / (INTERVAL_MONTHS[sub.interval] ?? 1));
}

/** Same rule as the backend `Subscription.mrr` property. */
export function mrrOf(sub: Pick<Subscription, "amount" | "quantity" | "discount" | "interval" | "status">) {
  return sub.status === "active" || sub.status === "past_due" ? monthlyValue(sub) : 0;
}

export function isBillable(status: string) {
  return status === "active" || status === "past_due";
}

/** Next invoice period, mirroring `invoice_subscription` in api/sales.py. */
export function nextInvoicePeriod(sub: Pick<Subscription, "current_period_end" | "interval">) {
  const start = toDate(sub.current_period_end) ?? new Date();
  const days = 30 * (INTERVAL_MONTHS[sub.interval] ?? 1);
  const end = addDays(start, days - 1);
  return { start: isoDate(start), end: isoDate(end), next: isoDate(addDays(end, 1)) };
}

/** Current billing period (the backend rolls periods of 30 days × months). */
export function currentPeriod(sub: Pick<Subscription, "current_period_end" | "interval">) {
  const end = toDate(sub.current_period_end);
  if (!end) return null;
  const start = addDays(end, -30 * (INTERVAL_MONTHS[sub.interval] ?? 1));
  const total = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(Date.now() - start.getTime(), 0), total);
  return { start, end, progress: total > 0 ? (elapsed / total) * 100 : 0 };
}

export function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Signed euro amount: « +149 € », « −1 490 € ». */
export function signed(v: number, format: (n: number) => string) {
  if (Math.abs(v) < 0.005) return format(0);
  return `${v > 0 ? "+" : "−"}${format(Math.abs(v))}`;
}

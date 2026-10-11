import { useQuery } from "@tanstack/react-query";
import { addDays, addMonths, addYears, differenceInCalendarDays, format, startOfMonth, startOfYear } from "date-fns";
import { fr } from "date-fns/locale";
import { api } from "@/lib/api";
import { useList, type Params } from "@/lib/hooks";
import { isoDate } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Period                                                                     */
/* -------------------------------------------------------------------------- */

export type PeriodKey = "30d" | "quarter" | "12m" | "ytd";

export const PERIODS: { value: PeriodKey; label: string; long: string }[] = [
  { value: "30d", label: "30 j", long: "30 derniers jours" },
  { value: "quarter", label: "Trimestre", long: "3 derniers mois" },
  { value: "12m", label: "12 mois", long: "12 derniers mois" },
  { value: "ytd", label: "Année en cours", long: "Depuis le 1er janvier" },
];

export interface Period {
  key: PeriodKey;
  long: string;
  start: Date;
  /** Exclusive upper bound (tomorrow). */
  end: Date;
  startIso: string;
  endIso: string;
  prevStartIso: string;
  prevEndIso: string;
  /** Number of months requested from /subscriptions/metrics. */
  months: number;
  granularity: "day" | "week" | "month";
}

export function computePeriod(key: PeriodKey, now = new Date()): Period {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = addDays(today, 1);
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;
  if (key === "ytd") {
    start = startOfYear(today);
    prevStart = addYears(start, -1);
    prevEnd = addYears(end, -1);
  } else {
    start = key === "30d" ? addDays(today, -29) : startOfMonth(addMonths(today, key === "quarter" ? -2 : -11));
    const days = differenceInCalendarDays(end, start);
    prevStart = addDays(start, -days);
    prevEnd = start;
  }
  return {
    key,
    long: PERIODS.find((p) => p.value === key)?.long ?? "",
    start,
    end,
    startIso: isoDate(start),
    endIso: isoDate(end),
    prevStartIso: isoDate(prevStart),
    prevEndIso: isoDate(prevEnd),
    months: key === "12m" ? 12 : key === "ytd" ? Math.max(3, today.getMonth() + 1) : 3,
    granularity: key === "30d" ? "day" : key === "quarter" ? "week" : "month",
  };
}

export function periodRangeLabel(p: Period) {
  const last = addDays(p.end, -1);
  const sameYear = p.start.getFullYear() === last.getFullYear();
  return `du ${format(p.start, sameYear ? "d MMM" : "d MMM yyyy", { locale: fr })} au ${format(last, "d MMM yyyy", { locale: fr })}`;
}

/** True when an ISO date / date-time falls inside the period (local calendar days). */
export function inPeriod(p: Period, value?: string | null) {
  if (!value) return false;
  const day = value.length <= 10 ? value : isoDate(new Date(value));
  return day >= p.startIso && day < p.endIso;
}

export function monthInPeriod(p: Period, month: string) {
  return month >= p.startIso.slice(0, 7) && month <= isoDate(addDays(p.end, -1)).slice(0, 7);
}

/** Groups dated values into day / week / month buckets covering the whole period. */
export function bucketize<T>(p: Period, rows: T[], dateOf: (row: T) => string | null | undefined, valueOf: (row: T) => number = () => 1) {
  const keyOf = (d: Date) => {
    if (p.granularity === "day") return isoDate(d);
    if (p.granularity === "month") return isoDate(d).slice(0, 7);
    const monday = addDays(d, -((d.getDay() + 6) % 7));
    return isoDate(monday);
  };
  const labelOf = (key: string) => {
    if (p.granularity === "month") return format(new Date(`${key}-01T12:00:00`), "MMM yy", { locale: fr });
    const d = new Date(`${key}T12:00:00`);
    return p.granularity === "week" ? `sem. ${format(d, "d MMM", { locale: fr })}` : format(d, "d MMM", { locale: fr });
  };
  const buckets = new Map<string, number>();
  for (let d = new Date(p.start); d < p.end; d = p.granularity === "month" ? addMonths(startOfMonth(d), 1) : addDays(d, p.granularity === "week" ? 7 : 1)) buckets.set(keyOf(d), 0);
  for (const row of rows) {
    const raw = dateOf(row);
    if (!raw || !inPeriod(p, raw)) continue;
    const k = keyOf(new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw));
    buckets.set(k, (buckets.get(k) ?? 0) + valueOf(row));
  }
  return Array.from(buckets, ([key, value]) => ({ key, label: labelOf(key), value }));
}

/* -------------------------------------------------------------------------- */
/* API shapes                                                                 */
/* -------------------------------------------------------------------------- */

export interface SaasMetrics {
  mrr: number;
  arr: number;
  active_subscriptions: number;
  customers: number;
  trialing: number;
  arpa: number;
  churn_rate: number;
  logo_churn_rate: number;
  nrr: number;
  series: { month: string; mrr: number; new: number; expansion: number; reactivation: number; contraction: number; churn: number }[];
  plans: { plan: string; mrr: number; count: number }[];
  renewals: { id: number; plan: string; company_id: number; date: string; amount: number }[];
}

export interface ReportsData {
  period: { start: string; end: string };
  revenue_total: number;
  revenue_series: { month: string; label: string; revenue: number; cash: number }[];
  revenue_by_product: { name: string; revenue: number }[];
  sales_by_owner: { owner_id: number | null; name: string; won: number; lost: number; open: number; won_value: number; win_rate: number | null }[];
  funnel: { stage: string; label: string; count: number }[];
  win_loss: { month: string; won: number; lost: number; won_value: number }[];
  time: { total_hours: number; billable_hours: number; billable_ratio: number | null; billable_value: number; by_project: { project: string; hours: number }[] };
  support: { tickets: number; avg_first_response_h: number | null; avg_resolution_h: number | null; csat: number | null };
  saas: SaasMetrics;
}

export function useReports(start: string, end: string) {
  return useQuery({ queryKey: ["reports", start, end], queryFn: () => api.get<ReportsData>("/reports", { start, end }), staleTime: 60_000 });
}

/**
 * Rows of a resource for a period. Filtering on date-time columns currently fails server side,
 * so those are fetched newest first and filtered here (`clientField`).
 */
export function usePeriodRows<T>(resource: string, p: Period, opts: { serverField?: string; clientField?: keyof T & string; params?: Params; enabled?: boolean }) {
  const params: Params = { ...(opts.params ?? {}), limit: 1000 };
  if (opts.serverField) {
    params[`${opts.serverField}__gte`] = p.startIso;
    params[`${opts.serverField}__lt`] = p.endIso;
  }
  if (opts.clientField) params.sort = `-${opts.clientField}`;
  const query = useList<T>(resource, params, { enabled: opts.enabled ?? true });
  const all = query.data?.items ?? [];
  const items = opts.clientField ? all.filter((r) => inPeriod(p, r[opts.clientField as keyof T] as string | null | undefined)) : all;
  const oldest = opts.clientField && all.length ? (all[all.length - 1][opts.clientField as keyof T] as string | null | undefined) : null;
  const truncated = !!query.data && query.data.total > all.length && (!opts.clientField || inPeriod(p, oldest));
  return { items, loading: query.isLoading, truncated };
}

/** Relative change in %, or null when the comparison is meaningless (no or negligible base). */
export function pct(current: number, previous: number | null | undefined) {
  if (!previous) return null;
  const value = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return Math.abs(value) > 999 ? null : value;
}

export function hours(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value >= 48) return `${(Math.round((value / 24) * 10) / 10).toLocaleString("fr-FR")} j`;
  return `${(Math.round(value * 10) / 10).toLocaleString("fr-FR")} h`;
}

import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const moneyFmt = new Map<string, Intl.NumberFormat>();

export function money(value: number | null | undefined, currency = "EUR", opts: { compact?: boolean; decimals?: number } = {}) {
  const v = Number(value ?? 0);
  const key = `${currency}-${opts.compact}-${opts.decimals}`;
  let f = moneyFmt.get(key);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.decimals ?? (opts.compact ? 1 : 2),
      minimumFractionDigits: opts.compact ? 0 : (opts.decimals ?? 2),
    });
    moneyFmt.set(key, f);
  }
  return f.format(v);
}

export function moneyShort(value: number | null | undefined, currency = "EUR") {
  const v = Math.abs(Number(value ?? 0));
  if (v >= 10_000) return money(value, currency, { compact: true });
  return money(value, currency, { decimals: v >= 1000 || Number.isInteger(v) ? 0 : 2 });
}

export function number(value: number | null | undefined, decimals = 0) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value ?? 0));
}

export function percent(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return `${number(value, decimals)} %`;
}

export function toDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return value.length <= 10 ? parseISO(value) : new Date(value);
}

export function date(value?: string | Date | null, pattern = "d MMM yyyy") {
  const d = toDate(value);
  if (!d) return "—";
  return format(d, pattern, { locale: fr });
}

export function dateShort(value?: string | Date | null) {
  return date(value, "dd/MM/yyyy");
}

export function dateTime(value?: string | Date | null) {
  return date(value, "d MMM yyyy 'à' HH:mm");
}

export function time(value?: string | Date | null) {
  return date(value, "HH:mm");
}

export function relative(value?: string | Date | null) {
  const d = toDate(value);
  if (!d) return "—";
  const diff = Math.abs(Date.now() - d.getTime());
  if (diff < 60_000) return "à l'instant";
  return formatDistanceToNowStrict(d, { locale: fr, addSuffix: true });
}

export function dayLabel(value?: string | Date | null) {
  const d = toDate(value);
  if (!d) return "—";
  if (isToday(d)) return "Aujourd'hui";
  if (isTomorrow(d)) return "Demain";
  if (isYesterday(d)) return "Hier";
  const days = differenceInCalendarDays(d, new Date());
  if (days > 0 && days < 7) return format(d, "EEEE", { locale: fr });
  return format(d, "d MMM", { locale: fr });
}

export function daysFromNow(value?: string | Date | null) {
  const d = toDate(value);
  if (!d) return null;
  return differenceInCalendarDays(d, new Date());
}

export function duration(minutes?: number | null) {
  const m = Math.round(Number(minutes ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

export function fileSize(bytes?: number | null) {
  const b = Number(bytes ?? 0);
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${number(b / 1024, 0)} Ko`;
  return `${number(b / 1024 / 1024, 1)} Mo`;
}

export function isoDate(d: Date = new Date()) {
  return format(d, "yyyy-MM-dd");
}

export function plural(n: number, singular: string, pluralForm?: string) {
  return `${number(n)} ${n > 1 ? (pluralForm ?? singular + "s") : singular}`;
}

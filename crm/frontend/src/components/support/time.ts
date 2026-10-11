import { useState } from "react";
import { useInterval } from "@/lib/hooks";

/** Current timestamp, refreshed every `ms` milliseconds (live countdowns, relative times). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}

/** Compact French duration from milliseconds: « 45 min », « 3 h 20 », « 2 j 4 h ». */
export function span(ms: number) {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return hours < 10 && rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours && days < 7 ? `${days} j ${restHours} h` : `${days} j`;
}

/** Duration expressed in hours (e.g. an average) → « 1 h 30 », « 2 j 3 h ». */
export function hoursLabel(hours: number) {
  return span(hours * 3_600_000);
}

export function ms(value?: string | null) {
  return value ? new Date(value).getTime() : NaN;
}

/** Compact elapsed time for dense tables: « à l'instant », « 12 min », « 3 h », « 2 j », « 12 sept. ». */
export function ago(value: string | null | undefined, now: number) {
  const t = ms(value);
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, now - t);
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} j`;
  return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Short timestamp for lists: « 14:32 » today, « lun. » this week, « 12 sept. » this year, « 12/09/2025 » otherwise. */
export function shortStamp(value: string | null | undefined, now: number) {
  if (!value) return "";
  const d = new Date(value);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const days = (today.getTime() - d.getTime()) / 86_400_000;
  if (days >= 0 && days < 6) return d.toLocaleDateString("fr-FR", { weekday: "short" });
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return d.toLocaleDateString("fr-FR");
}

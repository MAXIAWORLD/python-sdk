/** Shared helpers for the Delivery module (projects, tasks, time tracking, calendar). */

import { addDays, addMinutes, differenceInCalendarDays, endOfWeek, startOfWeek } from "date-fns";
import { EVENT_TYPES, findOption, type Tone } from "@/lib/constants";
import { isoDate, number, toDate } from "@/lib/format";
import type { CalendarEvent, Ref, Task, TimeEntry } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

export const WEEK_OPTIONS = { weekStartsOn: 1 as const };

export function weekStart(d: Date) {
  return startOfWeek(d, WEEK_OPTIONS);
}

export function weekEnd(d: Date) {
  return endOfWeek(d, WEEK_OPTIONS);
}

export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Next half hour from now (default start of a new event). */
export function nextHalfHour(from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  return addMinutes(d, m === 0 || m === 30 ? 30 : 30 - (m % 30));
}

/** Time entries as returned by the API (company and invoice references are expanded too). */
export type TimeEntryRow = TimeEntry & { company?: Ref | null; invoice?: Ref | null };

/* -------------------------------------------------------------------------- */
/* Durations                                                                  */
/* -------------------------------------------------------------------------- */

/** "55,5 h", "320 h" */
export function hours(value: number | null | undefined) {
  const v = Number(value ?? 0);
  return `${number(v, Number.isInteger(Math.round(v * 10) / 10) ? 0 : 1)} h`;
}

/** Compact duration for grids: "2:30", "0:45". */
export function clock(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Parse a free-form duration typed by a human: "1:30", "1h30", "1,5", "45 min", "90m". Returns minutes. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = s.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d{1,3})h(\d{1,2})?(?:m|min)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = s.match(/^(\d{1,4})(?:m|mn|min)$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d{1,3}(?:[.,]\d{1,2})?)h?$/);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 60);
  return null;
}

/** Elapsed seconds → "01:23:45". */
export function stopwatch(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export const BOARD_STATUSES = ["todo", "in_progress", "review", "done"] as const;

export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const PRIORITY_COLOR: Record<string, string> = { urgent: "#ff453a", high: "#ff9f0a", medium: "#0a84ff", low: "#8e8e93" };

export function isOpen(task: Pick<Task, "status">) {
  return task.status !== "done" && task.status !== "cancelled";
}

export function isLate(task: Pick<Task, "status" | "due_date">) {
  return isOpen(task) && !!task.due_date && task.due_date < isoDate(new Date());
}

export function isDueToday(task: Pick<Task, "due_date">) {
  return !!task.due_date && task.due_date === isoDate(new Date());
}

export function checklistStats(task: Pick<Task, "checklist">) {
  const items = task.checklist ?? [];
  return { done: items.filter((i) => i.done).length, total: items.length };
}

export type FocusGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

/** On Saturday and Sunday the current week is over: the "week" bucket becomes next week. */
function isWeekend(d: Date) {
  return d.getDay() === 0 || d.getDay() === 6;
}

export function focusGroups(now = new Date()): { key: FocusGroup; label: string }[] {
  return [
    { key: "overdue", label: "En retard" },
    { key: "today", label: "Aujourd'hui" },
    { key: "tomorrow", label: "Demain" },
    { key: "week", label: isWeekend(now) ? "Semaine prochaine" : "Cette semaine" },
    { key: "later", label: "Plus tard" },
    { key: "none", label: "Sans échéance" },
  ];
}

export function focusGroup(task: Pick<Task, "due_date">, now = new Date()): FocusGroup {
  const due = toDate(task.due_date);
  if (!due) return "none";
  const diff = differenceInCalendarDays(due, now);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (due <= weekEnd(isWeekend(now) ? addDays(now, 7) : now)) return "week";
  return "later";
}

/** Sort inside a group: due date, then time, then priority, then manual position. */
export function compareTasks(a: Task, b: Task) {
  return (
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    (a.due_time ?? "99").localeCompare(b.due_time ?? "99") ||
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    a.position - b.position
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

/** Apple-like system colours for each tone (used for event accents). */
export const TONE_HEX: Record<Tone, string> = {
  gray: "#8e8e93",
  blue: "#0a84ff",
  indigo: "#5e5ce6",
  violet: "#bf5af2",
  pink: "#ff375f",
  red: "#ff453a",
  orange: "#ff9f0a",
  yellow: "#ffd60a",
  green: "#30d158",
  teal: "#30d5c8",
  cyan: "#64d2ff",
};

export function eventTypeColor(type?: string | null) {
  return TONE_HEX[findOption(EVENT_TYPES, type)?.tone ?? "gray"];
}

export function eventColor(event: Pick<CalendarEvent, "type" | "color">) {
  return event.color || eventTypeColor(event.type);
}

/** Tinted translucent background for a colour (works in light and dark mode). */
export function tint(color: string, percent = 16) {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`;
}

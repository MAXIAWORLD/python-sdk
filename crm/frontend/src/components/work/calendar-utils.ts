import { addDays, addMonths, addWeeks, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import type { CalendarEvent, Task } from "@/lib/types";
import { weekEnd, weekStart } from "./work-utils";

export type CalendarView = "month" | "week" | "agenda";

/** Something shown on the calendar: an event, or a task with a due date (all-day). */
export type CalendarItem = { kind: "event"; id: string; event: CalendarEvent; start: Date; end: Date; allDay: boolean } | { kind: "task"; id: string; task: Task; start: Date; end: Date; allDay: true };

export function eventItem(event: CalendarEvent): CalendarItem {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at || event.start_at);
  return { kind: "event", id: `e${event.id}`, event, start, end: end > start ? end : new Date(start.getTime() + 30 * 60_000), allDay: event.all_day };
}

export function taskItem(task: Task): CalendarItem {
  const start = startOfDay(new Date(`${task.due_date}T00:00:00`));
  return { kind: "task", id: `t${task.id}`, task, start, end: addDays(start, 1), allDay: true };
}

/** Visible range for a view, anchored on a date. `end` is exclusive. */
export function viewRange(view: CalendarView, anchor: Date) {
  if (view === "week") {
    const start = weekStart(anchor);
    return { start, end: addDays(start, 7) };
  }
  if (view === "agenda") {
    const start = startOfMonth(anchor);
    return { start, end: addDays(endOfMonth(anchor), 1) };
  }
  const start = weekStart(startOfMonth(anchor));
  return { start, end: addDays(startOfDay(weekEnd(endOfMonth(anchor))), 1) };
}

export function shiftAnchor(view: CalendarView, anchor: Date, step: 1 | -1) {
  return view === "week" ? addWeeks(anchor, step) : addMonths(anchor, step);
}

/** Items touching a given calendar day. */
export function itemsOnDay(items: CalendarItem[], day: Date) {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();
  return items.filter((it) => it.start.getTime() < end && it.end.getTime() > start);
}

export interface Placed {
  item: CalendarItem;
  top: number; // minutes from midnight (clipped to the day)
  bottom: number;
  col: number;
  cols: number;
}

/**
 * Side-by-side layout of the timed items of one day: overlapping items are
 * grouped into clusters and spread over as many columns as needed.
 */
export function layoutDay(items: CalendarItem[], day: Date): Placed[] {
  const dayStart = startOfDay(day).getTime();
  const spans = items
    .filter((it) => !it.allDay)
    .map((item) => ({
      item,
      top: Math.max(0, (item.start.getTime() - dayStart) / 60_000),
      bottom: Math.min(24 * 60, (item.end.getTime() - dayStart) / 60_000),
    }))
    .filter((s) => s.bottom > s.top)
    .map((s) => ({ ...s, bottom: Math.max(s.bottom, s.top + 20) }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const out: Placed[] = [];
  let cluster: (Omit<Placed, "cols">)[] = [];
  let columns: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = columns.length;
    for (const c of cluster) out.push({ ...c, cols });
    cluster = [];
    columns = [];
    clusterEnd = -1;
  };
  for (const s of spans) {
    if (cluster.length && s.top >= clusterEnd) flush();
    let col = columns.findIndex((end) => end <= s.top);
    if (col === -1) {
      col = columns.length;
      columns.push(s.bottom);
    } else columns[col] = s.bottom;
    cluster.push({ ...s, col });
    clusterEnd = Math.max(clusterEnd, s.bottom);
  }
  if (cluster.length) flush();
  return out;
}

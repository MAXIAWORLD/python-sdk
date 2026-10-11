import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { CalendarEvent, Paginated, TimeEntry } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

/** Shape of GET /projects/{id}/stats. */
export interface ProjectStats {
  tasks_total: number;
  tasks_by_status: Record<string, number>;
  progress: number;
  hours: number;
  billable_hours: number;
  unbilled_hours: number;
  unbilled_value: number;
  budget_hours: number;
  budget_amount: number;
  budget_used_pct: number | null;
  invoiced: number;
  cost: number;
  margin: number | null;
  hours_by_user: { name: string; hours: number }[];
}

/** Stats are keyed under "projects" so any task / time mutation refreshes them. */
export function useProjectStats(projectId?: number | null) {
  return useQuery({
    queryKey: ["projects", "stats", projectId],
    queryFn: () => api.get<ProjectStats>(`/projects/${projectId}/stats`),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Timer                                                                      */
/* -------------------------------------------------------------------------- */

export interface TimerStart {
  project_id?: number | null;
  task_id?: number | null;
  description?: string | null;
  billable?: boolean;
}

/** The running stopwatch of the current user (same cache key as the top bar chip). */
export function useTimer() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const query = useQuery({ queryKey: ["timer"], queryFn: () => api.get<{ entry: TimeEntry | null }>("/timer"), refetchInterval: 60_000 });
  const start = useMutation({
    mutationFn: (body: TimerStart) => api.post<{ entry: TimeEntry }>("/timer/start", body),
    onSuccess: (res) => {
      qc.setQueryData(["timer"], { entry: res.entry });
      invalidate("timer", "time-entries", "projects");
    },
    onError: toastError,
  });
  const stop = useMutation({
    mutationFn: (body: { description?: string | null }) => api.post<{ entry: TimeEntry }>("/timer/stop", body),
    onSuccess: () => {
      qc.setQueryData(["timer"], { entry: null });
      invalidate("timer", "time-entries", "projects");
    },
    onError: toastError,
  });
  return { entry: query.data?.entry ?? null, isLoading: query.isLoading, start, stop };
}

/** Seconds elapsed since an ISO timestamp, ticking every second. */
export function useElapsed(startedAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
}

/** Current time, refreshed every `ms` (calendar "now" line…). */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* -------------------------------------------------------------------------- */
/* Calendar events                                                            */
/* -------------------------------------------------------------------------- */

/*
 * The generic list endpoint currently answers 500 on datetime filters
 * (`start_at__gte`…): the UTCDateTime column type exposes no python type, so the
 * raw string reaches the database driver. Until it is fixed we fall back — once
 * per session — to loading the most recent events and filtering them here.
 */
let datetimeFiltersBroken = false;

function overlaps(event: CalendarEvent, start: Date, end: Date) {
  const s = new Date(event.start_at).getTime();
  const e = new Date(event.end_at || event.start_at).getTime();
  return s < end.getTime() && Math.max(e, s + 1) > start.getTime();
}

async function fetchEvents(start: Date, end: Date, params: Record<string, string | number | undefined>) {
  if (!datetimeFiltersBroken) {
    try {
      const res = await api.get<Paginated<CalendarEvent>>("/events", { ...params, start_at__gte: start.toISOString(), start_at__lt: end.toISOString(), sort: "start_at", limit: 500 });
      return res.items;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status < 500) throw err;
      datetimeFiltersBroken = true;
    }
  }
  const res = await api.get<Paginated<CalendarEvent>>("/events", { ...params, sort: "-start_at", limit: 1000 });
  return res.items.filter((ev) => overlaps(ev, start, end)).sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function useCalendarEvents(start: Date, end: Date, params: Record<string, string | number | undefined> = {}) {
  return useQuery({
    queryKey: ["events", "range", start.toISOString(), end.toISOString(), params],
    queryFn: () => fetchEvents(start, end, params),
    placeholderData: (prev) => prev,
  });
}

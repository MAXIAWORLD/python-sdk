import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "./api";
import type { Paginated } from "./types";

export type Params = Record<string, string | number | boolean | null | undefined>;

export const keys = {
  list: (resource: string, params?: Params) => [resource, "list", params ?? {}] as const,
  item: (resource: string, id?: number | string | null) => [resource, "item", id] as const,
  all: (resource: string) => [resource] as const,
};

export function useList<T>(resource: string, params?: Params, options?: Partial<UseQueryOptions<Paginated<T>>>) {
  return useQuery<Paginated<T>>({
    queryKey: keys.list(resource, params),
    queryFn: () => api.get<Paginated<T>>(`/${resource}`, params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useItem<T>(resource: string, id?: number | string | null, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: keys.item(resource, id),
    queryFn: () => api.get<T>(`/${resource}/${id}`),
    enabled: id !== undefined && id !== null && id !== "",
    ...options,
  });
}

export function useApi<T>(key: readonly unknown[], path: string, params?: Params, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: [...key, params ?? {}], queryFn: () => api.get<T>(path, params), ...options });
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.errors?.length) return `${err.message}\n• ${err.errors.join("\n• ")}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Une erreur est survenue.";
}

export function toastError(err: unknown) {
  const msg = errorMessage(err);
  const [title, ...rest] = msg.split("\n");
  toast.error(title, rest.length ? { description: rest.join("\n") } : undefined);
}

/** Invalidate a resource and the cross-cutting views that aggregate it. */
export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (...resources: string[]) => {
      for (const r of resources) qc.invalidateQueries({ queryKey: [r] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
    [qc],
  );
}

const RELATED: Record<string, string[]> = {
  deals: ["deals-board", "companies", "contacts"],
  quotes: ["deals", "invoices"],
  invoices: ["quotes", "payments", "projects"],
  subscriptions: ["subscription-metrics", "subscription-changes"],
  tasks: ["projects"],
  "time-entries": ["projects", "timer"],
  tickets: ["ticket-messages"],
  "ticket-messages": ["tickets"],
  contacts: ["companies"],
  companies: ["contacts"],
};

export function useCreate<T = unknown>(resource: string, opts: { silent?: boolean; message?: string } = {}) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<T>(`/${resource}`, data),
    onSuccess: () => {
      invalidate(resource, ...(RELATED[resource] ?? []));
      if (!opts.silent) toast.success(opts.message ?? "Créé avec succès");
    },
    onError: toastError,
  });
}

export function useUpdate<T = unknown>(resource: string, opts: { silent?: boolean; message?: string } = {}) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.patch<T>(`/${resource}/${id}`, data),
    onSuccess: () => {
      invalidate(resource, ...(RELATED[resource] ?? []));
      if (!opts.silent) toast.success(opts.message ?? "Modifications enregistrées");
    },
    onError: toastError,
  });
}

export function useRemove(resource: string, opts: { silent?: boolean; message?: string } = {}) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/${resource}/${id}`),
    onSuccess: () => {
      invalidate(resource, ...(RELATED[resource] ?? []));
      if (!opts.silent) toast.success(opts.message ?? "Supprimé");
    },
    onError: toastError,
  });
}

/** Generic POST action (e.g. /invoices/12/issue) with invalidation. */
export function useAction<T = unknown, V = Record<string, unknown> | void>(path: string | ((vars: V) => string), invalidates: string[] = [], successMessage?: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: V) => api.post<T>(typeof path === "function" ? path(vars) : path, (vars as unknown) ?? {}),
    onSuccess: () => {
      invalidate(...invalidates);
      if (successMessage) toast.success(successMessage);
    },
    onError: toastError,
  });
}

export function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Live updates: re-fetch queries when the server broadcasts a change. */
export function useRealtime(onNotification?: (n: { title: string; body?: string; link?: string; kind?: string }) => void) {
  const qc = useQueryClient();
  const cb = useRef(onNotification);
  cb.current = onNotification;
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const flush = () => {
      for (const r of pending) qc.invalidateQueries({ queryKey: [r] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      pending.clear();
    };
    const entityToResource: Record<string, string> = {
      contact: "contacts", company: "companies", deal: "deals", quote: "quotes", invoice: "invoices", subscription: "subscriptions",
      project: "projects", task: "tasks", time_entry: "time-entries", event: "events", ticket: "tickets", ticket_message: "ticket-messages",
      activity: "activities", campaign: "campaigns", form: "forms", automation: "automations", product: "products", kb_article: "kb-articles",
    };
    const connect = () => {
      es = new EventSource("/api/stream");
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "event") {
            const r = entityToResource[msg.entity];
            if (r) pending.add(r);
            if (msg.entity === "deal") pending.add("deals-board");
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, 400);
          } else if (msg.type === "notification") {
            qc.invalidateQueries({ queryKey: ["notifications"] });
            cb.current?.(msg);
          }
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        es?.close();
        setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);
}

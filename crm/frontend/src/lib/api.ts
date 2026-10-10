import { downloadBlob } from "./utils";

/** Thin fetch wrapper for the Prisme API (cookie session + CSRF header). */

export class ApiError extends Error {
  status: number;
  detail: unknown;
  errors?: string[];
  warnings?: string[];
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
    if (detail && typeof detail === "object") {
      const d = detail as { errors?: string[]; warnings?: string[] };
      this.errors = d.errors;
      this.warnings = d.warnings;
    }
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function qs(params?: Query) {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function parseError(res: Response) {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  const b = body as { message?: string; detail?: unknown } | null;
  let message = (b && (b.message || (typeof b.detail === "string" ? b.detail : null))) || res.statusText || "Erreur";
  if (Array.isArray(b?.detail)) {
    message = (b!.detail as { msg?: string }[]).map((d) => d.msg).join(" ; ");
  }
  return new ApiError(res.status, String(message), body);
}

export async function request<T = unknown>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "prisme", Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin", ...init });
  if (res.status === 401 && !path.startsWith("/auth/")) onUnauthorized?.();
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}

export const api = {
  get: <T = unknown>(path: string, params?: Query) => request<T>("GET", path + qs(params)),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  put: <T = unknown>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  delete: <T = unknown>(path: string) => request<T>("DELETE", path),
  blob: (path: string, params?: Query) => request<Blob>("GET", path + qs(params)),
};

/** POST that returns a Server-Sent Events stream of JSON objects. */
export async function streamSSE(path: string, body: unknown, onEvent: (event: Record<string, unknown>) => void, signal?: AbortSignal) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "prisme", Accept: "text/event-stream" },
    body: JSON.stringify(body ?? {}),
    credentials: "same-origin",
    signal,
  });
  if (!res.ok || !res.body) throw await parseError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {
            /* ignore malformed line */
          }
        }
      }
    }
  }
}

export function fileUrl(path: string) {
  return path.startsWith("/api") ? path : `/api${path}`;
}

/** Download a file served by the API (CSV/PDF/JSON exports) under the given name. */
export async function download(path: string, filename: string, params?: Query) {
  const blob = await api.blob(path, params);
  downloadBlob(blob, filename);
}

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { FALLBACK_BILLING, type SettingsResponse } from "./lib";

/** Company identity + billing defaults (GET /settings), cached for the session. */
export function useBillingSettings() {
  const query = useQuery({ queryKey: ["billing-settings"], queryFn: () => api.get<SettingsResponse>("/settings"), staleTime: 5 * 60_000 });
  const data = query.data;
  return useMemo(() => {
    const company = data?.company ?? {};
    return {
      ready: !!data || query.isError,
      company,
      billing: { ...FALLBACK_BILLING, ...(data?.billing ?? {}) },
      publicUrl: (data?.general?.public_url || window.location.origin).replace(/\/$/, ""),
      franchise: company.vat_regime === "franchise",
      /** null when unknown (non-admin users do not receive the email settings). */
      smtpReady: data?.email ? Boolean(data.email.smtp_host) : null,
    };
  }, [data, query.isError]);
}

export type BillingContext = ReturnType<typeof useBillingSettings>;

/**
 * Protect unsaved edits: browser reload/close prompt and a confirmation before
 * following an in-app link while the document has pending changes.
 */
export function useLeaveGuard(dirty: boolean) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      e.preventDefault();
      confirm({
        title: "Quitter sans enregistrer ?",
        description: "Vos dernières modifications de ce document seront perdues.",
        confirmLabel: "Quitter sans enregistrer",
        cancelLabel: "Rester",
        danger: true,
      }).then((ok) => {
        if (ok) {
          dirtyRef.current = false;
          navigate(url.pathname + url.search + url.hash);
        }
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [confirm, navigate]);
}

/** ⌘S / Ctrl+S saves the document. */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const ref = useRef(onSave);
  ref.current = onSave;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

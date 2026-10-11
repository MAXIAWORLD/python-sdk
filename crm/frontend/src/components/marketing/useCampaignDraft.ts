import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { keys, toastError, useApi } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";
import type { EmailOrg } from "./EmailPreview";

/* -------------------------------------------------------------------------- */
/* Settings used by the marketing screens                                     */
/* -------------------------------------------------------------------------- */

export interface MarketingSettings {
  company?: { name?: string; legal_name?: string; address?: string; zip?: string; city?: string; siren?: string; email?: string };
  branding?: { accent?: string; app_name?: string };
  /** Only returned to administrators. */
  email?: { smtp_host?: string; from_email?: string; from_name?: string; smtp_user?: string };
  rgpd?: { privacy_url?: string; dpo_email?: string; controller_name?: string; form_notice?: string; require_explicit_consent?: boolean };
}

export function useMarketingSettings() {
  return useApi<MarketingSettings>(["settings", "marketing"], "/settings", undefined, { staleTime: 5 * 60_000 });
}

export function emailOrg(s?: MarketingSettings | null): EmailOrg {
  const c = s?.company ?? {};
  const name = c.name || s?.branding?.app_name || "Prisme";
  const address = [c.address, c.zip, c.city].filter(Boolean).join(" ");
  return {
    name,
    legal: [c.legal_name || c.name, address, c.siren ? `SIREN ${c.siren}` : null].filter(Boolean).join(" · "),
    accent: s?.branding?.accent || "#5b6cff",
    privacyUrl: s?.rgpd?.privacy_url || null,
  };
}

/** Sender used when the campaign does not override it (settings › emails). */
export function defaultSender(s?: MarketingSettings | null) {
  return {
    name: s?.email?.from_name || s?.company?.name || s?.branding?.app_name || "",
    email: s?.email?.from_email || s?.email?.smtp_user || "",
  };
}

/** null = unknown (non-admin users cannot read the email settings). */
export function smtpConfigured(s?: MarketingSettings | null): boolean | null {
  if (!s?.email) return null;
  return !!(s.email.smtp_host && (s.email.from_email || s.email.smtp_user));
}

/* -------------------------------------------------------------------------- */
/* Draft with debounced autosave                                              */
/* -------------------------------------------------------------------------- */

export interface CampaignDraft {
  name: string;
  subject: string;
  preheader: string;
  body: string;
  from_name: string;
  from_email: string;
  segment_id: number | null;
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function toDraft(c: Campaign): CampaignDraft {
  return { name: c.name, subject: c.subject ?? "", preheader: c.preheader ?? "", body: c.body ?? "", from_name: c.from_name ?? "", from_email: c.from_email ?? "", segment_id: c.segment_id ?? null };
}

export const isEditable = (c?: Campaign | null) => !!c && c.status !== "sending" && c.status !== "sent";

/**
 * Local copy of the editable fields, saved automatically 900 ms after the last change
 * (only the name once the campaign has been sent — the API refuses other changes).
 */
export function useCampaignDraft(campaign?: Campaign) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const latest = useRef<CampaignDraft | null>(null);
  const campaignRef = useRef<Campaign | undefined>(campaign);

  // Reset when another campaign is loaded (never when the same one is refetched).
  if (campaign && loadedId !== campaign.id) {
    setLoadedId(campaign.id);
    setDraft(toDraft(campaign));
    setState("idle");
  }

  useEffect(() => {
    latest.current = draft;
    campaignRef.current = campaign;
  });

  const patch = useCallback((p: Partial<CampaignDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    version.current += 1;
    setState("dirty");
  }, []);

  const save = useCallback(async () => {
    const c = campaignRef.current;
    const d = latest.current;
    if (!c || !d || version.current === savedVersion.current) return true;
    const v = version.current;
    setState("saving");
    try {
      const payload = isEditable(c)
        ? { name: d.name.trim() || c.name, subject: d.subject || null, preheader: d.preheader || null, body: d.body || null, from_name: d.from_name.trim() || null, from_email: d.from_email.trim() || null, segment_id: d.segment_id }
        : { name: d.name.trim() || c.name };
      const updated = await api.patch<Campaign>(`/campaigns/${c.id}`, payload);
      savedVersion.current = Math.max(savedVersion.current, v);
      qc.setQueryData(keys.item("campaigns", c.id), updated);
      qc.invalidateQueries({ queryKey: ["campaigns", "list"] });
      setSavedAt(new Date());
      setState(version.current === v ? "saved" : "dirty");
      return true;
    } catch (e) {
      setState("error");
      toastError(e);
      return false;
    }
  }, [qc]);

  useEffect(() => {
    if (state !== "dirty") return;
    const t = setTimeout(() => void save(), 900);
    return () => clearTimeout(t);
  }, [draft, state, save]);

  // Never lose a change: flush on unmount, warn before closing the tab.
  useEffect(() => () => void save(), [save]);
  useEffect(() => {
    if (state !== "dirty" && state !== "saving") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  /** Forget pending changes (e.g. the campaign is being deleted). */
  const discard = useCallback(() => {
    savedVersion.current = version.current;
    setState("idle");
  }, []);

  return { draft, patch, save, discard, state, savedAt };
}

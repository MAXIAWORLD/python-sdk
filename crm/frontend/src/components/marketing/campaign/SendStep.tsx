import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarClock, CalendarX2, Rocket, Send, ShieldCheck, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { KeyValue, Panel } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { dateTime, number } from "@/lib/format";
import { keys, toastError, useInvalidate } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { humanizeVariables, type Audience } from "../campaign-utils";
import type { CampaignDraft } from "../useCampaignDraft";
import { Callout, SuccessMark } from "../ui";
import type { Check, StepKey } from "./Preflight";
import { SmtpWarning } from "./TestStep";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultSchedule(existing?: string | null) {
  if (existing) return toLocalInput(new Date(existing));
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 30, 0, 0);
  return toLocalInput(d);
}

function ChoiceCard({ active, icon, title, description, onClick }: { active: boolean; icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn("relative flex items-start gap-3 rounded-[18px] p-4 pr-10 text-left ring-1 ring-inset transition", active ? "bg-accent-soft ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]" : "ring-[var(--hairline-strong)] hover:bg-black/[0.025] dark:hover:bg-white/[0.04]")}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[13px]", active ? "btn-primary" : "bg-black/[0.05] text-fg-2 dark:bg-white/[0.07]")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">{description}</span>
      </span>
      <span className={cn("absolute right-4 top-4 flex size-[18px] items-center justify-center rounded-full ring-2 ring-inset", active ? "ring-[var(--accent)]" : "ring-[var(--hairline-strong)]")}>
        {active && <motion.span layoutId="send-mode-dot" className="size-2 rounded-full bg-[var(--accent)]" />}
      </span>
    </button>
  );
}

export function SendStep({
  campaign,
  draft,
  audience,
  checks,
  canSend,
  smtp,
  sender,
  flush,
  onGo,
}: {
  campaign: Campaign;
  draft: CampaignDraft;
  audience?: Audience | null;
  checks: Check[];
  canSend: boolean;
  smtp: boolean | null;
  sender: { name: string; email: string };
  flush: () => Promise<boolean>;
  onGo: (s: StepKey) => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const [mode, setMode] = useState<"now" | "later">(campaign.status === "scheduled" ? "later" : "now");
  const [when, setWhen] = useState(() => defaultSchedule(campaign.scheduled_at));
  const [busy, setBusy] = useState<"send" | "schedule" | "cancel" | null>(null);
  const blocking = checks.filter((c) => c.level === "error");
  const count = audience?.count ?? 0;
  const recipients = `${number(count)} destinataire${count > 1 ? "s" : ""}`;
  const whenDate = new Date(when);
  const whenValid = !Number.isNaN(whenDate.getTime()) && whenDate.getTime() > Date.now() + 60_000;

  const store = (updated: Campaign) => {
    qc.setQueryData<Campaign>(keys.item("campaigns", campaign.id), (old) => ({ ...(old ?? campaign), ...updated, segment: updated.segment ?? old?.segment }));
    invalidate("campaigns");
  };

  const sendNow = async () => {
    const ok = await confirm({ title: `Envoyer « ${draft.name} » à ${recipients} ?`, description: "Chaque contact reçoit un email individuel comportant un lien de désinscription. Un envoi ne peut pas être annulé.", confirmLabel: "Envoyer maintenant" });
    if (!ok) return;
    setBusy("send");
    try {
      if (!(await flush())) return;
      const updated = await api.post<Campaign>(`/campaigns/${campaign.id}/send`, {});
      store(updated);
      const sent = Number(updated.stats?.sent ?? 0);
      const failed = Number(updated.stats?.failed ?? 0);
      toast.success("Campagne envoyée 🎉", { description: `${number(sent)} email${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}${failed ? ` · ${failed} échec${failed > 1 ? "s" : ""}` : ""}` });
      onGo("results");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    if (!whenValid) return toast.error("Choisissez une date future.");
    setBusy("schedule");
    try {
      if (!(await flush())) return;
      const updated = await api.post<Campaign>(`/campaigns/${campaign.id}/send`, { scheduled_at: whenDate.toISOString() });
      store(updated);
      toast.success("Campagne programmée", { description: `Envoi le ${dateTime(whenDate)}` });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const unschedule = async () => {
    setBusy("cancel");
    try {
      const updated = await api.patch<Campaign>(`/campaigns/${campaign.id}`, { status: "draft", scheduled_at: null });
      store(updated);
      toast.success("Programmation annulée", { description: "La campagne est repassée en brouillon." });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  if (campaign.status === "sent" || campaign.status === "sending") {
    const sent = Number(campaign.stats?.sent ?? 0);
    return (
      <Panel>
        <div className="flex flex-col items-center px-4 py-10 text-center">
          {campaign.status === "sending" ? <Spinner className="size-12 text-accent" /> : <SuccessMark size={80} />}
          <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">{campaign.status === "sending" ? "Envoi en cours…" : "Campagne envoyée"}</h3>
          <p className="mt-1 max-w-md text-[13.5px] text-fg-2">
            {campaign.status === "sending" ? "Les emails partent un par un, chacun avec son lien de désinscription personnel." : `Le ${dateTime(campaign.sent_at)} · ${number(sent)} email${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}.`}
          </p>
          <Button variant="primary" className="mt-6" icon={<BarChart3 className="size-4" />} onClick={() => onGo("results")}>
            Voir les résultats
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Panel title="Quand envoyer ?" icon={<Rocket className="size-4" />}>
        <div className="space-y-4">
          {campaign.status === "scheduled" && campaign.scheduled_at && (
            <Callout
              tone="info"
              icon={<CalendarClock className="size-[18px]" />}
              title={`Programmée pour le ${dateTime(campaign.scheduled_at)}`}
              action={
                canSend && (
                  <Button size="sm" variant="glass" icon={<CalendarX2 className="size-3.5" />} loading={busy === "cancel"} onClick={unschedule}>
                    Annuler
                  </Button>
                )
              }
            >
              Vos modifications d'ici là seront prises en compte à l'envoi.
            </Callout>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Moment de l'envoi">
            <ChoiceCard active={mode === "now"} onClick={() => setMode("now")} icon={<Zap className="size-[18px]" />} title="Envoyer maintenant" description="L'envoi démarre immédiatement, un email individuel par contact." />
            <ChoiceCard active={mode === "later"} onClick={() => setMode("later")} icon={<CalendarClock className="size-[18px]" />} title="Programmer" description="Choisissez le meilleur moment, par exemple un mardi matin." />
          </div>
          {mode === "later" && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              <Field label="Date et heure d'envoi (heure locale)" error={when && !whenValid ? "Choisissez une date dans le futur." : null}>
                <Input type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} className="sm:max-w-[280px]" />
              </Field>
            </motion.div>
          )}
          <SmtpWarning smtp={smtp} />
          {blocking.some((c) => c.key !== "smtp") && (
            <Callout tone="danger" title="À corriger avant l'envoi">
              <ul className="mt-1 space-y-0.5">
                {blocking.filter((c) => c.key !== "smtp").map((c) => (
                  <li key={c.key}>
                    {c.step ? (
                      <button type="button" className="text-left underline decoration-dotted underline-offset-2 hover:text-fg" onClick={() => onGo(c.step!)}>
                        {c.title}
                      </button>
                    ) : (
                      c.title
                    )}
                  </li>
                ))}
              </ul>
            </Callout>
          )}
          {!canSend && <Callout tone="info">L'envoi et la programmation sont réservés aux managers et administrateurs.</Callout>}
          <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-fg-3">{mode === "now" ? `${recipients} éligible${count > 1 ? "s" : ""} au moment de l'envoi.` : whenValid ? `Envoi automatique le ${dateTime(whenDate)}.` : "Indiquez une date d'envoi."}</p>
            {mode === "now" ? (
              <Button variant="primary" size="lg" icon={<Send className="size-4" />} loading={busy === "send"} disabled={!canSend || blocking.length > 0 || count === 0} onClick={sendNow}>
                Envoyer à {recipients}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon={<CalendarClock className="size-4" />} loading={busy === "schedule"} disabled={!canSend || blocking.length > 0 || !whenValid} onClick={schedule}>
                {campaign.status === "scheduled" ? "Reprogrammer" : "Programmer l'envoi"}
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Récapitulatif" bodyClassName="px-5 pb-4 pt-1">
        <div className="divide-y divide-[var(--hairline)]">
          <KeyValue label="Campagne">{draft.name}</KeyValue>
          <KeyValue label="Segment">{campaign.segment?.name ?? "—"}</KeyValue>
          <KeyValue label="Destinataires">
            <span className="font-semibold tabular">{audience ? number(audience.count) : "—"}</span>
            {audience?.excluded_count ? <span className="text-fg-3"> · {number(audience.excluded_count)} exclu{audience.excluded_count > 1 ? "s" : ""}</span> : null}
          </KeyValue>
          <KeyValue label="Expéditeur">
            <span className="block">{draft.from_name || sender.name || "—"}</span>
            <span className="block text-[12px] text-fg-3">{draft.from_email || sender.email || "Adresse des paramètres d'envoi"}</span>
          </KeyValue>
          <KeyValue label="Objet">
            <span className="line-clamp-2">{humanizeVariables(draft.subject) || "—"}</span>
          </KeyValue>
          <KeyValue label="Pré-en-tête">
            <span className="line-clamp-2 text-fg-2">{humanizeVariables(draft.preheader) || "—"}</span>
          </KeyValue>
          <KeyValue label="Désinscription">
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3.5" /> Lien automatique
            </span>
          </KeyValue>
        </div>
      </Panel>
    </div>
  );
}

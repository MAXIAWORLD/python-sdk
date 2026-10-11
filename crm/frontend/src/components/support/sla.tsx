import { AlarmClock, CircleCheck, CirclePause, Timer, TimerOff } from "lucide-react";
import { Tooltip } from "@/components/ui/overlay";
import { dateTime } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ms, span } from "./time";

export type SlaTone = "ok" | "warn" | "breach" | "paused" | "met" | "missed" | "none";

export interface SlaInfo {
  tone: SlaTone;
  /** Short label for badges: « dans 3 h », « dépassé de 2 h », « En pause »… */
  label: string;
  /** Sentence for tooltips and the detail panel. */
  detail: string;
  /** Elapsed share of the SLA window (0 → 1, may exceed 1 when breached). */
  progress: number;
}

type SlaTicket = Pick<Ticket, "status" | "sla_due_at" | "created_at" | "resolved_at">;

export const WAITING_AGENT = ["new", "open"];
const PAUSED = ["pending", "on_hold"];
const DONE = ["resolved", "closed"];

/** SLA state of a ticket: the clock runs while the ticket waits for the team (new / open). */
export function slaInfo(t: SlaTicket, now: number): SlaInfo {
  const due = ms(t.sla_due_at);
  if (Number.isNaN(due)) return { tone: "none", label: "—", detail: "Aucun engagement de délai.", progress: 0 };
  const start = ms(t.created_at);
  const windowMs = Math.max(60_000, due - start);
  const at = `Échéance le ${dateTime(t.sla_due_at)}`;
  if (DONE.includes(t.status)) {
    const end = Number.isNaN(ms(t.resolved_at)) ? due : ms(t.resolved_at);
    const progress = (end - start) / windowMs;
    return end <= due ? { tone: "met", label: "Respecté", detail: `Résolu ${span(due - end)} avant l'échéance.`, progress } : { tone: "missed", label: "Hors délai", detail: `Résolu avec ${span(end - due)} de retard.`, progress };
  }
  const remaining = due - now;
  const progress = (now - start) / windowMs;
  if (PAUSED.includes(t.status)) {
    return { tone: "paused", label: "En pause", detail: `Délai suspendu pendant l'attente. ${at}.`, progress };
  }
  if (remaining < 0) return { tone: "breach", label: `dépassé de ${span(remaining)}`, detail: `SLA dépassé de ${span(remaining)}. ${at}.`, progress };
  const tight = remaining < 3_600_000 || remaining / windowMs < 0.25;
  return { tone: tight ? "warn" : "ok", label: `dans ${span(remaining)}`, detail: `Réponse attendue dans ${span(remaining)}. ${at}.`, progress };
}

export function isBreached(t: SlaTicket, now: number) {
  return WAITING_AGENT.includes(t.status) && !!t.sla_due_at && ms(t.sla_due_at) < now;
}

const STYLES: Record<SlaTone, { cls: string; icon: typeof Timer }> = {
  ok: { cls: "text-fg-2", icon: Timer },
  warn: { cls: "bg-orange-500/12 text-orange-700 dark:text-orange-300", icon: AlarmClock },
  breach: { cls: "bg-red-500/14 text-red-600 font-semibold dark:text-red-300", icon: AlarmClock },
  paused: { cls: "text-fg-3", icon: CirclePause },
  met: { cls: "text-emerald-700 dark:text-emerald-400", icon: CircleCheck },
  missed: { cls: "text-fg-3", icon: TimerOff },
  none: { cls: "text-fg-3", icon: Timer },
};

/** Live SLA countdown pill (« dans 3 h » / « dépassé de 2 h » in red). */
export function SlaBadge({ ticket, now, className, withTooltip = true }: { ticket: SlaTicket; now: number; className?: string; withTooltip?: boolean }) {
  const info = slaInfo(ticket, now);
  if (info.tone === "none") return <span className="text-[12px] text-fg-3">—</span>;
  const { cls, icon: Icon } = STYLES[info.tone];
  const pill = (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11.5px] font-medium tabular", cls, className)}>
      <Icon className="size-3.5 shrink-0" />
      {info.label}
      {info.tone === "breach" && (
        <span className="relative ml-0.5 flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
        </span>
      )}
    </span>
  );
  if (!withTooltip) return pill;
  return <Tooltip content={info.detail}>{pill}</Tooltip>;
}

const BAR: Record<SlaTone, string> = {
  ok: "linear-gradient(90deg,#1baf7a,#22d3ee)",
  warn: "linear-gradient(90deg,#ff9f0a,#f97316)",
  breach: "linear-gradient(90deg,#f97316,#ef4444)",
  paused: "linear-gradient(90deg,#94a3b8,#cbd5e1)",
  met: "linear-gradient(90deg,#1baf7a,#34d399)",
  missed: "linear-gradient(90deg,#a1a1aa,#71717a)",
  none: "transparent",
};

/** Progress of the SLA window (used on the ticket page). */
export function SlaMeter({ ticket, now }: { ticket: SlaTicket; now: number }) {
  const info = slaInfo(ticket, now);
  if (info.tone === "none") return <p className="text-[12.5px] text-fg-3">Aucun délai contractuel sur ce ticket.</p>;
  const width = Math.max(4, Math.min(100, info.progress * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <SlaBadge ticket={ticket} now={now} withTooltip={false} className="-ml-1.5 text-[13px]" />
        {info.tone !== "paused" && <span className="text-[11.5px] text-fg-3 tabular">{Math.round(Math.min(info.progress, 9.99) * 100)} % du délai</span>}
      </div>
      <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${width}%`, background: BAR[info.tone] }} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-fg-3">{info.detail}</p>
    </div>
  );
}

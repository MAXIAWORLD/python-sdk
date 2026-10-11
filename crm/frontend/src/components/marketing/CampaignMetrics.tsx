import { motion } from "motion/react";
import type { ReactElement } from "react";
import { Tooltip } from "@/components/ui/overlay";
import { number, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TRACKING_NOTE, type CampaignMetrics } from "./campaign-utils";

const HATCH = "bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_5px,transparent_5px_10px)]";

function Bar({ rate, untracked }: { rate: number | null; untracked?: boolean }) {
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
      {untracked ? (
        <div className={cn("h-full w-full opacity-70", HATCH)} />
      ) : (
        <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, rate ? Math.max(rate, 3) : 0)}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} />
      )}
    </div>
  );
}

function Untracked({ children }: { children: ReactElement }) {
  return (
    <Tooltip content={TRACKING_NOTE}>
      <div tabIndex={0} className="min-w-0 cursor-help outline-none">
        {children}
      </div>
    </Tooltip>
  );
}

/** Value + mini bar (rate of the sent emails), used in table cells. */
export function MetricBar({ value, rate, untracked }: { value: string; rate: number | null; untracked?: boolean }) {
  const content = (
    <div className="min-w-[72px]">
      <div className={cn("mb-1 text-[13px] font-semibold tabular", untracked && "text-fg-3")}>{value}</div>
      <Bar rate={rate} untracked={untracked} />
    </div>
  );
  return untracked ? <Untracked>{content}</Untracked> : content;
}

/** Stacked metric (label, value, bar) for the campaign cards. */
function Metric({ label, value, rate, untracked }: { label: string; value: string; rate: number | null; untracked?: boolean }) {
  const content = (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium text-fg-3">{label}</div>
      <div className={cn("mb-1.5 mt-0.5 text-[15px] font-semibold leading-tight tabular", untracked && "text-fg-3")}>{value}</div>
      <Bar rate={rate} untracked={untracked} />
    </div>
  );
  return untracked ? <Untracked>{content}</Untracked> : content;
}

/** The four campaign metrics shown on the cards. */
export function CampaignMetricsRow({ m, className }: { m: CampaignMetrics; className?: string }) {
  return (
    <div className={cn("grid grid-cols-4 gap-2.5", className)}>
      <Metric label="Envoyés" value={number(m.sent)} rate={m.deliveryRate} />
      <Metric label="Ouverts" value={m.openRate === null ? "—" : percent(m.openRate, 1)} rate={m.openRate} untracked={m.openRate === null} />
      <Metric label="Cliqués" value={m.clickRate === null ? "—" : percent(m.clickRate, 1)} rate={m.clickRate} untracked={m.clickRate === null} />
      <Metric label="Désinscrits" value={number(m.unsubscribed)} rate={m.unsubRate} />
    </div>
  );
}

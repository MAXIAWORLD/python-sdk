import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/overlay";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StepState = "done" | "current" | "todo" | "error" | "warn";

export interface TimelineStep {
  key: string;
  label: ReactNode;
  icon: ReactNode;
  state: StepState;
  date?: string | null;
  detail?: ReactNode;
}

const DOT: Record<StepState, string> = {
  done: "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_6px_16px_-6px_var(--accent)]",
  current: "bg-accent-soft text-accent ring-2 ring-[color-mix(in_oklab,var(--accent)_45%,transparent)] pulse-ring",
  todo: "bg-black/[0.04] text-fg-3 ring-1 ring-inset ring-[var(--hairline-strong)] dark:bg-white/[0.05]",
  error: "bg-red-500 text-white shadow-[0_6px_16px_-6px_rgba(239,68,68,.8)]",
  warn: "bg-orange-500 text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.8)]",
};

/** Vertical status frieze (created → sent → viewed → signed / paid…). */
export function StatusTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const reached = step.state === "done" || step.state === "error" || step.state === "warn";
        const nextReached = !last && steps[i + 1].state !== "todo";
        return (
          <motion.li key={step.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className={cn("absolute left-[15px] top-8 h-[calc(100%-28px)] w-[2px] rounded-full", nextReached ? "bg-[linear-gradient(180deg,var(--accent),color-mix(in_oklab,var(--accent-2)_60%,transparent))]" : "bg-[var(--hairline-strong)]")} />}
            <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5", DOT[step.state])}>{step.icon}</span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-[13.5px] font-medium", !reached && step.state !== "current" && "text-fg-3")}>{step.label}</span>
                {step.date && (
                  <Tooltip content={dateTime(step.date)}>
                    <span className="shrink-0 cursor-default text-[11.5px] text-fg-3">{relative(step.date)}</span>
                  </Tooltip>
                )}
              </div>
              {step.detail && <div className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{step.detail}</div>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

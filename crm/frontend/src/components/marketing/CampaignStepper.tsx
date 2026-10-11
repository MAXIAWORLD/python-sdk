import { Check, type LucideIcon } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

export interface StepDef<K extends string> {
  key: K;
  label: string;
  hint?: string;
  icon: LucideIcon;
  done?: boolean;
  disabled?: boolean;
}

/** Liquid-glass stepper: a glass pill slides to the active step, completed steps show a check. */
export function CampaignStepper<K extends string>({ steps, value, onChange }: { steps: StepDef<K>[]; value: K; onChange: (k: K) => void }) {
  const id = useId();
  const activeRef = useRef<HTMLButtonElement>(null);
  const index = Math.max(0, steps.findIndex((s) => s.key === value));
  const progress = steps.length > 1 ? index / (steps.length - 1) : 0;

  // On narrow screens the steps scroll horizontally: keep the active one centred (never scrolls the page).
  useEffect(() => {
    const el = activeRef.current;
    const strip = el?.parentElement;
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
  }, [value]);

  return (
    <div className="glass relative overflow-hidden rounded-[22px] p-1.5">
      <LayoutGroup id={id}>
        <div className="flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Étapes de la campagne">
          {steps.map((s, i) => {
            const active = s.key === value;
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                ref={active ? activeRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={s.disabled}
                onClick={() => onChange(s.key)}
                className={cn("relative flex min-w-[148px] flex-1 items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45", !active && !s.disabled && "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]")}
              >
                {active && (
                  <motion.span
                    layoutId="campaign-step"
                    className="glass liquid absolute inset-0 rounded-[16px]"
                    style={{ boxShadow: "var(--glass-shadow), inset 0 1px 0 var(--glass-edge), inset 0 0 0 1px var(--glass-border)" }}
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-semibold transition-colors",
                    s.done ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_6px_14px_-6px_var(--accent)]" : active ? "bg-accent-soft text-accent" : "bg-black/[0.05] text-fg-3 dark:bg-white/[0.07]",
                  )}
                  style={s.done ? { background: "linear-gradient(135deg, var(--accent), var(--accent-2))" } : undefined}
                >
                  {s.done ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
                </span>
                <span className="relative z-10 min-w-0">
                  <span className={cn("flex items-center gap-1.5 text-[13.5px] font-semibold", active ? "text-fg" : "text-fg-2")}>
                    <span className="text-[11px] font-medium text-fg-3 tabular">{i + 1}.</span>
                    {s.label}
                  </span>
                  {s.hint && <span className="block truncate text-[11.5px] text-fg-3">{s.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
      <div className="mx-3 mt-1.5 h-[3px] overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
        <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent-3))" }} initial={false} animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ type: "spring", stiffness: 160, damping: 26 }} />
      </div>
    </div>
  );
}

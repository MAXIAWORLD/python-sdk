import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Sparkline } from "@/components/charts/Charts";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, icon, kicker, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }} className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        {icon && <div className="glass hidden size-12 shrink-0 items-center justify-center rounded-[16px] text-accent sm:flex">{icon}</div>}
        <div className="min-w-0">
          {kicker && <div className="mb-0.5 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-3">{kicker}</div>}
          <h1 className="truncate text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]">{title}</h1>
          {description && <p className="mt-0.5 text-[14px] text-fg-2">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </motion.div>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName, glow = true, icon }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; glow?: boolean; icon?: ReactNode }) {
  return (
    <Glass glow={glow} className={cn("flex flex-col", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
                {icon && <span className="text-fg-3">{icon}</span>}
                {title}
              </h3>
            )}
            {description && <p className="mt-0.5 text-[12.5px] text-fg-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn("min-h-0 flex-1 px-5 pb-5 pt-3", bodyClassName)}>{children}</div>
    </Glass>
  );
}

/** Animated count-up number. */
export function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, value, mv]);
  useEffect(() => text.on("change", (v) => ref.current && (ref.current.textContent = v)), [text]);
  return <span ref={ref}>{format(0)}</span>;
}

export function Delta({ value, goodWhenUp = true, suffix = "%", period }: { value?: number | null; goodWhenUp?: boolean; suffix?: string; period?: string }) {
  if (value === null || value === undefined) return <span className="text-[12px] text-fg-3">{period ? `— ${period}` : "—"}</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-semibold tabular", good ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {up ? "+" : ""}
      {value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
      {suffix}
      {period && <span className="ml-1 font-normal text-fg-3">{period}</span>}
    </span>
  );
}

export function StatTile({ label, value, format, delta, deltaGoodWhenUp = true, period, trend, icon, hint, onClick, accent }: { label: string; value: number; format: (v: number) => string; delta?: number | null; deltaGoodWhenUp?: boolean; period?: string; trend?: number[]; icon?: ReactNode; hint?: ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <TiltCard className="p-4" onClick={onClick} max={5}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
        {icon && (
          <span className="flex size-8 items-center justify-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_6px_14px_-6px_rgba(0,0,0,.45)]" style={{ background: accent ?? "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular">
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {delta !== undefined && <Delta value={delta} goodWhenUp={deltaGoodWhenUp} period={period} />}
          {hint && <div className="truncate text-[12px] text-fg-3">{hint}</div>}
        </div>
        {trend && trend.length > 1 && (
          <div className="-mb-1 -mr-1 shrink-0">
            <Sparkline values={trend} width={92} height={32} />
          </div>
        )}
      </div>
    </TiltCard>
  );
}

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2 text-[13.5px]", className)}>
      <span className="shrink-0 text-fg-3">{label}</span>
      <span className="min-w-0 text-right text-fg">{children}</span>
    </div>
  );
}

export function FilterChip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-all",
        active ? "btn-primary" : "glass-flat text-fg-2 hover:text-fg",
      )}
    >
      {children}
      {count !== undefined && <span className={cn("rounded-full px-1.5 text-[10.5px] tabular", active ? "bg-white/25" : "bg-black/5 dark:bg-white/10")}>{count}</span>}
    </button>
  );
}

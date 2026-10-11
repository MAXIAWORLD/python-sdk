import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const TICK = "M6 10.4l2.7 2.7L14.2 7.4";

const BURST = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle), color: ["#30d158", "#64d2ff", "#5b6cff", "#ffd60a"][i % 4] };
});

/** Round "complete" checkbox with a spring fill, a drawn tick and a tiny particle burst. */
export function TaskCheck({ done, onToggle, size = 20, ringColor, disabled, className }: { done: boolean; onToggle: () => void; size?: number; ringColor?: string; disabled?: boolean; className?: string }) {
  const [burst, setBurst] = useState(0);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Rouvrir la tâche" : "Terminer la tâche"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!done) setBurst((b) => b + 1);
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn("group/check relative shrink-0 rounded-full transition-transform active:scale-90 disabled:opacity-50", className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn("absolute inset-0 rounded-full transition-colors", !done && "group-hover/check:bg-emerald-500/10")}
        style={{ boxShadow: `inset 0 0 0 ${size >= 22 ? 2 : 1.6}px ${done ? "transparent" : (ringColor ?? "var(--hairline-strong)")}` }}
      />
      <motion.span
        className="absolute inset-0 rounded-full shadow-[0_4px_12px_-4px_rgba(48,209,88,.8),inset_0_1px_0_rgba(255,255,255,.45)]"
        style={{ background: "linear-gradient(140deg, #4ade80, #22c55e 55%, #16a34a)" }}
        initial={false}
        animate={{ scale: done ? 1 : 0.3, opacity: done ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 24 }}
      />
      <svg viewBox="0 0 20 20" className="absolute inset-0 size-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {!done && <path d={TICK} strokeWidth={2} className="stroke-emerald-500 opacity-0 transition-opacity group-hover/check:opacity-60" />}
        <motion.path d={TICK} strokeWidth={2.2} className="stroke-white" initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ duration: 0.24, delay: done ? 0.06 : 0 }} />
      </svg>
      <AnimatePresence>
        {burst > 0 && (
          <span key={burst} className="pointer-events-none absolute inset-0">
            {BURST.map((p, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 size-1 rounded-full"
                style={{ background: p.color, marginLeft: -2, marginTop: -2 }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: p.x * size * 0.95, y: p.y * size * 0.95, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
              />
            ))}
          </span>
        )}
      </AnimatePresence>
    </button>
  );
}

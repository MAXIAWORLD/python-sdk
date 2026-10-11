import { motion } from "motion/react";
import { useId, type ReactNode } from "react";

/**
 * Progress ring in a given colour. (The shared `Ring` derives its gradient id from
 * size + value, so two rings of different colours can collide — this one uses useId.)
 */
export function ColorRing({ value, size = 52, stroke = 5, color = "var(--accent)", children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const id = `ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: `color-mix(in oklab, ${color} 60%, white)` }} />
            <stop offset="100%" style={{ stopColor: color }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--hairline-strong)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 4px color-mix(in oklab, ${color} 45%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular">{children ?? `${Math.round(v)}`}</div>
    </div>
  );
}

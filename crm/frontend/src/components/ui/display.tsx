import { motion } from "motion/react";
import type { ReactNode } from "react";
import { TONE_STYLES, type Option, type Tone } from "@/lib/constants";
import { cn, colorFor, initials } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Badge({ tone = "gray", children, dot, className, size = "sm" }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string; size?: "xs" | "sm" }) {
  const s = TONE_STYLES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium", size === "xs" ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11.5px]", s.bg, s.fg, className)}>
      {dot && <span className={cn("size-1.5 rounded-full", s.dot)} />}
      {children}
    </span>
  );
}

export function StatusBadge({ options, value, className, size }: { options: Option[]; value?: string | null; className?: string; size?: "xs" | "sm" }) {
  const opt = options.find((o) => o.value === value);
  return (
    <Badge tone={opt?.tone ?? "gray"} dot className={className} size={size}>
      {opt?.label ?? value ?? "—"}
    </Badge>
  );
}

export function Tag({ children, onRemove, className }: { children: ReactNode; onRemove?: () => void; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[8px] bg-black/[0.05] px-1.5 py-0.5 text-[11.5px] font-medium text-fg-2 dark:bg-white/[0.08]", className)}>
      #{children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 text-fg-3 hover:text-fg" aria-label="Retirer">
          ×
        </button>
      )}
    </span>
  );
}

export function Avatar({ name, src, color, size = 32, className, ring }: { name?: string | null; src?: string | null; color?: string | null; size?: number; className?: string; ring?: boolean }) {
  const bg = color || colorFor(name);
  return (
    <span
      className={cn("relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white", ring && "ring-2 ring-[var(--bg)]", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), background: src ? undefined : `linear-gradient(140deg, ${bg}, color-mix(in oklab, ${bg} 55%, #000))` }}
      title={name ?? undefined}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(name)}
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.35)]" />
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 26 }: { people: { name?: string | null; color?: string | null; avatar_url?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <div className="flex -space-x-2">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} color={p.color ?? undefined} src={p.avatar_url} size={size} ring />
      ))}
      {people.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-black/10 text-[11px] font-semibold text-fg-2 ring-2 ring-[var(--bg)] dark:bg-white/15" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </div>
  );
}

export function CompanyLogo({ name, domain, size = 32, className }: { name?: string | null; domain?: string | null; size?: number; className?: string }) {
  const bg = colorFor(name);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[10px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_4px_10px_-4px_rgba(0,0,0,.35)]", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(145deg, ${bg}, color-mix(in oklab, ${bg} 50%, #111))`, borderRadius: size * 0.3 }}
      title={domain ?? undefined}
    >
      {(name ?? "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-[var(--hairline-strong)] bg-white/40 px-1 font-sans text-[10.5px] font-medium text-fg-2 dark:bg-white/[0.06]", className)}>{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[10px]", className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass mb-4 flex size-14 items-center justify-center rounded-[18px] text-accent">
          {icon}
        </motion.div>
      )}
      <p className="text-[15px] font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Progress({ value, className, tone, height = 6 }: { value: number; className?: string; tone?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/[0.08]", className)} style={{ height }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        className="h-full rounded-full"
        style={{ background: tone ?? "linear-gradient(90deg, var(--accent), var(--accent-2))", boxShadow: "0 0 12px -2px color-mix(in oklab, var(--accent) 60%, transparent)" }}
      />
    </div>
  );
}

export function Ring({ value, size = 44, stroke = 5, children, color }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  const id = `ring-${size}-${Math.round(v)}`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color ?? "var(--accent)"} />
            <stop offset="100%" stopColor={color ?? "var(--accent-2)"} />
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
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular">{children ?? `${Math.round(v)}`}</div>
    </div>
  );
}

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label)
    return (
      <div className={cn("flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-fg-3", className)}>
        <span className="h-px flex-1 bg-[var(--hairline)]" />
        {label}
        <span className="h-px flex-1 bg-[var(--hairline)]" />
      </div>
    );
  return <div className={cn("h-px w-full bg-[var(--hairline)]", className)} />;
}

export function ScoreDot({ score }: { score: number }) {
  const tone = score >= 75 ? "#30d158" : score >= 50 ? "#ff9f0a" : score >= 25 ? "#64d2ff" : "#8e8e93";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tabular">
      <span className="size-2 rounded-full" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
      {score}
    </span>
  );
}

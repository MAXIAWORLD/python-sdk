import { useState, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/data/blocks";
import { CompanyLogo } from "@/components/ui/display";
import type { Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Company logo: the uploaded `logo_url` when it loads, the generated monogram otherwise. */
export function CompanyAvatar({ name, logoUrl, domain, size = 32, className }: { name?: string | null; logoUrl?: string | null; domain?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (logoUrl && failed !== logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        title={domain ?? name ?? undefined}
        onError={() => setFailed(logoUrl)}
        className={cn("shrink-0 bg-white object-contain shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_4px_10px_-4px_rgba(0,0,0,.35)]", className)}
        style={{ width: size, height: size, borderRadius: size * 0.3 }}
      />
    );
  }
  return <CompanyLogo name={name} domain={domain} size={size} className={className} />;
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export function healthLevel(score: number): { color: string; tone: Tone; label: string } {
  if (score >= 75) return { color: "#30d158", tone: "green", label: "Bonne santé" };
  if (score >= 50) return { color: "#ff9f0a", tone: "yellow", label: "À surveiller" };
  return { color: "#ff453a", tone: "red", label: "À risque" };
}

/** Small health gauge (0–100) colored by state. */
export function HealthMeter({ score, width = 56, showValue = true, className }: { score: number; width?: number; showValue?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(score || 0)));
  const { color, label } = healthLevel(v);
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`Santé ${v}/100 — ${label}`}>
      <span className="relative h-1.5 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.1]" style={{ width }}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v}%`, background: `linear-gradient(90deg, color-mix(in oklab, ${color} 70%, white), ${color})`, boxShadow: `0 0 8px -1px ${color}` }} />
      </span>
      {showValue && <span className="w-6 text-[12px] font-semibold tabular text-fg-2">{v}</span>}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Key figures                                                                */
/* -------------------------------------------------------------------------- */

/** Compact key-figure tile (detail pages side column). */
export function MiniStat({ label, value, format, hint, icon, accent, alert, onClick }: { label: string; value: number; format: (v: number) => string; hint?: ReactNode; icon: ReactNode; accent: string; alert?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("glass-inset flex min-w-0 flex-col rounded-[16px] p-3 text-left", onClick && "transition hover:bg-[var(--field-hover)]")}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[11.5px] font-medium text-fg-3">{label}</span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-[8px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_4px_10px_-4px_rgba(0,0,0,.4)]" style={{ background: accent }}>
          {icon}
        </span>
      </span>
      <span className="mt-1.5 truncate text-[19px] font-semibold leading-tight tracking-[-0.02em] tabular">
        <AnimatedNumber value={value} format={format} />
      </span>
      {hint && <span className={cn("mt-0.5 truncate text-[11.5px]", alert ? "font-medium text-red-600 dark:text-red-400" : "text-fg-3")}>{hint}</span>}
    </Comp>
  );
}

/** Small uppercase heading used to separate groups inside a panel. */
export function SectionLabel({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1 flex items-center justify-between gap-2 px-2.5", className)}>
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">{children}</span>
      {right}
    </div>
  );
}

/** White or ink text, whichever reads best on top of a hex background color. */
export function readableOn(hex?: string | null) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#0b1020" : "#ffffff";
}

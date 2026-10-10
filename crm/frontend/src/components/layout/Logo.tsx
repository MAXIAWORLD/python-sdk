import { cn } from "@/lib/utils";

/** Prism mark: light enters a glass prism and splits into a spectrum. */
export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c8cff" />
            <stop offset=".55" stopColor="#9b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="lg-face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".98" />
            <stop offset="1" stopColor="#fff" stopOpacity=".6" />
          </linearGradient>
          <linearGradient id="lg-spec" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity=".95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="17" fill="url(#lg-bg)" />
        <rect x="1" y="1" width="62" height="62" rx="16" fill="none" stroke="#fff" strokeOpacity=".4" />
        <path d="M4 30 L28 31" stroke="url(#lg-spec)" strokeWidth="2.4" strokeLinecap="round" opacity=".75" />
        <path d="M31 13 L48 46 H14 Z" fill="url(#lg-face)" />
        <path d="M31 13 L37 46 H48 Z" fill="#fff" fillOpacity=".35" />
        <path d="M46 34 L59 29" stroke="#ffb4f0" strokeWidth="2" strokeLinecap="round" />
        <path d="M46.6 36.6 L59 36" stroke="#fff3a6" strokeWidth="2" strokeLinecap="round" />
        <path d="M47 39.2 L59 43" stroke="#a6fff2" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-[30%] shadow-[0_10px_24px_-8px_rgba(124,140,255,.75)]" />
    </span>
  );
}

export function Logo({ name = "Prisme", collapsed }: { name?: string; collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[17px] font-semibold tracking-[-0.02em]">{name}</div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-3">CRM · IA</div>
        </div>
      )}
    </div>
  );
}

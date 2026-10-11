import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Large selectable option (radio-like card) used in billing dialogs. */
export function ChoiceCard({ active, onClick, icon, title, children }: { active: boolean; onClick: () => void; icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-[18px] p-3.5 text-left ring-1 ring-inset transition",
        active ? "bg-accent-soft ring-[color-mix(in_oklab,var(--accent)_55%,transparent)]" : "bg-black/[0.02] ring-[var(--hairline)] hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]",
      )}
    >
      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[12px] [&_svg]:size-4", active ? "btn-primary" : "bg-black/[0.05] text-fg-2 dark:bg-white/[0.07]")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-2">{children}</span>
      </span>
    </button>
  );
}

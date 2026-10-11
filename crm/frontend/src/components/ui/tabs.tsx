import { LayoutGroup, motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

/** Underline-free tabs with a liquid glass pill that slides between items. */
export function Tabs<T extends string>({ items, value, onChange, className, size = "md" }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div className={cn("glass-flat inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[14px] p-1", className)} role="tablist">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={cn("relative flex shrink-0 items-center gap-1.5 rounded-[10px] font-medium transition-colors", size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13.5px]", active ? "text-fg" : "text-fg-2 hover:text-fg")}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="glass liquid absolute inset-0 rounded-[10px]"
                  style={{ boxShadow: "var(--glass-shadow), inset 0 1px 0 var(--glass-edge), inset 0 0 0 1px var(--glass-border)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {item.icon}
                {item.label}
                {item.count !== undefined && <span className={cn("rounded-full px-1.5 text-[10.5px] tabular", active ? "bg-accent-soft text-accent" : "bg-black/5 text-fg-3 dark:bg-white/10")}>{item.count}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({ options, value, onChange, className }: { options: { value: T; label: ReactNode; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return <Tabs items={options} value={value} onChange={onChange} className={className} size="sm" />;
}

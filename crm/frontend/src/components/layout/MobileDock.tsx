import { LayoutGrid, Plus, Sparkles } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Sheet } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { MOBILE_NAV, NAV } from "./nav";

/** iOS-style floating glass tab bar for phones and tablets. */
export function MobileDock() {
  const location = useLocation();
  const { openAssistant, openQuickCreate } = useUI();
  const [more, setMore] = useState(false);
  const isActive = (to: string, end?: boolean) => (end ? location.pathname === to : location.pathname.startsWith(to));

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <LayoutGroup id="dock">
          <div className="glass glass-strong liquid mx-auto flex max-w-[520px] items-center justify-between gap-1 rounded-[28px] p-1.5">
            {MOBILE_NAV.map((item) => {
              const active = isActive(item.to, item.end);
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className={cn("relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[10px] font-medium", active ? "text-accent" : "text-fg-2")}>
                  {active && <motion.span layoutId="dock-pill" className="glass absolute inset-0 rounded-[22px]" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                  <item.icon className="relative z-10 size-5" />
                  <span className="relative z-10">{item.label.split(" ")[0]}</span>
                </NavLink>
              );
            })}
            <button onClick={() => openQuickCreate("contacts")} className="btn-primary flex size-12 shrink-0 items-center justify-center rounded-[20px]" aria-label="Créer">
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
            <button onClick={() => openAssistant()} className="ai-gradient flex size-12 shrink-0 items-center justify-center rounded-[20px] text-white" aria-label="Assistant IA">
              <Sparkles className="size-5" />
            </button>
            <button onClick={() => setMore(true)} className="flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10px] font-medium text-fg-2" aria-label="Plus">
              <LayoutGrid className="size-5" />
              Menu
            </button>
          </div>
        </LayoutGroup>
      </div>
      <Sheet open={more} onOpenChange={setMore} title="Tous les modules" side="left" width={360}>
        <div className="space-y-5">
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{g.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMore(false)} className="glass-flat flex flex-col items-center gap-1.5 rounded-[16px] px-2 py-3 text-center text-[11.5px] font-medium">
                    <item.icon className="size-5 text-accent" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}

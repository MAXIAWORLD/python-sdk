import { addDays, isToday, isTomorrow } from "date-fns";
import { CalendarDays, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { date } from "@/lib/format";
import { cn } from "@/lib/utils";
import { itemsOnDay, viewRange, type CalendarItem } from "./calendar-utils";
import { ItemRow } from "./CalendarParts";

/** Chronological list grouped by day (days without anything are skipped). */
export function CalendarAgenda({ anchor, items, onOpen, onCreate }: { anchor: Date; items: CalendarItem[]; onOpen: (it: CalendarItem) => void; onCreate: (day: Date) => void }) {
  const { start, end } = viewRange("agenda", anchor);
  const days: { day: Date; list: CalendarItem[] }[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) {
    const list = itemsOnDay(items, d).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
    if (list.length || isToday(d)) days.push({ day: d, list });
  }

  if (!days.some((d) => d.list.length))
    return (
      <EmptyState
        icon={<CalendarDays className="size-6" />}
        title={`Rien de prévu en ${date(anchor, "MMMM")}`}
        description="Planifiez un rendez-vous, une démo ou un bloc de concentration."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => onCreate(isToday(anchor) ? new Date() : anchor)}>
            Nouvel événement
          </Button>
        }
      />
    );

  return (
    <div className="divide-y divide-[var(--hairline)]">
      {days.map(({ day, list }, i) => {
        const today = isToday(day);
        return (
          <motion.section key={day.toISOString()} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.3) }} className="flex flex-col gap-2 px-3 py-3.5 sm:flex-row sm:gap-5 sm:px-5">
            <div className="flex w-[150px] shrink-0 items-center gap-3 sm:items-start sm:pt-1.5">
              <span className={cn("flex size-11 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none", today ? "btn-primary" : "glass-inset")}>
                <span className={cn("text-[9.5px] font-semibold uppercase tracking-wide", today ? "text-white/80" : "text-fg-3")}>{date(day, "EEE").replace(".", "")}</span>
                <span className="mt-0.5 text-[17px] font-semibold tabular">{date(day, "d")}</span>
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-semibold first-letter:uppercase", today && "text-accent")}>{today ? "Aujourd'hui" : isTomorrow(day) ? "Demain" : date(day, "EEEE")}</span>
                <span className="block text-[11.5px] text-fg-3">{date(day, "d MMMM")}</span>
              </span>
            </div>
            <div className="min-w-0 flex-1">
              {list.length ? (
                list.map((it) => <ItemRow key={it.id} item={it} onOpen={onOpen} />)
              ) : (
                <button type="button" onClick={() => onCreate(new Date())} className="flex w-full items-center gap-2 rounded-[14px] px-2.5 py-2.5 text-left text-[13px] text-fg-3 transition hover:bg-black/[0.035] hover:text-fg-2 dark:hover:bg-white/[0.05]">
                  <Plus className="size-4" /> Rien de prévu aujourd'hui — planifier quelque chose
                </button>
              )}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

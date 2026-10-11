import { addDays, isSameMonth, isToday } from "date-fns";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import type { ReactElement } from "react";
import { Popover } from "@/components/ui/overlay";
import { date } from "@/lib/format";
import { cn } from "@/lib/utils";
import { itemsOnDay, viewRange, type CalendarItem } from "./calendar-utils";
import { ItemChip, itemColor, ItemRow } from "./CalendarParts";
import { weekDays } from "./work-utils";

const MAX_CHIPS = 3;

function DayPopover({ day, items, onOpen, onCreate, children }: { day: Date; items: CalendarItem[]; onOpen: (it: CalendarItem) => void; onCreate: (day: Date) => void; children: ReactElement }) {
  return (
    <Popover trigger={children} width={340} align="center">
      {/* Portalled content still bubbles through the React tree: keep clicks away from the day cell. */}
      <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-3">
        <span className="text-[14px] font-semibold first-letter:uppercase">{date(day, "EEEE d MMMM")}</span>
        <button type="button" onClick={() => onCreate(day)} className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft">
          <Plus className="size-3.5" /> Événement
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto p-1.5">
        {items.map((it) => (
          <ItemRow key={it.id} item={it} onOpen={onOpen} right={<span />} />
        ))}
      </div>
      </div>
    </Popover>
  );
}

/** Month grid (Monday → Sunday) with coloured pills, "+N" overflow and click-to-create. */
export function CalendarMonth({ anchor, items, onOpen, onCreate, onZoom }: { anchor: Date; items: CalendarItem[]; onOpen: (it: CalendarItem) => void; onCreate: (day: Date) => void; onZoom: (day: Date) => void }) {
  const { start, end } = viewRange("month", anchor);
  const weeks: Date[][] = [];
  for (let d = start; d < end; d = addDays(d, 7)) weeks.push(weekDays(d));

  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[var(--hairline)]">
        {weeks[0]?.map((d) => (
          <div key={d.toISOString()} className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3 sm:text-left sm:px-3">
            <span className="sm:hidden">{date(d, "EEEEE")}</span>
            <span className="hidden sm:inline">{date(d, "EEE").replace(".", "")}</span>
          </div>
        ))}
      </div>
      <motion.div key={`${anchor.getFullYear()}-${anchor.getMonth()}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="grid" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week) => (
          <div key={week[0].toISOString()} className="grid grid-cols-7 border-b border-[var(--hairline)] last:border-b-0">
            {week.map((day) => {
              const list = itemsOnDay(items, day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
              const inMonth = isSameMonth(day, anchor);
              const today = isToday(day);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const overflow = list.length > MAX_CHIPS;
              const shown = overflow ? list.slice(0, MAX_CHIPS - 1) : list;
              return (
                <div
                  key={day.toISOString()}
                  role="button"
                  tabIndex={-1}
                  onClick={() => onCreate(day)}
                  className={cn(
                    "group/day relative flex min-h-[74px] cursor-pointer flex-col gap-0.5 border-r border-[var(--hairline)] p-1 transition-colors last:border-r-0 hover:bg-black/[0.02] sm:min-h-[118px] sm:p-1.5 dark:hover:bg-white/[0.025]",
                    !inMonth && "bg-black/[0.018] dark:bg-white/[0.012]",
                    weekend && inMonth && "bg-black/[0.01] dark:bg-white/[0.008]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onZoom(day);
                      }}
                      title="Voir la semaine"
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-[12.5px] font-semibold tabular transition",
                        today ? "btn-primary" : inMonth ? "text-fg hover:bg-black/[0.05] dark:hover:bg-white/[0.08]" : "text-fg-3 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]",
                      )}
                    >
                      {date(day, "d")}
                    </button>
                    <Plus className="mr-1 hidden size-3.5 text-fg-3 opacity-0 transition group-hover/day:opacity-100 sm:block" />
                  </div>
                  <div className="hidden min-w-0 flex-col gap-px sm:flex">
                    {shown.map((it) => (
                      <ItemChip key={it.id} item={it} onOpen={onOpen} />
                    ))}
                    {overflow && (
                      <DayPopover day={day} items={list} onOpen={onOpen} onCreate={onCreate}>
                        <button type="button" onClick={(e) => e.stopPropagation()} className="rounded-[8px] px-1.5 py-[3px] text-left text-[11.5px] font-semibold text-fg-2 transition hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]">
                          +{list.length - shown.length} autres
                        </button>
                      </DayPopover>
                    )}
                  </div>
                  {list.length > 0 && (
                    <DayPopover day={day} items={list} onOpen={onOpen} onCreate={onCreate}>
                      <button type="button" onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center justify-center gap-[3px] px-0.5 pt-0.5 sm:hidden" aria-label={`${list.length} élément(s)`}>
                        {list.slice(0, 4).map((it) => (
                          <span key={it.id} className="size-[6px] rounded-full" style={{ background: itemColor(it) }} />
                        ))}
                      </button>
                    </DayPopover>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

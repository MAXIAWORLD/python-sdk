import { isToday } from "date-fns";
import { MapPin, Video } from "lucide-react";
import { motion } from "motion/react";
import { useState, type PointerEvent } from "react";
import { date, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import { itemsOnDay, layoutDay, type CalendarItem, type Placed } from "./calendar-utils";
import { isStruck, ItemChip, itemColor, itemTitle } from "./CalendarParts";
import { useNow } from "./hooks";
import { tint, weekDays, weekStart } from "./work-utils";

const HOUR = 52; // px per hour
const COLS = "grid-cols-[52px_repeat(7,minmax(0,1fr))]";

const at = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function EventBlock({ placed, startHour, onOpen }: { placed: Placed; startHour: number; onOpen: (it: CalendarItem) => void }) {
  const { item } = placed;
  const color = itemColor(item);
  const height = Math.max(20, ((placed.bottom - placed.top) / 60) * HOUR - 2);
  const ev = item.kind === "event" ? item.event : null;
  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onOpen(item)}
      className="absolute z-10 flex flex-col overflow-hidden rounded-[9px] px-1.5 py-1 text-left text-[11.5px] leading-tight shadow-[0_4px_14px_-8px_rgba(0,0,0,.4)] transition-[filter,box-shadow] hover:z-20 hover:brightness-[1.05] hover:shadow-[0_10px_24px_-10px_rgba(0,0,0,.45)]"
      style={{
        top: ((placed.top - startHour * 60) / 60) * HOUR + 1,
        height,
        left: `calc(${(placed.col / placed.cols) * 100}% + 2px)`,
        width: `calc(${100 / placed.cols}% - 4px)`,
        background: `linear-gradient(180deg, ${tint(color, 26)}, ${tint(color, 16)})`,
        boxShadow: `inset 3px 0 0 ${color}, inset 0 0 0 1px ${tint(color, 30)}`,
        backdropFilter: "blur(10px)",
      }}
    >
      <span className={cn("truncate pl-1 font-semibold text-fg", isStruck(item) && "text-fg-3 line-through")}>{itemTitle(item)}</span>
      {height > 34 && (
        <span className="truncate pl-1 tabular text-fg-2">
          {time(item.start)} – {time(item.end)}
        </span>
      )}
      {height > 54 && ev && (ev.meeting_url || ev.location) && (
        <span className="flex min-w-0 items-center gap-1 truncate pl-1 text-fg-3">
          {ev.meeting_url ? <Video className="size-3 shrink-0" /> : <MapPin className="size-3 shrink-0" />}
          <span className="truncate">{ev.meeting_url ? "Visio" : ev.location}</span>
        </span>
      )}
    </motion.button>
  );
}

function DayColumn({ day, items, startHour, endHour, now, onOpen, onCreate }: { day: Date; items: CalendarItem[]; startHour: number; endHour: number; now: Date; onOpen: (it: CalendarItem) => void; onCreate: (start: Date, end: Date) => void }) {
  const placed = layoutDay(items, day);
  const [sel, setSel] = useState<{ anchor: number; from: number; to: number } | null>(null);
  const today = isToday(day);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const minutesAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height - 1);
    return startHour * 60 + Math.floor((y / HOUR) * 2) * 30;
  };

  return (
    <div
      className={cn("relative cursor-cell touch-pan-y border-l border-[var(--hairline)]", today && "bg-accent-soft/40")}
      style={{ backgroundImage: "linear-gradient(to bottom, var(--hairline) 1px, transparent 1px)", backgroundSize: `100% ${HOUR}px` }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const m = minutesAt(e);
        setSel({ anchor: m, from: m, to: m + 30 });
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!sel) return;
        const m = minutesAt(e);
        setSel({ anchor: sel.anchor, from: Math.min(sel.anchor, m), to: Math.max(sel.anchor, m) + 30 });
      }}
      onPointerUp={() => {
        if (!sel) return;
        const dragged = sel.to - sel.from > 30;
        setSel(null);
        onCreate(at(day, sel.from), at(day, dragged ? sel.to : sel.from + 60));
      }}
      onPointerCancel={() => setSel(null)}
    >
      {placed.map((p) => (
        <EventBlock key={p.item.id} placed={p} startHour={startHour} onOpen={onOpen} />
      ))}
      {sel && (
        <div className="pointer-events-none absolute inset-x-1 z-20 rounded-[9px] bg-accent-soft px-1.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-[var(--accent)]/50" style={{ top: ((sel.from - startHour * 60) / 60) * HOUR + 1, height: ((sel.to - sel.from) / 60) * HOUR - 2 }}>
          <span className="tabular">
            {hhmm(sel.from)} – {hhmm(sel.to - sel.from > 30 ? sel.to : sel.from + 60)}
          </span>
        </div>
      )}
      {today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
        <div className="pointer-events-none absolute inset-x-0 z-30" style={{ top: ((nowMin - startHour * 60) / 60) * HOUR }}>
          <div className="h-[2px] bg-[#ff453a] shadow-[0_0_10px_rgba(255,69,58,.7)]" />
          <div className="absolute -left-[5px] -top-[4px] size-[10px] rounded-full bg-[#ff453a] shadow-[0_0_0_2px_var(--bg)]" />
        </div>
      )}
    </div>
  );
}

/** Week time grid (7 h → 21 h, widened when events fall outside) with click-or-drag to create. */
export function CalendarWeek({ anchor, items, onOpen, onCreate }: { anchor: Date; items: CalendarItem[]; onOpen: (it: CalendarItem) => void; onCreate: (start: Date, end: Date) => void }) {
  const days = weekDays(weekStart(anchor));
  const now = useNow(30_000);
  const timed = items.filter((it) => !it.allDay);
  const allDay = items.filter((it) => it.allDay);
  let startHour = 7;
  let endHour = 21;
  for (const it of timed) {
    startHour = Math.min(startHour, it.start.getHours());
    endHour = Math.max(endHour, Math.min(24, it.end.getHours() + (it.end.getMinutes() ? 1 : 0)));
  }
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = days.some((d) => isToday(d)) && nowMin >= startHour * 60 && nowMin <= endHour * 60;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className={cn("grid border-b border-[var(--hairline)]", COLS)}>
          <div />
          {days.map((d) => {
            const today = isToday(d);
            return (
              <div key={d.toISOString()} className="flex flex-col items-center gap-0.5 py-2.5">
                <span className={cn("text-[11px] font-semibold uppercase tracking-[0.07em]", today ? "text-accent" : "text-fg-3")}>{date(d, "EEE").replace(".", "")}</span>
                <span className={cn("flex size-8 items-center justify-center rounded-full text-[15px] font-semibold tabular", today ? "btn-primary" : "text-fg")}>{date(d, "d")}</span>
              </div>
            );
          })}
        </div>
        {allDay.length > 0 && (
          <div className={cn("grid border-b border-[var(--hairline)]", COLS)}>
            <div className="pr-2 pt-2 text-right text-[10.5px] font-medium text-fg-3">Journée</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="flex min-w-0 flex-col gap-px border-l border-[var(--hairline)] p-1">
                {itemsOnDay(allDay, d).map((it) => (
                  <ItemChip key={it.id} item={it} onOpen={onOpen} compact />
                ))}
              </div>
            ))}
          </div>
        )}
        <div className={cn("relative grid", COLS)} style={{ height: hours.length * HOUR }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className={cn("absolute right-2 text-[10.5px] font-medium tabular text-fg-3", i === 0 ? "translate-y-1" : "-translate-y-1/2")} style={{ top: (h - startHour) * HOUR }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            {showNow && (
              <span className="absolute right-1 z-30 -translate-y-1/2 rounded-full bg-[#ff453a] px-1.5 py-px text-[10px] font-semibold tabular text-white" style={{ top: ((nowMin - startHour * 60) / 60) * HOUR }}>
                {time(now)}
              </span>
            )}
          </div>
          {days.map((d) => (
            <DayColumn key={d.toISOString()} day={d} items={itemsOnDay(timed, d)} startHour={startHour} endHour={endHour} now={now} onOpen={onOpen} onCreate={onCreate} />
          ))}
        </div>
      </div>
    </div>
  );
}

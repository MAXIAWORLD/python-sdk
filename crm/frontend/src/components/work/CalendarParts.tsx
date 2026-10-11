import { CheckCircle2, Circle, MapPin, Video } from "lucide-react";
import { Avatar } from "@/components/ui/display";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "./calendar-utils";
import { eventColor, PRIORITY_COLOR, tint } from "./work-utils";

export function itemColor(item: CalendarItem) {
  return item.kind === "event" ? eventColor(item.event) : PRIORITY_COLOR[item.task.priority] ?? "#8e8e93";
}

/** Done tasks and cancelled events are shown struck through. */
export function isStruck(item: CalendarItem) {
  return item.kind === "task" ? item.task.status === "done" : item.event.status === "cancelled";
}

export function itemTitle(item: CalendarItem) {
  return item.kind === "event" ? item.event.title : item.task.title;
}

/** "09:30 – 10:30", "Toute la journée", "Échéance". */
export function itemWhen(item: CalendarItem) {
  if (item.kind === "task") return item.task.due_time ? `Échéance ${item.task.due_time.slice(0, 5)}` : "Échéance";
  if (item.allDay) return "Toute la journée";
  return `${time(item.start)} – ${time(item.end)}`;
}

/** Compact pill for month cells and all-day rows. */
export function ItemChip({ item, onOpen, compact = false }: { item: CalendarItem; onOpen: (item: CalendarItem) => void; compact?: boolean }) {
  const color = itemColor(item);
  const done = item.kind === "task" && item.task.status === "done";
  const struck = isStruck(item);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      className="group flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-1.5 py-[3px] text-left text-[11.5px] leading-tight transition hover:brightness-[1.04]"
      style={{ background: item.kind === "event" && !item.allDay ? "transparent" : tint(color, 16) }}
      title={`${itemTitle(item)} · ${itemWhen(item)}`}
    >
      {item.kind === "task" ? (
        done ? <CheckCircle2 className="size-3 shrink-0 text-emerald-500" /> : <Circle className="size-3 shrink-0" style={{ color }} />
      ) : (
        <span className="size-[7px] shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${tint(color, 70)}` }} />
      )}
      {item.kind === "event" && !item.allDay && !compact && <span className="shrink-0 tabular text-fg-3">{time(item.start)}</span>}
      <span className={cn("min-w-0 truncate font-medium text-fg group-hover:text-fg", struck && "text-fg-3 line-through")}>{itemTitle(item)}</span>
    </button>
  );
}

/** Row used by the agenda list and the "+N" day popover. */
export function ItemRow({ item, onOpen, showOwner = true }: { item: CalendarItem; onOpen: (item: CalendarItem) => void; showOwner?: boolean }) {
  const color = itemColor(item);
  const ev = item.kind === "event" ? item.event : null;
  const meta = ev ? [ev.contact?.name, ev.company?.name].filter(Boolean).join(" · ") : [item.kind === "task" ? item.task.project?.name : null, item.kind === "task" ? (item.task.contact?.name ?? item.task.company?.name) : null].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={() => onOpen(item)} className="group flex w-full items-stretch gap-3 rounded-[14px] px-2.5 py-2 text-left transition hover:bg-black/[0.035] dark:hover:bg-white/[0.05]">
      <span className="w-[92px] shrink-0 pt-0.5 text-[12px] font-medium tabular text-fg-2">{itemWhen(item)}</span>
      <span className="w-[3px] shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${tint(color, 60)}` }} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13.5px] font-medium", isStruck(item) && "text-fg-3 line-through")}>
          {item.kind === "task" && <span className="mr-1 text-fg-3">Tâche ·</span>}
          {itemTitle(item)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
          {ev?.meeting_url && (
            <span className="inline-flex shrink-0 items-center gap-1 text-accent">
              <Video className="size-3" /> Visio
            </span>
          )}
          {ev?.location && !ev.meeting_url && (
            <span className="inline-flex min-w-0 shrink-0 items-center gap-1">
              <MapPin className="size-3" />
              <span className="truncate">{ev.location}</span>
            </span>
          )}
          {meta && <span className="truncate">{(ev?.meeting_url || ev?.location ? "· " : "") + meta}</span>}
        </span>
      </span>
      {showOwner && ev?.user && <Avatar name={ev.user.name} color={(ev.user.color as string) ?? undefined} size={24} className="self-center" />}
    </button>
  );
}

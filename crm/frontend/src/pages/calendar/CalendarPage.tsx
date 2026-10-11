import { addDays, addHours, isSameMonth, isToday, setHours, startOfDay } from "date-fns";
import { CalendarDays, CalendarRange, CalendarSync, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Kbd, Skeleton } from "@/components/ui/display";
import { Switch } from "@/components/ui/fields";
import { Tooltip } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { CalendarAgenda } from "@/components/work/CalendarAgenda";
import { CalendarMonth } from "@/components/work/CalendarMonth";
import { CalendarWeek } from "@/components/work/CalendarWeek";
import { eventItem, shiftAnchor, taskItem, viewRange, type CalendarItem, type CalendarView } from "@/components/work/calendar-utils";
import { EventSheet } from "@/components/work/EventSheet";
import { useCalendarEvents } from "@/components/work/hooks";
import { IcsDialog } from "@/components/work/IcsDialog";
import { TaskSheet, useTaskParam } from "@/components/work/TaskSheet";
import { eventTypeColor, nextHalfHour, tint } from "@/components/work/work-utils";
import { EVENT_TYPES } from "@/lib/constants";
import { date, dateTime, isoDate, plural } from "@/lib/format";
import { useList, useLocalStorage } from "@/lib/hooks";
import type { CalendarEvent, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

function periodTitle(view: CalendarView, anchor: Date) {
  if (view !== "week") return date(anchor, "MMMM yyyy");
  const { start } = viewRange("week", anchor);
  const end = addDays(start, 6);
  if (isSameMonth(start, end)) return `${date(start, "d")} – ${date(end, "d MMMM yyyy")}`;
  return `${date(start, "d MMM")} – ${date(end, "d MMM yyyy")}`;
}

/** Default slot for a click on a whole day: 9:00 (or the next half hour when that day is today). */
function daySlot(day: Date) {
  const start = isToday(day) && new Date().getHours() >= 9 ? nextHalfHour() : setHours(startOfDay(day), 9);
  return { start, end: addHours(start, 1) };
}

export default function CalendarPage() {
  const me = useAuth((s) => s.user);
  const [view, setView] = useLocalStorage<CalendarView>("prisme-calendar-view", window.innerWidth < 640 ? "agenda" : "month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [scope, setScope] = useLocalStorage<"all" | "mine">("prisme-calendar-scope", "all");
  const [showTasks, setShowTasks] = useLocalStorage("prisme-calendar-tasks", false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [creating, setCreating] = useState<{ start_at: string; end_at: string } | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [taskId, setTaskId] = useTaskParam();
  const [icsOpen, setIcsOpen] = useState(false);

  const range = viewRange(view, anchor);
  const events = useCalendarEvents(range.start, range.end, scope === "mine" && me ? { user_id: me.id } : {});
  const tasks = useList<Task>("tasks", { due_date__gte: isoDate(range.start), due_date__lt: isoDate(range.end), status__ne: "cancelled", ...(scope === "mine" && me ? { assignee_id: me.id } : {}), limit: 500 }, { enabled: showTasks });

  const items = useMemo<CalendarItem[]>(() => {
    const evs = (events.data ?? []).filter((e) => !hidden.includes(e.type)).map(eventItem);
    const ts = showTasks ? (tasks.data?.items ?? []).filter((t) => t.due_date).map(taskItem) : [];
    return [...evs, ...ts];
  }, [events.data, tasks.data, hidden, showTasks]);

  const next = useMemo(() => (events.data ?? []).find((e) => new Date(e.start_at) > new Date()), [events.data]);

  const create = (start: Date, end: Date) => setCreating({ start_at: start.toISOString(), end_at: end.toISOString() });
  const createOnDay = (day: Date) => {
    const slot = daySlot(day);
    create(slot.start, slot.end);
  };
  const open = (it: CalendarItem) => (it.kind === "event" ? setEvent(it.event) : setTaskId(it.task.id));
  const zoom = (day: Date) => {
    setAnchor(day);
    setView("week");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const key = e.key.toLowerCase();
      if (key === "t") setAnchor(new Date());
      else if (key === "arrowleft") setAnchor((a) => shiftAnchor(view, a, -1));
      else if (key === "arrowright") setAnchor((a) => shiftAnchor(view, a, 1));
      else if (key === "m") setView("month");
      else if (key === "w" || key === "s") setView("week");
      else if (key === "a") setView("agenda");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, setView]);

  const eventCount = (events.data ?? []).filter((e) => !hidden.includes(e.type)).length;

  return (
    <div>
      <PageHeader
        title="Agenda"
        icon={<CalendarDays className="size-5" />}
        description={
          events.data ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{plural(eventCount, "événement")} sur la période</span>
              {next && (
                <span className="truncate">
                  Prochain : <b className="font-semibold text-fg">{next.title}</b> · {dateTime(next.start_at)}
                </span>
              )}
            </span>
          ) : (
            "Chargement…"
          )
        }
        actions={
          <>
            <Button variant="glass" icon={<CalendarSync className="size-4" />} onClick={() => setIcsOpen(true)}>
              S'abonner (ICS)
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => create(nextHalfHour(), addHours(nextHalfHour(), 1))}>
              Nouvel événement
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <Tooltip content={<span className="flex items-center gap-1.5">Aujourd'hui <Kbd className="border-white/30 bg-white/10 text-white dark:text-black">T</Kbd></span>}>
            <Button variant="glass" size="sm" onClick={() => setAnchor(new Date())}>
              Aujourd'hui
            </Button>
          </Tooltip>
          <IconButton label="Période précédente" size="sm" variant="glass" onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Période suivante" size="sm" variant="glass" onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}>
            <ChevronRight className="size-4" />
          </IconButton>
          <h2 className="ml-1 truncate text-[22px] font-semibold tracking-[-0.02em] first-letter:uppercase">{periodTitle(view, anchor)}</h2>
        </div>
        <div className="lg:ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />Mois</span> },
              { value: "week", label: <span className="flex items-center gap-1.5"><CalendarRange className="size-4" />Semaine</span> },
              { value: "agenda", label: <span className="flex items-center gap-1.5"><List className="size-4" />Agenda</span> },
            ]}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <div className="glass-flat mr-1 inline-flex rounded-full p-0.5">
          {(
            [
              ["all", "Toute l'équipe"],
              ["mine", "Mon agenda"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setScope(value)} className={cn("h-7 rounded-full px-3 text-[12.5px] font-medium transition", scope === value ? "btn-primary" : "text-fg-2 hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>
        {EVENT_TYPES.map((t) => {
          const color = eventTypeColor(t.value);
          const off = hidden.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={!off}
              onClick={() => setHidden((h) => (off ? h.filter((x) => x !== t.value) : [...h, t.value]))}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition", off ? "text-fg-3 line-through decoration-[var(--hairline-strong)] hover:text-fg-2" : "text-fg")}
              style={off ? { boxShadow: "inset 0 0 0 1px var(--hairline)" } : { background: tint(color, 14), boxShadow: `inset 0 0 0 1px ${tint(color, 32)}` }}
            >
              <span className="size-2 rounded-full" style={{ background: off ? "var(--hairline-strong)" : color }} />
              {t.label}
            </button>
          );
        })}
        <div className="ml-auto pl-2">
          <Switch size="sm" checked={showTasks} onChange={setShowTasks} label={<span className="text-[12.5px] font-medium text-fg-2">Tâches à échéance</span>} />
        </div>
      </div>

      <Glass radius="lg" className="overflow-hidden">
        {events.isLoading && !events.data ? (
          <div className="p-4">
            <Skeleton className="h-[560px] rounded-[16px]" />
          </div>
        ) : view === "month" ? (
          <CalendarMonth anchor={anchor} items={items} onOpen={open} onCreate={createOnDay} onZoom={zoom} />
        ) : view === "week" ? (
          <CalendarWeek anchor={anchor} items={items} onOpen={open} onCreate={create} />
        ) : (
          <CalendarAgenda anchor={anchor} items={items} onOpen={open} onCreate={createOnDay} />
        )}
      </Glass>
      <p className="mt-3 hidden text-center text-[12px] text-fg-3 lg:block">
        Raccourcis : <Kbd>T</Kbd> aujourd'hui · <Kbd>←</Kbd> <Kbd>→</Kbd> naviguer · <Kbd>M</Kbd> <Kbd>S</Kbd> <Kbd>A</Kbd> changer de vue · cliquez ou glissez sur la grille pour créer un événement
      </p>

      <RecordDialog resource="events" open={!!creating} onOpenChange={(o) => !o && setCreating(null)} initial={{ type: "meeting", ...(creating ?? {}) }} />
      <EventSheet event={event} onClose={() => setEvent(null)} />
      <TaskSheet taskId={taskId} onClose={() => setTaskId(null)} />
      <IcsDialog open={icsOpen} onOpenChange={setIcsOpen} />
    </div>
  );
}

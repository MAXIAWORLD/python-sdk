import { useQueryClient } from "@tanstack/react-query";
import { addDays, nextMonday } from "date-fns";
import { AlarmClock, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, Coffee, Inbox, Sun, Sunrise } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/display";
import { Menu } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { date, isoDate, plural } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ColorRing } from "./ColorRing";
import { DueChip, PriorityFlag, refColor, TaskIndicators } from "./TaskCard";
import { TaskCheck } from "./TaskCheck";
import { compareTasks, focusGroup, focusGroups, PRIORITY_COLOR, type FocusGroup } from "./work-utils";

const GROUP_ICON: Record<FocusGroup, ReactNode> = {
  overdue: <AlarmClock className="size-4" />,
  today: <Sun className="size-4" />,
  tomorrow: <Sunrise className="size-4" />,
  week: <CalendarDays className="size-4" />,
  later: <CalendarClock className="size-4" />,
  none: <Inbox className="size-4" />,
};

/** Hook gathering the mutations of the focus list (complete with animation, reopen, reschedule). */
function useFocusActions() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const [completing, setCompleting] = useState<number[]>([]);

  const refresh = () => {
    invalidate("projects");
    return qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const reopen = async (task: Task) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status: "todo" });
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  const complete = async (task: Task) => {
    setCompleting((ids) => [...ids, task.id]);
    try {
      await api.patch(`/tasks/${task.id}`, { status: "done" });
      toast.success("Tâche terminée", { description: task.title, action: { label: "Annuler", onClick: () => reopen(task) } });
      // let the tick animation play before the row leaves the list
      setTimeout(() => refresh().then(() => setCompleting((ids) => ids.filter((id) => id !== task.id))), 650);
    } catch (e) {
      toastError(e);
      setCompleting((ids) => ids.filter((id) => id !== task.id));
    }
  };

  const reschedule = async (task: Task, due: string | null, label: string) => {
    try {
      await api.patch(`/tasks/${task.id}`, { due_date: due });
      toast.success(label, { description: task.title });
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  return { completing, complete, reopen, reschedule };
}

function FocusRow({ task, done, showAssignee, onOpen, onComplete, onReopen, onReschedule }: { task: Task; done: boolean; showAssignee: boolean; onOpen: (t: Task) => void; onComplete: (t: Task) => void; onReopen: (t: Task) => void; onReschedule: (t: Task, due: string | null, label: string) => void }) {
  const today = new Date();
  const context = task.contact?.name ?? task.company?.name ?? task.deal?.name;
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }} className="overflow-hidden">
      <div role="button" tabIndex={0} onClick={() => onOpen(task)} onKeyDown={(e) => e.key === "Enter" && onOpen(task)} className="group flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
        <TaskCheck done={done} ringColor={PRIORITY_COLOR[task.priority]} onToggle={() => (done ? onReopen(task) : onComplete(task))} />
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[14px] font-medium transition-colors duration-300", done && "text-fg-3 line-through")}>{task.title}</div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-3">
            {task.project && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: refColor(task.project) }} />
                <span className="max-w-[180px] truncate">{task.project.name}</span>
              </span>
            )}
            {context && <span className="max-w-[180px] truncate">{context}</span>}
            <TaskIndicators task={task} />
          </div>
        </div>
        {!done && <DueChip task={task} className="hidden sm:inline-flex" />}
        <PriorityFlag priority={task.priority} />
        {showAssignee && task.assignee && <Avatar name={task.assignee.name} color={(task.assignee.color as string) ?? undefined} size={24} />}
        {!done && (
          <span onClick={(e) => e.stopPropagation()} className="opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <Menu
              width={210}
              trigger={
                <button type="button" className="flex size-8 items-center justify-center rounded-[10px] text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Reporter">
                  <CalendarClock className="size-4" />
                </button>
              }
              items={[
                { label: "Aujourd'hui", icon: <Sun className="size-4" />, onSelect: () => onReschedule(task, isoDate(today), "Prévue aujourd'hui") },
                { label: "Demain", icon: <Sunrise className="size-4" />, onSelect: () => onReschedule(task, isoDate(addDays(today, 1)), "Reportée à demain") },
                { label: "Lundi prochain", icon: <CalendarDays className="size-4" />, onSelect: () => onReschedule(task, isoDate(nextMonday(today)), "Reportée à lundi prochain") },
                { label: "Dans une semaine", icon: <CalendarClock className="size-4" />, onSelect: () => onReschedule(task, isoDate(addDays(today, 7)), `Reportée au ${date(addDays(today, 7), "d MMMM")}`) },
                { separator: true, label: "" },
                { label: "Retirer l'échéance", icon: <Inbox className="size-4" />, onSelect: () => onReschedule(task, null, "Échéance retirée") },
              ]}
            />
          </span>
        )}
      </div>
    </motion.div>
  );
}

function Group({ label, icon, count, tone, children, defaultOpen = true }: { label: string; icon: ReactNode; count: number; tone?: "danger" | "accent"; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.section layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mb-1.5 flex w-full items-center gap-2 px-2 text-left">
        <span className={cn("flex size-7 items-center justify-center rounded-[9px]", tone === "danger" ? "bg-red-500/12 text-red-500" : tone === "accent" ? "bg-accent-soft text-accent" : "bg-black/[0.05] text-fg-2 dark:bg-white/[0.07]")}>{icon}</span>
        <span className={cn("text-[14px] font-semibold", tone === "danger" && "text-red-600 dark:text-red-400")}>{label}</span>
        <span className="rounded-full bg-black/[0.06] px-1.5 text-[11px] font-semibold tabular text-fg-2 dark:bg-white/10">{count}</span>
        <span className="ml-2 h-px flex-1 bg-[var(--hairline)]" />
        <ChevronDown className={cn("size-4 text-fg-3 transition-transform", !open && "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <Glass className="p-1.5">{children}</Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** "Ma journée": open tasks grouped by due date, check to complete, quick rescheduling. */
export function TaskFocus({ open, done, loading, showAssignee, onOpen }: { open: Task[]; done: Task[]; loading: boolean; showAssignee: boolean; onOpen: (t: Task) => void }) {
  const actions = useFocusActions();
  const todayKey = isoDate();
  const groups = useMemo(() => {
    const map = new Map<FocusGroup, Task[]>();
    for (const t of open) {
      const g = focusGroup(t);
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return focusGroups().map((g) => ({ ...g, tasks: (map.get(g.key) ?? []).sort(compareTasks) })).filter((g) => g.tasks.length);
  }, [open]);
  const doneToday = done.filter((t) => t.completed_at && isoDate(new Date(t.completed_at)) === todayKey);
  const dueNow = open.filter((t) => ["overdue", "today"].includes(focusGroup(t))).length;
  const overdue = open.filter((t) => focusGroup(t) === "overdue").length;
  const ratio = doneToday.length + dueNow ? (doneToday.length / (doneToday.length + dueNow)) * 100 : 100;

  if (loading && !open.length)
    return (
      <div className="space-y-4">
        <Skeleton className="h-[120px] rounded-[22px]" />
        <Skeleton className="h-[220px] rounded-[22px]" />
      </div>
    );

  return (
    <div className="space-y-5">
      <Glass glow radius="xl" className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-24 size-72 rounded-full bg-[radial-gradient(circle,var(--accent),transparent_65%)] opacity-25 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <ColorRing value={ratio} size={76} stroke={7} color={overdue ? "#ff9f0a" : "#30d158"}>
            <span className="text-[15px] font-semibold">
              {doneToday.length}/{doneToday.length + dueNow}
            </span>
          </ColorRing>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium text-fg-3 first-letter:uppercase">{date(new Date(), "EEEE d MMMM")}</div>
            <div className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em]">{dueNow === 0 ? (doneToday.length ? "Journée bouclée, bravo ✨" : "Rien d'urgent aujourd'hui") : `${plural(dueNow, "tâche")} à traiter aujourd'hui`}</div>
            <div className="mt-0.5 text-[13.5px] text-fg-2">
              {overdue > 0 && <span className="font-semibold text-red-500">dont {overdue} en retard · </span>}
              {doneToday.length > 0 ? `${plural(doneToday.length, "tâche terminée", "tâches terminées")} aujourd'hui` : "Cochez une tâche pour la terminer."}
            </div>
          </div>
        </div>
      </Glass>

      {groups.length === 0 && (
        <Glass>
          <EmptyState icon={<Coffee className="size-6" />} title="Tout est à jour" description="Aucune tâche ouverte avec ces filtres. Ajoutez-en une avec la barre ci-dessus." />
        </Glass>
      )}

      <AnimatePresence initial={false}>
        {groups.map((g) => (
          <Group key={g.key} label={g.label} icon={GROUP_ICON[g.key]} count={g.tasks.length} tone={g.key === "overdue" ? "danger" : g.key === "today" ? "accent" : undefined}>
            <AnimatePresence initial={false}>
              {g.tasks.map((t) => (
                <FocusRow key={t.id} task={t} done={actions.completing.includes(t.id)} showAssignee={showAssignee} onOpen={onOpen} onComplete={actions.complete} onReopen={actions.reopen} onReschedule={actions.reschedule} />
              ))}
            </AnimatePresence>
          </Group>
        ))}
      </AnimatePresence>

      {doneToday.length > 0 && (
        <Group label="Terminées aujourd'hui" icon={<CheckCircle2 className="size-4" />} count={doneToday.length} defaultOpen={false}>
          <AnimatePresence initial={false}>
            {doneToday.map((t) => (
              <FocusRow key={t.id} task={t} done showAssignee={showAssignee} onOpen={onOpen} onComplete={actions.complete} onReopen={actions.reopen} onReschedule={actions.reschedule} />
            ))}
          </AnimatePresence>
        </Group>
      )}
    </div>
  );
}


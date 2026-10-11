import { AlarmClock, AlignLeft, CalendarDays, Clock3, Flag, ListChecks, Mail, Phone, Repeat2, Users, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/display";
import { dayLabel } from "@/lib/format";
import type { Ref, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { checklistStats, hours, isDueToday, isLate, isOpen, PRIORITY_COLOR } from "./work-utils";

export const TASK_TYPE_ICON: Record<string, LucideIcon | undefined> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  follow_up: Repeat2,
  deadline: AlarmClock,
};

/** Colour carried by an expanded project reference ({id, name, color}). */
export function refColor(ref?: Ref | null, fallback = "var(--accent)") {
  return typeof ref?.color === "string" && ref.color ? ref.color : fallback;
}

export function PriorityFlag({ priority, className }: { priority: string; className?: string }) {
  if (priority !== "high" && priority !== "urgent") return null;
  const color = PRIORITY_COLOR[priority];
  return <Flag className={cn("size-3.5 shrink-0", className)} style={{ color, fill: color }} aria-label={priority === "urgent" ? "Priorité urgente" : "Priorité haute"} />;
}

export function DueChip({ task, className }: { task: Task; className?: string }) {
  if (!task.due_date) return null;
  const late = isLate(task);
  const today = isOpen(task) && isDueToday(task);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full text-[11.5px] font-medium",
        late ? "bg-red-500/12 px-1.5 py-px text-red-600 dark:text-red-400" : today ? "bg-orange-500/14 px-1.5 py-px text-orange-700 dark:text-orange-300" : "text-fg-3",
        className,
      )}
    >
      <CalendarDays className="size-3" />
      <span className="first-letter:uppercase">{dayLabel(task.due_date)}</span>
      {task.due_time && <span className="tabular">{task.due_time.slice(0, 5)}</span>}
    </span>
  );
}

/** Small inline indicators (type, checklist, estimate, notes) shared by cards and rows. */
export function TaskIndicators({ task, className }: { task: Task; className?: string }) {
  const TypeIcon = TASK_TYPE_ICON[task.type];
  const cl = checklistStats(task);
  return (
    <span className={cn("inline-flex items-center gap-2 text-[11.5px] text-fg-3", className)}>
      {TypeIcon && <TypeIcon className="size-3.5" />}
      {cl.total > 0 && (
        <span className={cn("inline-flex items-center gap-1 tabular", cl.done === cl.total && "text-emerald-600 dark:text-emerald-400")}>
          <ListChecks className="size-3.5" />
          {cl.done}/{cl.total}
        </span>
      )}
      {!!task.estimate_hours && (
        <span className="inline-flex items-center gap-1 tabular">
          <Clock3 className="size-3" />
          {hours(task.estimate_hours)}
        </span>
      )}
      {task.description && <AlignLeft className="size-3.5" aria-label="Description" />}
    </span>
  );
}

/** Kanban card of a task. */
export function TaskCard({ task, showProject = true, overlay, onOpen }: { task: Task; showProject?: boolean; overlay?: boolean; onOpen?: (task: Task) => void }) {
  const done = task.status === "done";
  return (
    <div
      onClick={() => !overlay && onOpen?.(task)}
      className={cn(
        "glass group cursor-grab rounded-[16px] p-3 transition-shadow active:cursor-grabbing",
        overlay && "rotate-[2deg] scale-[1.03] shadow-[0_30px_60px_-20px_rgba(20,30,90,.55)] ring-1 ring-[var(--accent)]/40",
      )}
      style={{ "--glass-blur": "18px" } as CSSProperties}
    >
      {showProject && task.project && (
        <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-fg-3">
          <span className="size-2 shrink-0 rounded-full" style={{ background: refColor(task.project), boxShadow: `0 0 8px ${refColor(task.project)}` }} />
          <span className="truncate">{task.project.name}</span>
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className={cn("line-clamp-3 min-w-0 flex-1 text-[13.5px] font-medium leading-snug", done && "text-fg-3 line-through decoration-[var(--hairline-strong)]")}>{task.title}</div>
        <PriorityFlag priority={task.priority} className="mt-0.5" />
      </div>
      {!showProject && !task.project && (task.contact || task.company) && <div className="mt-1 truncate text-[12px] text-fg-3">{task.contact?.name ?? task.company?.name}</div>}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {!done && <DueChip task={task} />}
          <TaskIndicators task={task} />
        </div>
        {task.assignee && <Avatar name={task.assignee.name} color={(task.assignee.color as string) ?? undefined} size={22} />}
      </div>
    </div>
  );
}

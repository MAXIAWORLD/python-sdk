import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/display";
import { api } from "@/lib/api";
import { findOption, TASK_STATUS } from "@/lib/constants";
import { toastError, useCreate, useInvalidate } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import { BOARD_STATUSES, TONE_HEX } from "./work-utils";

type Columns = Record<string, Task[]>;

function groupByStatus(tasks: Task[], statuses: readonly string[]): Columns {
  const out: Columns = Object.fromEntries(statuses.map((s) => [s, [] as Task[]]));
  for (const t of tasks) out[t.status]?.push(t);
  for (const s of statuses) out[s].sort((a, b) => a.position - b.position || b.id - a.id);
  return out;
}

const taskKey = (id: number) => `task-${id}`;
const colKey = (status: string) => `col-${status}`;

function SortableTask({ task, showProject, onOpen }: { task: Task; showProject: boolean; onOpen: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: taskKey(task.id) });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-30")} {...attributes} {...listeners}>
      <TaskCard task={task} showProject={showProject} onOpen={onOpen} />
    </div>
  );
}

type AddTask = (status: string, title: string) => Promise<boolean>;

function QuickAdd({ status, onAdd }: { status: string; onAdd: AddTask }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    if (await onAdd(status, value)) setTitle("");
    setBusy(false);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      setTitle("");
      setOpen(false);
    }
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-1.5 rounded-[14px] py-2 text-[12.5px] font-medium text-fg-3 transition hover:bg-black/[0.04] hover:text-fg-2 dark:hover:bg-white/[0.05]">
        <Plus className="size-3.5" /> Ajouter une tâche
      </button>
    );

  return (
    <div className="glass-inset rounded-[14px] p-2">
      <textarea
        autoFocus
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => !title.trim() && setOpen(false)}
        placeholder="Titre de la tâche…"
        className="w-full resize-none bg-transparent px-1 text-[13.5px] leading-snug outline-none placeholder:text-fg-3"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="px-1 text-[11px] text-fg-3">Entrée pour ajouter · Échap pour fermer</span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!title.trim() || busy} className="btn-primary rounded-[9px] px-2.5 py-1 text-[12px] font-semibold disabled:opacity-40">
          Ajouter
        </button>
      </div>
    </div>
  );
}

function BoardColumn({ status, tasks, showProject, onOpen, onAdd }: { status: string; tasks: Task[]; showProject: boolean; onOpen: (t: Task) => void; onAdd: AddTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey(status) });
  const option = findOption(TASK_STATUS, status);
  const color = TONE_HEX[option?.tone ?? "gray"];
  const estimate = tasks.reduce((s, t) => s + (t.estimate_hours ?? 0), 0);
  return (
    <div className="flex min-w-[252px] flex-1 basis-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="truncate text-[13.5px] font-semibold">{option?.label ?? status}</span>
        <span className="rounded-full bg-black/[0.06] px-1.5 text-[11px] font-semibold tabular text-fg-2 dark:bg-white/10">{tasks.length}</span>
        {status === "done" ? <CheckCircle2 className="ml-auto size-3.5 text-emerald-500" /> : estimate > 0 && <span className="ml-auto text-[11px] tabular text-fg-3">{Math.round(estimate * 10) / 10} h estimées</span>}
      </div>
      <div ref={setNodeRef} className={cn("flex min-h-[180px] flex-1 flex-col gap-2 rounded-[20px] p-2 transition-colors", isOver ? "bg-accent-soft ring-1 ring-[var(--accent)]/30" : "bg-black/[0.025] dark:bg-white/[0.03]")}>
        <SortableContext items={tasks.map((t) => taskKey(t.id))} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableTask key={t.id} task={t} showProject={showProject} onOpen={onOpen} />
          ))}
        </SortableContext>
        <QuickAdd status={status} onAdd={onAdd} />
      </div>
    </div>
  );
}

/**
 * Kanban of tasks by status with drag & drop. Order and status are persisted with
 * POST /tasks/reorder; the board updates optimistically and resyncs from the server.
 */
export function TaskBoard({ tasks, loading, onOpen, createDefaults, showProject = true, statuses = BOARD_STATUSES }: { tasks: Task[]; loading?: boolean; onOpen: (task: Task) => void; createDefaults?: Record<string, unknown>; showProject?: boolean; statuses?: readonly string[] }) {
  const invalidate = useInvalidate();
  const create = useCreate<Task>("tasks", { silent: true });
  const [columns, setColumns] = useState<Columns>(() => groupByStatus(tasks, statuses));
  const [source, setSource] = useState(tasks);
  const [active, setActive] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  if (source !== tasks && !active && !saving) {
    setSource(tasks);
    setColumns(groupByStatus(tasks, statuses));
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnOf = (id: UniqueIdentifier, cols: Columns = columns) => {
    const key = String(id);
    if (key.startsWith("col-")) return key.slice(4);
    return statuses.find((s) => cols[s].some((t) => taskKey(t.id) === key));
  };

  const reset = () => setColumns(groupByStatus(source, statuses));

  const onDragStart = (e: DragStartEvent) => {
    const id = Number(String(e.active.id).slice(5));
    setActive(tasks.find((t) => t.id === id) ?? null);
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) return;
    setColumns((cols) => {
      const from = columnOf(a.id, cols);
      const to = columnOf(over.id, cols);
      if (!from || !to || from === to) return cols;
      const task = cols[from].find((t) => taskKey(t.id) === a.id);
      if (!task) return cols;
      const overIndex = cols[to].findIndex((t) => taskKey(t.id) === over.id);
      const index = overIndex >= 0 ? overIndex : cols[to].length;
      return { ...cols, [from]: cols[from].filter((t) => t.id !== task.id), [to]: [...cols[to].slice(0, index), { ...task, status: to }, ...cols[to].slice(index)] };
    });
  };

  const onDragEnd = async ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    if (!over) return reset();
    const status = columnOf(over.id) ?? columnOf(a.id);
    if (!status) return reset();
    const taskId = Number(String(a.id).slice(5));
    let list = columns[status];
    const oldIndex = list.findIndex((t) => t.id === taskId);
    const overIndex = String(over.id).startsWith("task-") ? list.findIndex((t) => taskKey(t.id) === over.id) : list.length - 1;
    if (oldIndex >= 0 && overIndex >= 0 && oldIndex !== overIndex) list = arrayMove(list, oldIndex, overIndex);
    const order = list.map((t) => t.id);
    const original = source.find((t) => t.id === taskId);
    const before = groupByStatus(source, statuses)[status]?.map((t) => t.id) ?? [];
    if (original?.status === status && before.join() === order.join()) return reset();

    setColumns((cols) => ({ ...cols, [status]: list.map((t, i) => ({ ...t, status, position: i })) }));
    setSaving(true);
    try {
      await api.post("/tasks/reorder", { status, order });
      if (original && original.status !== status) {
        const label = findOption(TASK_STATUS, status)?.label ?? status;
        if (status === "done") toast.success("Tâche terminée", { description: original.title });
        else toast.success(`Déplacée dans « ${label} »`, { description: original.title });
      }
    } catch (err) {
      toastError(err);
      reset();
    } finally {
      setSaving(false);
      invalidate("tasks", "projects");
    }
  };

  const addTask: AddTask = async (status, title) => {
    const last = columns[status].at(-1);
    try {
      await create.mutateAsync({ ...createDefaults, title, status, position: last ? last.position + 1 : 0 });
      return true;
    } catch {
      return false; // already reported by the mutation's onError toast
    }
  };

  if (loading && !tasks.length)
    return (
      <div className="flex gap-4 overflow-hidden">
        {statuses.map((s) => (
          <Skeleton key={s} className="h-[420px] min-w-[252px] flex-1 rounded-[22px]" />
        ))}
      </div>
    );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); reset(); }}>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
        {statuses.map((s) => (
          <BoardColumn key={s} status={s} tasks={columns[s] ?? []} showProject={showProject} onOpen={onOpen} onAdd={addTask} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>{active ? <TaskCard task={active} showProject={showProject} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

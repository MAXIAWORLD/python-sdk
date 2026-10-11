import { CalendarClock, Flag, Pencil, Play, Square, Timer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { PropertyList } from "@/components/entity/PropertyList";
import { Button } from "@/components/ui/button";
import { EmptyState, Progress, Skeleton } from "@/components/ui/display";
import { Textarea } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/markdown";
import { Sheet, useConfirm } from "@/components/ui/overlay";
import { PRIORITY, TASK_STATUS, TONE_STYLES } from "@/lib/constants";
import { date, dateTime, duration } from "@/lib/format";
import { useItem, useList, useRemove, useUpdate } from "@/lib/hooks";
import type { Task, TimeEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Checklist } from "./Checklist";
import { useTimer } from "./hooks";
import { refColor } from "./TaskCard";
import { TaskCheck } from "./TaskCheck";
import { hours, PRIORITY_COLOR } from "./work-utils";

/** `?task=12` in the URL ↔ the task sheet (deep-linkable). */
export function useTaskParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("task");
  const taskId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const setTaskId = (id: number | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("task", String(id));
        else next.delete("task");
        return next;
      },
      { replace: true },
    );
  return [taskId, setTaskId] as const;
}

function SectionLabel({ children }: { children: string }) {
  return <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3">{children}</div>;
}

function Description({ task, onSave }: { task: Task; onSave: (value: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const start = () => {
    setDraft(task.description ?? "");
    setEditing(true);
  };
  const save = () => {
    setEditing(false);
    const value = draft.trim();
    if (value !== (task.description ?? "")) onSave(value || null);
  };
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[13px] font-semibold">Description</h4>
        {!editing && task.description && (
          <button type="button" onClick={start} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-3 hover:text-fg">
            <Pencil className="size-3" /> Modifier
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea autoFocus rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Contexte, liens, critères de fin… (markdown accepté)" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && save()} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <Button size="sm" variant="primary" onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : task.description ? (
        <div className="rounded-[14px] bg-black/[0.025] px-3.5 py-2.5 text-[13.5px] dark:bg-white/[0.035]">
          <Markdown>{task.description}</Markdown>
        </div>
      ) : (
        <button type="button" onClick={start} className="w-full rounded-[14px] border border-dashed border-[var(--hairline-strong)] px-3.5 py-3 text-left text-[13px] text-fg-3 transition hover:border-[var(--accent)] hover:text-fg-2">
          Ajouter une description…
        </button>
      )}
    </section>
  );
}

function TimeSpent({ task }: { task: Task }) {
  const { data } = useList<TimeEntry>("time-entries", { task_id: task.id, limit: 500, expand: 0 });
  const minutes = (data?.items ?? []).reduce((s, e) => s + e.minutes, 0);
  if (!minutes && !task.estimate_hours) return null;
  const pct = task.estimate_hours ? (minutes / 60 / task.estimate_hours) * 100 : 0;
  return (
    <section className="rounded-[16px] bg-black/[0.025] px-3.5 py-3 dark:bg-white/[0.035]">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="flex items-center gap-2 font-semibold">
          <Timer className="size-4 text-fg-3" /> Temps passé
        </span>
        <span className="tabular text-fg-2">
          <b className="font-semibold text-fg">{duration(minutes)}</b>
          {task.estimate_hours ? ` / ${hours(task.estimate_hours)} estimées` : ""}
        </span>
      </div>
      {!!task.estimate_hours && <Progress value={pct} height={4} className="mt-2" tone={pct > 100 ? "linear-gradient(90deg,#ff9f0a,#ff453a)" : undefined} />}
    </section>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const update = useUpdate("tasks", { silent: true });
  const patch = (data: Record<string, unknown>) => update.mutate({ id: task.id, data });
  const [title, setTitle] = useState(task.title);
  const [prevTitle, setPrevTitle] = useState(task.title);
  if (task.title !== prevTitle) {
    setPrevTitle(task.title);
    setTitle(task.title);
  }
  const done = task.status === "done";

  const saveTitle = () => {
    const value = title.trim();
    if (!value) return setTitle(task.title);
    if (value !== task.title) patch({ title: value });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <TaskCheck
          done={done}
          size={26}
          className="mt-1"
          ringColor={PRIORITY_COLOR[task.priority]}
          onToggle={() => {
            patch({ status: done ? "todo" : "done" });
            if (!done) toast.success("Tâche terminée", { description: task.title });
          }}
        />
        <textarea
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") setTitle(task.title);
          }}
          aria-label="Titre de la tâche"
          className={cn("field-sizing-content min-w-0 flex-1 resize-none rounded-[10px] bg-transparent px-1 text-[20px] font-semibold leading-snug tracking-[-0.02em] outline-none transition hover:bg-black/[0.03] focus:bg-black/[0.03] dark:hover:bg-white/[0.04] dark:focus:bg-white/[0.04]", done && "text-fg-3 line-through")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <SectionLabel>Statut</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {TASK_STATUS.map((s) => {
              const tone = TONE_STYLES[s.tone ?? "gray"];
              const active = task.status === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => !active && patch({ status: s.value })}
                  className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition", active ? cn(tone.bg, tone.fg, "ring-1 ring-inset ring-current/25") : "glass-flat text-fg-2 hover:text-fg")}
                >
                  <span className={cn("size-1.5 rounded-full", tone.dot)} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <SectionLabel>Priorité</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY.map((p) => {
              const active = task.priority === p.value;
              const color = PRIORITY_COLOR[p.value];
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => !active && patch({ priority: p.value })}
                  className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition", active ? "text-fg" : "glass-flat text-fg-2 hover:text-fg")}
                  style={active ? { background: `color-mix(in oklab, ${color} 18%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)` } : undefined}
                >
                  <Flag className="size-3" style={{ color, fill: active ? color : "transparent" }} />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-[16px] bg-black/[0.025] px-3.5 py-1 dark:bg-white/[0.035]">
        <PropertyList resource="tasks" record={task} fields={["due_date", "due_time", "assignee_id", "type", "project_id", "contact_id", "company_id", "deal_id", "estimate_hours"]} />
      </div>

      <Description task={task} onSave={(description) => patch({ description })} />
      <Checklist task={task} />
      <TimeSpent task={task} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3" /> Créée le {date(task.created_at)}
        </span>
        {task.completed_at && <span>· Terminée le {dateTime(task.completed_at)}</span>}
      </div>
    </div>
  );
}

/** Side sheet showing and editing one task — used by the tasks, project and calendar pages. */
export function TaskSheet({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  const [shownId, setShownId] = useState(taskId);
  if (taskId && taskId !== shownId) setShownId(taskId);
  const { data: task, error } = useItem<Task>("tasks", shownId);
  const remove = useRemove("tasks", { message: "Tâche supprimée" });
  const confirm = useConfirm();
  const timer = useTimer();
  const tracking = !!task && timer.entry?.task_id === task.id;

  const destroy = async () => {
    if (!task) return;
    if (!(await confirm({ title: `Supprimer « ${task.title} » ?`, description: "La tâche et sa checklist seront définitivement supprimées.", danger: true, confirmLabel: "Supprimer" }))) return;
    await remove.mutateAsync(task.id);
    onClose();
  };

  const toggleTimer = () => {
    if (!task) return;
    if (tracking) timer.stop.mutate({}, { onSuccess: () => toast.success("Chronomètre arrêté") });
    else timer.start.mutate({ task_id: task.id, project_id: task.project_id, description: task.title }, { onSuccess: () => toast.success("Chronomètre démarré", { description: task.title }) });
  };

  return (
    <Sheet
      open={!!taskId}
      onOpenChange={(o) => !o && onClose()}
      width={600}
      title={
        task?.project ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: refColor(task.project), boxShadow: `0 0 10px ${refColor(task.project)}` }} />
            <span className="truncate">{task.project.name}</span>
          </span>
        ) : (
          "Tâche"
        )
      }
      footer={
        task && (
          <>
            <Button variant="ghost" className="mr-auto text-red-500" icon={<Trash2 className="size-4" />} onClick={destroy}>
              Supprimer
            </Button>
            <Button variant={tracking ? "danger" : "glass"} icon={tracking ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />} loading={timer.start.isPending || timer.stop.isPending} onClick={toggleTimer}>
              {tracking ? "Arrêter le chrono" : "Chronométrer"}
            </Button>
            <Button variant="primary" onClick={onClose}>
              Fermer
            </Button>
          </>
        )
      }
    >
      {error ? (
        <EmptyState title="Tâche introuvable" description="Elle a peut-être été supprimée." />
      ) : task ? (
        <TaskDetail key={task.id} task={task} />
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-16" />
          <Skeleton className="h-48" />
        </div>
      )}
    </Sheet>
  );
}

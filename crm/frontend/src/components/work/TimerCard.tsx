import { Play, RotateCcw, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Input, Switch } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { time } from "@/lib/format";
import { toastError, useInvalidate, useList } from "@/lib/hooks";
import type { TimeEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useElapsed, useTimer } from "./hooks";
import { refColor } from "./TaskCard";
import { stopwatch, tint } from "./work-utils";

function Digit({ char }: { char: string }) {
  return (
    <span className="relative inline-block h-[1.08em] w-[0.6em] overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={char}
          initial={{ y: "70%", opacity: 0, filter: "blur(6px)" }}
          animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 text-center"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** "01:23:45" with each digit rolling independently. */
export function Stopwatch({ seconds, running, className }: { seconds: number; running: boolean; className?: string }) {
  const text = stopwatch(seconds);
  return (
    <div className={cn("flex items-center font-semibold leading-none tracking-[-0.04em] tabular", running ? "text-fg" : "text-fg-3", className)} role="timer" aria-live="off" aria-label={text}>
      {text.split("").map((ch, i) =>
        ch === ":" ? (
          <span key={i} className={cn("mx-[0.02em] -translate-y-[0.06em] text-fg-3", running && "animate-pulse")}>
            :
          </span>
        ) : (
          <Digit key={i} char={ch} />
        ),
      )}
    </div>
  );
}

interface Combo {
  key: string;
  project_id?: number | null;
  task_id?: number | null;
  description?: string | null;
  label: string;
  sub?: string;
  color: string;
}

/** Prominent stopwatch card: start (project, task, description) / stop, with one-click "resume" of recent work. */
export function TimerCard({ className }: { className?: string }) {
  const me = useAuth((s) => s.user);
  const invalidate = useInvalidate();
  const timer = useTimer();
  const entry = timer.entry;
  const running = !!entry?.started_at;
  const seconds = useElapsed(entry?.started_at);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectLabel, setProjectLabel] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [runningDraft, setRunningDraft] = useState<string | null>(null);

  const recent = useList<TimeEntry>("time-entries", { user_id: me?.id, sort: "-date", limit: 40 }, { enabled: !!me });
  const combos = useMemo(() => {
    const out: Combo[] = [];
    for (const e of recent.data?.items ?? []) {
      if (!e.project_id && !e.description) continue;
      const key = `${e.project_id}-${e.task_id}-${(e.description ?? "").toLowerCase()}`;
      if (out.some((c) => c.key === key)) continue;
      out.push({ key, project_id: e.project_id, task_id: e.task_id, description: e.description, label: e.project?.name ?? "Sans projet", sub: e.task?.name ?? e.description ?? undefined, color: refColor(e.project, "#8e8e93") });
      if (out.length === 4) break;
    }
    return out;
  }, [recent.data]);

  const glow = running ? refColor(entry?.project, "#5b6cff") : "#5b6cff";

  const start = (body: { project_id?: number | null; task_id?: number | null; description?: string | null }) =>
    timer.start.mutate(
      { ...body, billable },
      {
        onSuccess: () => {
          toast.success("Chronomètre démarré");
          setDescription("");
          setTaskId(null);
        },
      },
    );

  const stop = () =>
    timer.stop.mutate(
      { description: runningDraft?.trim() || undefined },
      {
        onSuccess: (res) => {
          setRunningDraft(null);
          toast.success("Temps enregistré", { description: `${Math.max(res.entry.minutes, 0)} min sur ${res.entry.project?.name ?? "aucun projet"}` });
        },
      },
    );

  const patchRunning = async (data: Record<string, unknown>) => {
    if (!entry) return;
    try {
      await api.patch(`/time-entries/${entry.id}`, data);
      invalidate("timer", "time-entries");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Glass glow radius="xl" className={cn("relative overflow-hidden", className)}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 size-[380px] rounded-full blur-[70px]"
        style={{ background: glow }}
        animate={{ opacity: running ? [0.32, 0.5, 0.32] : 0.14, scale: running ? [1, 1.08, 1] : 1 }}
        transition={running ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />
      <div className="relative z-10 flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">
            {running ? (
              <>
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
                </span>
                <span className="text-red-500 dark:text-red-400">En cours</span>
                <span className="font-medium normal-case tracking-normal">· démarré à {time(entry?.started_at)}</span>
              </>
            ) : (
              "Chronomètre"
            )}
          </div>
          {!running && <Switch size="sm" checked={billable} onChange={setBillable} label={<span className="text-[12.5px] font-medium text-fg-2">Facturable</span>} />}
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <Stopwatch seconds={seconds} running={running} className="text-[58px] sm:text-[76px]" />
          <Button
            size="lg"
            variant={running ? "danger" : "primary"}
            className="h-14 min-w-[170px] rounded-[18px] text-[16px]"
            loading={timer.start.isPending || timer.stop.isPending}
            icon={running ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            onClick={() => (running ? stop() : start({ project_id: projectId, task_id: taskId, description: description.trim() || null }))}
          >
            {running ? "Arrêter" : "Démarrer"}
          </Button>
        </div>

        {running && entry ? (
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
            <EntitySelect resource="projects" value={entry.project_id ?? null} initialLabel={entry.project?.name} onChange={(id) => patchRunning({ project_id: id, task_id: null })} placeholder="Projet" />
            <EntitySelect resource="tasks" value={entry.task_id ?? null} initialLabel={entry.task?.name} params={entry.project_id ? { project_id: entry.project_id } : undefined} onChange={(id) => patchRunning({ task_id: id })} placeholder="Tâche (facultatif)" />
            <Input value={runningDraft ?? entry.description ?? ""} onChange={(e) => setRunningDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && stop()} placeholder="Sur quoi travaillez-vous ?" />
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
            <EntitySelect
              resource="projects"
              value={projectId}
              initialLabel={projectLabel}
              params={{ status__in: "planned,active,on_hold" }}
              onChange={(id, row) => {
                setProjectId(id);
                setProjectLabel(row ? String(row.name ?? "") : null);
                setTaskId(null);
              }}
              placeholder="Projet"
            />
            <EntitySelect resource="tasks" value={taskId} params={projectId ? { project_id: projectId, status__nin: "done,cancelled" } : { status__nin: "done,cancelled" }} onChange={(id) => setTaskId(id)} placeholder="Tâche (facultatif)" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start({ project_id: projectId, task_id: taskId, description: description.trim() || null })} placeholder="Sur quoi travaillez-vous ?" />
          </div>
        )}

        {!running && combos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-3">
              <RotateCcw className="size-3.5" /> Reprendre
            </span>
            {combos.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => start({ project_id: c.project_id, task_id: c.task_id, description: c.description })}
                className="group inline-flex max-w-[260px] items-center gap-2 rounded-full py-1 pl-2 pr-1 text-[12.5px] transition hover:brightness-110"
                style={{ background: tint(c.color, 14), boxShadow: `inset 0 0 0 1px ${tint(c.color, 30)}` }}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 truncate">
                  <span className="font-medium">{c.label}</span>
                  {c.sub && <span className="text-fg-2"> · {c.sub}</span>}
                </span>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-fg shadow-sm transition group-hover:scale-110 dark:bg-white/15">
                  <Play className="size-2.5 fill-current" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Glass>
  );
}

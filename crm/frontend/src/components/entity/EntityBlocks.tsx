import { ArrowLeft, CalendarDays, CheckCircle2, Circle, Plus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { Panel } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { Input } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/markdown";
import { PRIORITY } from "@/lib/constants";
import { dayLabel } from "@/lib/format";
import { useCreate, useList, useUpdate } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import type { Scope } from "./Timeline";

/* -------------------------------------------------------------------------- */
/* Detail header                                                              */
/* -------------------------------------------------------------------------- */

/** Top of every record page: back link, visual, title, meta line, badges and actions. */
export function DetailHeader({ back, backLabel, visual, title, subtitle, badges, actions, loading }: { back: string; backLabel: string; visual?: ReactNode; title?: ReactNode; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode; loading?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5">
      <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-2 transition hover:text-fg">
        <ArrowLeft className="size-4" /> {backLabel}
      </button>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {visual}
          <div className="min-w-0">
            {loading ? <Skeleton className="h-8 w-64" /> : <h1 className="truncate text-[26px] font-semibold tracking-[-0.025em] sm:text-[28px]">{title}</h1>}
            {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-fg-2">{subtitle}</div>}
            {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </motion.div>
    </div>
  );
}

/** Tell Iris which record the user is looking at (better answers to "summarise this", "draft a reply"…). */
export function useAssistantRecord(type: string, id?: number, label?: string | null) {
  const set = useUI((s) => s.setAssistantContext);
  useEffect(() => {
    if (id) set({ type, id, label: label ?? undefined });
  }, [type, id, label, set]);
}

/* -------------------------------------------------------------------------- */
/* AI summary                                                                 */
/* -------------------------------------------------------------------------- */

export function AiSummaryPanel({ resource, id, title = "Synthèse d'Iris", kind = "summarize", params }: { resource: string; id: number; title?: string; kind?: string; params?: Record<string, unknown> }) {
  const ai = useAiGenerate();
  return (
    <Glass className="ai-border overflow-hidden" glow>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <span className="ai-gradient flex size-6 items-center justify-center rounded-[8px] text-white">
            <Sparkles className="size-3.5" />
          </span>
          {title}
        </div>
        <Button size="xs" variant={ai.text ? "ghost" : "ai"} loading={ai.loading} onClick={() => ai.run(kind, params ?? { resource, id })}>
          {ai.text ? "Régénérer" : "Générer"}
        </Button>
      </div>
      <div className="px-4 pb-4 pt-1 text-[13.5px]">
        {ai.text ? <Markdown streaming={ai.loading}>{ai.text}</Markdown> : <p className="text-[12.5px] text-fg-3">Situation, derniers échanges, risques et prochaine action recommandée — en un clic.</p>}
      </div>
    </Glass>
  );
}

/* -------------------------------------------------------------------------- */
/* Related tasks                                                              */
/* -------------------------------------------------------------------------- */

export function TaskRow({ task, showContext = true }: { task: Task; showContext?: boolean }) {
  const update = useUpdate("tasks", { silent: true });
  const done = task.status === "done";
  const late = !done && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
      <button onClick={() => update.mutate({ id: task.id, data: { status: done ? "todo" : "done" } })} className={cn("shrink-0 transition", done ? "text-emerald-500" : "text-fg-3 hover:text-emerald-500")} aria-label={done ? "Rouvrir" : "Terminer"}>
        {done ? <CheckCircle2 className="size-[18px]" /> : <Circle className="size-[18px]" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13.5px]", done && "text-fg-3 line-through")}>{task.title}</div>
        <div className={cn("flex items-center gap-1 text-[11.5px]", late ? "text-red-500" : "text-fg-3")}>
          {task.due_date && (
            <>
              <CalendarDays className="size-3" /> {dayLabel(task.due_date)}
              {task.due_time ? ` ${task.due_time.slice(0, 5)}` : ""}
            </>
          )}
          {showContext && (task.contact?.name || task.deal?.name || task.project?.name) && <span className="truncate">· {task.contact?.name ?? task.deal?.name ?? task.project?.name}</span>}
        </div>
      </div>
      {(task.priority === "high" || task.priority === "urgent") && !done && <StatusBadge options={PRIORITY} value={task.priority} size="xs" />}
      {task.assignee && <Avatar name={task.assignee.name} color={(task.assignee.color as string) ?? undefined} size={22} />}
    </motion.div>
  );
}

/** Open tasks linked to a record, with a quick-add field. */
export function RelatedTasks({ scope, title = "Tâches", className }: { scope: Scope; title?: string; className?: string }) {
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState("");
  const { data, isLoading } = useList<Task>("tasks", { ...scope, sort: "due_date", limit: 50, ...(showDone ? {} : { status__nin: "done,cancelled" }) });
  const create = useCreate("tasks", { silent: true });
  const add = async () => {
    if (!draft.trim()) return;
    await create.mutateAsync({ ...scope, title: draft.trim(), due_date: due || null });
    setDraft("");
    setDue("");
  };
  return (
    <Panel
      title={title}
      className={className}
      bodyClassName="px-2.5 pb-3"
      actions={
        <button onClick={() => setShowDone((v) => !v)} className="text-[12px] font-medium text-fg-3 hover:text-fg">
          {showDone ? "Masquer terminées" : "Voir terminées"}
        </button>
      }
    >
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nouvelle tâche…" className="h-9 flex-1 text-[13px]" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 w-[138px] text-[12.5px]" />
        <Button size="sm" variant="subtle" onClick={add} loading={create.isPending} aria-label="Ajouter">
          <Plus className="size-4" />
        </Button>
      </div>
      {isLoading && <Skeleton className="mx-1 mt-2 h-10" />}
      {!isLoading && !data?.items.length && <p className="px-3 py-4 text-center text-[12.5px] text-fg-3">Aucune tâche {showDone ? "" : "ouverte"}.</p>}
      <AnimatePresence initial={false}>
        {data?.items.map((t) => (
          <TaskRow key={t.id} task={t} showContext={false} />
        ))}
      </AnimatePresence>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk selection bar                                                         */
/* -------------------------------------------------------------------------- */

/** Floating liquid-glass action bar shown while rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div initial={{ y: 80, opacity: 0, x: "-50%" }} animate={{ y: 0, opacity: 1, x: "-50%" }} exit={{ y: 80, opacity: 0, x: "-50%" }} transition={{ type: "spring", stiffness: 380, damping: 30 }} className="fixed bottom-24 left-1/2 z-40 lg:bottom-6">
          <div className="glass glass-strong liquid flex items-center gap-2 rounded-[20px] py-2 pl-4 pr-2 shadow-[var(--glass-shadow-lg)]">
            <span className="mr-1 whitespace-nowrap text-[13px] font-semibold tabular">
              {count} sélectionné{count > 1 ? "s" : ""}
            </span>
            <span className="h-5 w-px bg-[var(--hairline-strong)]" />
            <div className="flex items-center gap-1">{children}</div>
            <button onClick={onClear} className="ml-1 rounded-full p-1.5 text-fg-3 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Désélectionner">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Compact list row linking to a related record. */
export function RelatedRow({ to, title, meta, right, icon }: { to: string; title: ReactNode; meta?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-[12px] px-2.5 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium">{title}</div>
        {meta && <div className="truncate text-[11.5px] text-fg-3">{meta}</div>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </Link>
  );
}

export function NotFoundRecord({ label, back }: { label: string; back: string }) {
  return (
    <Glass className="mx-auto mt-10 max-w-lg">
      <EmptyState
        title={`${label} introuvable`}
        description="Cet élément a peut-être été supprimé."
        action={
          <Button asChild variant="primary">
            <Link to={back}>Retour à la liste</Link>
          </Button>
        }
      />
    </Glass>
  );
}

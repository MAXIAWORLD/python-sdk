import { CalendarClock, FileText, Mail, MessageSquareText, MoreHorizontal, Phone, Pin, PinOff, Sparkles, Trash2, Users, Wand2, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { extractJson, useAiGenerate } from "@/components/ai/AiGenerate";
import { FilterChip } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { NumberInput, Select, Textarea } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/markdown";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { ACTIVITY_TYPES, findOption } from "@/lib/constants";
import { dateTime, dayLabel, duration, isoDate, relative } from "@/lib/format";
import { toastError, useCreate, useInvalidate, useList, useRemove, useUpdate } from "@/lib/hooks";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface Scope {
  contact_id?: number;
  company_id?: number;
  deal_id?: number;
  ticket_id?: number;
  project_id?: number;
}

const ICONS: Record<string, ReactNode> = {
  note: <MessageSquareText className="size-3.5" />,
  call: <Phone className="size-3.5" />,
  email: <Mail className="size-3.5" />,
  meeting: <Users className="size-3.5" />,
  task: <CalendarClock className="size-3.5" />,
  deal: <Zap className="size-3.5" />,
  quote: <FileText className="size-3.5" />,
  invoice: <FileText className="size-3.5" />,
  ai: <Sparkles className="size-3.5" />,
};

const TONE_BG: Record<string, string> = {
  note: "from-amber-400 to-orange-400",
  call: "from-emerald-400 to-teal-500",
  email: "from-sky-400 to-blue-500",
  meeting: "from-violet-400 to-fuchsia-500",
  task: "from-teal-400 to-cyan-500",
  deal: "from-indigo-400 to-violet-500",
  quote: "from-cyan-400 to-sky-500",
  invoice: "from-orange-400 to-rose-400",
  ticket: "from-pink-400 to-rose-500",
  ai: "from-fuchsia-400 to-indigo-500",
  system: "from-zinc-400 to-zinc-500",
};

const OUTCOMES = [
  { value: "connected", label: "Joint" },
  { value: "voicemail", label: "Messagerie" },
  { value: "no_answer", label: "Pas de réponse" },
  { value: "busy", label: "Occupé" },
  { value: "wrong_number", label: "Mauvais numéro" },
];

type ComposerType = "note" | "call" | "meeting" | "email";

/** Log a note, call, meeting or offline email against any record — with AI structuring of meeting notes. */
export function ActivityComposer({ scope, onLogged }: { scope: Scope; onLogged?: () => void }) {
  const [type, setType] = useState<ComposerType>("note");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("connected");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState<{ title: string; due_in_days?: number; priority?: string }[]>([]);
  const create = useCreate<Activity>("activities", { silent: true });
  const ai = useAiGenerate();
  const invalidate = useInvalidate();

  const placeholder = {
    note: "Écrire une note… (markdown accepté)",
    call: "Résumé de l'appel…",
    meeting: "Notes de réunion brutes — Iris peut les structurer ✨",
    email: "Email échangé hors CRM (copie / résumé)…",
  }[type];

  const submit = async () => {
    if (!body.trim()) return;
    const firstLine = body.trim().split("\n")[0].replace(/^[#*\s]+/, "").slice(0, 90);
    await create.mutateAsync({
      ...scope,
      type,
      subject: type === "call" ? `Appel — ${OUTCOMES.find((o) => o.value === outcome)?.label}` : firstLine,
      body,
      outcome: type === "call" ? outcome : null,
      duration_minutes: minutes,
      direction: type === "email" ? "in" : null,
    });
    toast.success(type === "note" ? "Note ajoutée" : "Activité enregistrée");
    setBody("");
    setMinutes(null);
    setFocused(false);
    onLogged?.();
  };

  const structure = async () => {
    const out = await ai.run("meeting_notes", { text: body });
    if (!out) return;
    const tasks = extractJson<{ title: string; due_in_days?: number; priority?: string }[]>(out);
    setBody(out.replace(/```(?:json)?[\s\S]*?```/g, "").trim());
    if (Array.isArray(tasks) && tasks.length) setSuggestedTasks(tasks);
  };

  const createTasks = async () => {
    try {
      for (const t of suggestedTasks) {
        const due = new Date();
        due.setDate(due.getDate() + Number(t.due_in_days ?? 3));
        await api.post("/tasks", { ...scope, title: t.title, priority: ["low", "medium", "high"].includes(String(t.priority)) ? t.priority : "medium", due_date: isoDate(due) });
      }
      toast.success(`${suggestedTasks.length} tâche(s) créée(s)`);
      setSuggestedTasks([]);
      invalidate("tasks");
    } catch (e) {
      toastError(e);
    }
  };

  const types: { value: ComposerType; label: string; icon: ReactNode }[] = [
    { value: "note", label: "Note", icon: ICONS.note },
    { value: "call", label: "Appel", icon: ICONS.call },
    { value: "meeting", label: "Réunion", icon: ICONS.meeting },
    { value: "email", label: "Email", icon: ICONS.email },
  ];

  return (
    <div className="glass-inset rounded-[18px] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {types.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-medium transition", type === t.value ? "bg-[var(--glass-strong)] text-fg shadow-[var(--glass-shadow)]" : "text-fg-2 hover:text-fg")}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setFocused(true)}
        rows={focused || body ? 4 : 2}
        placeholder={placeholder}
        className="bg-transparent ring-0 hover:bg-transparent focus:bg-transparent focus:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <AnimatePresence>
        {(focused || body) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            {suggestedTasks.length > 0 && (
              <div className="mt-2 rounded-[14px] bg-accent-soft p-3 text-[13px]">
                <div className="mb-1.5 font-semibold text-accent">Tâches détectées par Iris</div>
                <ul className="mb-2 list-disc space-y-0.5 pl-5 text-fg-2">
                  {suggestedTasks.map((t, i) => (
                    <li key={i}>
                      {t.title} <span className="text-fg-3">· J+{t.due_in_days ?? 3}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button size="xs" variant="primary" onClick={createTasks}>
                    Créer ces tâches
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setSuggestedTasks([])}>
                    Ignorer
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {type === "call" && <Select options={OUTCOMES} value={outcome} onChange={setOutcome} className="w-[150px]" />}
              {(type === "call" || type === "meeting") && <NumberInput value={minutes} onChange={setMinutes} suffix="min" placeholder="Durée" className="w-[110px]" />}
              {type === "meeting" && (
                <Button size="sm" variant="ai" icon={<Wand2 className="size-3.5" />} loading={ai.loading} disabled={!body.trim()} onClick={structure}>
                  Structurer
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-[11.5px] text-fg-3 sm:inline">⌘/Ctrl + Entrée</span>
                <Button size="sm" variant="ghost" onClick={() => { setBody(""); setFocused(false); }}>
                  Annuler
                </Button>
                <Button size="sm" variant="primary" loading={create.isPending} disabled={!body.trim()} onClick={submit}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActivityItem({ a }: { a: Activity }) {
  const update = useUpdate("activities", { silent: true });
  const remove = useRemove("activities", { silent: true });
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const opt = findOption(ACTIVITY_TYPES, a.type);
  const long = (a.body?.length ?? 0) > 280;
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group relative flex gap-3 pb-5">
      <div className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_4px_12px_-4px_rgba(0,0,0,.35)]", TONE_BG[a.type] ?? TONE_BG.system)}>
        {ICONS[a.type] ?? <Zap className="size-3.5" />}
      </div>
      <div className={cn("min-w-0 flex-1 rounded-[16px] px-3.5 py-2.5", a.pinned ? "glass" : "bg-black/[0.025] dark:bg-white/[0.035]")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[13.5px] font-medium">{a.subject || opt?.label}</span>
              {a.pinned && <Pin className="size-3 text-accent" />}
              {a.outcome && <Badge size="xs">{OUTCOMES.find((o) => o.value === a.outcome)?.label ?? a.outcome}</Badge>}
              {a.duration_minutes ? <span className="text-[11.5px] text-fg-3">{duration(a.duration_minutes)}</span> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
              {a.user && <Avatar name={a.user.name} color={(a.user.color as string) ?? undefined} size={16} />}
              <span>{a.user?.name ?? "Système"}</span>
              <span>·</span>
              <span title={dateTime(a.occurred_at)}>{relative(a.occurred_at)}</span>
              {a.deal && <span className="truncate">· {a.deal.name}</span>}
            </div>
          </div>
          <Menu
            trigger={
              <button className="rounded-[8px] p-1 text-fg-3 opacity-0 transition hover:bg-black/5 hover:text-fg group-hover:opacity-100 dark:hover:bg-white/10" aria-label="Actions">
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={[
              { label: a.pinned ? "Désépingler" : "Épingler", icon: a.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />, onSelect: () => update.mutate({ id: a.id, data: { pinned: !a.pinned } }) },
              { separator: true, label: "" },
              {
                label: "Supprimer",
                danger: true,
                icon: <Trash2 className="size-4" />,
                onSelect: async () => {
                  if (await confirm({ title: "Supprimer cette activité ?", danger: true, confirmLabel: "Supprimer" })) remove.mutate(a.id);
                },
              },
            ]}
          />
        </div>
        {a.body && a.type !== "system" && (
          <div className={cn("relative mt-1.5 text-[13.5px]", long && !expanded && "max-h-[132px] overflow-hidden")}>
            <Markdown>{a.body}</Markdown>
            {long && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-2)] to-transparent opacity-80" />}
          </div>
        )}
        {long && (
          <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-[12px] font-medium text-accent">
            {expanded ? "Réduire" : "Lire la suite"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** Chronological activity feed for a record, grouped by day, with type filters and a composer. */
export function Timeline({ scope, composer = true, limit = 60 }: { scope: Scope; composer?: boolean; limit?: number }) {
  const [filter, setFilter] = useState<string>("all");
  const { data, isLoading } = useList<Activity>("activities", { ...scope, sort: "-occurred_at", limit, ...(filter !== "all" ? { type: filter } : {}) });
  const items = useMemo(() => {
    const rows = data?.items ?? [];
    return [...rows.filter((r) => r.pinned), ...rows.filter((r) => !r.pinned)];
  }, [data]);
  const groups = useMemo(() => {
    const out: { label: string; items: Activity[] }[] = [];
    for (const a of items) {
      const label = a.pinned ? "Épinglé" : dayLabel(a.occurred_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-4">
      {composer && <ActivityComposer scope={scope} />}
      <div className="flex flex-wrap gap-1.5">
        {[{ value: "all", label: "Tout" }, ...ACTIVITY_TYPES.filter((t) => ["note", "call", "email", "meeting", "deal", "quote", "invoice", "ticket"].includes(t.value))].map((t) => (
          <FilterChip key={t.value} active={filter === t.value} onClick={() => setFilter(t.value)}>
            {t.label}
          </FilterChip>
        ))}
      </div>
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}
      {!isLoading && items.length === 0 && <EmptyState icon={<MessageSquareText className="size-6" />} title="Aucune activité" description="Notes, appels, emails et événements apparaîtront ici." />}
      <div className="relative">
        {items.length > 0 && <div className="absolute bottom-6 left-4 top-2 w-px bg-[var(--hairline-strong)]" />}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="relative z-10 mb-3 ml-1 inline-flex rounded-full bg-[var(--glass-strong)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3 shadow-[var(--glass-shadow)] first-letter:uppercase">{g.label}</div>
            {g.items.map((a) => (
              <ActivityItem key={a.id} a={a} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

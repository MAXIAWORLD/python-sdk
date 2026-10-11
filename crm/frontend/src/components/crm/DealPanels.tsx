import { Building2, CalendarClock, Check, ChevronDown, FileText, Flag, Gauge, ListTodo, Pencil, Plus, Star, UserPlus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { splitSubject } from "@/components/ai/AiGenerate";
import { Panel } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { TaskRow } from "@/components/entity/EntityBlocks";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Ring, Skeleton, StatusBadge } from "@/components/ui/display";
import { Input, NumberInput } from "@/components/ui/fields";
import { Popover } from "@/components/ui/overlay";
import { LIFECYCLE } from "@/lib/constants";
import { dayLabel, daysFromNow, isoDate, money } from "@/lib/format";
import { useCreate, useList, useUpdate } from "@/lib/hooks";
import type { Contact, Deal, Quote, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { companyQueries, QuoteRow } from "./CompanyTabs";

/** Shared list params, so tab counters and tab contents (and the shared side panels) hit the same cache. */
export const dealQueries = {
  quotes: (id: number) => ({ deal_id: id, sort: "-issue_date", limit: 50 }),
  tasks: (id: number) => ({ deal_id: id, sort: "due_date", limit: 100 }),
  openTasks: (id: number) => ({ deal_id: id, sort: "due_date", limit: 50, status__nin: "done,cancelled" }),
  documents: (id: number) => ({ deal_id: id, sort: "-created_at", limit: 50 }),
};

export type DealTab = "activity" | "quotes" | "tasks" | "documents" | "contacts";

function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/* -------------------------------------------------------------------------- */
/* Forecast                                                                   */
/* -------------------------------------------------------------------------- */

function Line({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-fg-3">{label}</span>
      <span className={cn("tabular", strong ? "font-semibold text-fg" : "text-fg-2")}>{children}</span>
    </div>
  );
}

/** Probability (stage or manual override), weighted value and value breakdown. */
export function ForecastPanel({ deal, stageName, stageProbability }: { deal: Deal; stageName?: string; stageProbability: number }) {
  const update = useUpdate("deals", { message: "Probabilité mise à jour" });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const overridden = deal.probability !== null && deal.probability !== undefined;
  const closed = deal.status !== "open";
  const effective = deal.status === "won" ? 100 : deal.status === "lost" ? 0 : (deal.probability ?? stageProbability);
  const weighted = (deal.value * effective) / 100;

  const apply = (value: number | null) => {
    update.mutate({ id: deal.id, data: { probability: value === null ? null : Math.max(0, Math.min(100, Math.round(value))) } });
    setOpen(false);
  };

  return (
    <Panel
      title="Prévision"
      icon={<Gauge className="size-4" />}
      actions={
        !closed && (
          <Popover
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o) setDraft(effective);
            }}
            width={290}
            trigger={
              <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-3 hover:text-fg">
                Ajuster <ChevronDown className="size-3" />
              </button>
            }
          >
            <div className="space-y-3 p-4">
              <div>
                <div className="text-[13.5px] font-semibold">Probabilité de gain</div>
                <div className="mt-0.5 text-[12px] text-fg-3">
                  Par défaut, celle de l'étape « {stageName ?? "—"} » ({stageProbability} %).
                </div>
              </div>
              <div className="flex gap-2">
                <NumberInput value={draft} onChange={setDraft} suffix="%" min={0} step={5} className="flex-1" />
                <Button variant="primary" disabled={draft === null} onClick={() => apply(draft)}>
                  Appliquer
                </Button>
              </div>
              {overridden && (
                <button type="button" onClick={() => apply(null)} className="text-[12.5px] font-medium text-accent">
                  Revenir à la probabilité de l'étape
                </button>
              )}
            </div>
          </Popover>
        )
      }
    >
      <div className="flex items-center gap-4">
        <Ring value={effective} size={66} stroke={6}>
          <span className="text-[14px] font-semibold">{effective} %</span>
        </Ring>
        <div className="min-w-0">
          <div className="text-[12px] text-fg-3">Valeur pondérée</div>
          <div className="text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular">{money(weighted, "EUR", { decimals: 0 })}</div>
          <div className="truncate text-[11.5px] text-fg-3">
            {deal.status === "won" ? "Affaire gagnée" : deal.status === "lost" ? "Affaire perdue" : overridden ? `Ajustée manuellement · étape : ${stageProbability} %` : `Probabilité de l'étape « ${stageName ?? "—"} »`}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 rounded-[14px] bg-black/[0.03] p-3 text-[12.5px] dark:bg-white/[0.04]">
        <Line label="One-shot HT">{money(deal.amount, "EUR", { decimals: 0 })}</Line>
        <Line label="Récurrent (MRR)">{deal.mrr ? `${money(deal.mrr, "EUR", { decimals: 0 })} /mois` : "—"}</Line>
        <Line label="Valeur 1re année" strong>
          {money(deal.value, "EUR", { decimals: 0 })}
        </Line>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Next step                                                                  */
/* -------------------------------------------------------------------------- */

const QUICK_DATES = [
  { label: "Demain", days: 1 },
  { label: "Dans 3 jours", days: 3 },
  { label: "Dans 1 semaine", days: 7 },
];

/** Editable "next step" card: the single action that keeps the deal moving. */
export function NextStepCard({ deal, className }: { deal: Deal; className?: string }) {
  const update = useUpdate("deals", { message: "Prochaine étape mise à jour" });
  const createTask = useCreate("tasks", { message: "Tâche créée" });
  const logActivity = useCreate("activities", { silent: true });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const days = daysFromNow(deal.next_step_date);
  const overdue = deal.status === "open" && days !== null && days < 0;

  const startEdit = (fromScratch = false) => {
    setText(fromScratch ? "" : (deal.next_step ?? ""));
    setDue(fromScratch ? "" : (deal.next_step_date ?? ""));
    setEditing(true);
  };

  const save = async () => {
    try {
      await update.mutateAsync({ id: deal.id, data: { next_step: text.trim() || null, next_step_date: due || null } });
      setEditing(false);
    } catch {
      /* erreur déjà signalée */
    }
  };

  const done = async () => {
    if (!deal.next_step) return;
    try {
      await logActivity.mutateAsync({ type: "note", subject: `Étape réalisée : ${deal.next_step}`, deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id });
      await update.mutateAsync({ id: deal.id, data: { next_step: null, next_step_date: null } });
      startEdit(true);
    } catch {
      /* erreur déjà signalée */
    }
  };

  if (deal.status !== "open" && !deal.next_step && !editing) return null;

  const when = deal.next_step_date ? `${dayLabel(deal.next_step_date)} · ${days === 0 ? "aujourd'hui" : overdue ? `en retard de ${-(days ?? 0)} j` : `dans ${days} j`}` : "Sans échéance";

  return (
    <Panel
      title="Prochaine étape"
      icon={<Flag className="size-4" />}
      className={cn(overdue && !editing && "ring-1 ring-inset ring-red-500/30", className)}
      actions={
        !editing &&
        deal.next_step && (
          <button type="button" onClick={() => startEdit()} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-3 hover:text-fg">
            <Pencil className="size-3" /> Modifier
          </button>
        )
      }
    >
      {editing ? (
        <div className="space-y-2.5">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Ex. : envoyer la proposition révisée" autoFocus />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_DATES.map((q) => (
              <button key={q.days} type="button" onClick={() => setDue(addDays(q.days))} className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-medium transition", due === addDays(q.days) ? "bg-accent-soft text-accent" : "bg-black/[0.04] text-fg-2 hover:text-fg dark:bg-white/[0.06]")}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <Button size="sm" variant="primary" loading={update.isPending} onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : deal.next_step ? (
        <div>
          <div className="text-[15px] font-medium leading-snug">{deal.next_step}</div>
          <div className={cn("mt-1 flex items-center gap-1.5 text-[12.5px]", overdue ? "font-medium text-red-500" : "text-fg-3")}>
            <CalendarClock className="size-3.5" />
            <span className="first-letter:uppercase">{when}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="subtle"
              icon={<ListTodo className="size-3.5" />}
              loading={createTask.isPending}
              onClick={() => createTask.mutate({ title: deal.next_step, type: "follow_up", due_date: deal.next_step_date ?? null, deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id, priority: deal.priority === "high" ? "high" : "medium" })}
            >
              Créer la tâche
            </Button>
            <Button size="xs" variant="ghost" icon={<Check className="size-3.5" />} loading={logActivity.isPending} onClick={done}>
              Fait, planifier la suite
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-fg-3">Aucune action planifiée. Définissez la prochaine étape pour garder l'affaire en mouvement.</p>
          <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => startEdit(true)}>
            Définir la prochaine étape
          </Button>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

export function DealQuotesTab({ deal, onCreate }: { deal: Deal; onCreate: () => void }) {
  const { data, isLoading } = useList<Quote>("quotes", dealQueries.quotes(deal.id));
  if (isLoading) return <TabSkeleton />;
  const items = data?.items ?? [];
  if (!items.length)
    return (
      <EmptyState
        icon={<FileText className="size-6" />}
        title="Aucun devis"
        description="Créez un devis prérempli avec l'entreprise et le contact de cette opportunité."
        action={
          <Button variant="primary" size="sm" icon={<FileText className="size-4" />} onClick={onCreate}>
            Créer un devis
          </Button>
        }
      />
    );
  const signed = items.filter((q) => q.status === "accepted" || q.status === "invoiced").reduce((s, q) => s + q.total, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[13px] text-fg-2">
          <b className="font-semibold text-fg tabular">{items.length}</b> devis · signé <b className="font-semibold text-emerald-600 tabular dark:text-emerald-400">{money(signed, "EUR", { decimals: 0 })}</b> TTC
        </span>
        <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={onCreate}>
          Créer un devis
        </Button>
      </div>
      <div className="space-y-0.5">
        {items.map((q) => (
          <QuoteRow key={q.id} q={q} />
        ))}
      </div>
    </div>
  );
}

export function DealTasksTab({ deal }: { deal: Deal }) {
  const me = useAuth((s) => s.user);
  const { data, isLoading } = useList<Task>("tasks", dealQueries.tasks(deal.id));
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const items = data?.items ?? [];
  const open = items.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = items.filter((t) => t.status === "done");
  const dialog = (
    <RecordDialog
      resource="tasks"
      open={creating}
      onOpenChange={setCreating}
      initial={{ deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id, assignee_id: me?.id, type: "follow_up" }}
      labels={{ deal_id: deal.title, company_id: deal.company?.name, contact_id: deal.contact?.name, assignee_id: me?.name }}
    />
  );
  if (isLoading) return <TabSkeleton />;
  if (!items.length)
    return (
      <>
        <EmptyState
          icon={<ListTodo className="size-6" />}
          title="Aucune tâche"
          description="Relances, démos, envoi de proposition : planifiez les actions de cette affaire."
          action={
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvelle tâche
            </Button>
          }
        />
        {dialog}
      </>
    );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[13px] text-fg-2">
          <b className="font-semibold text-fg tabular">{open.length}</b> à faire · {done.length} terminée{done.length > 1 ? "s" : ""}
        </span>
        <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Nouvelle tâche
        </Button>
      </div>
      {open.length ? (
        <AnimatePresence initial={false}>
          {open.map((t) => (
            <TaskRow key={t.id} task={t} showContext={false} />
          ))}
        </AnimatePresence>
      ) : (
        <p className="px-2.5 py-3 text-[12.5px] text-fg-3">Toutes les tâches sont terminées.</p>
      )}
      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1 px-2.5 text-[12px] font-medium text-fg-3 hover:text-fg">
            <ChevronDown className={cn("size-3.5 transition-transform", showDone && "rotate-180")} />
            {showDone ? "Masquer" : "Afficher"} les tâches terminées ({done.length})
          </button>
          {showDone && (
            <AnimatePresence initial={false}>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} showContext={false} />
              ))}
            </AnimatePresence>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}

export function DealContactsTab({ deal, onAddContact, onEdit }: { deal: Deal; onAddContact: () => void; onEdit: () => void }) {
  const { data, isLoading } = useList<Contact>("contacts", companyQueries.contacts(deal.company_id ?? 0), { enabled: !!deal.company_id });
  const update = useUpdate("deals", { message: "Contact principal mis à jour" });
  if (!deal.company_id)
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="Aucune entreprise associée"
        description="Associez une entreprise à l'opportunité pour retrouver ici tous ses interlocuteurs."
        action={
          <Button variant="primary" size="sm" icon={<Pencil className="size-4" />} onClick={onEdit}>
            Associer une entreprise
          </Button>
        }
      />
    );
  if (isLoading) return <TabSkeleton />;
  const items = data?.items ?? [];
  if (!items.length)
    return (
      <EmptyState
        icon={<UserPlus className="size-6" />}
        title="Aucun contact dans cette entreprise"
        description="Ajoutez les décideurs et utilisateurs impliqués dans la décision."
        action={
          <Button variant="primary" size="sm" icon={<UserPlus className="size-4" />} onClick={onAddContact}>
            Ajouter un contact
          </Button>
        }
      />
    );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[13px] text-fg-2">
          <b className="font-semibold text-fg tabular">{items.length}</b> contact{items.length > 1 ? "s" : ""} chez{" "}
          <Link to={`/companies/${deal.company_id}`} className="font-medium text-fg hover:text-accent">
            {deal.company?.name}
          </Link>
        </span>
        <Button size="sm" variant="subtle" icon={<UserPlus className="size-4" />} onClick={onAddContact}>
          Ajouter un contact
        </Button>
      </div>
      <div className="space-y-0.5">
        {items.map((c) => {
          const main = c.id === deal.contact_id;
          return (
            <div key={c.id} className="group flex items-center gap-3 rounded-[12px] px-2.5 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <Link to={`/contacts/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={c.full_name} src={c.avatar_url} size={34} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">{c.full_name}</div>
                  <div className="truncate text-[11.5px] text-fg-3">{[c.job_title, c.email ?? c.phone].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {main ? (
                  <Badge tone="violet" size="xs">
                    <Star className="size-2.5 fill-current" /> Contact principal
                  </Badge>
                ) : (
                  <Button size="xs" variant="ghost" className="opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" loading={update.isPending && update.variables?.data.contact_id === c.id} onClick={() => update.mutate({ id: deal.id, data: { contact_id: c.id } })}>
                    Définir principal
                  </Button>
                )}
                <StatusBadge options={LIFECYCLE} value={c.lifecycle} size="xs" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Coach                                                                      */
/* -------------------------------------------------------------------------- */

/** The ready-to-send follow-up message at the end of a `deal_coach` analysis, if any. */
export function extractFollowUp(text: string): { subject: string; body: string } | null {
  const m = /message de relance[^\n]*\n?/i.exec(text);
  if (!m) return null;
  const head = m[0];
  const after = head.slice(head.toLowerCase().indexOf("message de relance") + "message de relance".length);
  const colon = after.indexOf(":");
  const inline = colon >= 0 ? after.slice(colon + 1).replace(/^[\s*_]+/, "").trim() : "";
  const raw = (inline.length > 2 ? `${inline}\n` : "") + text.slice(m.index + head.length);
  const body = raw
    .replace(/```[a-z]*\n?/gi, "")
    .split("\n")
    .map((l) => l.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim()
    .replace(/^[«"]\s*/, "")
    .replace(/\s*[»"]$/, "")
    .trim();
  if (body.length < 30) return null;
  return splitSubject(body);
}

import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, FileText, Hourglass, Mail, MoreHorizontal, Pencil, Repeat, RotateCcw, Route, Send, Sparkles, Target, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { useConfetti } from "@/components/crm/Confetti";
import { DealContactsTab, DealQuotesTab, dealQueries, DealTasksTab, extractFollowUp, ForecastPanel, NextStepCard, type DealTab } from "@/components/crm/DealPanels";
import { companyQueries } from "@/components/crm/CompanyTabs";
import { daysSince, newDocPath, schemaValues } from "@/components/crm/records";
import { LostReasonDialog, StageBar } from "@/components/crm/StageBar";
import { CompanyAvatar } from "@/components/crm/visuals";
import { Panel } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { AiSummaryPanel, DetailHeader, NotFoundRecord, RelatedTasks, useAssistantRecord } from "@/components/entity/EntityBlocks";
import { EmailComposer } from "@/components/entity/EmailComposer";
import { PropertyList } from "@/components/entity/PropertyList";
import { RelatedDocuments } from "@/components/entity/RelatedDocuments";
import { Timeline } from "@/components/entity/Timeline";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Skeleton, StatusBadge, Tag } from "@/components/ui/display";
import { Markdown } from "@/components/ui/markdown";
import { Menu, Sheet, Tooltip, useConfirm } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { DEAL_STATUS, findOption, PRIORITY } from "@/lib/constants";
import { daysFromNow, money, relative } from "@/lib/format";
import { keys, toastError, useInvalidate, useItem, useList, useRemove, useUpdate } from "@/lib/hooks";
import type { FieldDef } from "@/lib/schemas";
import type { Contact, Deal, DocumentFile, Quote, Stage, Task } from "@/lib/types";
import { useAuth } from "@/stores/auth";

/* -------------------------------------------------------------------------- */
/* Header pieces                                                              */
/* -------------------------------------------------------------------------- */

function DealVisual({ deal }: { deal: Deal }) {
  const color = deal.stage?.color ?? "var(--accent)";
  return (
    <span className="relative shrink-0">
      {deal.company ? (
        <CompanyAvatar name={deal.company.name} logoUrl={deal.company.logo_url as string | null | undefined} domain={deal.company.domain as string | null | undefined} size={64} className="shadow-[0_10px_30px_-10px_rgba(0,0,0,.5)]" />
      ) : (
        <span className="ai-gradient flex size-16 items-center justify-center rounded-[20px] text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,.5)]">
          <Target className="size-7" />
        </span>
      )}
      <span className="absolute -bottom-1 -right-1 size-4 rounded-full ring-[3px] ring-[var(--bg-2)]" style={{ background: color, boxShadow: `0 0 10px ${color}` }} title={deal.stage?.name} />
    </span>
  );
}

function DealValue({ deal }: { deal: Deal }) {
  return (
    <Tooltip content="Valeur 1re année HT : montant one-shot + 12 × récurrent mensuel">
      <span className="inline-flex cursor-default items-center gap-1.5">
        <span className="text-[16px] font-semibold tracking-[-0.01em] text-fg tabular">{money(deal.value, "EUR", { decimals: 0 })}</span>
        {deal.mrr > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/12 px-2 py-0.5 text-[11.5px] font-semibold text-violet-700 tabular dark:text-violet-300">
            <Repeat className="size-3" />
            dont {money(deal.mrr, "EUR", { decimals: 0 })}/mois
          </span>
        )}
      </span>
    </Tooltip>
  );
}

function DealSubtitle({ deal }: { deal: Deal }) {
  const parts: ReactNode[] = [<DealValue deal={deal} />];
  if (deal.company)
    parts.push(
      <Link to={`/companies/${deal.company.id}`} className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent">
        <CompanyAvatar name={deal.company.name} logoUrl={deal.company.logo_url as string | null | undefined} size={18} />
        {deal.company.name}
      </Link>,
    );
  if (deal.contact)
    parts.push(
      <Link to={`/contacts/${deal.contact.id}`} className="inline-flex items-center gap-1.5 hover:text-accent">
        <Avatar name={deal.contact.name} src={deal.contact.avatar_url as string | null | undefined} size={18} />
        {deal.contact.name}
      </Link>,
    );
  if (deal.pipeline)
    parts.push(
      <span className="inline-flex items-center gap-1 text-fg-3">
        <Route className="size-3.5" />
        {deal.pipeline.name}
      </span>,
    );
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="hidden text-fg-3 sm:inline">·</span>}
          {p}
        </Fragment>
      ))}
    </>
  );
}

function CoachSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-5 h-5 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DealDetail() {
  const { id } = useParams();
  const dealId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const me = useAuth((s) => s.user);
  const confirm = useConfirm();
  const { data: deal, isLoading, error } = useItem<Deal>("deals", dealId);
  const stagesQuery = useList<Stage>("stages", { pipeline_id: deal?.pipeline_id, sort: "position", limit: 100 }, { enabled: !!deal });
  const [tab, setTab] = useState<DealTab>("activity");
  const [editing, setEditing] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [lostTarget, setLostTarget] = useState<Stage | null>(null);
  const coach = useAiGenerate();
  const remove = useRemove("deals", { message: "Opportunité supprimée" });
  const linkContact = useUpdate("deals", { message: "Contact associé à l'opportunité" });
  const { fire, element: confetti } = useConfetti();
  useAssistantRecord("deal", dealId, deal?.title);

  const quotesCount = useList<Quote>("quotes", dealQueries.quotes(dealId)).data?.total;
  const tasksCount = useList<Task>("tasks", dealQueries.openTasks(dealId)).data?.total;
  const documentsCount = useList<DocumentFile>("documents", dealQueries.documents(dealId)).data?.total;
  const contactsCount = useList<Contact>("contacts", companyQueries.contacts(deal?.company_id ?? 0), { enabled: !!deal?.company_id }).data?.total;
  const followUp = useMemo(() => (coach.loading ? null : extractFollowUp(coach.text)), [coach.text, coach.loading]);

  if (error) return <NotFoundRecord label="Opportunité" back="/deals" />;

  const stages = stagesQuery.data?.items ?? [];
  const stage = stages.find((s) => s.id === deal?.stage_id);
  const stageProbability = stage?.probability ?? deal?.stage?.probability ?? 0;
  const daysInStage = daysSince(deal?.stage_changed_at) ?? 0;
  const age = daysSince(deal?.created_at) ?? 0;
  const cycle = deal?.closed_at ? Math.max(0, age - (daysSince(deal.closed_at) ?? 0)) : null;
  const rotting = deal?.status === "open" && !!stage?.rotting_days && daysInStage > stage.rotting_days;
  const closeIn = daysFromNow(deal?.expected_close_date);
  const closingLate = deal?.status === "open" && closeIn !== null && closeIn < 0;
  const priority = findOption(PRIORITY, deal?.priority);

  const move = async (target: Stage, lostReason?: string) => {
    if (!deal) return;
    setPending(target.id);
    try {
      const updated = await api.post<Deal>(`/deals/${deal.id}/move`, { stage_id: target.id, position: deal.position, lost_reason: lostReason });
      qc.setQueryData(keys.item("deals", deal.id), updated);
      invalidate("deals", "deals-board", "companies", "contacts");
      if (updated.status === "won") {
        fire();
        toast.success("Affaire gagnée ! 🎉", { description: `${updated.title} · ${money(updated.value, "EUR", { decimals: 0 })}` });
      } else if (updated.status === "lost") toast("Affaire marquée perdue", { description: lostReason });
      else toast.success(`Étape « ${target.name} »`);
    } catch (e) {
      toastError(e);
    } finally {
      setPending(null);
    }
  };

  const select = async (target: Stage) => {
    if (!deal || target.id === deal.stage_id || pending !== null) return;
    if (target.is_lost) {
      setLostTarget(target);
      return;
    }
    if (deal.status !== "open" && !target.is_won) {
      const ok = await confirm({ title: "Rouvrir cette affaire ?", description: `Elle repassera « En cours » à l'étape « ${target.name} ».`, confirmLabel: "Rouvrir" });
      if (!ok) return;
    }
    await move(target);
  };

  const openCoach = () => {
    setCoachOpen(true);
    if (deal && !coach.text && !coach.loading) coach.run("deal_coach", { deal_id: deal.id });
  };

  const createQuote = () => deal && navigate(newDocPath("/quotes/new", { deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id }));

  const deleteDeal = async () => {
    if (!deal) return;
    const ok = await confirm({
      title: `Supprimer « ${deal.title} » ?`,
      description: "Cette action est définitive. Pour conserver vos statistiques de conversion, préférez « Marquer perdue ».",
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(deal.id);
      navigate("/deals");
    } catch {
      /* erreur déjà signalée par la mutation */
    }
  };

  const fields: (string | FieldDef)[] = [
    { name: "amount", label: "One-shot HT", type: "money" },
    { name: "mrr", label: "MRR HT", type: "money" },
    "expected_close_date",
    "priority",
    "owner_id",
    "source",
    "next_step",
    { name: "next_step_date", label: "Échéance de l'étape", type: "date" },
    "company_id",
    { name: "contact_id", label: "Contact", type: "entity", resource: "contacts", entityParams: deal?.company_id ? { company_id: deal.company_id } : undefined },
    "description",
  ];

  const sideColumn = deal && (
    <>
      <AiSummaryPanel resource="deals" id={deal.id} kind="deal_coach" params={{ deal_id: deal.id }} title="Coach d'Iris" />
      <RelatedTasks scope={{ deal_id: deal.id }} />
    </>
  );

  return (
    <div>
      <DetailHeader
        back="/deals"
        backLabel="Pipeline"
        loading={isLoading}
        visual={deal ? <DealVisual deal={deal} /> : <Skeleton className="size-16 rounded-[20px]" />}
        title={deal && <span className="line-clamp-2 whitespace-normal">{deal.title}</span>}
        subtitle={deal && <DealSubtitle deal={deal} />}
        badges={
          deal && (
            <>
              <StatusBadge options={DEAL_STATUS} value={deal.status} />
              {priority && (
                <Badge tone={priority.tone} dot>
                  Priorité {priority.label.toLowerCase()}
                </Badge>
              )}
              <Badge tone="gray">
                <Clock className="size-3" />
                {cycle !== null ? `Cycle de ${cycle} j` : `Ouverte depuis ${age} j`}
              </Badge>
              {deal.status === "open" && (
                <Badge tone={rotting ? "orange" : "gray"}>
                  <Hourglass className="size-3" />
                  {daysInStage} j dans l'étape{rotting ? " · stagne" : ""}
                </Badge>
              )}
              {closingLate && (
                <Badge tone="red">
                  <CalendarClock className="size-3" />
                  Closing dépassé de {-(closeIn ?? 0)} j
                </Badge>
              )}
              {deal.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </>
          )
        }
        actions={
          deal && (
            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
              <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={openCoach}>
                Coach IA
              </Button>
              <Button variant="glass" icon={<FileText className="size-4" />} onClick={createQuote}>
                Créer un devis
              </Button>
              <Button
                variant="glass"
                icon={<Mail className="size-4" />}
                onClick={() => {
                  setEmailDraft(null);
                  setEmailOpen(true);
                }}
              >
                Email
              </Button>
              <Menu
                trigger={
                  <Button variant="glass" aria-label="Plus d'actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
                items={[
                  { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => setEditing(true) },
                  { separator: true, label: "" },
                  { label: "Supprimer", danger: true, icon: <Trash2 className="size-4" />, onSelect: deleteDeal },
                ]}
              />
            </div>
          )
        }
      />

      {isLoading || !deal ? (
        <>
          <Skeleton className="mb-4 h-[96px] rounded-[22px]" />
          <div className="grid gap-4 lg:grid-cols-[320px_1fr] 2xl:grid-cols-[320px_1fr_340px]">
            <Skeleton className="h-[480px] rounded-[22px]" />
            <Skeleton className="h-[480px] rounded-[22px]" />
            <Skeleton className="hidden h-[480px] rounded-[22px] 2xl:block" />
          </div>
        </>
      ) : (
        <>
          <Glass className="mb-4 p-3 sm:p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">
                <Route className="size-3.5" />
                Étapes{deal.pipeline ? ` · ${deal.pipeline.name}` : ""}
              </span>
              <span className="hidden text-[12px] text-fg-3 sm:inline">Cliquez sur une étape pour y déplacer l'affaire</span>
            </div>
            {stagesQuery.isLoading ? <Skeleton className="h-[62px] rounded-[18px]" /> : <StageBar deal={deal} stages={stages} pending={pending} daysInStage={daysInStage} onSelect={select} />}
          </Glass>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <NextStepCard deal={deal} className="2xl:hidden" />
              <ForecastPanel deal={deal} stageName={stage?.name ?? deal.stage?.name} stageProbability={stageProbability} />
              <Panel title="Informations">
                <PropertyList resource="deals" record={deal} fields={fields} />
                <div className="mt-3 text-[11.5px] text-fg-3">
                  Créée {relative(deal.created_at)} · modifiée {relative(deal.updated_at)}
                  {deal.owner ? ` · suivie par ${deal.owner.name}` : ""}
                </div>
              </Panel>
            </div>

            <div className="min-w-0 space-y-4">
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: "activity", label: "Activité" },
                  { value: "quotes", label: "Devis", count: quotesCount },
                  { value: "tasks", label: "Tâches", count: tasksCount },
                  { value: "documents", label: "Documents", count: documentsCount },
                  { value: "contacts", label: "Contacts de l'entreprise", count: contactsCount },
                ]}
              />
              {tab === "documents" ? (
                <RelatedDocuments scope={{ deal_id: deal.id }} />
              ) : (
                <Panel bodyClassName="p-4 sm:p-5">
                  {tab === "activity" && <Timeline scope={{ deal_id: deal.id }} />}
                  {tab === "quotes" && <DealQuotesTab deal={deal} onCreate={createQuote} />}
                  {tab === "tasks" && <DealTasksTab deal={deal} />}
                  {tab === "contacts" && <DealContactsTab deal={deal} onAddContact={() => setNewContact(true)} onEdit={() => setEditing(true)} />}
                </Panel>
              )}
              <div className="space-y-4 2xl:hidden">{sideColumn}</div>
            </div>

            <div className="hidden space-y-4 2xl:block">
              <NextStepCard deal={deal} />
              {sideColumn}
            </div>
          </div>
        </>
      )}

      {deal && (
        <>
          <RecordDialog
            resource="deals"
            open={editing}
            onOpenChange={setEditing}
            recordId={deal.id}
            initial={schemaValues("deals", deal)}
            labels={{ company_id: deal.company?.name, contact_id: deal.contact?.name, owner_id: deal.owner?.name, pipeline_id: deal.pipeline?.name }}
          />
          <RecordDialog
            resource="contacts"
            open={newContact}
            onOpenChange={setNewContact}
            initial={{ company_id: deal.company_id, owner_id: me?.id }}
            labels={{ company_id: deal.company?.name, owner_id: me?.name }}
            onSaved={(row) => {
              if (!deal.contact_id) linkContact.mutate({ id: deal.id, data: { contact_id: row.id } });
            }}
          />
          <EmailComposer
            open={emailOpen}
            onOpenChange={setEmailOpen}
            to={(deal.contact?.email as string | undefined) ?? ""}
            context={{ deal_id: deal.id, contact_id: deal.contact_id, company_id: deal.company_id }}
            subject={emailDraft?.subject ?? ""}
            body={emailDraft?.body ?? ""}
            purpose={deal.next_step ?? ""}
          />
          <LostReasonDialog
            open={!!lostTarget}
            onOpenChange={(o) => !o && setLostTarget(null)}
            onConfirm={(reason) => {
              if (lostTarget) move(lostTarget, reason);
              setLostTarget(null);
            }}
          />
          <Sheet
            open={coachOpen}
            onOpenChange={setCoachOpen}
            title="Coach commercial d'Iris"
            width={600}
            footer={
              <>
                <Button variant="ghost" onClick={() => setCoachOpen(false)}>
                  Fermer
                </Button>
                <Button variant="glass" icon={<RotateCcw className="size-4" />} disabled={coach.loading} onClick={() => coach.run("deal_coach", { deal_id: deal.id })}>
                  Régénérer
                </Button>
                <Button
                  variant="primary"
                  icon={<Send className="size-4" />}
                  disabled={!followUp}
                  onClick={() => {
                    setEmailDraft(followUp);
                    setCoachOpen(false);
                    setEmailOpen(true);
                  }}
                >
                  Utiliser la relance
                </Button>
              </>
            }
          >
            {coach.text ? (
              <Markdown streaming={coach.loading}>{coach.text}</Markdown>
            ) : coach.loading ? (
              <CoachSkeleton />
            ) : (
              <EmptyState
                icon={<Sparkles className="size-6" />}
                title="Analyse indisponible"
                description="Vérifiez la configuration du fournisseur d'IA dans Paramètres › IA, puis relancez l'analyse."
                action={
                  <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={() => coach.run("deal_coach", { deal_id: deal.id })}>
                    Relancer l'analyse
                  </Button>
                }
              />
            )}
          </Sheet>
        </>
      )}
      {confetti}
    </div>
  );
}

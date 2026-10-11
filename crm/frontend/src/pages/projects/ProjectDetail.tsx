import { CalendarDays, Check, ChevronDown, Clock3, FileText, FolderKanban, MoreHorizontal, Pencil, Play, Plus, Receipt, Square, Trash2, Users, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { BarList } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, Panel } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { AiSummaryPanel, DetailHeader, NotFoundRecord, useAssistantRecord } from "@/components/entity/EntityBlocks";
import { PropertyList } from "@/components/entity/PropertyList";
import { RelatedDocuments } from "@/components/entity/RelatedDocuments";
import { Timeline } from "@/components/entity/Timeline";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, CompanyLogo, EmptyState, Progress, Skeleton, StatusBadge } from "@/components/ui/display";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { ColorRing } from "@/components/work/ColorRing";
import { useProjectStats, useTimer, type ProjectStats } from "@/components/work/hooks";
import { TaskBoard } from "@/components/work/TaskBoard";
import { DueChip, PriorityFlag, TaskIndicators } from "@/components/work/TaskCard";
import { TaskCheck } from "@/components/work/TaskCheck";
import { TaskSheet, useTaskParam } from "@/components/work/TaskSheet";
import { TimeEntryDialog, type TimeEntryDefaults } from "@/components/work/TimeEntryDialog";
import { clock, hours, PRIORITY_COLOR, PRIORITY_RANK, type TimeEntryRow } from "@/components/work/work-utils";
import { api } from "@/lib/api";
import { BILLING_MODES, labelOf, PRIORITY, PROJECT_HEALTH, PROJECT_STATUS, TASK_STATUS, type Option } from "@/lib/constants";
import { date, money, moneyShort, percent, plural } from "@/lib/format";
import { toastError, useInvalidate, useItem, useList, useLocalStorage, useRemove, useUpdate } from "@/lib/hooks";
import type { Invoice, Project, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "board" | "list" | "time" | "activity" | "documents";
type TimeFilter = "all" | "billable" | "non_billable" | "unbilled";

/* -------------------------------------------------------------------------- */
/* Header helpers                                                             */
/* -------------------------------------------------------------------------- */

function OptionMenu({ options, value, onChange, label }: { options: Option[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Menu
      align="start"
      trigger={
        <button type="button" className="inline-flex items-center gap-0.5 rounded-full transition hover:brightness-95" aria-label={label}>
          <StatusBadge options={options} value={value} />
          <ChevronDown className="size-3 text-fg-3" />
        </button>
      }
      items={options.map((o) => ({ label: o.label, icon: o.value === value ? <Check className="size-4" /> : <span />, onSelect: () => o.value !== value && onChange(o.value) }))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* KPI tiles                                                                  */
/* -------------------------------------------------------------------------- */

function Kpi({ label, icon, value, sub, children, visual, className, accent }: { label: string; icon: ReactNode; value: ReactNode; sub?: ReactNode; children?: ReactNode; visual?: ReactNode; className?: string; accent?: string }) {
  return (
    <Glass glow className={cn("flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
        <span className="flex size-7 items-center justify-center rounded-[9px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_6px_14px_-6px_rgba(0,0,0,.45)]" style={{ background: accent ?? "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>
          {icon}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[24px] font-semibold leading-none tracking-[-0.03em] tabular">{value}</div>
          {sub && <div className="mt-2 text-[12px] text-fg-3">{sub}</div>}
        </div>
        {visual}
      </div>
      {children && <div className="mt-auto pt-1">{children}</div>}
    </Glass>
  );
}

function KpiRow({ project, stats }: { project: Project; stats?: ProjectStats }) {
  if (!stats)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn("h-[132px] rounded-[22px]", i === 4 && "col-span-2 lg:col-span-1")} />
        ))}
      </div>
    );
  const budgetPct = stats.budget_hours ? (stats.hours / stats.budget_hours) * 100 : null;
  const over = budgetPct !== null && budgetPct > 100;
  const revenue = stats.margin !== null ? stats.invoiced : project.billing_mode === "fixed" ? project.budget_amount : stats.invoiced + stats.unbilled_value;
  const margin = stats.margin ?? revenue - stats.cost;
  const marginPct = revenue ? (margin / revenue) * 100 : null;
  const done = stats.tasks_by_status.done ?? 0;
  const total = stats.tasks_total - (stats.tasks_by_status.cancelled ?? 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi label="Temps passé" icon={<Clock3 className="size-3.5" />} value={hours(stats.hours)} sub={stats.budget_hours ? `sur ${hours(stats.budget_hours)} budgétées · ${percent(budgetPct, 0)}` : "Aucun budget temps"} accent="linear-gradient(135deg,#5b6cff,#22d3ee)">
        {budgetPct !== null && <Progress value={Math.min(budgetPct, 100)} height={6} tone={over ? "linear-gradient(90deg,#ff9f0a,#ff453a)" : undefined} />}
      </Kpi>
      <Kpi label="À facturer" icon={<Receipt className="size-3.5" />} value={moneyShort(stats.unbilled_value)} sub={`${hours(stats.unbilled_hours)} facturables non facturées`} accent="linear-gradient(135deg,#ff9f0a,#ff375f)" />
      <Kpi label="Facturé HT" icon={<FileText className="size-3.5" />} value={moneyShort(stats.invoiced)} sub={project.budget_amount ? `sur ${moneyShort(project.budget_amount)} de budget` : "Factures émises du projet"} accent="linear-gradient(135deg,#8b5cf6,#ec4899)">
        {project.budget_amount > 0 && <Progress value={(stats.invoiced / project.budget_amount) * 100} height={6} tone="linear-gradient(90deg,#8b5cf6,#ec4899)" />}
      </Kpi>
      {project.billing_mode === "non_billable" ? (
        <Kpi label="Coût interne" icon={<Wallet className="size-3.5" />} value={moneyShort(stats.cost)} sub="Projet non facturable" accent="linear-gradient(135deg,#1baf7a,#22d3ee)" />
      ) : (
        <Kpi
          label={stats.margin !== null ? "Marge sur facturé" : "Marge estimée"}
          icon={<Wallet className="size-3.5" />}
          value={<span className={cn(margin < 0 && "text-red-500")}>{moneyShort(margin)}</span>}
          sub={
            <>
              {marginPct !== null && <span className={cn("font-semibold", margin < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{percent(marginPct, 0)} · </span>}
              coût interne {moneyShort(stats.cost)}
            </>
          }
          accent="linear-gradient(135deg,#1baf7a,#22d3ee)"
        />
      )}
      <Kpi
        label="Tâches terminées"
        icon={<Check className="size-3.5" />}
        value={`${done}/${total}`}
        sub={total ? plural(total - done, "tâche ouverte", "tâches ouvertes") : "Aucune tâche"}
        className="col-span-2 lg:col-span-1"
        accent="linear-gradient(135deg,#30d158,#64d2ff)"
        visual={
          <ColorRing value={total ? (done / total) * 100 : 0} size={46} stroke={4.5} color={project.color}>
            <span className="text-[10.5px]">{total ? Math.round((done / total) * 100) : 0} %</span>
          </ColorRing>
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

const STATUS_RANK = Object.fromEntries(TASK_STATUS.map((s, i) => [s.value, i]));

function TaskListTab({ tasks, loading, onOpen }: { tasks: Task[]; loading: boolean; onOpen: (t: Task) => void }) {
  const update = useUpdate("tasks", { silent: true });
  const [sort, setSort] = useState("status");
  const rows = useMemo(() => {
    const desc = sort.startsWith("-");
    const key = sort.replace(/^-/, "");
    const value = (t: Task): string | number => {
      if (key === "status") return STATUS_RANK[t.status] ?? 9;
      if (key === "priority") return PRIORITY_RANK[t.priority] ?? 9;
      if (key === "due_date") return t.due_date ?? "9999";
      if (key === "assignee") return t.assignee?.name ?? "~";
      return t.title.toLowerCase();
    };
    return [...tasks].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : a.position - b.position;
      return desc ? -cmp : cmp;
    });
  }, [tasks, sort]);

  const columns: Column<Task>[] = [
    { key: "check", header: "", width: "44px", cell: (t) => <TaskCheck done={t.status === "done"} ringColor={PRIORITY_COLOR[t.priority]} onToggle={() => update.mutate({ id: t.id, data: { status: t.status === "done" ? "todo" : "done" } })} /> },
    {
      key: "title",
      header: "Tâche",
      sortKey: "title",
      cell: (t) => (
        <div className="min-w-0">
          <div className={cn("flex items-center gap-1.5 truncate font-medium", t.status === "done" && "text-fg-3 line-through")}>
            {t.title}
            <PriorityFlag priority={t.priority} />
          </div>
          <TaskIndicators task={t} />
        </div>
      ),
    },
    { key: "status", header: "Statut", sortKey: "status", cell: (t) => <StatusBadge options={TASK_STATUS} value={t.status} size="xs" /> },
    { key: "priority", header: "Priorité", sortKey: "priority", hideOnMobile: true, cell: (t) => <StatusBadge options={PRIORITY} value={t.priority} size="xs" /> },
    { key: "due", header: "Échéance", sortKey: "due_date", hideOnMobile: true, cell: (t) => (t.due_date ? <DueChip task={t} /> : <span className="text-fg-3">—</span>) },
    { key: "assignee", header: "Assignée", sortKey: "assignee", hideOnMobile: true, cell: (t) => (t.assignee ? <span className="flex items-center gap-2"><Avatar name={t.assignee.name} color={(t.assignee.color as string) ?? undefined} size={22} /><span className="truncate text-[13px]">{t.assignee.name}</span></span> : <span className="text-fg-3">—</span>) },
  ];

  return (
    <Glass className="overflow-hidden" radius="lg">
      <DataTable columns={columns} rows={rows} loading={loading} sort={sort} onSortChange={setSort} onRowClick={onOpen} dense empty={<EmptyState icon={<Check className="size-6" />} title="Aucune tâche" description="Ajoutez des tâches depuis le tableau ou la fiche." />} />
    </Glass>
  );
}

function TimeTab({ project, entries, loading, onAdd, onEdit }: { project: Project; entries: TimeEntryRow[]; loading: boolean; onAdd: () => void; onEdit: (e: TimeEntryRow) => void }) {
  const [filter, setFilter] = useState<TimeFilter>("all");
  const totals = useMemo(() => {
    const sum = (list: TimeEntryRow[]) => list.reduce((s, e) => s + e.minutes, 0);
    return {
      all: sum(entries),
      billable: sum(entries.filter((e) => e.billable)),
      non_billable: sum(entries.filter((e) => !e.billable)),
      unbilled: sum(entries.filter((e) => e.billable && !e.invoice_id)),
    };
  }, [entries]);
  const rows = entries.filter((e) => (filter === "billable" ? e.billable : filter === "non_billable" ? !e.billable : filter === "unbilled" ? e.billable && !e.invoice_id : true));
  const rate = (e: TimeEntryRow) => e.hourly_rate ?? project.hourly_rate ?? 0;

  const columns: Column<TimeEntryRow>[] = [
    { key: "date", header: "Date", cell: (e) => <span className="whitespace-nowrap tabular">{date(e.date, "EEE d MMM")}</span> },
    { key: "user", header: "Membre", hideOnMobile: true, cell: (e) => (e.user ? <span className="flex items-center gap-2"><Avatar name={e.user.name} color={(e.user.color as string) ?? undefined} size={22} /><span className="truncate text-[13px]">{e.user.name}</span></span> : null) },
    {
      key: "desc",
      header: "Description",
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate">{e.description || <span className="text-fg-3">Sans description</span>}</div>
          {e.task && <div className="truncate text-[12px] text-fg-3">{e.task.name}</div>}
        </div>
      ),
    },
    { key: "minutes", header: "Durée", align: "right", cell: (e) => <span className="font-semibold tabular">{clock(e.minutes)}</span> },
    {
      key: "state",
      header: "Facturation",
      hideOnMobile: true,
      cell: (e) =>
        e.invoice_id ? (
          <Link to={`/invoices/${e.invoice_id}`} onClick={(ev) => ev.stopPropagation()}>
            <Badge tone="violet" dot>
              Facturé{e.invoice?.name && e.invoice.name !== "Brouillon" ? ` · ${e.invoice.name}` : ""}
            </Badge>
          </Link>
        ) : e.billable ? (
          <Badge tone="green" dot>
            Facturable
          </Badge>
        ) : (
          <Badge tone="gray" dot>
            Non facturable
          </Badge>
        ),
    },
    { key: "amount", header: "Montant HT", align: "right", hideOnMobile: true, cell: (e) => (e.billable ? <span className="tabular">{money((e.minutes / 60) * rate(e))}</span> : <span className="text-fg-3">—</span>) },
  ];

  const chips: { value: TimeFilter; label: string }[] = [
    { value: "all", label: "Tout" },
    { value: "billable", label: "Facturable" },
    { value: "non_billable", label: "Non facturable" },
    { value: "unbilled", label: "Non facturé" },
  ];

  return (
    <Glass className="overflow-hidden" radius="lg">
      <div className="flex flex-col gap-3 border-b border-[var(--hairline)] px-5 py-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <FilterChip key={c.value} active={filter === c.value} onClick={() => setFilter(c.value)}>
              {c.label} <span className="tabular opacity-70">{clock(totals[c.value])}</span>
            </FilterChip>
          ))}
        </div>
        <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={onAdd}>
          Saisir du temps
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        dense
        onRowClick={onEdit}
        empty={<EmptyState icon={<Clock3 className="size-6" />} title="Aucun temps saisi" description="Saisissez du temps ou lancez le chronomètre sur ce projet." action={<Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={onAdd}>Saisir du temps</Button>} />}
      />
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-[var(--hairline)] px-5 py-3 text-[12.5px] text-fg-2">
          <span>
            Total <b className="font-semibold text-fg tabular">{clock(rows.reduce((s, e) => s + e.minutes, 0))}</b>
          </span>
          <span>
            Valeur facturable <b className="font-semibold text-fg tabular">{money(rows.filter((e) => e.billable).reduce((s, e) => s + (e.minutes / 60) * rate(e), 0))}</b>
          </span>
        </div>
      )}
    </Glass>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ProjectDetail() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { data: project, isLoading, error } = useItem<Project>("projects", projectId);
  const { data: stats } = useProjectStats(projectId);
  const tasks = useList<Task>("tasks", { project_id: projectId, sort: "position", limit: 500 });
  const entries = useList<TimeEntryRow>("time-entries", { project_id: projectId, sort: "-date", limit: 500 });
  const [tab, setTab] = useLocalStorage<Tab>("prisme-project-tab", "board");
  const [taskId, setTaskId] = useTaskParam();
  const [editing, setEditing] = useState(false);
  const [timeDialog, setTimeDialog] = useState<{ entry?: TimeEntryRow; defaults?: TimeEntryDefaults } | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const update = useUpdate("projects", { message: "Projet mis à jour" });
  const remove = useRemove("projects", { message: "Projet supprimé" });
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const timer = useTimer();
  useAssistantRecord("projet", projectId, project?.name);

  if (error) return <NotFoundRecord label="Projet" back="/projects" />;

  const taskList = tasks.data?.items ?? [];
  const openCount = taskList.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const tracking = !!project && timer.entry?.project_id === project.id;
  const billable = project?.billing_mode !== "non_billable";

  const invoiceTime = async () => {
    if (!project || !stats) return;
    const ok = await confirm({
      title: "Facturer le temps non facturé ?",
      description: `${hours(stats.unbilled_hours)} pour ${money(stats.unbilled_value)} HT seront regroupées dans une facture brouillon, à relire avant émission.`,
      confirmLabel: "Créer la facture",
    });
    if (!ok) return;
    setInvoicing(true);
    try {
      const invoice = await api.post<Invoice>(`/projects/${project.id}/invoice-time`, {});
      toast.success("Facture brouillon créée", { description: `${invoice.title ?? project.name} · ${money(invoice.total)} TTC` });
      invalidate("invoices", "projects", "time-entries");
      navigate(`/invoices/${invoice.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setInvoicing(false);
    }
  };

  const destroy = async () => {
    if (!project) return;
    const ok = await confirm({
      title: `Supprimer « ${project.name} » ?`,
      description: `${plural(taskList.length, "tâche")} et ${hours(stats?.hours ?? 0)} de temps saisi sont rattachées à ce projet. Pour garder l'historique, préférez le statut « Terminé » ou « Annulé ».`,
      danger: true,
      confirmLabel: "Supprimer définitivement",
    });
    if (!ok) return;
    await remove.mutateAsync(project.id);
    navigate("/projects");
  };

  const toggleTimer = () => {
    if (!project) return;
    if (tracking) timer.stop.mutate({}, { onSuccess: () => toast.success("Temps enregistré") });
    else timer.start.mutate({ project_id: project.id, billable }, { onSuccess: () => toast.success("Chronomètre démarré", { description: project.name }) });
  };

  const color = project?.color || "#5b6cff";

  const aside = project && (
    <>
      <AiSummaryPanel resource="projects" id={project.id} />
      <Panel title="Équipe" description="Heures saisies par membre" icon={<Users className="size-4" />}>
        {stats ? stats.hours_by_user.length ? <BarList items={stats.hours_by_user.map((u) => ({ label: u.name, value: u.hours }))} format={(v) => hours(v)} /> : <p className="py-4 text-center text-[12.5px] text-fg-3">Aucun temps saisi pour l'instant.</p> : <Skeleton className="h-32" />}
      </Panel>
      <Panel title="Détails">
        <PropertyList resource="projects" record={project} fields={["billing_mode", "hourly_rate", "budget_amount", "budget_hours", "start_date", "due_date", "owner_id", "company_id", "deal_id", "color", "description"]} />
        <div className="mt-3 text-[11.5px] text-fg-3">Créé le {date(project.created_at)} · {project.code}</div>
      </Panel>
    </>
  );

  return (
    <div>
      <DetailHeader
        back="/projects"
        backLabel="Projets"
        loading={isLoading}
        visual={
          project ? (
            <span className="relative flex size-16 shrink-0 items-center justify-center rounded-[20px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_14px_30px_-12px_rgba(0,0,0,.45)]" style={{ background: `linear-gradient(140deg, color-mix(in oklab, ${color} 75%, white), ${color} 55%, color-mix(in oklab, ${color} 70%, black))`, boxShadow: `0 14px 34px -12px ${color}` }}>
              <FolderKanban className="size-7" />
            </span>
          ) : (
            <Skeleton className="size-16 rounded-[20px]" />
          )
        }
        title={project?.name}
        subtitle={
          project && (
            <>
              {project.code && <span className="tabular text-fg-3">{project.code}</span>}
              {project.company && (
                <Link to={`/companies/${project.company.id}`} className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent">
                  <CompanyLogo name={project.company.name} size={18} />
                  {project.company.name}
                </Link>
              )}
              {(project.start_date || project.due_date) && (
                <span className="inline-flex items-center gap-1 text-fg-3">
                  <CalendarDays className="size-3.5" />
                  {project.start_date ? date(project.start_date, "d MMM yyyy") : "…"} → {project.due_date ? date(project.due_date, "d MMM yyyy") : "…"}
                </span>
              )}
              <span className="text-fg-3">· {labelOf(BILLING_MODES, project.billing_mode)}</span>
            </>
          )
        }
        badges={
          project && (
            <>
              <OptionMenu label="Changer le statut" options={PROJECT_STATUS} value={project.status} onChange={(status) => update.mutate({ id: project.id, data: { status } })} />
              <OptionMenu label="Changer la santé" options={PROJECT_HEALTH} value={project.health} onChange={(health) => update.mutate({ id: project.id, data: { health } })} />
            </>
          )
        }
        actions={
          project && (
            <>
              <Button variant={tracking ? "danger" : "glass"} icon={tracking ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />} loading={timer.start.isPending || timer.stop.isPending} onClick={toggleTimer}>
                {tracking ? "Arrêter" : "Chronométrer"}
              </Button>
              {billable && (
                <Button variant="primary" icon={<Receipt className="size-4" />} loading={invoicing} disabled={!stats?.unbilled_hours} onClick={invoiceTime} title={stats?.unbilled_hours ? undefined : "Aucun temps facturable non facturé"}>
                  Facturer le temps{stats?.unbilled_value ? ` · ${moneyShort(stats.unbilled_value)}` : ""}
                </Button>
              )}
              <Menu
                trigger={
                  <Button variant="glass" aria-label="Plus d'actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
                items={[
                  { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => setEditing(true) },
                  { label: "Saisir du temps", icon: <Clock3 className="size-4" />, onSelect: () => setTimeDialog({ defaults: { project_id: project.id, project_name: project.name } }) },
                  { separator: true, label: "" },
                  { label: "Supprimer", danger: true, icon: <Trash2 className="size-4" />, onSelect: destroy },
                ]}
              />
            </>
          )
        }
      />

      {!project ? (
        <div className="space-y-4">
          <Skeleton className="h-[132px] rounded-[22px]" />
          <Skeleton className="h-[460px] rounded-[22px]" />
        </div>
      ) : (
        <div className="space-y-4">
          <KpiRow project={project} stats={stats} />

          <div className={cn("grid grid-cols-1 items-start gap-4", tab !== "board" && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
            <div className="min-w-0 space-y-4">
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: "board", label: "Tableau", count: openCount },
                  { value: "list", label: "Liste", count: taskList.length },
                  { value: "time", label: "Temps", count: entries.data?.total },
                  { value: "activity", label: "Activité" },
                  { value: "documents", label: "Documents" },
                ]}
              />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                  {tab === "board" && <TaskBoard tasks={taskList} loading={tasks.isLoading} onOpen={(t) => setTaskId(t.id)} createDefaults={{ project_id: project.id, company_id: project.company_id }} showProject={false} />}
                  {tab === "list" && <TaskListTab tasks={taskList} loading={tasks.isLoading} onOpen={(t) => setTaskId(t.id)} />}
                  {tab === "time" && <TimeTab project={project} entries={entries.data?.items ?? []} loading={entries.isLoading} onAdd={() => setTimeDialog({ defaults: { project_id: project.id, project_name: project.name } })} onEdit={(entry) => setTimeDialog({ entry })} />}
                  {tab === "activity" && (
                    <Panel bodyClassName="p-4 sm:p-5">
                      <Timeline scope={{ project_id: project.id }} />
                    </Panel>
                  )}
                  {tab === "documents" && <RelatedDocuments scope={{ project_id: project.id }} />}
                </motion.div>
              </AnimatePresence>
            </div>
            <motion.aside layout="position" className={cn("min-w-0", tab === "board" ? "grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-4")}>
              {aside}
            </motion.aside>
          </div>
        </div>
      )}

      {project && (
        <>
          <RecordDialog
            resource="projects"
            open={editing}
            onOpenChange={setEditing}
            recordId={project.id}
            initial={project as unknown as Record<string, unknown>}
            labels={{ company_id: project.company?.name, owner_id: project.owner?.name, deal_id: (project as Project & { deal?: { name: string } | null }).deal?.name }}
          />
          <TimeEntryDialog open={!!timeDialog} onOpenChange={(o) => !o && setTimeDialog(null)} entry={timeDialog?.entry} defaults={timeDialog?.defaults} />
        </>
      )}
      <TaskSheet taskId={taskId} onClose={() => setTaskId(null)} />
    </div>
  );
}

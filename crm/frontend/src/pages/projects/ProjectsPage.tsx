import { CalendarDays, FolderKanban, LayoutGrid, Plus, Rows3 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, CompanyLogo, EmptyState, Progress, Skeleton, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { SearchInput, Select } from "@/components/ui/fields";
import { Segmented } from "@/components/ui/tabs";
import { ColorRing } from "@/components/work/ColorRing";
import { useProjectStats } from "@/components/work/hooks";
import { hours } from "@/components/work/work-utils";
import { PROJECT_HEALTH, PROJECT_STATUS } from "@/lib/constants";
import { date, daysFromNow, isoDate, plural } from "@/lib/format";
import { useList, useLocalStorage } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-updated_at", label: "Récemment modifiés" },
  { value: "due_date", label: "Échéance la plus proche" },
  { value: "name", label: "Nom (A → Z)" },
  { value: "-budget_amount", label: "Budget le plus élevé" },
];

const BILLING_SHORT: Record<string, string> = { fixed: "Forfait", time: "Régie", retainer: "Retainer", non_billable: "Non facturable" };

function dueInfo(p: Project) {
  if (!p.due_date) return null;
  const days = daysFromNow(p.due_date) ?? 0;
  const closed = p.status === "completed" || p.status === "cancelled";
  if (!closed && days < 0) return { text: `En retard de ${plural(-days, "jour")}`, tone: "late" as const };
  if (!closed && days === 0) return { text: "Échéance aujourd'hui", tone: "soon" as const };
  if (!closed && days <= 14) return { text: `Échéance dans ${plural(days, "jour")}`, tone: "soon" as const };
  return { text: `Échéance ${date(p.due_date, "d MMM yyyy")}`, tone: "normal" as const };
}

function DueLabel({ project, className }: { project: Project; className?: string }) {
  const due = dueInfo(project);
  if (!due) return <span className={cn("text-fg-3", className)}>Sans échéance</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", due.tone === "late" ? "font-semibold text-red-500" : due.tone === "soon" ? "font-medium text-orange-600 dark:text-orange-400" : "text-fg-3", className)}>
      <CalendarDays className="size-3.5" />
      {due.text}
    </span>
  );
}

function BudgetBar({ project }: { project: Project }) {
  const { data: stats } = useProjectStats(project.id);
  if (!stats) return <Skeleton className="h-[30px]" />;
  const pct = stats.budget_hours ? (stats.hours / stats.budget_hours) * 100 : 0;
  const over = pct > 100;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-fg-3">Temps passé</span>
        <span className="tabular">
          <b className={cn("font-semibold", over && "text-red-500")}>{hours(stats.hours)}</b>
          <span className="text-fg-3">{stats.budget_hours ? ` / ${hours(stats.budget_hours)}` : " · sans budget"}</span>
        </span>
      </div>
      <Progress value={Math.min(pct, 100)} height={5} tone={over ? "linear-gradient(90deg,#ff9f0a,#ff453a)" : `linear-gradient(90deg, color-mix(in oklab, ${project.color} 70%, white), ${project.color})`} />
    </div>
  );
}

function ProgressRing({ project, size = 52 }: { project: Project; size?: number }) {
  const { data: stats } = useProjectStats(project.id);
  const value = stats?.progress ?? project.progress;
  return (
    <ColorRing value={value} size={size} stroke={size > 44 ? 5 : 4} color={project.color}>
      <span className={size > 44 ? "text-[11.5px]" : "text-[10px]"}>{Math.round(value)} %</span>
    </ColorRing>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const navigate = useNavigate();
  const color = project.color || "#5b6cff";
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.03, 0.3) }} className="h-full">
      <TiltCard className="group relative h-full overflow-hidden p-5" onClick={() => navigate(`/projects/${project.id}`)}>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 z-0 size-60 rounded-full opacity-35 blur-3xl transition-opacity duration-500 group-hover:opacity-55" style={{ background: color }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-0 z-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        <div className="relative z-10 flex h-full flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11.5px] font-medium text-fg-3">
                <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                <span className="tabular">{project.code ?? "Projet"}</span>
                <span>·</span>
                <span>{BILLING_SHORT[project.billing_mode] ?? project.billing_mode}</span>
              </div>
              <h3 className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.01em]">{project.name}</h3>
              {project.company ? (
                <Link to={`/companies/${project.company.id}`} onClick={(e) => e.stopPropagation()} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-fg-2 hover:text-accent">
                  <CompanyLogo name={project.company.name} size={18} />
                  <span className="truncate">{project.company.name}</span>
                </Link>
              ) : (
                <div className="mt-1.5 text-[12.5px] text-fg-3">Projet interne</div>
              )}
            </div>
            <ProgressRing project={project} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge options={PROJECT_STATUS} value={project.status} size="xs" />
            <StatusBadge options={PROJECT_HEALTH} value={project.health} size="xs" />
          </div>
          <div className="mt-auto space-y-3.5">
            <BudgetBar project={project} />
            <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3 text-[12px]">
              <DueLabel project={project} />
              {project.owner && <Avatar name={project.owner.name} color={(project.owner.color as string) ?? undefined} size={24} />}
            </div>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const ls = useListState({ filters: ["status", "health", "company_id"], defaultSort: "-updated_at" });
  const { data, isLoading, isFetching } = useList<Project>("projects", ls.params);
  const overview = useList<Project>("projects", { limit: 1000, expand: 0 });
  const [view, setView] = useLocalStorage<"cards" | "table">("prisme-projects-view", "cards");
  const [creating, setCreating] = useState(false);
  const rows = data?.items ?? [];

  const counts = useMemo(() => {
    const all = overview.data?.items ?? [];
    const byStatus: Record<string, number> = {};
    for (const p of all) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    const live = all.filter((p) => p.status === "active" || p.status === "planned");
    return { total: all.length, byStatus, atRisk: live.filter((p) => p.health !== "on_track").length };
  }, [overview.data]);

  const columns: Column<Project>[] = [
    {
      key: "name",
      header: "Projet",
      sortKey: "name",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
          <div className="min-w-0">
            <div className="truncate font-medium">{p.name}</div>
            <div className="truncate text-[12px] text-fg-3">
              {p.code} · {BILLING_SHORT[p.billing_mode] ?? p.billing_mode}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "company",
      header: "Client",
      hideOnMobile: true,
      cell: (p) =>
        p.company ? (
          <span className="flex min-w-0 items-center gap-2">
            <CompanyLogo name={p.company.name} size={22} />
            <span className="truncate">{p.company.name}</span>
          </span>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    { key: "status", header: "Statut", sortKey: "status", cell: (p) => <StatusBadge options={PROJECT_STATUS} value={p.status} size="xs" /> },
    { key: "health", header: "Santé", sortKey: "health", hideOnMobile: true, cell: (p) => <StatusBadge options={PROJECT_HEALTH} value={p.health} size="xs" /> },
    { key: "progress", header: "Avancement", align: "center", hideOnMobile: true, cell: (p) => <ProgressRing project={p} size={36} /> },
    { key: "budget", header: "Budget temps", hideOnMobile: true, width: "190px", cell: (p) => <BudgetBar project={p} /> },
    { key: "due", header: "Échéance", sortKey: "due_date", hideOnMobile: true, cell: (p) => <DueLabel project={p} className="text-[12.5px]" /> },
    { key: "owner", header: "Resp.", hideOnMobile: true, cell: (p) => (p.owner ? <Avatar name={p.owner.name} color={(p.owner.color as string) ?? undefined} size={24} /> : null) },
  ];

  const empty = (
    <EmptyState
      icon={<FolderKanban className="size-6" />}
      title={ls.activeFilterCount ? "Aucun projet ne correspond" : "Aucun projet pour l'instant"}
      description={ls.activeFilterCount ? "Essayez d'élargir votre recherche ou vos filtres." : "Créez votre premier projet pour suivre tâches, temps passé et rentabilité."}
      action={
        ls.activeFilterCount ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouveau projet
          </Button>
        )
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Projets"
        icon={<FolderKanban className="size-5" />}
        description={
          overview.data ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{plural(counts.total, "projet")}</span>
              <span>
                <b className="font-semibold text-fg tabular">{counts.byStatus.active ?? 0}</b> en cours
              </span>
              {counts.atRisk > 0 && (
                <span>
                  <b className="font-semibold text-orange-600 tabular dark:text-orange-400">{counts.atRisk}</b> à surveiller
                </span>
              )}
            </span>
          ) : (
            "Chargement…"
          )
        }
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouveau projet
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Nom, code, description…" className="lg:w-[300px]" />
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap lg:ml-auto">
            <Select options={[{ value: "", label: "Toutes les santés" }, ...PROJECT_HEALTH]} value={ls.filters.health ?? ""} onChange={(v) => ls.setFilter("health", v)} className="sm:w-[170px]" />
            <EntitySelect resource="companies" value={ls.filters.company_id ? Number(ls.filters.company_id) : null} onChange={(id) => ls.setFilter("company_id", id)} placeholder="Tous les clients" className="sm:w-[190px]" />
            <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="sm:w-[205px]" />
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "cards", label: <LayoutGrid className="size-4" aria-label="Cartes" /> },
                { value: "table", label: <Rows3 className="size-4" aria-label="Tableau" /> },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={!ls.filters.status} onClick={() => ls.setFilter("status", null)} count={counts.total || undefined}>
            Tous
          </FilterChip>
          {PROJECT_STATUS.map((s) => (
            <FilterChip key={s.value} active={ls.filters.status === s.value} onClick={() => ls.setFilter("status", ls.filters.status === s.value ? null : s.value)} count={counts.byStatus[s.value]}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <Glass className="overflow-hidden" radius="lg">
          <DataTable columns={columns} rows={rows} loading={isLoading || (isFetching && !rows.length)} sort={ls.sort} onSortChange={ls.setSort} onRowClick={(p) => navigate(`/projects/${p.id}`)} empty={empty} page={ls.page} pageSize={ls.pageSize} total={data?.total} onPageChange={ls.setPage} />
        </Glass>
      ) : (
        <>
          {isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-[268px] rounded-[22px]" />
              ))}
            </div>
          )}
          {!isLoading && rows.length === 0 && <Glass>{empty}</Glass>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
          {data && data.total > ls.pageSize && (
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" disabled={ls.page === 0} onClick={() => ls.setPage(ls.page - 1)}>
                Précédent
              </Button>
              <Button size="sm" disabled={(ls.page + 1) * ls.pageSize >= data.total} onClick={() => ls.setPage(ls.page + 1)}>
                Suivant
              </Button>
            </div>
          )}
        </>
      )}

      <RecordDialog resource="projects" open={creating} onOpenChange={setCreating} navigateOnCreate initial={{ owner_id: me?.id, start_date: isoDate() }} labels={{ owner_id: me?.name }} />
    </div>
  );
}

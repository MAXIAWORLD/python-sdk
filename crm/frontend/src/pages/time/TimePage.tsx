import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, endOfQuarter, isSameWeek, startOfMonth, startOfQuarter, subDays, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Clock3, Download, FolderKanban, Plus, Timer, Users } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { BarList, Legend } from "@/components/charts/Charts";
import { useChartTheme } from "@/components/charts/theme";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader, Panel } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Progress, Skeleton } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Select } from "@/components/ui/fields";
import { useElapsed, useTimer } from "@/components/work/hooks";
import { refColor } from "@/components/work/TaskCard";
import { TimeEntryDialog, type TimeEntryDefaults } from "@/components/work/TimeEntryDialog";
import { TimerCard } from "@/components/work/TimerCard";
import { Timesheet } from "@/components/work/Timesheet";
import { clock, hours, isRunning, weekDays, weekStart, type TimeEntryRow } from "@/components/work/work-utils";
import { api, download } from "@/lib/api";
import { date, duration, isoDate, money, percent } from "@/lib/format";
import { toastError, useList } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

interface Summary {
  start: string;
  end: string;
  total_minutes: number;
  days: Record<string, number>;
  items: TimeEntryRow[];
}

const WEEKLY_TARGET = 35 * 60;

const PERIODS = [
  { value: "week", label: "Cette semaine" },
  { value: "last_week", label: "Semaine dernière" },
  { value: "month", label: "Ce mois-ci" },
  { value: "last_month", label: "Mois dernier" },
  { value: "30d", label: "30 derniers jours" },
  { value: "quarter", label: "Ce trimestre" },
];

function periodRange(period: string, now = new Date()) {
  switch (period) {
    case "week":
      return { start: weekStart(now), end: addDays(weekStart(now), 6) };
    case "last_week":
      return { start: weekStart(subDays(now, 7)), end: addDays(weekStart(subDays(now, 7)), 6) };
    case "last_month":
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case "30d":
      return { start: subDays(now, 29), end: now };
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

const rateOf = (e: TimeEntryRow) => e.hourly_rate ?? 0;

/* -------------------------------------------------------------------------- */
/* My week (GET /time-entries/summary)                                        */
/* -------------------------------------------------------------------------- */

function WeekCard() {
  const start = weekStart(new Date());
  const days = weekDays(start);
  const { data } = useQuery({ queryKey: ["time-entries", "summary", isoDate(start)], queryFn: () => api.get<Summary>("/time-entries/summary", { start: isoDate(start), end: isoDate(addDays(start, 6)) }) });
  const timer = useTimer();
  const live = Math.floor(useElapsed(timer.entry?.started_at) / 60);
  const todayKey = isoDate();
  const perDay = days.map((d) => (data?.days[isoDate(d)] ?? 0) + (isoDate(d) === todayKey ? live : 0));
  const total = (data?.total_minutes ?? 0) + live;
  const billable = (data?.items ?? []).filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);
  const max = Math.max(8 * 60, ...perDay);

  return (
    <Panel title="Ma semaine" description={`Du ${date(start, "d")} au ${date(addDays(start, 6), "d MMMM")}`} icon={<Clock3 className="size-4" />} className="h-full">
      {!data ? (
        <Skeleton className="h-[190px]" />
      ) : (
        <div className="flex h-full flex-col gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-semibold leading-none tracking-[-0.03em] tabular">{clock(total)}</span>
              <span className="text-[13px] text-fg-3">/ {hours(WEEKLY_TARGET / 60)}</span>
            </div>
            <Progress value={(total / WEEKLY_TARGET) * 100} height={6} className="mt-2.5" />
            <div className="mt-1.5 flex justify-between text-[12px] text-fg-3">
              <span>{total ? `Facturable ${percent((billable / Math.max(1, total - live)) * 100)}` : "Aucun temps saisi"}</span>
              <span>{total >= WEEKLY_TARGET ? "Objectif atteint" : `Reste ${duration(WEEKLY_TARGET - total)}`}</span>
            </div>
          </div>
          <div className="grid min-h-[104px] flex-1 grid-cols-7 items-end gap-2">
            {days.map((d, i) => {
              const today = isoDate(d) === todayKey;
              const m = perDay[i];
              return (
                <div key={d.toISOString()} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${date(d, "EEEE d MMMM")} : ${duration(m)}`}>
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(m ? 6 : 3, (m / max) * 100)}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.03 }}
                      className={cn("w-full max-w-[24px] rounded-t-[4px] rounded-b-[2px]", m ? "" : "bg-black/[0.07] dark:bg-white/[0.08]")}
                      style={m ? { background: today ? "linear-gradient(180deg, var(--accent-2), var(--accent))" : "var(--accent)", opacity: today ? 1 : 0.75 } : undefined}
                    />
                  </div>
                  <span className={cn("text-[11px] font-semibold uppercase", today ? "text-accent" : "text-fg-3")}>{date(d, "EEEEE")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Weekly timesheet                                                           */
/* -------------------------------------------------------------------------- */

function TimesheetPanel({ onAdd, onEdit }: { onAdd: (d: TimeEntryDefaults) => void; onEdit: (e: TimeEntryRow) => void }) {
  const me = useAuth((s) => s.user);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [member, setMember] = useState<{ id: number | "all"; name?: string } | null>(null);
  const userId = member === null ? me?.id : member.id === "all" ? undefined : member.id;
  const { data, isLoading } = useList<TimeEntryRow>("time-entries", { date__gte: isoDate(start), date__lte: isoDate(addDays(start, 6)), user_id: userId, sort: "date", limit: 1000 });
  const current = isSameWeek(start, new Date(), { weekStartsOn: 1 });
  const entries = useMemo(() => (data?.items ?? []).filter((e) => !isRunning(e)), [data]);

  return (
    <Glass glow className="flex flex-col">
      <div className="flex flex-col gap-3 px-5 pb-1 pt-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <Timer className="size-4 text-fg-3" /> Feuille de temps
          </h3>
          <p className="mt-0.5 text-[12.5px] text-fg-3">
            Semaine du {date(start, "d MMMM")} au {date(addDays(start, 6), "d MMMM yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={member === null} onClick={() => setMember(null)}>
            Moi
          </FilterChip>
          <FilterChip active={member?.id === "all"} onClick={() => setMember({ id: "all" })}>
            Équipe
          </FilterChip>
          <EntitySelect resource="users" value={typeof member?.id === "number" ? member.id : null} initialLabel={member?.name} onChange={(id, row) => setMember(id ? { id, name: String(row?.name ?? "") } : null)} placeholder="Un membre…" className="h-8 w-[150px] rounded-full text-[12.5px]" />
          <span className="mx-1 hidden h-5 w-px bg-[var(--hairline-strong)] sm:block" />
          <div className="flex items-center gap-1.5">
            <IconButton label="Semaine précédente" size="sm" onClick={() => setStart((s) => addDays(s, -7))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <Button size="sm" variant={current ? "subtle" : "glass"} onClick={() => setStart(weekStart(new Date()))}>
              Cette semaine
            </Button>
            <IconButton label="Semaine suivante" size="sm" onClick={() => setStart((s) => addDays(s, 7))}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="px-3 pb-4 pt-3 sm:px-4">
        <Timesheet key={isoDate(start)} start={start} entries={entries} loading={isLoading} showUser={member?.id === "all"} onAdd={(a) => onAdd({ ...a, user_id: typeof member?.id === "number" ? member.id : undefined })} onEdit={onEdit} />
      </div>
    </Glass>
  );
}

/* -------------------------------------------------------------------------- */
/* Synthesis                                                                  */
/* -------------------------------------------------------------------------- */

function Synthesis({ entries, loading }: { entries: TimeEntryRow[]; loading: boolean }) {
  const t = useChartTheme();
  const agg = useMemo(() => {
    const projects = new Map<string, { label: string; value: number; billable: number; id?: number }>();
    const members = new Map<string, { label: string; value: number; billable: number }>();
    let total = 0;
    let billable = 0;
    let value = 0;
    let unbilled = 0;
    let invoiced = 0;
    for (const e of entries) {
      const h = e.minutes / 60;
      total += h;
      if (e.billable) {
        billable += h;
        value += h * rateOf(e);
        if (e.invoice_id) invoiced += h * rateOf(e);
        else unbilled += h * rateOf(e);
      }
      const pk = e.project ? String(e.project.id) : "none";
      const p = projects.get(pk) ?? { label: e.project?.name ?? "Sans projet", value: 0, billable: 0, id: e.project?.id };
      p.value += h;
      if (e.billable) p.billable += h;
      projects.set(pk, p);
      const mk = e.user ? String(e.user.id) : "none";
      const m = members.get(mk) ?? { label: e.user?.name ?? "—", value: 0, billable: 0 };
      m.value += h;
      if (e.billable) m.billable += h;
      members.set(mk, m);
    }
    const sort = <T extends { value: number }>(list: T[]) => list.sort((a, b) => b.value - a.value);
    return { projects: sort([...projects.values()]), members: sort([...members.values()]), total, billable, value, unbilled, invoiced };
  }, [entries]);

  if (loading && !entries.length)
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[260px] rounded-[22px]" />
        ))}
      </div>
    );

  const share = agg.total ? (agg.billable / agg.total) * 100 : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Heures par projet" icon={<FolderKanban className="size-4" />}>
        {agg.projects.length ? (
          <BarList items={agg.projects.slice(0, 8).map((p) => ({ id: p.id, label: p.label, value: p.value, sub: `${hours(p.billable)} facturables` }))} format={(v) => hours(v)} />
        ) : (
          <p className="py-8 text-center text-[12.5px] text-fg-3">Aucun temps sur la période.</p>
        )}
      </Panel>
      <Panel title="Facturable / non facturable" icon={<Clock3 className="size-4" />}>
        <div className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular">{hours(agg.total)}</span>
              <span className="text-[13px] font-semibold tabular text-fg-2">{percent(share)} facturable</span>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.07]">
              <motion.div initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} className="h-full rounded-l-full" style={{ background: t.accent }} />
              <div className="h-full flex-1" style={{ background: t.muted }} />
            </div>
            <div className="mt-2.5">
              <Legend
                items={[
                  { label: "Facturable", color: t.accent, value: hours(agg.billable) },
                  { label: "Non facturable", color: t.muted, value: hours(agg.total - agg.billable) },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Valeur facturable", value: money(agg.value, "EUR", { decimals: 0 }) },
              { label: "Reste à facturer", value: money(agg.unbilled, "EUR", { decimals: 0 }) },
              { label: "Déjà facturé", value: money(agg.invoiced, "EUR", { decimals: 0 }) },
              { label: "Taux horaire moyen", value: agg.billable ? `${money(agg.value / agg.billable, "EUR", { decimals: 0 })}/h` : "—" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-[14px] bg-black/[0.025] px-3 py-2.5 dark:bg-white/[0.035]">
                <div className="text-[11.5px] text-fg-3">{tile.label}</div>
                <div className="mt-0.5 text-[16px] font-semibold tabular">{tile.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Par membre" icon={<Users className="size-4" />}>
        {agg.members.length ? (
          <BarList items={agg.members.map((m) => ({ label: m.label, value: m.value, sub: `${percent(m.value ? (m.billable / m.value) * 100 : 0)} facturable` }))} format={(v) => hours(v)} />
        ) : (
          <p className="py-8 text-center text-[12.5px] text-fg-3">Aucun temps sur la période.</p>
        )}
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TimePage() {
  const ls = useListState({ filters: ["period", "user_id", "project_id", "billable"], defaultSort: "-date", pageSize: 25 });
  const [dialog, setDialog] = useState<{ entry?: TimeEntryRow; defaults?: TimeEntryDefaults } | null>(null);
  const period = ls.filters.period ?? "month";
  const range = periodRange(period);
  const filters = { date__gte: isoDate(range.start), date__lte: isoDate(range.end), user_id: ls.filters.user_id, project_id: ls.filters.project_id, billable: ls.filters.billable };
  const all = useList<TimeEntryRow>("time-entries", { ...filters, limit: 1000 });
  const table = useList<TimeEntryRow>("time-entries", { ...filters, sort: ls.sort, limit: ls.pageSize, offset: ls.page * ls.pageSize });
  const rows = table.data?.items ?? [];

  const columns: Column<TimeEntryRow>[] = [
    { key: "date", header: "Date", sortKey: "date", cell: (e) => <span className="whitespace-nowrap tabular">{date(e.date, "EEE d MMM")}</span> },
    { key: "user", header: "Membre", hideOnMobile: true, cell: (e) => (e.user ? <span className="flex items-center gap-2"><Avatar name={e.user.name} color={(e.user.color as string) ?? undefined} size={22} /><span className="truncate text-[13px]">{e.user.name}</span></span> : null) },
    {
      key: "project",
      header: "Projet",
      cell: (e) =>
        e.project ? (
          <Link to={`/projects/${e.project.id}`} onClick={(ev) => ev.stopPropagation()} className="flex min-w-0 items-center gap-2 hover:text-accent">
            <span className="size-2 shrink-0 rounded-full" style={{ background: refColor(e.project) }} />
            <span className="truncate">{e.project.name}</span>
          </Link>
        ) : (
          <span className="text-fg-3">Sans projet</span>
        ),
    },
    {
      key: "desc",
      header: "Description",
      hideOnMobile: true,
      cell: (e) => (
        <div className="min-w-0 max-w-[280px]">
          <div className="truncate">{e.description || <span className="text-fg-3">—</span>}</div>
          {e.task && <div className="truncate text-[12px] text-fg-3">{e.task.name}</div>}
        </div>
      ),
    },
    {
      key: "minutes",
      header: "Durée",
      sortKey: "minutes",
      align: "right",
      cell: (e) =>
        isRunning(e) ? (
          <Badge tone="red" dot>
            En cours
          </Badge>
        ) : (
          <span className="font-semibold tabular">{clock(e.minutes)}</span>
        ),
    },
    {
      key: "billing",
      header: "Facturation",
      hideOnMobile: true,
      cell: (e) =>
        e.invoice_id ? (
          <Badge tone="violet" dot>
            Facturé
          </Badge>
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
    { key: "amount", header: "Montant HT", align: "right", hideOnMobile: true, cell: (e) => (e.billable && e.hourly_rate ? <span className="tabular">{money((e.minutes / 60) * rateOf(e))}</span> : <span className="text-fg-3">—</span>) },
  ];

  const empty = (
    <EmptyState
      icon={<Clock3 className="size-6" />}
      title="Aucune saisie sur la période"
      description="Lancez le chronomètre ou saisissez du temps sur un projet."
      action={
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({})}>
          Saisir du temps
        </Button>
      }
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Temps"
        icon={<Timer className="size-5" />}
        description="Chronomètre, feuille de temps et rentabilité du temps passé"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({})}>
            Saisir du temps
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <TimerCard className="xl:col-span-2" />
        <WeekCard />
      </div>

      <TimesheetPanel onAdd={(defaults) => setDialog({ defaults })} onEdit={(entry) => setDialog({ entry })} />

      <div className="flex flex-col gap-3 pt-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Analyse</h2>
          <p className="text-[13px] text-fg-3">
            Du {date(range.start, "d MMMM")} au {date(range.end, "d MMMM yyyy")}
            {all.data && all.data.total > 1000 ? " · synthèse calculée sur les 1 000 dernières saisies" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select options={PERIODS} value={period} onChange={(v) => ls.setFilter("period", v === "month" ? null : v)} className="w-[175px]" />
          <EntitySelect resource="users" value={ls.filters.user_id ? Number(ls.filters.user_id) : null} onChange={(id) => ls.setFilter("user_id", id)} placeholder="Toute l'équipe" className="w-[170px]" />
          <EntitySelect resource="projects" value={ls.filters.project_id ? Number(ls.filters.project_id) : null} onChange={(id) => ls.setFilter("project_id", id)} placeholder="Tous les projets" className="w-[190px]" />
          <Select
            options={[
              { value: "", label: "Facturable ou non" },
              { value: "true", label: "Facturable" },
              { value: "false", label: "Non facturable" },
            ]}
            value={ls.filters.billable ?? ""}
            onChange={(v) => ls.setFilter("billable", v)}
            className="w-[175px]"
          />
        </div>
      </div>

      <Synthesis entries={all.data?.items ?? []} loading={all.isLoading} />

      <Glass className="overflow-hidden" radius="lg">
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Saisies</h3>
            <p className="text-[12.5px] text-fg-3">{table.data ? `${table.data.total.toLocaleString("fr-FR")} saisie${table.data.total > 1 ? "s" : ""} · ${clock((all.data?.items ?? []).reduce((s, e) => s + e.minutes, 0))}` : "Chargement…"}</p>
          </div>
          <Button size="sm" variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/time-entries.csv", `temps-${isoDate(range.start)}-${isoDate(range.end)}.csv`, filters).catch(toastError)}>
            Exporter
          </Button>
        </div>
        <DataTable columns={columns} rows={rows} loading={table.isLoading} sort={ls.sort} onSortChange={ls.setSort} onRowClick={(entry) => setDialog({ entry })} empty={empty} page={ls.page} pageSize={ls.pageSize} total={table.data?.total} onPageChange={ls.setPage} dense />
      </Glass>

      <TimeEntryDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} entry={dialog?.entry} defaults={dialog?.defaults} />
    </div>
  );
}

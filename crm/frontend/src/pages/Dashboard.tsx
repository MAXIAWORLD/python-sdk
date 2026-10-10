import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Circle,
  Gauge,
  LifeBuoy,
  Phone,
  Repeat,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { BarList, MrrMovements, RevenueChart } from "@/components/charts/Charts";
import { AnimatedNumber, Delta, Panel, StatTile } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Scene3D } from "@/components/three/Scene3D";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { Markdown } from "@/components/ui/markdown";
import { api } from "@/lib/api";
import { ACTIVITY_TYPES, PRIORITY } from "@/lib/constants";
import { date, dayLabel, money, moneyShort, number, percent, relative, time } from "@/lib/format";
import { useUpdate } from "@/lib/hooks";
import type { Activity, CalendarEvent, Deal, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

interface DashboardData {
  kpis: Record<string, number | null>;
  revenue_series: { month: string; label: string; revenue: number; cash: number }[];
  mrr_series: { month: string; mrr: number; new: number; expansion: number; reactivation: number; contraction: number; churn: number }[];
  pipeline: { stages: { id: number; name: string; color: string; count: number; value: number; weighted: number; is_won: boolean; is_lost: boolean }[]; open_value: number; weighted_value: number };
  lead_sources: { source: string; count: number }[];
  top_clients: { id: number; name: string; revenue: number }[];
  my_tasks: Task[];
  upcoming_events: CalendarEvent[];
  activities: Activity[];
  deals_at_risk: Deal[];
  renewals: { id: number; plan: string; company_id: number; date: string; amount: number }[];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

const EVENT_ICON = { call: Phone, demo: Video, meeting: Users } as Record<string, typeof Phone>;

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const openAssistant = useUI((s) => s.openAssistant);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/dashboard"), refetchInterval: 120_000 });
  const brief = useAiGenerate();
  const updateTask = useUpdate("tasks", { silent: true });
  const k = data?.kpis ?? {};

  const revenueTrend = data?.revenue_series.map((r) => r.revenue) ?? [];
  const mrrTrend = data?.mrr_series.map((r) => r.mrr) ?? [];
  const cashTrend = data?.revenue_series.map((r) => r.cash) ?? [];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Glass glow className="relative overflow-hidden" radius="xl">
        <div className="grid min-h-[260px] grid-cols-1 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative z-10 flex flex-col justify-between gap-6 p-6 sm:p-8">
            <div>
              <div className="text-[13px] font-medium text-fg-3 first-letter:uppercase">{date(new Date(), "EEEE d MMMM yyyy")}</div>
              <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[36px]">
                {greeting()}, {user?.name?.split(" ")[0]} <span className="inline-block animate-[float_4s_ease-in-out_infinite]">✨</span>
              </h1>
              <p className="mt-1.5 max-w-[520px] text-[14.5px] text-fg-2">
                {k.tasks_overdue ? `${k.tasks_overdue} tâche${(k.tasks_overdue ?? 0) > 1 ? "s" : ""} en retard, ` : ""}
                {k.overdue_count ? `${k.overdue_count} facture${(k.overdue_count ?? 0) > 1 ? "s" : ""} impayée${(k.overdue_count ?? 0) > 1 ? "s" : ""} à relancer` : "aucune facture en retard"}
                {k.sla_breached ? `, ${k.sla_breached} ticket${(k.sla_breached ?? 0) > 1 ? "s" : ""} hors SLA.` : "."}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <div className="text-[12.5px] font-medium text-fg-3">Chiffre d'affaires du mois (HT)</div>
                <div className="mt-1 text-[48px] font-semibold leading-none tracking-[-0.04em] sm:text-[56px]">
                  {isLoading ? <Skeleton className="h-14 w-60" /> : <AnimatedNumber value={k.revenue_month ?? 0} format={(v) => money(v, "EUR", { decimals: 0 })} />}
                </div>
                <div className="mt-2">
                  <Delta value={k.revenue_month_delta} period="vs mois dernier (même période)" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ai" icon={<Sparkles className="size-4" />} loading={brief.loading} onClick={() => brief.run("daily_briefing")}>
                  Brief du jour
                </Button>
                <Button variant="glass" onClick={() => openAssistant()} iconRight={<ArrowRight className="size-4" />}>
                  Demander à Iris
                </Button>
              </div>
            </div>
          </div>
          <div className="relative h-[240px] lg:h-auto">
            <Scene3D className="absolute inset-0" />
          </div>
        </div>
        <AnimatePresence>
          {(brief.text || brief.loading) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative z-10 overflow-hidden border-t border-[var(--hairline)]">
              <div className="px-6 py-5 sm:px-8">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#b26bff]">
                  <Sparkles className="size-3.5" /> Brief d'Iris
                </div>
                <Markdown streaming={brief.loading}>{brief.text || "…"}</Markdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Glass>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="MRR" value={k.mrr ?? 0} format={(v) => moneyShort(v)} trend={mrrTrend} icon={<Repeat className="size-4" />} hint={`ARR ${moneyShort(k.arr)} · NRR ${percent(k.nrr, 0)}`} onClick={() => navigate("/subscriptions")} />
        <StatTile label="Encaissements du mois" value={k.cash_month ?? 0} format={(v) => moneyShort(v)} delta={k.cash_month_delta} period="vs M-1" trend={cashTrend} icon={<Wallet className="size-4" />} accent="linear-gradient(135deg,#1baf7a,#22d3ee)" onClick={() => navigate("/invoices?status=paid")} />
        <StatTile label="Pipeline pondéré" value={k.pipeline_weighted ?? 0} format={(v) => moneyShort(v)} hint={`${number(k.pipeline_count)} affaires · ${moneyShort(k.pipeline_open)} au total`} icon={<Target className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" onClick={() => navigate("/deals")} />
        <StatTile label="Créances en retard" value={k.overdue_amount ?? 0} format={(v) => moneyShort(v)} hint={`${number(k.overdue_count)} facture(s) · ${moneyShort(k.receivables)} à encaisser`} icon={<AlertTriangle className="size-4" />} accent="linear-gradient(135deg,#ff9f0a,#ff375f)" onClick={() => navigate("/invoices?status=overdue")} />
        <StatTile label="Taux de conversion (90 j)" value={k.win_rate ?? 0} format={(v) => percent(v, 1)} hint={`${number(k.won_month_count)} gagnée(s) ce mois · ${moneyShort(k.won_month_value)}`} icon={<Gauge className="size-4" />} accent="linear-gradient(135deg,#5b6cff,#22d3ee)" />
        <StatTile label="Nouveaux leads" value={k.leads_month ?? 0} format={(v) => number(v)} delta={k.leads_month_delta} period="vs M-1" icon={<Users className="size-4" />} accent="linear-gradient(135deg,#22d3ee,#5b6cff)" onClick={() => navigate("/contacts?lifecycle=lead")} />
        <StatTile label="CA depuis janvier" value={k.revenue_ytd ?? 0} format={(v) => moneyShort(v)} trend={revenueTrend} icon={<TrendingUp className="size-4" />} accent="linear-gradient(135deg,#34d399,#5b6cff)" onClick={() => navigate("/reports")} />
        <StatTile label="Tickets ouverts" value={k.tickets_open ?? 0} format={(v) => number(v)} hint={k.sla_breached ? `${k.sla_breached} hors SLA` : "SLA respectés"} icon={<LifeBuoy className="size-4" />} accent="linear-gradient(135deg,#f472b6,#fbbf24)" onClick={() => navigate("/tickets")} />
      </div>

      {/* Revenue + pipeline */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Chiffre d'affaires & encaissements" description="12 derniers mois, HT facturé et règlements reçus" className="xl:col-span-2">
          {data ? <RevenueChart data={data.revenue_series} /> : <Skeleton className="h-[290px]" />}
        </Panel>
        <Panel title="Pipeline par étape" description={`Pondéré : ${moneyShort(data?.pipeline.weighted_value)}`} actions={<Link to="/deals" className="text-[12.5px] font-medium text-accent">Ouvrir</Link>}>
          {data ? (
            <BarList items={data.pipeline.stages.filter((s) => !s.is_lost).map((s) => ({ label: s.name, value: s.value, sub: `${s.count} affaire${s.count > 1 ? "s" : ""}${s.is_won ? "" : ` · pondéré ${moneyShort(s.weighted)}`}` }))} format={(v) => moneyShort(v)} />
          ) : (
            <Skeleton className="h-[260px]" />
          )}
        </Panel>
      </div>

      {/* MRR + tasks + agenda */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel title="Mouvements de MRR" description="Nouveau, expansion, contraction et churn par mois" className="xl:col-span-2">
          {data ? <MrrMovements data={data.mrr_series.slice(-8)} /> : <Skeleton className="h-[260px]" />}
        </Panel>
        <Panel title="Mes tâches" actions={<Link to="/tasks" className="text-[12.5px] font-medium text-accent">Tout voir</Link>} bodyClassName="px-2 pb-3">
          {data && data.my_tasks.length === 0 && <EmptyState icon={<CheckCircle2 className="size-6" />} title="Rien à faire 🎉" description="Aucune tâche cette semaine." />}
          <div className="space-y-0.5">
            {data?.my_tasks.slice(0, 7).map((t) => {
              const late = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
              return (
                <div key={t.id} className="group flex items-center gap-2.5 rounded-[12px] px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                  <button onClick={() => updateTask.mutate({ id: t.id, data: { status: "done" } })} className="text-fg-3 transition hover:text-emerald-500" aria-label="Terminer">
                    <Circle className="size-[18px]" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px]">{t.title}</div>
                    <div className={cn("text-[11.5px]", late ? "text-red-500" : "text-fg-3")}>{t.due_date ? dayLabel(t.due_date) : "Sans échéance"}{t.contact ? ` · ${t.contact.name}` : t.project ? ` · ${t.project.name}` : ""}</div>
                  </div>
                  {t.priority === "high" || t.priority === "urgent" ? <StatusBadge options={PRIORITY} value={t.priority} size="xs" /> : null}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Agenda" description="7 prochains jours" actions={<Link to="/calendar" className="text-[12.5px] font-medium text-accent">Agenda</Link>} bodyClassName="px-2 pb-3">
          {data && data.upcoming_events.length === 0 && <EmptyState icon={<CalendarDays className="size-6" />} title="Agenda libre" />}
          <div className="space-y-0.5">
            {data?.upcoming_events.slice(0, 6).map((e) => {
              const Icon = EVENT_ICON[e.type] ?? CalendarDays;
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-[12px] px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                  <div className="glass-inset flex w-11 shrink-0 flex-col items-center rounded-[11px] py-1 leading-none">
                    <span className="text-[9.5px] font-semibold uppercase tracking-wide text-fg-3">{date(e.start_at, "EEE").replace(".", "")}</span>
                    <span className="mt-0.5 text-[16px] font-semibold tabular">{date(e.start_at, "d")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px]">{e.title}</div>
                    <div className="flex items-center gap-1 text-[11.5px] text-fg-3">
                      <Icon className="size-3 shrink-0" />
                      <span className="tabular">{e.all_day ? "Journée" : time(e.start_at)}</span>
                      <span className="truncate">· {e.location ?? (e.meeting_url ? "Visio" : "—")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Activity + risk + clients */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel title="Activité récente" className="xl:col-span-2" bodyClassName="px-3 pb-3">
          <div className="relative space-y-0.5">
            {data?.activities.slice(0, 9).map((a) => {
              const opt = ACTIVITY_TYPES.find((o) => o.value === a.type);
              return (
                <div key={a.id} className="flex items-start gap-3 rounded-[12px] px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                  <Avatar name={a.user?.name ?? "Système"} color={(a.user?.color as string) ?? undefined} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] leading-snug">
                      <span className="font-medium">{a.subject}</span>
                      {a.contact && (
                        <Link to={`/contacts/${a.contact.id}`} className="text-fg-2 hover:text-accent">
                          {" "}
                          · {a.contact.name}
                        </Link>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-fg-3">
                      <Badge tone={opt?.tone} size="xs">
                        {opt?.label ?? a.type}
                      </Badge>
                      {relative(a.occurred_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Affaires à surveiller" description="En retard ou sans mouvement depuis 3 semaines" bodyClassName="px-2 pb-3">
          {data && data.deals_at_risk.length === 0 && <EmptyState icon={<CheckCircle2 className="size-6" />} title="Tout est sous contrôle" />}
          {data?.deals_at_risk.map((d) => (
            <Link key={d.id} to={`/deals/${d.id}`} className="block rounded-[12px] px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px]">{d.title}</span>
                <span className="shrink-0 text-[12.5px] font-semibold tabular">{moneyShort(d.value)}</span>
              </div>
              <div className="text-[11.5px] text-fg-3">
                {d.stage?.name} · closing {d.expected_close_date ? date(d.expected_close_date, "d MMM") : "—"}
              </div>
            </Link>
          ))}
        </Panel>
        <Panel title="Meilleurs clients" description="CA HT sur 12 mois" icon={<Banknote className="size-4" />}>
          {data ? <BarList items={data.top_clients.map((c) => ({ id: c.id, label: c.name, value: c.revenue }))} format={(v) => moneyShort(v)} onClick={(it) => navigate(`/companies/${it.id}`)} /> : <Skeleton className="h-48" />}
          {data && data.lead_sources.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 text-[13px] font-semibold">Sources des leads (6 mois)</div>
              <BarList items={data.lead_sources.slice(0, 5).map((s) => ({ label: s.source, value: s.count }))} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

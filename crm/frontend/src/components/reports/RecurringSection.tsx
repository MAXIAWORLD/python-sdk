import { CalendarClock, Layers, Repeat, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Link } from "react-router";
import { BarList, monthLabel, MrrLine, MrrMovements } from "@/components/charts/Charts";
import { Panel, StatTile } from "@/components/data/blocks";
import { CompanyLogo, EmptyState, Skeleton } from "@/components/ui/display";
import { date, dayLabel, money, moneyShort, number, percent } from "@/lib/format";
import { useApi, useList } from "@/lib/hooks";
import type { Subscription } from "@/lib/types";
import type { Period, SaasMetrics } from "./data";
import { ReportPanel, type TableColumn } from "./kit";

export function RecurringSection({ period }: { period: Period }) {
  const { data: saas, isLoading } = useApi<SaasMetrics>(["subscription-metrics", "reports"], "/subscriptions/metrics", { months: period.months }, { staleTime: 60_000 });
  const renewalIds = (saas?.renewals ?? []).slice(0, 7).map((r) => r.id);
  const subs = useList<Subscription>("subscriptions", { id__in: renewalIds.join(","), limit: 20 }, { enabled: renewalIds.length > 0 });

  const series = saas?.series ?? [];
  const net = (m: SaasMetrics["series"][number]) => m.new + m.expansion + m.reactivation + m.contraction + m.churn;
  const moveCols: TableColumn<SaasMetrics["series"][number]>[] = [
    { key: "m", header: "Mois", cell: (r) => <span className="capitalize">{monthLabel(r.month)}</span>, csv: (r) => r.month },
    { key: "n", header: "Nouveau", align: "right", cell: (r) => money(r.new, "EUR", { decimals: 0 }), csv: (r) => r.new },
    { key: "e", header: "Expansion", align: "right", cell: (r) => money(r.expansion + r.reactivation, "EUR", { decimals: 0 }), csv: (r) => r.expansion + r.reactivation },
    { key: "c", header: "Contraction", align: "right", hideOnMobile: true, cell: (r) => money(r.contraction, "EUR", { decimals: 0 }), csv: (r) => r.contraction },
    { key: "ch", header: "Churn", align: "right", cell: (r) => money(r.churn, "EUR", { decimals: 0 }), csv: (r) => r.churn },
    { key: "net", header: "Net", align: "right", cell: (r) => <span className="font-semibold">{money(net(r), "EUR", { decimals: 0 })}</span>, csv: (r) => net(r) },
    { key: "mrr", header: "MRR fin de mois", align: "right", hideOnMobile: true, cell: (r) => money(r.mrr, "EUR", { decimals: 0 }), csv: (r) => r.mrr },
  ];
  const planCols: TableColumn<SaasMetrics["plans"][number]>[] = [
    { key: "p", header: "Formule", cell: (r) => r.plan, csv: (r) => r.plan },
    { key: "c", header: "Abonnements", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "m", header: "MRR", align: "right", cell: (r) => money(r.mrr, "EUR", { decimals: 0 }), csv: (r) => r.mrr },
    { key: "s", header: "Part du MRR", align: "right", cell: (r) => percent(saas?.mrr ? (r.mrr / saas.mrr) * 100 : 0, 1), csv: (r) => (saas?.mrr ? (r.mrr / saas.mrr) * 100 : 0) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="MRR" value={saas?.mrr ?? 0} format={(v) => moneyShort(v)} trend={series.map((s) => s.mrr)} icon={<Repeat className="size-4" />} />
        <StatTile label="ARR" value={saas?.arr ?? 0} format={(v) => moneyShort(v)} hint="MRR × 12" icon={<Wallet className="size-4" />} accent="linear-gradient(135deg,#0ea5e9,#14b8a6)" />
        <StatTile label="NRR (30 j)" value={saas?.nrr ?? 0} format={(v) => percent(v, 1)} hint="rétention nette du revenu" icon={<TrendingUp className="size-4" />} accent="linear-gradient(135deg,#10b981,#22d3ee)" />
        <StatTile label="Churn MRR (30 j)" value={saas?.churn_rate ?? 0} format={(v) => percent(v, 1)} hint={`churn clients ${percent(saas?.logo_churn_rate, 1)}`} icon={<TrendingDown className="size-4" />} accent="linear-gradient(135deg,#fb923c,#f43f5e)" />
        <StatTile label="ARPA" value={saas?.arpa ?? 0} format={(v) => moneyShort(v)} hint={`${number(saas?.customers)} clients abonnés`} icon={<Users className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
        <StatTile label="Abonnements actifs" value={saas?.active_subscriptions ?? 0} format={(v) => number(v)} hint={`${number(saas?.trialing)} en essai`} icon={<Layers className="size-4" />} accent="linear-gradient(135deg,#6366f1,#a855f7)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Évolution du MRR" description={`Fin de mois · ${period.months} derniers mois`} icon={<Repeat className="size-4" />}>
          {isLoading ? <Skeleton className="h-[220px]" /> : series.length ? <MrrLine data={series} height={252} /> : <EmptyState title="Aucun abonnement." className="py-10" />}
        </Panel>
        <ReportPanel title="Mouvements de MRR" description="Nouveau, expansion, contraction et churn par mois" icon={<TrendingUp className="size-4" />} loading={isLoading} empty={!series.length} chart={<MrrMovements data={series} />} table={{ columns: moveCols, rows: series }} csvName="mouvements-mrr" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportPanel
          title="MRR par formule"
          description="Abonnements actifs et impayés"
          icon={<Layers className="size-4" />}
          loading={isLoading}
          empty={!saas?.plans.length}
          chart={<BarList items={(saas?.plans ?? []).map((p) => ({ label: p.plan, value: p.mrr, sub: `${p.count} abonnement${p.count > 1 ? "s" : ""} · ${percent(saas?.mrr ? (p.mrr / saas.mrr) * 100 : 0, 0)} du MRR` }))} format={(v) => moneyShort(v)} />}
          table={{ columns: planCols, rows: saas?.plans ?? [] }}
          csvName="mrr-par-formule"
        />
        <Panel title="Renouvellements à venir" description="45 prochains jours" icon={<CalendarClock className="size-4" />} bodyClassName="px-2 pb-3" actions={<Link to="/subscriptions" className="text-[12.5px] font-medium text-accent">Abonnements</Link>}>
          {isLoading ? (
            <Skeleton className="mx-3 h-40" />
          ) : !saas?.renewals.length ? (
            <EmptyState icon={<CalendarClock className="size-6" />} title="Aucun renouvellement proche" className="py-8" />
          ) : (
            <div className="space-y-0.5">
              {saas.renewals.slice(0, 7).map((r) => {
                const sub = subs.data?.items.find((s) => s.id === r.id);
                const company = sub?.company?.name;
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-[12px] px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                    <CompanyLogo name={company ?? r.plan} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium">{company ?? `Abonnement #${r.id}`}</div>
                      <div className="truncate text-[11.5px] text-fg-3">{r.plan}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] font-semibold tabular">{money(r.amount, "EUR", { decimals: 0 })}</div>
                      <div className="text-[11.5px] text-fg-3 first-letter:uppercase" title={date(r.date)}>
                        {dayLabel(r.date)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

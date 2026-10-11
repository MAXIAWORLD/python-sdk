import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { Filter, Gauge, Hourglass, Package, Target, TrendingUp, Trophy, UserRound, XCircle } from "lucide-react";
import { useMemo } from "react";
import { BarList, monthLabel } from "@/components/charts/Charts";
import { StatTile } from "@/components/data/blocks";
import { api } from "@/lib/api";
import { money, moneyShort, number, percent } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { Funnel, MultiColumns, SeriesColumns } from "./charts";
import { monthInPeriod, pct, usePeriodRows, type Period, type ReportsData } from "./data";
import { ReportPanel, TruncatedNote, type TableColumn } from "./kit";

interface DashboardLite {
  kpis: Record<string, number | null>;
  pipeline: { stages: { id: number; name: string; count: number; value: number; weighted: number; is_won: boolean; is_lost: boolean }[]; open_value: number; weighted_value: number };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function SalesSection({ period, report, prev }: { period: Period; report?: ReportsData; prev?: ReportsData }) {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardLite>("/dashboard"), staleTime: 60_000 });
  const closed = usePeriodRows<Deal>("deals", period, { clientField: "closed_at", params: { status__in: "won,lost", expand: 0 } });

  const sales = useMemo(() => {
    const won = closed.items.filter((d) => d.status === "won");
    const lost = closed.items.filter((d) => d.status === "lost");
    const wonValue = sum(won.map((d) => d.value));
    const cycles = won.filter((d) => d.closed_at).map((d) => Math.max(0, differenceInCalendarDays(new Date(d.closed_at as string), new Date(d.created_at)))).sort((a, b) => a - b);
    const reasons = new Map<string, { count: number; value: number }>();
    for (const d of lost) {
      const key = (d.lost_reason ?? "").split(" — ")[0].trim() || "Non renseigné";
      const r = reasons.get(key) ?? { count: 0, value: 0 };
      reasons.set(key, { count: r.count + 1, value: r.value + d.value });
    }
    return {
      won,
      lost,
      wonValue,
      winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
      avgCycle: cycles.length ? sum(cycles) / cycles.length : null,
      medianCycle: cycles.length ? cycles[Math.floor(cycles.length / 2)] : null,
      avgDeal: won.length ? wonValue / won.length : null,
      reasons: Array.from(reasons, ([label, r]) => ({ label, ...r })).sort((a, b) => b.count - a.count || b.value - a.value),
    };
  }, [closed.items]);

  const k = dashboard.data?.kpis ?? {};
  const revenueRows = (report?.revenue_series ?? []).map((r) => ({ ...r, active: monthInPeriod(period, r.month) }));
  const products = report?.revenue_by_product ?? [];
  const productTotal = sum(products.map((p) => p.revenue));
  const productBars = products.length > 8 ? [...products.slice(0, 7).map((p) => ({ label: p.name, value: p.revenue })), { label: `Autres (${products.length - 7})`, value: sum(products.slice(7).map((p) => p.revenue)) }] : products.map((p) => ({ label: p.name, value: p.revenue }));
  const revenueTotal12 = sum((report?.revenue_series ?? []).map((r) => r.revenue));
  const best = (report?.revenue_series ?? []).reduce<ReportsData["revenue_series"][number] | null>((acc, r) => (!acc || r.revenue > acc.revenue ? r : acc), null);
  const owners = report?.sales_by_owner ?? [];
  const funnel = report?.funnel ?? [];
  const stages = (dashboard.data?.pipeline.stages ?? []).filter((s) => !s.is_won && !s.is_lost);

  /* ------------------------------------------------------------ tables */
  const revenueCols: TableColumn<(typeof revenueRows)[number]>[] = [
    { key: "m", header: "Mois", cell: (r) => <span className="capitalize">{monthLabel(r.month)}</span>, csv: (r) => r.month },
    { key: "rev", header: "CA HT", align: "right", cell: (r) => money(r.revenue, "EUR", { decimals: 0 }), csv: (r) => r.revenue },
    { key: "cash", header: "Encaissements", align: "right", cell: (r) => money(r.cash, "EUR", { decimals: 0 }), csv: (r) => r.cash },
  ];
  const productCols: TableColumn<{ name: string; revenue: number }>[] = [
    { key: "n", header: "Produit / service", cell: (r) => r.name, csv: (r) => r.name },
    { key: "r", header: "CA HT", align: "right", cell: (r) => money(r.revenue, "EUR", { decimals: 0 }), csv: (r) => r.revenue },
    { key: "s", header: "Part", align: "right", cell: (r) => percent(productTotal ? (r.revenue / productTotal) * 100 : 0, 1), csv: (r) => (productTotal ? (r.revenue / productTotal) * 100 : 0) },
  ];
  const ownerCols: TableColumn<(typeof owners)[number]>[] = [
    { key: "n", header: "Commercial", cell: (r) => <span className="font-medium">{r.name}</span>, csv: (r) => r.name },
    { key: "w", header: "Gagnées", align: "right", cell: (r) => number(r.won), csv: (r) => r.won },
    { key: "l", header: "Perdues", align: "right", cell: (r) => number(r.lost), csv: (r) => r.lost },
    { key: "o", header: "En cours", align: "right", hideOnMobile: true, cell: (r) => number(r.open), csv: (r) => r.open },
    { key: "rate", header: "Taux de gain", align: "right", cell: (r) => percent(r.win_rate, 0), csv: (r) => r.win_rate },
    { key: "v", header: "CA signé", align: "right", cell: (r) => money(r.won_value, "EUR", { decimals: 0 }), csv: (r) => r.won_value },
  ];
  const funnelRows = funnel.map((f, i) => ({ ...f, fromPrev: i > 0 && funnel[i - 1].count ? (f.count / funnel[i - 1].count) * 100 : null, fromTop: funnel[0]?.count ? (f.count / funnel[0].count) * 100 : null }));
  const funnelCols: TableColumn<(typeof funnelRows)[number]>[] = [
    { key: "l", header: "Stade", cell: (r) => r.label, csv: (r) => r.label },
    { key: "c", header: "Contacts", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "p", header: "Depuis l'étape préc.", align: "right", cell: (r) => (r.fromPrev === null ? "—" : percent(r.fromPrev, 1)), csv: (r) => r.fromPrev },
    { key: "t", header: "Depuis le début", align: "right", hideOnMobile: true, cell: (r) => percent(r.fromTop, 1), csv: (r) => r.fromTop },
  ];
  const winLoss = (report?.win_loss ?? []).map((w) => ({ ...w, label: monthLabel(w.month) }));
  const winLossCols: TableColumn<(typeof winLoss)[number]>[] = [
    { key: "m", header: "Mois", cell: (r) => <span className="capitalize">{r.label}</span>, csv: (r) => r.month },
    { key: "w", header: "Gagnées", align: "right", cell: (r) => number(r.won), csv: (r) => r.won },
    { key: "l", header: "Perdues", align: "right", cell: (r) => number(r.lost), csv: (r) => r.lost },
    { key: "v", header: "CA signé", align: "right", cell: (r) => money(r.won_value, "EUR", { decimals: 0 }), csv: (r) => r.won_value },
  ];
  const reasonCols: TableColumn<(typeof sales.reasons)[number]>[] = [
    { key: "l", header: "Motif", cell: (r) => r.label, csv: (r) => r.label },
    { key: "c", header: "Affaires", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "v", header: "Montant perdu", align: "right", cell: (r) => money(r.value, "EUR", { decimals: 0 }), csv: (r) => r.value },
  ];
  const stageCols: TableColumn<(typeof stages)[number]>[] = [
    { key: "n", header: "Étape", cell: (r) => r.name, csv: (r) => r.name },
    { key: "c", header: "Affaires", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "v", header: "Montant", align: "right", cell: (r) => money(r.value, "EUR", { decimals: 0 }), csv: (r) => r.value },
    { key: "w", header: "Pondéré", align: "right", hideOnMobile: true, cell: (r) => money(r.weighted, "EUR", { decimals: 0 }), csv: (r) => r.weighted },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="CA HT facturé" value={report?.revenue_total ?? 0} format={(v) => moneyShort(v)} delta={report && prev ? (pct(report.revenue_total, prev.revenue_total) ?? undefined) : undefined} period="vs période préc." icon={<TrendingUp className="size-4" />} />
        <StatTile label="Affaires gagnées" value={sales.wonValue} format={(v) => moneyShort(v)} hint={`${sales.won.length} affaire${sales.won.length > 1 ? "s" : ""}${sales.avgDeal ? ` · panier ${moneyShort(sales.avgDeal)}` : ""}`} icon={<Trophy className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
        <StatTile label="Taux de gain" value={sales.winRate ?? 0} format={(v) => (sales.winRate === null ? "—" : percent(v, 0))} hint={`${sales.won.length} gagnée${sales.won.length > 1 ? "s" : ""} · ${sales.lost.length} perdue${sales.lost.length > 1 ? "s" : ""}`} icon={<Target className="size-4" />} accent="linear-gradient(135deg,#5b6cff,#22d3ee)" />
        <StatTile label="Cycle de vente moyen" value={sales.avgCycle ?? 0} format={(v) => (sales.avgCycle === null ? "—" : `${number(v)} j`)} hint={sales.medianCycle !== null ? `médiane ${number(sales.medianCycle)} j` : "aucune affaire gagnée"} icon={<Hourglass className="size-4" />} accent="linear-gradient(135deg,#f59e0b,#f97316)" />
        <StatTile label="Pipeline pondéré" value={k.pipeline_weighted ?? 0} format={(v) => moneyShort(v)} hint={`${number(k.pipeline_count)} affaires ouvertes`} icon={<Gauge className="size-4" />} accent="linear-gradient(135deg,#10b981,#22d3ee)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ReportPanel
          className="xl:col-span-2"
          title="Chiffre d'affaires HT par mois"
          description="Factures et acomptes émis, nets des avoirs · 12 derniers mois"
          icon={<TrendingUp className="size-4" />}
          loading={!report}
          chart={
            <>
              <SeriesColumns data={revenueRows.map((r) => ({ label: r.label, value: r.revenue, active: r.active }))} valueLabel="CA HT" format={(v) => money(v, "EUR", { decimals: 0 })} axisFormat={(v) => moneyShort(v)} height={300} />
              {best && (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--hairline)] pt-4">
                  {[
                    { label: "Total 12 mois", value: moneyShort(revenueTotal12) },
                    { label: "Moyenne mensuelle", value: moneyShort(revenueTotal12 / Math.max(1, revenueRows.length)) },
                    { label: `Meilleur mois (${monthLabel(best.month)})`, value: moneyShort(best.revenue) },
                  ].map((x) => (
                    <div key={x.label} className="min-w-0">
                      <div className="truncate text-[11.5px] text-fg-3">{x.label}</div>
                      <div className="text-[16px] font-semibold tracking-[-0.01em] tabular">{x.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          }
          table={{ columns: revenueCols, rows: revenueRows, footer: { month: "Total", label: "Total", revenue: sum(revenueRows.map((r) => r.revenue)), cash: sum(revenueRows.map((r) => r.cash)), active: true } }}
          csvName="ca-par-mois"
        />
        <ReportPanel
          title="CA par produit / service"
          description="Top 10 sur la période"
          icon={<Package className="size-4" />}
          loading={!report}
          empty={!report?.revenue_by_product.length}
          chart={<BarList items={productBars.map((p) => ({ ...p, sub: `${percent(productTotal ? (p.value / productTotal) * 100 : 0, 0)} du CA` }))} format={(v) => moneyShort(v)} />}
          table={{ columns: productCols, rows: report?.revenue_by_product ?? [] }}
          csvName="ca-par-produit"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportPanel
          title="Performance par commercial"
          description="Affaires créées depuis le début de la période"
          icon={<UserRound className="size-4" />}
          loading={!report}
          empty={!owners.length}
          chart={<BarList items={owners.map((o) => ({ label: o.name, value: o.won_value, sub: `${o.won} gagnée${o.won > 1 ? "s" : ""} · ${o.lost} perdue${o.lost > 1 ? "s" : ""} · ${o.open} en cours · réussite ${percent(o.win_rate, 0)}` }))} format={(v) => moneyShort(v)} />}
          table={{ columns: ownerCols, rows: owners }}
          csvName="ventes-par-commercial"
        />
        <ReportPanel title="Entonnoir de conversion" description="Contacts par stade du cycle de vie (cumulé)" icon={<Filter className="size-4" />} loading={!report} empty={!funnel.length || !funnel[0].count} chart={<Funnel steps={funnel.map((f) => ({ label: f.label, count: f.count }))} />} table={{ columns: funnelCols, rows: funnelRows }} csvName="entonnoir-conversion" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ReportPanel
          title="Gains et pertes"
          description="Affaires clôturées par mois"
          icon={<Trophy className="size-4" />}
          loading={!report}
          empty={!winLoss.length}
          emptyText="Aucune affaire clôturée sur la période."
          chart={
            <MultiColumns
              data={winLoss.map((w) => ({ label: w.label, won: w.won, lost: w.lost }))}
              series={[
                { key: "won", label: "Gagnées" },
                { key: "lost", label: "Perdues" },
              ]}
              height={220}
            />
          }
          table={{ columns: winLossCols, rows: winLoss }}
          csvName="gagnees-perdues"
        />
        <ReportPanel
          title="Motifs de perte"
          description={`${sales.lost.length} affaire${sales.lost.length > 1 ? "s" : ""} perdue${sales.lost.length > 1 ? "s" : ""} · ${moneyShort(sum(sales.lost.map((d) => d.value)))}`}
          icon={<XCircle className="size-4" />}
          loading={closed.loading}
          empty={!sales.reasons.length}
          emptyText="Aucune affaire perdue sur la période."
          chart={
            <>
              <BarList items={sales.reasons.map((r) => ({ label: r.label, value: r.count, sub: `${moneyShort(r.value)} perdus` }))} format={(v) => `${number(v)} affaire${v > 1 ? "s" : ""}`} />
              <TruncatedNote show={closed.truncated} />
            </>
          }
          table={{ columns: reasonCols, rows: sales.reasons }}
          csvName="motifs-de-perte"
        />
        <ReportPanel
          className="lg:col-span-2 xl:col-span-1"
          title="Pipeline ouvert par étape"
          description={dashboard.data ? `Pipeline principal · pondéré ${moneyShort(dashboard.data.pipeline.weighted_value)}` : undefined}
          icon={<Gauge className="size-4" />}
          loading={dashboard.isLoading}
          empty={!stages.length}
          chart={<BarList items={stages.map((s) => ({ label: s.name, value: s.value, sub: `${s.count} affaire${s.count > 1 ? "s" : ""} · pondéré ${moneyShort(s.weighted)}` }))} format={(v) => moneyShort(v)} />}
          table={{ columns: stageCols, rows: stages }}
          csvName="pipeline-par-etape"
        />
      </div>
    </div>
  );
}

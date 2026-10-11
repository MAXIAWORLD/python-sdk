import { Building2, Coins, Hourglass, Layers, Magnet, TrendingDown, TrendingUp } from "lucide-react";
import { BarList, monthLabel, MrrLine, MrrMovements } from "@/components/charts/Charts";
import { AnimatedNumber, Delta, Panel, StatTile } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { money, moneyShort, number, percent, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { signed, type SubscriptionMetrics } from "./model";

export interface OverviewExtras {
  /** Seats (sum of quantities) of billable subscriptions, for ARPU. */
  seats: number;
  /** Trials ending within 7 days. */
  trialsEndingSoon: number;
  /** Potential MRR of running trials. */
  trialsPotential: number;
  pastDue: number;
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11.5px] font-medium text-fg-3">{label}</div>
      <div className={cn("whitespace-nowrap text-[16px] font-semibold tracking-[-0.01em] tabular", tone === "up" && "text-emerald-600 dark:text-emerald-400", tone === "down" && "text-red-500 dark:text-red-400")}>{value}</div>
      <div className="text-[11.5px] leading-snug text-fg-3">{sub}</div>
    </div>
  );
}

/** MRR hero: live MRR, month-over-month delta, 12-month growth and the MRR curve. */
export function MrrHero({ metrics, loading }: { metrics?: SubscriptionMetrics; loading: boolean }) {
  const series = metrics?.series ?? [];
  const first = series[0];
  const previous = series.length > 1 ? series[series.length - 2] : undefined;
  const mrr = metrics?.mrr ?? 0;
  const mom = previous && previous.mrr > 0 ? ((mrr - previous.mrr) / previous.mrr) * 100 : null;
  const growth = first ? mrr - first.mrr : 0;
  const growthPct = first && first.mrr > 0 ? (growth / first.mrr) * 100 : null;
  const since = series.slice(1);
  const added = since.reduce((s, p) => s + p.new + p.expansion + p.reactivation, 0);
  const lost = since.reduce((s, p) => s + p.contraction + p.churn, 0);

  return (
    <Glass glow radius="xl" className="relative flex h-full flex-col overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_28%,transparent),transparent_70%)]" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div>
          <div className="text-[12.5px] font-medium text-fg-3">MRR · revenu récurrent mensuel HT</div>
          <div className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em] tabular sm:text-[52px]">{loading || !metrics ? <Skeleton className="h-12 w-56" /> : <AnimatedNumber value={mrr} format={(v) => money(v, "EUR", { decimals: 0 })} />}</div>
          <div className="mt-2.5">{metrics && <Delta value={mom === null ? null : Math.round(mom * 10) / 10} suffix=" %" period={previous ? `vs fin ${monthLabel(previous.month)}` : undefined} />}</div>
        </div>
        {metrics && first && (
          <div className="grid w-full grid-cols-3 gap-x-5 gap-y-2 sm:w-auto sm:gap-x-7 sm:pt-1">
            <MiniStat
              label="Croissance"
              value={signed(growth, moneyShort)}
              sub={`${growthPct !== null ? `${growthPct >= 0 ? "+" : "−"}${number(Math.abs(growthPct), 0)} % ` : ""}depuis ${monthLabel(first.month)}`}
              tone={growth > 0 ? "up" : growth < 0 ? "down" : undefined}
            />
            <MiniStat label="Gagné" value={signed(added, moneyShort)} sub="nouveau + expansion" tone={added > 0 ? "up" : undefined} />
            <MiniStat label="Perdu" value={signed(lost, moneyShort)} sub="churn + contraction" tone={lost < 0 ? "down" : undefined} />
          </div>
        )}
      </div>
      <div className="mt-5 min-h-[200px] flex-1">{metrics ? <MrrLine data={series} height={210} /> : <Skeleton className="h-[210px]" />}</div>
    </Glass>
  );
}

/** Six SaaS KPI tiles (ARR, NRR, churn, ARPA/ARPU, active customers, trials). */
export function MetricTiles({ metrics, extras, onFilter }: { metrics?: SubscriptionMetrics; extras: OverviewExtras; onFilter: (status: string) => void }) {
  if (!metrics)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-[22px]" />
        ))}
      </div>
    );
  const arpu = extras.seats > 0 ? metrics.mrr / extras.seats : 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
      <StatTile label="ARR" value={metrics.arr} format={(v) => moneyShort(v)} trend={metrics.series.map((p) => p.mrr * 12)} icon={<TrendingUp className="size-4" />} hint="MRR × 12" />
      <StatTile label="NRR (30 j)" value={metrics.nrr} format={(v) => percent(v, 1)} icon={<Magnet className="size-4" />} accent="linear-gradient(135deg,#1baf7a,#22d3ee)" hint="Rétention nette du revenu" />
      <StatTile
        label="Churn MRR (30 j)"
        value={metrics.churn_rate}
        format={(v) => percent(v, 1)}
        icon={<TrendingDown className="size-4" />}
        accent="linear-gradient(135deg,#ff9f0a,#ff375f)"
        hint={`Churn logos : ${percent(metrics.logo_churn_rate, 1)}`}
        onClick={() => onFilter("canceled")}
      />
      <StatTile label="ARPA" value={metrics.arpa} format={(v) => moneyShort(v)} icon={<Coins className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" hint={arpu > 0 ? `ARPU : ${moneyShort(arpu)} / siège` : "Revenu moyen par compte"} />
      <StatTile
        label="Clients actifs"
        value={metrics.customers}
        format={(v) => number(v)}
        icon={<Building2 className="size-4" />}
        accent="linear-gradient(135deg,#5b6cff,#22d3ee)"
        hint={`${plural(metrics.active_subscriptions, "abonnement")} actif${metrics.active_subscriptions > 1 ? "s" : ""}${extras.pastDue ? ` · ${extras.pastDue} impayé${extras.pastDue > 1 ? "s" : ""}` : ""}`}
        onClick={() => onFilter("active")}
      />
      <StatTile
        label="Essais en cours"
        value={metrics.trialing}
        format={(v) => number(v)}
        icon={<Hourglass className="size-4" />}
        accent="linear-gradient(135deg,#22d3ee,#5b6cff)"
        hint={extras.trialsEndingSoon ? `${extras.trialsEndingSoon} se termine${extras.trialsEndingSoon > 1 ? "nt" : ""} sous 7 j` : metrics.trialing ? `MRR potentiel ${moneyShort(extras.trialsPotential)}` : "Aucun essai actif"}
        onClick={() => onFilter("trialing")}
      />
    </div>
  );
}

/** MRR movements (stacked, 12 months) + MRR split by plan. */
export function MovementsRow({ metrics, onPlan }: { metrics?: SubscriptionMetrics; onPlan: (plan: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Panel title="Mouvements de MRR" description="Nouveau, expansion, contraction et churn — 12 derniers mois" className="xl:col-span-2">
        {metrics ? <MrrMovements data={metrics.series} height={240} /> : <Skeleton className="h-[270px]" />}
      </Panel>
      <Panel title="MRR par offre" description="Répartition du revenu récurrent actif" icon={<Layers className="size-4" />}>
        {!metrics ? (
          <Skeleton className="h-[240px]" />
        ) : metrics.plans.length === 0 ? (
          <EmptyState icon={<Layers className="size-6" />} title="Aucune offre active" description="Les offres apparaîtront ici dès le premier abonnement actif." />
        ) : (
          <BarList
            items={metrics.plans.map((p) => ({
              id: p.plan,
              label: p.plan,
              value: p.mrr,
              sub: `${plural(p.count, "abonnement")} · ${percent(metrics.mrr > 0 ? (p.mrr / metrics.mrr) * 100 : 0, 0)} du MRR`,
            }))}
            format={(v) => moneyShort(v)}
            onClick={(it) => onPlan(String(it.id))}
          />
        )}
      </Panel>
    </div>
  );
}

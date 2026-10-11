import { Activity, ChartColumn, LifeBuoy, RefreshCw, Repeat, Sparkles, Timer, TrendingUp, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { ActivitySection } from "@/components/reports/ActivitySection";
import { CashSection } from "@/components/reports/CashSection";
import { computePeriod, periodRangeLabel, PERIODS, useReports, type PeriodKey } from "@/components/reports/data";
import { RecurringSection } from "@/components/reports/RecurringSection";
import { SalesSection } from "@/components/reports/SalesSection";
import { SupportSection } from "@/components/reports/SupportSection";
import { TimeSection } from "@/components/reports/TimeSection";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Segmented, Tabs } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/hooks";
import { useUI } from "@/stores/ui";

type Section = "sales" | "recurring" | "cash" | "activity" | "support" | "time";

const SECTIONS: { value: Section; label: string; icon: typeof TrendingUp; prompt: string }[] = [
  { value: "sales", label: "Ventes", icon: TrendingUp, prompt: "ventes (chiffre d'affaires, produits, commerciaux, entonnoir, motifs de perte, cycle de vente)" },
  { value: "recurring", label: "Revenus récurrents", icon: Repeat, prompt: "revenus récurrents (MRR, mouvements, churn, NRR, formules)" },
  { value: "cash", label: "Trésorerie", icon: Wallet, prompt: "trésorerie (encaissements, créances, balance âgée, factures en retard)" },
  { value: "activity", label: "Activité", icon: Activity, prompt: "activité commerciale (appels, emails, réunions par membre)" },
  { value: "support", label: "Support", icon: LifeBuoy, prompt: "support (volume de tickets, respect des SLA, délais, satisfaction)" },
  { value: "time", label: "Temps", icon: Timer, prompt: "temps passé (taux facturable, heures par projet et par membre)" },
];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const openAssistant = useUI((s) => s.openAssistant);
  const periodKey = (PERIODS.some((p) => p.value === params.get("period")) ? params.get("period") : "12m") as PeriodKey;
  const section = (SECTIONS.some((s) => s.value === params.get("section")) ? params.get("section") : "sales") as Section;
  const period = useMemo(() => computePeriod(periodKey), [periodKey]);
  const reports = useReports(period.startIso, period.endIso);
  const prev = useReports(period.prevStartIso, period.prevEndIso);
  const current = SECTIONS.find((s) => s.value === section) ?? SECTIONS[0];

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const analyze = () =>
    openAssistant(
      `Analyse mes rapports de ${current.prompt} sur la période « ${period.long.toLowerCase()} » (${periodRangeLabel(period)}). Compare avec la période précédente quand c'est pertinent, signale les signaux faibles et donne 5 recommandations concrètes et priorisées.`,
    );

  return (
    <div>
      <PageHeader
        title="Rapports"
        icon={<ChartColumn className="size-5" />}
        description={
          <span>
            {period.long} · <span className="text-fg-3">{periodRangeLabel(period)}</span>
          </span>
        }
        actions={
          <>
            <Segmented value={periodKey} onChange={(v) => setParam("period", v)} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />
            <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={analyze}>
              Analyser avec Iris
            </Button>
          </>
        }
      />

      <div className="sticky top-[84px] z-20 -mx-1 mb-5 px-1 py-1">
        <Tabs
          value={section}
          onChange={(v) => setParam("section", v)}
          items={SECTIONS.map((s) => ({ value: s.value, label: s.label, icon: <s.icon className="size-4" /> }))}
        />
      </div>

      {reports.isError ? (
        <Glass>
          <EmptyState
            icon={<ChartColumn className="size-6" />}
            title="Impossible de charger les rapports"
            description={errorMessage(reports.error)}
            action={
              <Button icon={<RefreshCw className="size-4" />} onClick={() => reports.refetch()}>
                Réessayer
              </Button>
            }
          />
        </Glass>
      ) : (
        <motion.div key={`${section}-${periodKey}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
          {section === "sales" && <SalesSection period={period} report={reports.data} prev={prev.data} />}
          {section === "recurring" && <RecurringSection period={period} />}
          {section === "cash" && <CashSection period={period} report={reports.data} />}
          {section === "activity" && <ActivitySection period={period} />}
          {section === "support" && <SupportSection period={period} report={reports.data} />}
          {section === "time" && <TimeSection period={period} report={reports.data} prev={prev.data} />}
        </motion.div>
      )}
    </div>
  );
}

import { Activity, CircleDot, Filter, Zap } from "lucide-react";
import { Panel } from "@/components/data/blocks";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { dateTime, relative } from "@/lib/format";
import type { Automation } from "@/lib/types";
import { triggerVisual, type AutomationCatalog, type AutomationRun } from "./catalog";
import { RunStatusIcon } from "./parts";

export function RecentRuns({ runs, automations, catalog, loading, onOpen }: { runs: AutomationRun[]; automations: Automation[]; catalog?: AutomationCatalog; loading: boolean; onOpen: (a: Automation) => void }) {
  return (
    <Panel title="Dernières exécutions" description="Tous scénarios confondus" icon={<Activity className="size-4" />} bodyClassName="px-2 pb-3">
      {loading ? (
        <div className="space-y-2 px-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState icon={<Zap className="size-6" />} title="Aucune exécution pour l'instant" description="Les automatisations actives se déclenchent dès qu'un événement correspondant survient." className="py-8" />
      ) : (
        <div className="space-y-0.5">
          {runs.slice(0, 9).map((r) => {
            const a = automations.find((x) => x.id === r.automation_id);
            const t = triggerVisual(catalog, r.event ?? a?.trigger?.type ?? "");
            return (
              <button key={r.id} type="button" disabled={!a} onClick={() => a && onOpen(a)} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-black/[0.03] disabled:cursor-default dark:hover:bg-white/[0.04]">
                <RunStatusIcon status={r.status} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{a?.name ?? r.automation?.name ?? "Automatisation supprimée"}</span>
                  <span className="block truncate text-[11.5px] text-fg-3" title={dateTime(r.created_at)}>
                    {t.label} · {relative(r.created_at)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const STEPS = [
  { icon: Zap, title: "Un événement survient", text: "Nouveau lead, devis consulté, facture en retard, chaque lundi à 8 h…" },
  { icon: Filter, title: "Vos conditions filtrent", text: "Montant, priorité, statut, cycle de vie : seules les bonnes situations passent." },
  { icon: CircleDot, title: "Les actions s'enchaînent", text: "Tâches, emails, notifications, mises à jour ou mission confiée à Iris." },
];

export function HowItWorks() {
  return (
    <Panel title="Comment ça marche" bodyClassName="pb-4">
      <ol className="space-y-3.5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-accent">
              <s.icon className="size-4" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold">
                {i + 1}. {s.title}
              </span>
              <span className="block text-[12.5px] leading-snug text-fg-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

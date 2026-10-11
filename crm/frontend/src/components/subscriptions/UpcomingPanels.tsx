import { CalendarClock, Hourglass, Sparkles, UserMinus, Zap } from "lucide-react";
import { motion } from "motion/react";
import { Panel } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Badge, CompanyLogo, EmptyState, Skeleton } from "@/components/ui/display";
import { Tooltip } from "@/components/ui/overlay";
import { date, daysFromNow, moneyShort, plural } from "@/lib/format";
import type { Subscription } from "@/lib/types";
import { INTERVAL_UNIT, monthlyValue, periodAmount } from "./model";
import type { SubscriptionActions } from "./useSubscriptionActions";

function DateBlock({ value }: { value?: string | null }) {
  return (
    <div className="glass-inset flex w-11 shrink-0 flex-col items-center rounded-[11px] py-1 leading-none">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-fg-3">{date(value, "MMM").replace(".", "")}</span>
      <span className="mt-0.5 text-[16px] font-semibold tabular">{date(value, "d")}</span>
    </div>
  );
}

function countdown(days: number | null) {
  if (days === null) return { label: "Sans date", tone: "gray" as const };
  if (days < 0) return { label: `Terminé depuis ${plural(-days, "jour")}`, tone: "red" as const };
  if (days === 0) return { label: "Aujourd'hui", tone: "orange" as const };
  if (days === 1) return { label: "Demain", tone: "orange" as const };
  return { label: `Dans ${days} j`, tone: days <= 3 ? ("orange" as const) : days <= 7 ? ("yellow" as const) : ("blue" as const) };
}

/** Billable subscriptions whose period ends within 30 days. */
export function RenewalsPanel({ rows, loading, onOpen }: { rows: Subscription[]; loading: boolean; onOpen: (sub: Subscription) => void }) {
  const total = rows.reduce((s, r) => s + periodAmount(r), 0);
  return (
    <Panel
      title="Renouvellements à venir (30 j)"
      icon={<CalendarClock className="size-4" />}
      description={rows.length ? `${plural(rows.length, "échéance")} · ${moneyShort(total)} HT à facturer` : "Prochaines échéances de facturation"}
      bodyClassName="px-2 pb-3"
    >
      {loading ? (
        <div className="space-y-2 px-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-6" />} title="Aucune échéance d'ici 30 jours" description="Les abonnements à renouveler apparaîtront ici." />
      ) : (
        <div className="max-h-[332px] space-y-0.5 overflow-y-auto pr-1">
          {rows.map((s, i) => {
            const days = daysFromNow(s.current_period_end);
            return (
              <motion.button
                type="button"
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.3) }}
                onClick={() => onOpen(s)}
                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                <DateBlock value={s.current_period_end} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium">{s.company?.name ?? "Client"}</span>
                    {s.status === "past_due" && (
                      <Badge tone="orange" size="xs">
                        Impayé
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-[11.5px] text-fg-3">
                    {s.plan} · {days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${plural(days ?? 0, "jour")}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-semibold tabular">{moneyShort(periodAmount(s))}</div>
                  <div className="flex items-center justify-end gap-1 text-[11px] text-fg-3">
                    {s.auto_invoice && (
                      <Tooltip content="Facture brouillon créée automatiquement à l'échéance">
                        <Zap className="size-3 text-violet-500" aria-label="Facturation automatique" />
                      </Tooltip>
                    )}
                    HT / {INTERVAL_UNIT[s.interval] ?? s.interval}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/** Running trials sorted by end date, with one-click conversion. */
export function TrialsPanel({ rows, loading, onOpen, actions }: { rows: Subscription[]; loading: boolean; onOpen: (sub: Subscription) => void; actions: SubscriptionActions }) {
  const potential = rows.reduce((s, r) => s + monthlyValue(r), 0);
  return (
    <Panel title="Essais qui se terminent" icon={<Hourglass className="size-4" />} description={rows.length ? `${plural(rows.length, "essai")} en cours · MRR potentiel ${moneyShort(potential)}` : "Périodes d'essai en cours"} bodyClassName="px-2 pb-3">
      {loading ? (
        <div className="space-y-2 px-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Hourglass className="size-6" />} title="Aucun essai en cours" description="Créez un abonnement au statut « Essai » avec une date de fin pour suivre sa conversion." />
      ) : (
        <div className="max-h-[332px] space-y-0.5 overflow-y-auto pr-1">
          {rows.map((s, i) => {
            const c = countdown(daysFromNow(s.trial_end));
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.3) }}
                className="group flex items-center gap-3 rounded-[12px] px-3 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                <button type="button" onClick={() => onOpen(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <CompanyLogo name={s.company?.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{s.company?.name ?? "Client"}</div>
                    <div className="truncate text-[11.5px] text-fg-3">
                      {s.plan} · {moneyShort(monthlyValue(s))}/mois potentiels
                    </div>
                  </div>
                </button>
                <Tooltip content={s.trial_end ? `Fin d'essai le ${date(s.trial_end, "EEEE d MMMM")}` : "Aucune date de fin d'essai"}>
                  <span>
                    <Badge tone={c.tone} dot size="xs">
                      {c.label}
                    </Badge>
                  </span>
                </Tooltip>
                <Button size="xs" variant="subtle" icon={<Sparkles className="size-3" />} loading={actions.isBusy("convert", s)} onClick={() => actions.convertTrial(s)} className="shrink-0">
                  Convertir
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/** Latest cancellations with their reason (churn analysis at a glance). */
export function ChurnPanel({ rows, loading, onOpen, className }: { rows: Subscription[]; loading: boolean; onOpen: (sub: Subscription) => void; className?: string }) {
  const lost = rows.reduce((s, r) => s + monthlyValue(r), 0);
  return (
    <Panel title="Dernières résiliations" icon={<UserMinus className="size-4" />} description={rows.length ? `${moneyShort(lost)} de MRR perdu · motifs de départ` : "Motifs de départ des clients"} bodyClassName="px-2 pb-3" className={className}>
      {loading ? (
        <Skeleton className="mx-3 h-11" />
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-[12.5px] text-fg-3">Aucune résiliation enregistrée. 🎉</p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((s) => (
            <button type="button" key={s.id} onClick={() => onOpen(s)} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <CompanyLogo name={s.company?.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{s.company?.name ?? "Client"}</div>
                <div className="truncate text-[11.5px] text-fg-3">
                  {s.cancel_reason ? `« ${s.cancel_reason} »` : "Motif non renseigné"} · {date(s.canceled_at, "d MMM yyyy")}
                </div>
              </div>
              <span className="shrink-0 text-[12.5px] font-semibold tabular text-fg-2">−{moneyShort(monthlyValue(s))}/mois</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

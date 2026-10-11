import { Ban, CirclePause, CirclePlay, FileText, History, Pencil, Receipt, RotateCcw, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { KeyValue } from "@/components/data/blocks";
import { RelatedRow } from "@/components/entity/EntityBlocks";
import { Button } from "@/components/ui/button";
import { Badge, CompanyLogo, Progress, Skeleton, StatusBadge } from "@/components/ui/display";
import { Switch } from "@/components/ui/fields";
import { Sheet } from "@/components/ui/overlay";
import { INVOICE_STATUS, INTERVALS, labelOf, SUBSCRIPTION_STATUS } from "@/lib/constants";
import { date, daysFromNow, money, moneyShort, number, percent, plural } from "@/lib/format";
import { useItem, useList } from "@/lib/hooks";
import type { Invoice, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { currentPeriod, INTERVAL_UNIT, isBillable, monthlyValue, MOVEMENT_KINDS, periodAmount, signed, type MrrChange } from "./model";
import type { SubscriptionActions } from "./useSubscriptionActions";

export interface SheetHandlers {
  onEdit: (sub: Subscription) => void;
  onChangePlan: (sub: Subscription) => void;
  onCancel: (sub: Subscription) => void;
}

function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="glass-inset rounded-[16px] px-3.5 py-3">
      <div className="text-[11.5px] font-medium text-fg-3">{label}</div>
      <div className="mt-0.5 truncate text-[18px] font-semibold tracking-[-0.02em] tabular">{value}</div>
      {sub && <div className="truncate text-[11.5px] text-fg-3">{sub}</div>}
    </div>
  );
}

function PeriodBar({ sub }: { sub: Subscription }) {
  if (sub.status === "trialing" && sub.trial_end) {
    const left = daysFromNow(sub.trial_end) ?? 0;
    const start = new Date(sub.start_date).getTime();
    const end = new Date(sub.trial_end).getTime();
    const progress = end > start ? ((Date.now() - start) / (end - start)) * 100 : 100;
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="font-medium">Période d'essai</span>
          <span className={cn("tabular", left <= 3 ? "font-semibold text-orange-600 dark:text-orange-400" : "text-fg-3")}>{left < 0 ? "Terminée" : left === 0 ? "Se termine aujourd'hui" : `${plural(left, "jour")} restant${left > 1 ? "s" : ""}`}</span>
        </div>
        <Progress value={progress} tone="linear-gradient(90deg,#22d3ee,var(--accent))" />
        <div className="mt-1 flex justify-between text-[11.5px] text-fg-3 tabular">
          <span>{date(sub.start_date, "d MMM")}</span>
          <span>{date(sub.trial_end, "d MMM yyyy")}</span>
        </div>
      </div>
    );
  }
  if (!isBillable(sub.status)) return null;
  const period = currentPeriod(sub);
  if (!period) return null;
  const left = daysFromNow(sub.current_period_end) ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="font-medium">Période en cours</span>
        <span className={cn("tabular", left < 0 ? "font-semibold text-red-500" : "text-fg-3")}>{left < 0 ? `Échéance dépassée de ${plural(-left, "jour")}` : left === 0 ? "Échéance aujourd'hui" : `Échéance dans ${plural(left, "jour")}`}</span>
      </div>
      <Progress value={period.progress} />
      <div className="mt-1 flex justify-between text-[11.5px] text-fg-3 tabular">
        <span>{date(period.start, "d MMM")}</span>
        <span>{date(period.end, "d MMM yyyy")}</span>
      </div>
    </div>
  );
}

function Movements({ subscriptionId }: { subscriptionId: number }) {
  const { data, isLoading } = useList<MrrChange>("subscription-changes", { subscription_id: subscriptionId, sort: "-date,-id", limit: 50 });
  if (isLoading) return <Skeleton className="h-24" />;
  const rows = data?.items ?? [];
  if (!rows.length) return <p className="rounded-[14px] bg-black/[0.03] px-3.5 py-3 text-[12.5px] text-fg-3 dark:bg-white/[0.04]">Aucun mouvement enregistré. Les changements de prix, de quantité ou de statut sont tracés automatiquement.</p>;
  return (
    <ol className="relative space-y-0.5 pl-1">
      <span aria-hidden className="absolute bottom-3 left-[17px] top-3 w-px bg-[var(--hairline-strong)]" />
      {rows.map((m, i) => {
        const kind = MOVEMENT_KINDS.find((k) => k.value === m.kind);
        const up = m.mrr_delta >= 0;
        return (
          <motion.li key={m.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="relative flex items-center gap-3 rounded-[12px] py-2 pl-0 pr-1">
            <span className={cn("relative z-10 ml-[8px] size-[11px] shrink-0 rounded-full ring-4 ring-[var(--glass-solid)]", up ? "bg-emerald-500" : "bg-red-500")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge tone={kind?.tone} size="xs">
                  {kind?.label ?? m.kind}
                </Badge>
                <span className="text-[12px] text-fg-3">{date(m.date, "d MMM yyyy")}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-fg-3">MRR après : {money(m.mrr_after)}</div>
            </div>
            <span className={cn("shrink-0 text-[13.5px] font-semibold tabular", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>{signed(m.mrr_delta, moneyShort)}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}

function RelatedInvoices({ subscriptionId }: { subscriptionId: number }) {
  const { data, isLoading } = useList<Invoice>("invoices", { subscription_id: subscriptionId, sort: "-issue_date,-id", limit: 6 });
  if (isLoading) return <Skeleton className="h-16" />;
  if (!data?.items.length) return <p className="px-1 text-[12.5px] text-fg-3">Aucune facture générée pour cet abonnement.</p>;
  return (
    <div className="-mx-2.5 space-y-0.5">
      {data.items.map((inv) => (
        <RelatedRow
          key={inv.id}
          to={`/invoices/${inv.id}`}
          icon={<FileText className="size-4 shrink-0 text-fg-3" />}
          title={inv.number || "Brouillon"}
          meta={`${date(inv.issue_date)}${inv.title ? ` · ${inv.title}` : ""}`}
          right={
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tabular">{money(inv.total, inv.currency)}</span>
              <StatusBadge options={INVOICE_STATUS} value={inv.status} size="xs" />
            </div>
          }
        />
      ))}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-fg-3">
      {icon}
      {children}
    </h4>
  );
}

/** Side panel of one subscription: key figures, billing period, actions, MRR history and invoices. */
export function SubscriptionSheet({ id, initial, open, onOpenChange, actions, handlers }: { id: number | null; initial?: Subscription; open: boolean; onOpenChange: (o: boolean) => void; actions: SubscriptionActions; handlers: SheetHandlers }) {
  const { data: sub, isLoading } = useItem<Subscription>("subscriptions", id, { placeholderData: initial });
  const openAssistant = useUI((s) => s.openAssistant);
  const billable = sub ? isBillable(sub.status) : false;
  const unit = sub ? (INTERVAL_UNIT[sub.interval] ?? sub.interval) : "";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width={580}
      title={sub ? `Abonnement · ${sub.plan}` : "Abonnement"}
      footer={
        sub && (
          <>
            <Button variant="glass" icon={<Pencil className="size-4" />} onClick={() => handlers.onEdit(sub)}>
              Modifier
            </Button>
            <Button variant="primary" icon={<Receipt className="size-4" />} loading={actions.isBusy("invoice", sub)} disabled={sub.status === "canceled"} onClick={() => actions.generateInvoice(sub)}>
              Générer la facture
            </Button>
          </>
        )
      }
    >
      {!sub || (isLoading && !initial) ? (
        <div className="space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-3.5">
            <CompanyLogo name={sub.company?.name} size={50} />
            <div className="min-w-0 flex-1">
              {sub.company ? (
                <Link to={`/companies/${sub.company.id}`} className="block truncate text-[17px] font-semibold tracking-[-0.01em] hover:text-accent">
                  {sub.company.name}
                </Link>
              ) : (
                <div className="text-[17px] font-semibold">Client inconnu</div>
              )}
              <div className="truncate text-[13px] text-fg-2">
                {sub.plan} · {labelOf(INTERVALS, sub.interval)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge options={SUBSCRIPTION_STATUS} value={sub.status} />
                {sub.auto_invoice && sub.status !== "canceled" && (
                  <Badge tone="violet">
                    <Zap className="size-3" /> Facturation auto
                  </Badge>
                )}
                {sub.discount > 0 && <Badge tone="pink">Remise {percent(sub.discount, sub.discount % 1 ? 1 : 0)}</Badge>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Figure label={billable ? "MRR" : "MRR potentiel"} value={moneyShort(billable ? sub.mrr : monthlyValue(sub))} sub={billable ? "revenu mensuel" : sub.status === "trialing" ? "à la conversion" : "hors MRR"} />
            <Figure label={`Montant / ${unit}`} value={moneyShort(periodAmount(sub))} sub={`${sub.quantity} × ${money(sub.amount)} HT`} />
            <Figure label="ARR" value={moneyShort((billable ? sub.mrr : monthlyValue(sub)) * 12)} sub={`TVA ${number(sub.vat_rate, sub.vat_rate % 1 ? 1 : 0)} % en sus`} />
          </div>

          <PeriodBar sub={sub} />

          <div className="flex flex-wrap gap-1.5">
            {sub.status !== "canceled" && (
              <Button size="sm" variant="glass" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => handlers.onChangePlan(sub)}>
                Quantité / prix
              </Button>
            )}
            {sub.status === "trialing" && (
              <Button size="sm" variant="subtle" icon={<Sparkles className="size-3.5" />} loading={actions.isBusy("convert", sub)} onClick={() => actions.convertTrial(sub)}>
                Convertir l'essai
              </Button>
            )}
            {billable && (
              <Button size="sm" variant="glass" icon={<CirclePause className="size-3.5" />} loading={actions.isBusy("pause", sub)} onClick={() => actions.pause(sub)}>
                Mettre en pause
              </Button>
            )}
            {sub.status === "paused" && (
              <Button size="sm" variant="subtle" icon={<CirclePlay className="size-3.5" />} loading={actions.isBusy("resume", sub)} onClick={() => actions.resume(sub)}>
                Reprendre
              </Button>
            )}
            {sub.status === "canceled" ? (
              <Button size="sm" variant="subtle" icon={<RotateCcw className="size-3.5" />} loading={actions.isBusy("reactivate", sub)} onClick={() => actions.reactivate(sub)}>
                Réactiver
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-500" icon={<Ban className="size-3.5" />} onClick={() => handlers.onCancel(sub)}>
                Résilier
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Sparkles className="size-3.5 text-[#b26bff]" />}
              onClick={() =>
                openAssistant(
                  `Analyse l'abonnement « ${sub.plan} » de ${sub.company?.name ?? "ce client"} (statut ${labelOf(SUBSCRIPTION_STATUS, sub.status)}, ${sub.quantity} × ${money(sub.amount)} / ${unit}, MRR ${money(sub.mrr)}). Évalue le risque de churn, les opportunités d'expansion et propose la prochaine action commerciale.`,
                )
              }
            >
              Conseil d'Iris
            </Button>
          </div>

          {sub.status === "canceled" && (
            <div className="rounded-[16px] bg-red-500/[0.07] px-3.5 py-3 text-[13px] ring-1 ring-inset ring-red-500/20">
              <div className="font-semibold text-red-600 dark:text-red-400">Résilié{sub.canceled_at ? ` le ${date(sub.canceled_at)}` : ""}</div>
              <div className="mt-0.5 text-fg-2">Motif : {sub.cancel_reason || "non renseigné"}</div>
            </div>
          )}

          <div className="divide-y divide-[var(--hairline)]">
            <KeyValue label="Offre">{sub.plan}</KeyValue>
            {sub.product && sub.product.name !== sub.plan && <KeyValue label="Produit du catalogue">{sub.product.name}</KeyValue>}
            <KeyValue label="Prix unitaire">
              <span className="tabular">
                {money(sub.amount)} HT / {unit}
              </span>
            </KeyValue>
            <KeyValue label="Quantité">
              <span className="tabular">{plural(sub.quantity, "siège")}</span>
            </KeyValue>
            <KeyValue label="Début">{date(sub.start_date)}</KeyValue>
            {sub.trial_end && <KeyValue label="Fin d'essai">{date(sub.trial_end)}</KeyValue>}
            {sub.status !== "canceled" && <KeyValue label="Prochaine échéance">{date(sub.current_period_end)}</KeyValue>}
            <KeyValue label="Responsable">{sub.owner?.name ?? "—"}</KeyValue>
            {sub.notes && <KeyValue label="Notes">{sub.notes}</KeyValue>}
          </div>

          <div className="glass-inset rounded-[16px] px-4 py-3">
            <Switch
              size="sm"
              checked={sub.auto_invoice}
              disabled={sub.status === "canceled" || actions.isBusy("auto", sub)}
              onChange={(v) => actions.toggleAutoInvoice(sub, v)}
              label={<span className="text-[13.5px]">Facturation automatique</span>}
              description="Une facture brouillon est créée chaque jour d'échéance, à vérifier puis émettre."
            />
          </div>

          <section>
            <SectionTitle icon={<History className="size-3.5" />}>Historique des mouvements</SectionTitle>
            <Movements subscriptionId={sub.id} />
          </section>

          <section>
            <SectionTitle icon={<Receipt className="size-3.5" />}>Factures de l'abonnement</SectionTitle>
            <RelatedInvoices subscriptionId={sub.id} />
          </section>
        </div>
      )}
    </Sheet>
  );
}

import { ArrowRight, Ban, Minus, Plus, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FilterChip } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/ui/display";
import { Field, Input, NumberInput, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { date, isoDate, money, moneyShort } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CANCEL_REASONS, INTERVAL_UNIT, isBillable, monthlyValue, mrrOf, periodAmount, signed } from "./model";

/** Like `Field`, but a plain group: a <label> would forward clicks to the first button inside. */
function GroupField({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">
        {label}
        {required && <span className="ml-0.5 text-[var(--accent)]">*</span>}
      </div>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-red-500">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-fg-3">{hint}</span> : null}
    </div>
  );
}

function SubscriptionChip({ sub }: { sub: Subscription }) {
  return (
    <div className="glass-inset flex items-center gap-3 rounded-[16px] px-3.5 py-3">
      <CompanyLogo name={sub.company?.name} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{sub.company?.name ?? "Client"}</div>
        <div className="truncate text-[12.5px] text-fg-3">
          {sub.plan} · {sub.quantity} × {money(sub.amount)} / {INTERVAL_UNIT[sub.interval] ?? sub.interval}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-3">MRR</div>
        <div className="text-[14px] font-semibold tabular">{money(sub.mrr)}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Quantity / price change (expansion & contraction)                          */
/* -------------------------------------------------------------------------- */

export function ChangePlanDialog({ sub, open, onOpenChange }: { sub: Subscription | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidate();
  const [quantity, setQuantity] = useState<number | null>(1);
  const [amount, setAmount] = useState<number | null>(0);
  const [discount, setDiscount] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const key = `${open}-${sub?.id}-${sub?.updated_at}`;
  if (open && sub && key !== lastKey) {
    setLastKey(key);
    setQuantity(sub.quantity);
    setAmount(sub.amount);
    setDiscount(sub.discount);
  }
  if (!sub) return null;

  const draft = { ...sub, quantity: Math.max(1, Math.round(quantity ?? 1)), amount: amount ?? 0, discount: discount ?? 0 };
  const billable = isBillable(sub.status);
  const before = billable ? sub.mrr : monthlyValue(sub);
  const after = billable ? mrrOf(draft) : monthlyValue(draft);
  const delta = Math.round((after - before) * 100) / 100;
  const unchanged = draft.quantity === sub.quantity && draft.amount === sub.amount && draft.discount === sub.discount;
  const invalid = amount === null || amount < 0 || (discount ?? 0) < 0 || (discount ?? 0) > 100;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/subscriptions/${sub.id}`, { quantity: draft.quantity, amount: draft.amount, discount: draft.discount });
      invalidate("subscriptions", "subscription-metrics", "subscription-changes");
      onOpenChange(false);
      if (billable && delta !== 0) toast.success(delta > 0 ? "Expansion enregistrée" : "Contraction enregistrée", { description: `${signed(delta, moneyShort)} de MRR · ${sub.company?.name ?? sub.plan}` });
      else toast.success("Abonnement mis à jour");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<SlidersHorizontal className="size-5" />}
      title="Changer la quantité ou le prix"
      description="Les variations de MRR sont tracées automatiquement (expansion ou contraction) dans l'historique des mouvements."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={saving} disabled={unchanged || invalid} onClick={save}>
            {billable && delta > 0 ? "Enregistrer l'expansion" : billable && delta < 0 ? "Enregistrer la contraction" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SubscriptionChip sub={sub} />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <GroupField label="Quantité / sièges">
            <div className="flex items-center gap-1.5">
              <Button type="button" size="md" variant="glass" className="w-10 shrink-0 px-0" aria-label="Retirer un siège" disabled={draft.quantity <= 1} onClick={() => setQuantity(Math.max(1, draft.quantity - 1))}>
                <Minus className="size-4" />
              </Button>
              <NumberInput value={quantity} onChange={setQuantity} step={1} min={1} className="min-w-0 flex-1 text-center" />
              <Button type="button" size="md" variant="glass" className="w-10 shrink-0 px-0" aria-label="Ajouter un siège" onClick={() => setQuantity(draft.quantity + 1)}>
                <Plus className="size-4" />
              </Button>
            </div>
          </GroupField>
          <Field label={`Prix unitaire HT / ${INTERVAL_UNIT[sub.interval] ?? "période"}`}>
            <NumberInput value={amount} onChange={setAmount} suffix="€" min={0} />
          </Field>
          <Field label="Remise">
            <NumberInput value={discount} onChange={setDiscount} suffix="%" min={0} />
          </Field>
        </div>

        <div
          className={cn(
            "relative overflow-hidden rounded-[18px] p-4 ring-1 ring-inset transition-colors",
            tone === "up" ? "bg-emerald-500/[0.07] ring-emerald-500/25" : tone === "down" ? "bg-orange-500/[0.07] ring-orange-500/25" : "bg-black/[0.03] ring-[var(--hairline)] dark:bg-white/[0.04]",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[11.5px] font-medium text-fg-3">{billable ? "MRR actuel" : "Valeur mensuelle"}</div>
                <div className="text-[18px] font-semibold tabular">{money(before)}</div>
              </div>
              <ArrowRight className="size-4 text-fg-3" />
              <div>
                <div className="text-[11.5px] font-medium text-fg-3">Après changement</div>
                <div className="text-[18px] font-semibold tabular">{money(after)}</div>
              </div>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={tone}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold tabular",
                  tone === "up" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : tone === "down" ? "bg-orange-500/15 text-orange-700 dark:text-orange-300" : "bg-black/5 text-fg-2 dark:bg-white/10",
                )}
              >
                {tone === "up" ? <TrendingUp className="size-4" /> : tone === "down" ? <TrendingDown className="size-4" /> : null}
                {tone === "flat" ? "Aucune variation" : `${tone === "up" ? "Expansion" : "Contraction"} ${signed(delta, moneyShort)}/mois`}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-fg-2">
            <span>
              Montant par {INTERVAL_UNIT[sub.interval] ?? "période"} : <b className="font-semibold text-fg tabular">{money(periodAmount(draft))} HT</b>
            </span>
            {tone !== "flat" && (
              <span>
                Impact ARR : <b className="font-semibold text-fg tabular">{signed(delta * 12, moneyShort)}</b>
              </span>
            )}
          </div>
          {!billable && <p className="mt-2 text-[12px] text-fg-3">L'abonnement n'est pas facturé actuellement ({sub.status === "trialing" ? "essai" : sub.status === "paused" ? "en pause" : "résilié"}) : aucun mouvement de MRR ne sera enregistré.</p>}
        </div>
        {billable && <p className="text-[12px] text-fg-3">Le mouvement est daté du jour. Le nouveau tarif s'appliquera à la prochaine facture de l'abonnement.</p>}
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Cancellation (mandatory reason + effective date)                           */
/* -------------------------------------------------------------------------- */

type When = "today" | "period_end" | "custom";

export function CancelDialog({ sub, open, onOpenChange }: { sub: Subscription | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidate();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [custom, setCustom] = useState(isoDate());
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const key = `${open}-${sub?.id}`;
  if (open && sub && key !== lastKey) {
    setLastKey(key);
    setReason(null);
    setDetails("");
    setWhen("today");
    setCustom(isoDate());
    setTouched(false);
  }
  if (!sub) return null;

  const periodEnd = sub.current_period_end ?? null;
  const effective = when === "today" ? isoDate() : when === "period_end" && periodEnd ? periodEnd : custom;
  const motive = [reason, details.trim()].filter(Boolean).join(" — ");
  const missingReason = !motive;
  const lost = sub.mrr || monthlyValue(sub);

  const submit = async () => {
    setTouched(true);
    if (missingReason || !effective) return;
    setSaving(true);
    try {
      await api.patch(`/subscriptions/${sub.id}`, { status: "canceled", canceled_at: effective, cancel_reason: motive });
      invalidate("subscriptions", "subscription-metrics", "subscription-changes");
      onOpenChange(false);
      toast.success("Abonnement résilié", { description: `${sub.company?.name ?? sub.plan} · effet au ${date(effective)}` });
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Ban className="size-5" />}
      title="Résilier l'abonnement"
      description="Le motif alimente l'analyse du churn. La résiliation est tracée dans l'historique des mouvements de MRR."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Conserver l'abonnement
          </Button>
          <Button variant="danger" loading={saving} onClick={submit}>
            Résilier
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SubscriptionChip sub={sub} />
        <GroupField label="Motif de résiliation" required error={touched && missingReason ? "Indiquez le motif de la résiliation." : null}>
          <div className="flex flex-wrap gap-1.5">
            {CANCEL_REASONS.map((r) => (
              <FilterChip key={r} active={reason === r} onClick={() => setReason(reason === r ? null : r)}>
                {r}
              </FilterChip>
            ))}
          </div>
        </GroupField>
        <Field label="Précisions" hint="Facultatif si un motif est sélectionné.">
          <Textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ex. : budget gelé jusqu'au prochain exercice, migre vers une solution interne…" />
        </Field>
        <GroupField label="Date d'effet" required>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented
              value={when}
              onChange={setWhen}
              options={[{ value: "today", label: "Aujourd'hui" }, ...(periodEnd && periodEnd >= isoDate() ? [{ value: "period_end" as const, label: `À l'échéance (${date(periodEnd, "d MMM")})` }] : []), { value: "custom", label: "Autre date" }]}
            />
            {when === "custom" && <Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} className="sm:w-[170px]" aria-label="Date d'effet" />}
          </div>
        </GroupField>
        <div className="rounded-[16px] bg-red-500/[0.07] p-3.5 text-[12.5px] text-fg-2 ring-1 ring-inset ring-red-500/20">
          <b className="font-semibold text-red-600 dark:text-red-400">Impact : {signed(-lost, moneyShort)} de MRR</b> ({signed(-lost * 12, moneyShort)} d'ARR). L'abonnement passe immédiatement au statut « Résilié » ; le churn est daté du {date(effective)}.
        </div>
      </div>
    </Dialog>
  );
}

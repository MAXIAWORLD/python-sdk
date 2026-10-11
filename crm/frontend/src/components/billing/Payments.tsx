import { useQuery } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Coins, CreditCard, Landmark, Plus, ReceiptEuro, Trash2, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { CHAINS, labelOf, PAYMENT_METHODS } from "@/lib/constants";
import { date, money } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Invoice, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DateField, NumField } from "./fields";
import { copyText, round2, shortHash, todayIso } from "./lib";

const METHOD_ICON: Record<string, ReactNode> = {
  transfer: <Landmark />,
  direct_debit: <Landmark />,
  card: <CreditCard />,
  stripe: <CreditCard />,
  paypal: <Wallet />,
  crypto: <Coins />,
  cash: <Banknote />,
  check: <ReceiptEuro />,
};

const REFERENCE_HINT: Record<string, string> = {
  transfer: "Libellé ou référence du virement",
  direct_debit: "Référence du prélèvement (RUM)",
  card: "N° d'autorisation",
  check: "N° du chèque",
  stripe: "Identifiant du paiement Stripe",
  paypal: "Identifiant de transaction PayPal",
  cash: "Reçu n°",
};

export function usePayments(invoiceId: number) {
  return useQuery({ queryKey: ["invoices", "payments", invoiceId], queryFn: () => api.get<{ items: Payment[] }>(`/invoices/${invoiceId}/payments`) });
}

/** Record a payment received on an issued invoice. */
export function PaymentDialog({ open, onOpenChange, invoice, onRecorded }: { open: boolean; onOpenChange: (open: boolean) => void; invoice: Invoice; onRecorded: (invoice: Invoice) => void }) {
  const [amount, setAmount] = useState<number | null>(invoice.balance_due);
  const [day, setDay] = useState<string | null>(todayIso());
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [chain, setChain] = useState(CHAINS[0]);
  const [txHash, setTxHash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setAmount(invoice.balance_due);
      setDay(todayIso());
      setMethod("transfer");
      setReference("");
      setTxHash("");
      setNotes("");
    }
  }
  const remaining = round2(invoice.balance_due - (amount ?? 0));
  const crypto = method === "crypto";

  const submit = async () => {
    if (!amount || amount <= 0) return toast.error("Indiquez un montant positif.");
    setBusy(true);
    try {
      const res = await api.post<{ payment: Payment; invoice: Invoice }>(`/invoices/${invoice.id}/payments`, {
        amount,
        date: day ?? todayIso(),
        method,
        reference: reference.trim() || null,
        chain: crypto ? chain : null,
        tx_hash: crypto ? txHash.trim() || null : null,
        notes: notes.trim() || null,
      });
      onRecorded(res.invoice);
      onOpenChange(false);
      if (res.invoice.status === "paid") toast.success(`Facture ${res.invoice.number} soldée 🎉`, { description: `Paiement de ${money(res.payment.amount)} enregistré.` });
      else toast.success(`Paiement de ${money(res.payment.amount)} enregistré`, { description: `Reste dû : ${money(res.invoice.balance_due)}` });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Banknote className="size-5" />}
      title="Enregistrer un paiement"
      description={`${invoice.number} · reste dû ${money(invoice.balance_due, invoice.currency)}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Enregistrer le paiement
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Montant reçu" required>
            <NumField size="field" value={amount} onChange={setAmount} suffix="€" money autoFocus aria-label="Montant reçu" />
          </Field>
          <Field label="Date de réception" required>
            <DateField value={day} onChange={setDay} className="h-10 text-[14px]" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[invoice.balance_due, round2(invoice.balance_due / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
            <button key={v} type="button" onClick={() => setAmount(v)} className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium transition", amount === v ? "bg-accent-soft text-accent" : "bg-black/[0.04] text-fg-2 hover:text-fg dark:bg-white/[0.06]")}>
              {v === invoice.balance_due ? "Solde" : "50 %"} · {money(v)}
            </button>
          ))}
        </div>
        <Field label="Moyen de paiement">
          <Select options={PAYMENT_METHODS} value={method} onChange={setMethod} />
        </Field>
        <AnimatePresence initial={false}>
          {crypto && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-1 gap-3 pb-0.5 sm:grid-cols-[180px_1fr]">
                <Field label="Réseau">
                  <Select options={CHAINS} value={chain} onChange={setChain} />
                </Field>
                <Field label="Hash de la transaction" hint="Conservé comme justificatif ; le montant est saisi en euros (contre-valeur au jour du paiement).">
                  <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x…" className="font-mono text-[13px]" />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="Référence">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={REFERENCE_HINT[method] ?? "Référence"} />
        </Field>
        <Field label="Note interne">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Facultatif" />
        </Field>
        <div
          className={cn(
            "flex items-center justify-between rounded-[14px] px-3.5 py-2.5 text-[13px]",
            remaining < -0.005 ? "bg-orange-500/10 text-orange-700 dark:text-orange-300" : remaining <= 0.005 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-black/[0.03] text-fg-2 dark:bg-white/[0.04]",
          )}
        >
          <span>{remaining < -0.005 ? "Trop-perçu : le montant dépasse le reste dû" : remaining <= 0.005 ? "La facture sera soldée" : "Reste dû après ce paiement"}</span>
          <b className="tabular">{money(Math.abs(remaining), invoice.currency)}</b>
        </div>
      </div>
    </Dialog>
  );
}

/** Payment progress + received payments of an issued invoice. */
export function PaymentsPanel({ invoice, canWrite, canDelete, onAdd, onChanged }: { invoice: Invoice; canWrite: boolean; canDelete: boolean; onAdd: () => void; onChanged: (invoice: Invoice) => void }) {
  const { data, isLoading } = usePayments(invoice.id);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const total = Math.abs(invoice.total) || 1;
  const paidPct = Math.min(100, (invoice.amount_paid / total) * 100);
  const creditPct = Math.min(100 - paidPct, (invoice.credited_amount / total) * 100);
  const outstanding = invoice.balance_due > 0.005 && invoice.status !== "cancelled";

  const remove = async (p: Payment) => {
    const ok = await confirm({ title: `Supprimer le paiement de ${money(p.amount)} ?`, description: "Le reste dû et le statut de la facture seront recalculés. L'opération est tracée dans le journal d'audit.", danger: true, confirmLabel: "Supprimer" });
    if (!ok) return;
    try {
      const updated = await api.delete<Invoice>(`/invoices/${invoice.id}/payments/${p.id}`);
      onChanged(updated);
      invalidate("invoices", "payments");
      toast.success("Paiement supprimé");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Panel
      title="Paiement"
      icon={<Banknote className="size-4" />}
      actions={
        canWrite && outstanding ? (
          <Button size="xs" variant="subtle" icon={<Plus className="size-3.5" />} onClick={onAdd}>
            Paiement
          </Button>
        ) : null
      }
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[12px] text-fg-3">{invoice.status === "paid" ? "Soldée" : invoice.status === "cancelled" ? "Annulée par avoir" : "Reste dû"}</div>
          <div className={cn("text-[24px] font-semibold leading-tight tracking-[-0.02em] tabular", invoice.status === "paid" && "text-emerald-600 dark:text-emerald-400")}>
            {invoice.status === "paid" ? <CheckCircle2 className="mb-1 mr-1 inline size-5" /> : null}
            {money(invoice.status === "paid" ? invoice.total : Math.max(0, invoice.balance_due), invoice.currency)}
          </div>
        </div>
        <div className="text-right text-[12px] text-fg-3">
          sur {money(invoice.total, invoice.currency)}
          {invoice.paid_at && <div>le {date(invoice.paid_at)}</div>}
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/[0.08]" role="progressbar" aria-valuenow={Math.round(paidPct + creditPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du règlement">
        <motion.div initial={{ width: 0 }} animate={{ width: `${paidPct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} className="h-full bg-[linear-gradient(90deg,#1baf7a,#34d399)]" />
        <motion.div initial={{ width: 0 }} animate={{ width: `${creditPct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }} className="h-full bg-[linear-gradient(90deg,#f59e0b,#fb923c)]" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Payé {money(invoice.amount_paid, invoice.currency)}
        </span>
        {invoice.credited_amount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" /> Avoirs {money(invoice.credited_amount, invoice.currency)}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1">
        {isLoading && <Skeleton className="h-12 rounded-[14px]" />}
        {!isLoading && !data?.items.length && <p className="rounded-[14px] bg-black/[0.025] px-3 py-3 text-center text-[12.5px] text-fg-3 dark:bg-white/[0.035]">Aucun paiement enregistré.</p>}
        <AnimatePresence initial={false}>
          {data?.items.map((p) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-2.5 rounded-[14px] px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 [&_svg]:size-4">{METHOD_ICON[p.method] ?? <Banknote />}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {labelOf(PAYMENT_METHODS, p.method)}
                  {p.chain ? <span className="text-fg-3"> · {p.chain}</span> : null}
                </div>
                <div className="truncate text-[11.5px] text-fg-3">
                  {date(p.date)}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.tx_hash ? (
                    <button type="button" className="ml-1 font-mono hover:text-fg" onClick={() => copyText(p.tx_hash ?? "", "Hash de transaction copié")} title="Copier le hash">
                      · {shortHash(p.tx_hash, 8, 6)}
                    </button>
                  ) : null}
                </div>
              </div>
              <span className="text-[13px] font-semibold tabular">{money(p.amount, invoice.currency)}</span>
              {canDelete && (
                <button type="button" onClick={() => remove(p)} className="rounded-full p-1.5 text-fg-3 opacity-0 transition hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100" aria-label="Supprimer le paiement">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

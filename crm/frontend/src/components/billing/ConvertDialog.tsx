import { AlertTriangle, FileCheck2, PiggyBank, ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Invoice, Quote } from "@/lib/types";
import { NumField } from "./fields";
import { round2 } from "./lib";
import { ChoiceCard } from "./ui";

/** Quote → invoice (full / balance) or deposit invoice (acompte). */
export function ConvertDialog({ open, onOpenChange, quote, depositsIssued, onConverted }: { open: boolean; onOpenChange: (open: boolean) => void; quote: Quote; depositsIssued: Invoice[]; onConverted: (invoice: Invoice) => void }) {
  const [mode, setMode] = useState<"full" | "deposit">("full");
  const [percent, setPercent] = useState<number | null>(quote.deposit_percent ?? 30);
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const invalidate = useInvalidate();
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setMode(quote.deposit_percent && depositsIssued.length === 0 ? "deposit" : "full");
      setPercent(quote.deposit_percent ?? 30);
    }
  }
  const depositTotal = depositsIssued.reduce((s, d) => s + d.total, 0);
  const signed = quote.status === "accepted" || !!quote.accepted_at;

  const submit = async () => {
    if (mode === "deposit" && (!percent || percent <= 0 || percent >= 100)) return toast.error("Indiquez un pourcentage d'acompte entre 1 et 99 %.");
    setBusy(true);
    try {
      const invoice = await api.post<Invoice>(`/quotes/${quote.id}/convert`, mode === "deposit" ? { deposit_percent: percent } : {});
      invalidate("quotes", "invoices", "deals");
      toast.success(mode === "deposit" ? "Facture d'acompte créée en brouillon" : "Facture créée en brouillon", { description: "Vérifiez-la puis émettez-la pour lui attribuer son numéro." });
      onConverted(invoice);
      onOpenChange(false);
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
      icon={<ReceiptText className="size-5" />}
      title={`Facturer le devis ${quote.number}`}
      description={`${quote.title ?? "Sans titre"} · ${money(quote.total, quote.currency)} TTC`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {mode === "deposit" ? "Créer la facture d'acompte" : "Créer la facture"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!signed && (
          <div className="flex gap-2.5 rounded-[14px] bg-amber-400/[0.13] px-3.5 py-2.5 text-[12.5px] leading-relaxed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            Ce devis n'a pas été signé électroniquement. Assurez-vous de disposer de l'accord écrit du client.
          </div>
        )}
        <ChoiceCard active={mode === "full"} onClick={() => setMode("full")} icon={<FileCheck2 />} title={depositsIssued.length ? "Facture de solde" : "Facture totale"}>
          Reprend toutes les lignes du devis.
          {depositsIssued.length > 0 && (
            <>
              {" "}
              Les {depositsIssued.length} facture{depositsIssued.length > 1 ? "s" : ""} d'acompte émise{depositsIssued.length > 1 ? "s" : ""} ({money(depositTotal)} TTC) {depositsIssued.length > 1 ? "sont déduites" : "est déduite"} automatiquement.
            </>
          )}{" "}
          Le devis passe au statut « Facturé ».
        </ChoiceCard>
        <ChoiceCard active={mode === "deposit"} onClick={() => setMode("deposit")} icon={<PiggyBank />} title="Facture d'acompte">
          Une ligne par taux de TVA, calculée sur la base HT du devis. Le devis reste ouvert pour la facture de solde.
        </ChoiceCard>
        {mode === "deposit" && (
          <div className="glass-inset flex items-center justify-between gap-3 rounded-[16px] px-3.5 py-3">
            <label className="flex items-center gap-2.5 text-[13px] font-medium">
              Acompte
              <NumField size="field" value={percent} onChange={setPercent} suffix="%" decimals={2} className="w-[110px]" aria-label="Pourcentage d'acompte" />
            </label>
            <span className="text-right text-[12.5px] text-fg-2">
              soit <b className="text-[15px] font-semibold text-fg tabular">{money(round2((quote.total * (percent ?? 0)) / 100), quote.currency)}</b> TTC
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

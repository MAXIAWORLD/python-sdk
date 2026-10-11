import { FileMinus2, FilePen, FileX2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FilterChip } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";
import { toastError } from "@/lib/hooks";
import type { Invoice } from "@/lib/types";
import { ChoiceCard } from "./ui";

const REASONS = ["Erreur de facturation", "Annulation de la commande", "Geste commercial", "Prestation non réalisée", "Retour de marchandise"];

/** Correct an issued invoice the only lawful way: a credit note referencing it. */
export function CreditNoteDialog({ open, onOpenChange, invoice, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; invoice: Invoice; onCreated: (credit: Invoice) => void }) {
  const [full, setFull] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setFull(true);
      setReason("");
    }
  }
  const remaining = Math.max(0, invoice.total - invoice.credited_amount);

  const submit = async () => {
    setBusy(true);
    try {
      const credit = await api.post<Invoice>(`/invoices/${invoice.id}/credit-note`, { full, reason: reason.trim() || null });
      toast.success(full ? `Avoir ${credit.number} émis` : "Brouillon d'avoir créé", { description: full ? `La facture ${invoice.number} est annulée à hauteur de ${money(Math.abs(credit.total))}.` : "Ajustez les lignes puis émettez l'avoir." });
      onCreated(credit);
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
      icon={<FileMinus2 className="size-5" />}
      title={`Créer un avoir sur ${invoice.number}`}
      description={`Facture du ${date(invoice.issue_date)} · ${money(invoice.total, invoice.currency)} TTC${invoice.credited_amount ? ` · déjà créditée de ${money(invoice.credited_amount, invoice.currency)}` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant={full ? "danger" : "primary"} loading={busy} onClick={submit}>
            {full ? "Émettre l'avoir total" : "Créer le brouillon d'avoir"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <ChoiceCard active={full} onClick={() => setFull(true)} icon={<FileX2 />} title="Avoir total">
            Annule l'intégralité de la facture ({money(remaining, invoice.currency)} TTC restant à créditer). L'avoir est <b className="text-fg">émis immédiatement</b> avec son propre numéro.
          </ChoiceCard>
          <ChoiceCard active={!full} onClick={() => setFull(false)} icon={<FilePen />} title="Avoir partiel">
            Crée un <b className="text-fg">brouillon</b> reprenant les lignes en négatif : ajustez quantités ou montants, puis émettez-le.
          </ChoiceCard>
        </div>
        <Field label="Motif" hint="Repris dans l'intitulé et les notes de l'avoir.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : erreur sur le nombre de jours facturés" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <FilterChip key={r} active={reason === r} onClick={() => setReason(reason === r ? "" : r)}>
              {r}
            </FilterChip>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed text-fg-3">
          La facture d'origine reste inchangée et conservée : l'avoir la référence et son montant vient en déduction du reste dû une fois émis.
        </p>
      </div>
    </Dialog>
  );
}

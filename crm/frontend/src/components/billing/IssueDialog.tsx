import { CalendarCheck2, FileLock2, Hash, Link2, Lock, ReceiptText, Stamp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { date, money } from "@/lib/format";
import { toastError } from "@/lib/hooks";
import type { Invoice } from "@/lib/types";
import { CheckList, type LegalCheckResult } from "./LegalChecks";

export type IssuedInvoice = Invoice & { warnings?: string[] };

function Consequence({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent [&_svg]:size-3.5">{icon}</span>
      <span className="text-[13px] leading-relaxed text-fg-2">{children}</span>
    </li>
  );
}

/** Explicit confirmation before the irreversible issuing of an invoice (number, lock, chain). */
export function IssueDialog({ open, onOpenChange, invoice, checks, prefix, onIssued }: { open: boolean; onOpenChange: (open: boolean) => void; invoice: Invoice; checks?: LegalCheckResult; prefix: string; onIssued: (invoice: IssuedInvoice) => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<LegalCheckResult | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setAgreed(false);
      setServerErrors(null);
    }
  }
  const credit = invoice.kind === "credit_note";
  const label = credit ? "l'avoir" : invoice.kind === "deposit" ? "la facture d'acompte" : "la facture";
  const result = serverErrors ?? checks;
  const blocking = (result?.errors.length ?? 0) > 0;
  const year = new Date().getFullYear();

  const issue = async () => {
    setBusy(true);
    try {
      const issued = await api.post<IssuedInvoice>(`/invoices/${invoice.id}/issue`);
      onIssued(issued);
      onOpenChange(false);
      toast.success(`${credit ? "Avoir" : "Facture"} ${issued.number} émis${credit ? "" : "e"}`, { description: "Numérotée, verrouillée et scellée dans la chaîne d'intégrité." });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.errors?.length) setServerErrors({ errors: e.errors, warnings: e.warnings ?? [] });
      else toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Stamp className="size-5" />}
      title={`Émettre ${label} ?`}
      description={`${invoice.company?.name ?? invoice.contact?.name ?? "Client non renseigné"} · ${money(invoice.total, invoice.currency)} TTC${invoice.due_date && !credit ? ` · échéance le ${date(invoice.due_date)}` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" icon={<Lock className="size-4" />} loading={busy} disabled={blocking || !agreed} onClick={issue}>
            Émettre définitivement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {blocking && result ? (
          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-red-600 dark:text-red-400">Corrigez d'abord ces points bloquants :</p>
            <CheckList result={result} companyId={invoice.company_id} onFix={() => onOpenChange(false)} />
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              <Consequence icon={<Hash />}>
                Un <b className="text-fg">numéro définitif et continu</b> lui est attribué ({prefix}-{year}-…), dans l'ordre chronologique d'émission.
              </Consequence>
              <Consequence icon={<CalendarCheck2 />}>
                La date d'émission devient <b className="text-fg">aujourd'hui ({date(new Date())})</b> ; vos coordonnées et celles du client sont figées sur le document.
              </Consequence>
              <Consequence icon={<FileLock2 />}>
                Le document est <b className="text-fg">verrouillé</b> : il ne pourra plus être modifié ni supprimé. Toute correction passera par un <b className="text-fg">avoir</b>.
              </Consequence>
              <Consequence icon={<Link2 />}>
                Il est scellé dans la <b className="text-fg">chaîne d'intégrité SHA-256</b> et produit au format <b className="text-fg">Factur-X (PDF/A-3 + XML EN 16931)</b>.
              </Consequence>
            </ul>
            {result && result.warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-[12.5px] font-medium text-fg-2">Points d'attention (non bloquants) :</p>
                <CheckList result={{ errors: [], warnings: result.warnings }} companyId={invoice.company_id} onFix={() => onOpenChange(false)} />
              </div>
            )}
            <div className="glass-inset rounded-[16px] px-3.5 py-3">
              <Checkbox
                checked={agreed}
                onChange={setAgreed}
                label={
                  <span className="text-[13px]">
                    J'ai vérifié le contenu de {label} <ReceiptText className="mb-0.5 inline size-3.5 text-fg-3" /> et je comprends que l'émission est définitive.
                  </span>
                }
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

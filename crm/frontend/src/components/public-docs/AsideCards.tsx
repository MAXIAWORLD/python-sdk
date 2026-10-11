import { Landmark, Mail, Phone, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Glass } from "@/components/glass/Glass";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatIban } from "./doc-utils";
import { CopyButton } from "./PublicBits";
import type { PublicInvoiceDoc, SellerParty } from "./types";

/** Label / value line of a summary card. */
export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <dt className="shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

export function ContactCard({ seller, subject }: { seller: SellerParty; subject: string }) {
  if (!seller.email && !seller.phone) return null;
  return (
    <Glass radius="lg" className="no-print p-4">
      <div className="text-[13.5px] font-semibold">Une question ?</div>
      <p className="mt-0.5 text-[12.5px] text-fg-3">{seller.trade_name || seller.name} vous répond directement.</p>
      <div className="mt-3 space-y-1">
        {seller.email && (
          <a href={`mailto:${seller.email}?subject=${encodeURIComponent(subject)}`} className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-[13px] transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
            <Mail className="size-4 shrink-0 text-fg-3" />
            <span className="truncate">{seller.email}</span>
          </a>
        )}
        {seller.phone && (
          <a href={`tel:${seller.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-[13px] transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
            <Phone className="size-4 shrink-0 text-fg-3" />
            <span className="tabular">{seller.phone}</span>
          </a>
        )}
      </div>
    </Glass>
  );
}

function CopyRow({ label, value, copy, message, mono, highlight }: { label: string; value: string; copy: string; message: string; mono?: "code" | "iban"; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-[14px] px-3 py-2", highlight ? "bg-accent-soft" : "bg-black/[0.025] dark:bg-white/[0.035]")}>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-medium text-fg-3">{label}</div>
        <div className={cn("break-words text-[14px] font-semibold", mono === "code" && "font-mono text-[13px]", mono === "iban" && "text-balance text-[13.5px] tracking-[0.01em] tabular", highlight && "text-accent")}>{value}</div>
      </div>
      <CopyButton value={copy} label={label.toLowerCase()} message={message} />
    </div>
  );
}

/** Bank transfer details with one-click copy (IBAN, BIC, reference, amount). */
export function PaymentDetails({ doc, overdue }: { doc: PublicInvoiceDoc; overdue?: boolean }) {
  const s = doc.seller;
  const iban = (s.iban ?? "").replace(/\s+/g, "");
  return (
    <Glass radius="xl" className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
          <Landmark className="size-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold">Payer par virement</h3>
          <p className={cn("text-[12px]", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-fg-3")}>{overdue ? "Échéance dépassée : à régler dès que possible" : doc.due_date ? `Avant le ${date(doc.due_date, "d MMMM yyyy")}` : "Dès réception"}</p>
        </div>
      </div>
      {iban ? (
        <div className="mt-4 space-y-1.5">
          <CopyRow label="Bénéficiaire" value={s.name ?? ""} copy={s.name ?? ""} message="Bénéficiaire copié" />
          <CopyRow label="IBAN" value={formatIban(iban)} copy={iban} message="IBAN copié" mono="iban" />
          {s.bic && <CopyRow label="BIC" value={s.bic} copy={s.bic} message="BIC copié" mono="code" />}
          <CopyRow label="Référence du virement" value={doc.number} copy={doc.number} message="Référence copiée" highlight />
          <CopyRow label="Montant" value={money(doc.balance_due, doc.currency)} copy={doc.balance_due.toFixed(2).replace(".", ",")} message="Montant copié" />
          {s.bank_name && <p className="px-1 pt-1 text-[12px] text-fg-3">Banque : {s.bank_name}</p>}
        </div>
      ) : (
        <p className="mt-4 rounded-[14px] bg-black/[0.03] p-3 text-[13px] text-fg-2 dark:bg-white/[0.04]">Les coordonnées bancaires vous sont communiquées sur simple demande. Rappelez la référence {doc.number} avec votre règlement.</p>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-fg-3">
        Indiquez la référence <b className="font-semibold text-fg-2">{doc.number}</b> dans le libellé de votre virement pour un rapprochement immédiat.
        {doc.payment_terms ? ` ${doc.payment_terms}.` : ""}
      </p>
    </Glass>
  );
}

/** Short legal reminder (art. L441-10 and D441-5 of the French Commercial Code). */
export function LatePaymentNotice({ doc, emphasis }: { doc: PublicInvoiceDoc; emphasis?: boolean }) {
  return (
    <div className={cn("flex gap-2.5 rounded-[16px] px-3.5 py-3 text-[12px] leading-relaxed ring-1 ring-inset", emphasis ? "bg-red-500/[0.06] text-fg-2 ring-red-500/25" : "bg-black/[0.025] text-fg-3 ring-[var(--hairline)] dark:bg-white/[0.035]")}>
      <Scale className={cn("mt-0.5 size-4 shrink-0", emphasis ? "text-red-500" : "text-fg-3")} />
      <span>En cas de retard de paiement, des pénalités de retard sont exigibles ainsi qu'une indemnité forfaitaire de {money(doc.recovery_fee || 40, doc.currency)} pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce).</span>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarClock, CircleAlert, CircleCheck, FileDown, HandCoins, ReceiptText } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ContactCard, LatePaymentNotice, PaymentDetails, SummaryRow } from "@/components/public-docs/AsideCards";
import { natureLabel, vatLabel } from "@/components/public-docs/doc-utils";
import { DocumentPaper, type DocumentPaperProps, type TotalRow } from "@/components/public-docs/DocumentPaper";
import { DocError, DocSkeleton, StatusBanner } from "@/components/public-docs/PublicBits";
import type { PublicInvoiceDoc } from "@/components/public-docs/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { api } from "@/lib/api";
import { date, daysFromNow, money, plural } from "@/lib/format";

type InvoiceState = "open" | "partial" | "overdue" | "paid" | "cancelled" | "credit";

const KIND_LABEL: Record<string, string> = { invoice: "Facture", deposit: "Facture d'acompte", credit_note: "Avoir" };

function invoiceState(doc: PublicInvoiceDoc): InvoiceState {
  if (doc.kind === "credit_note") return "credit";
  if (doc.status === "cancelled") return "cancelled";
  if (doc.status === "paid" || doc.balance_due <= 0.005) return "paid";
  if (doc.status === "overdue" || (doc.due_date && (daysFromNow(doc.due_date) ?? 0) < 0)) return "overdue";
  if (doc.status === "partial" || doc.amount_paid > 0) return "partial";
  return "open";
}

function invoiceTotals(doc: PublicInvoiceDoc, state: InvoiceState): TotalRow[] {
  const c = doc.currency;
  const rows: TotalRow[] = [{ label: "Total HT", value: money(doc.lines_total, c) }];
  if (doc.discount) {
    rows.push({ label: `Remise globale (${vatLabel(doc.discount)})`, value: `−${money(doc.discount_amount, c)}` });
    rows.push({ label: "Total HT net", value: money(doc.subtotal, c) });
  }
  for (const v of doc.vat_breakdown) rows.push({ label: `TVA ${vatLabel(v.rate)} sur ${money(v.base, c)}`, value: money(v.amount, c), variant: "muted" });
  rows.push({ label: state === "credit" ? "Total TTC de l'avoir" : "Total TTC", value: money(doc.total, c), variant: "strong" });
  if (state === "credit") return rows;
  if (doc.amount_paid > 0) rows.push({ label: "Déjà réglé", value: `−${money(doc.amount_paid, c)}` });
  if (doc.credited_amount > 0) rows.push({ label: "Avoir(s) déduit(s)", value: `−${money(doc.credited_amount, c)}` });
  if (state === "paid") rows.push({ label: "Facture soldée", value: money(0, c), variant: "success" });
  else if (state !== "cancelled") rows.push({ label: "Reste à payer", value: money(doc.balance_due, c), variant: "accent" });
  return rows;
}

const STAMPS: Partial<Record<InvoiceState, DocumentPaperProps["stamp"]>> = {
  paid: { label: "Payée", tone: "green" },
  overdue: { label: "En retard", tone: "red" },
  cancelled: { label: "Annulée", tone: "gray" },
};

export default function PublicInvoice() {
  const { token = "" } = useParams();
  const query = useQuery({ queryKey: ["public-invoice", token], queryFn: () => api.get<PublicInvoiceDoc>(`/public/invoices/${encodeURIComponent(token)}`), retry: false, staleTime: 60_000 });
  const doc = query.data;
  const label = doc ? (KIND_LABEL[doc.kind] ?? "Facture") : "Facture";
  const company = doc ? doc.seller.trade_name || doc.seller.name || doc.branding.company || "" : "";

  useEffect(() => {
    if (doc?.number) document.title = `${label} ${doc.number}${company ? ` — ${company}` : ""}`;
  }, [doc?.number, label, company]);

  if (query.isLoading)
    return (
      <PublicLayout width="xl">
        <DocSkeleton />
      </PublicLayout>
    );
  if (query.error || !doc)
    return (
      <PublicLayout width="lg">
        <DocError error={query.error} kind="invoice" onRetry={() => query.refetch()} />
      </PublicLayout>
    );

  const state = invoiceState(doc);
  const c = doc.currency;
  const pdfHref = `/api/public/invoices/${encodeURIComponent(token)}/pdf`;
  const pdfName = `${doc.number}.pdf`;
  const dueIn = daysFromNow(doc.due_date);
  const late = state === "overdue" && dueIn !== null ? -dueIn : 0;
  const payable = state === "open" || state === "partial" || state === "overdue";

  const banner = {
    open: (
      <StatusBanner
        tone="accent"
        icon={<CalendarClock className="size-[18px]" />}
        title={doc.due_date ? `À régler avant le ${date(doc.due_date, "d MMMM yyyy")}` : "Facture à régler dès réception"}
        description={`${money(doc.balance_due, c)} par virement${dueIn !== null && dueIn >= 0 ? ` · ${dueIn === 0 ? "échéance aujourd'hui" : `échéance dans ${plural(dueIn, "jour")}`}` : ""}.`}
      />
    ),
    partial: <StatusBanner tone="orange" icon={<HandCoins className="size-[18px]" />} title="Paiement partiel reçu — merci" description={`Reste ${money(doc.balance_due, c)} à régler${doc.due_date ? ` avant le ${date(doc.due_date, "d MMMM yyyy")}` : ""}.`} />,
    overdue: (
      <StatusBanner
        tone="red"
        icon={<CircleAlert className="size-[18px]" />}
        title={late > 0 ? `Facture échue depuis ${plural(late, "jour")}` : "Facture échue"}
        description={`Merci de régler ${money(doc.balance_due, c)} dans les meilleurs délais : des pénalités de retard et une indemnité forfaitaire de ${money(doc.recovery_fee || 40, c)} sont applicables.`}
      />
    ),
    paid: <StatusBanner tone="green" icon={<CircleCheck className="size-[18px]" />} title="Facture réglée — merci !" description={`Paiement reçu${doc.paid_at ? ` le ${date(doc.paid_at, "d MMMM yyyy")}` : ""}. Aucune action n'est requise de votre part.`} />,
    cancelled: <StatusBanner tone="gray" icon={<Ban className="size-[18px]" />} title="Facture annulée" description="Cette facture a été annulée par un avoir : aucun paiement n'est attendu." />,
    credit: <StatusBanner tone="violet" icon={<ReceiptText className="size-[18px]" />} title={`Avoir de ${money(doc.total, c)}`} description="Ce montant vient en déduction de vos prochaines factures ou vous est remboursé." />,
  }[state];

  const settlement = [
    doc.payment_terms ? `${doc.payment_terms}.` : null,
    doc.late_penalty_rate,
    `Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : ${money(doc.recovery_fee || 40, c)} (art. D441-5 du Code de commerce).`,
    doc.early_payment_discount,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <PublicLayout
      width="xl"
      title={`${label} ${doc.number}`}
      subtitle={`${doc.title ? `${doc.title} · ` : ""}${doc.buyer.name ?? ""}`}
      actions={
        <Button size="sm" variant="glass" asChild>
          <a href={pdfHref} download={pdfName}>
            <FileDown className="size-4" /> PDF
          </a>
        </Button>
      }
    >
      <div className="space-y-5">
        {banner}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <DocumentPaper
              kicker={label}
              number={doc.number}
              stamp={STAMPS[state]}
              dates={[
                { label: state === "credit" ? "Émis le" : "Émise le", value: date(doc.issue_date, "d MMMM yyyy") },
                ...(doc.due_date && state !== "credit" ? [{ label: "Échéance", value: date(doc.due_date, "d MMMM yyyy"), tone: state === "overdue" ? ("danger" as const) : undefined }] : []),
                ...(doc.service_date
                  ? [{ label: doc.service_period_end ? "Période" : "Date de prestation", value: doc.service_period_end ? `${date(doc.service_date, "d MMM")} → ${date(doc.service_period_end, "d MMM yyyy")}` : date(doc.service_date, "d MMMM yyyy") }]
                  : []),
                { label: "Nature", value: natureLabel(doc.nature) },
              ]}
              title={doc.title}
              seller={doc.seller}
              buyer={doc.buyer}
              buyerLabel="Facturé à"
              lines={doc.lines}
              currency={c}
              totals={invoiceTotals(doc, state)}
              logoUrl={doc.branding.logo_url}
              mentions={[
                doc.vat_mention || (doc.seller.vat_regime === "franchise" ? "TVA non applicable, art. 293 B du CGI" : null),
                doc.vat_on_debits && "Option pour le paiement de la TVA d'après les débits.",
                doc.einvoice_format === "factur-x" && "Facture électronique au format Factur-X (EN 16931).",
              ]}
              sections={[...(state !== "credit" ? [{ title: "Conditions de règlement", body: settlement }] : []), ...(doc.notes ? [{ title: "Notes", body: doc.notes }] : []), ...(doc.terms ? [{ title: "Conditions", body: doc.terms }] : [])]}
            />
          </div>

          <aside className="order-first space-y-4 lg:order-none">
            <Glass radius="xl" glow className="p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-fg-3">{state === "credit" ? "Montant de l'avoir" : state === "paid" ? "Montant réglé" : state === "cancelled" ? "Montant annulé" : "Reste à payer"}</span>
                {state === "paid" && (
                  <Badge tone="green" dot>
                    Payée
                  </Badge>
                )}
                {state === "overdue" && (
                  <Badge tone="red" dot>
                    En retard
                  </Badge>
                )}
                {state === "partial" && (
                  <Badge tone="yellow" dot>
                    Partiellement payée
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.035em] tabular">{money(payable ? doc.balance_due : doc.total, c)}</div>
              <div className="text-[12.5px] text-fg-3 tabular">
                Total {money(doc.total, c)} TTC{doc.amount_paid > 0 && state !== "paid" ? ` · déjà réglé ${money(doc.amount_paid, c)}` : ""}
              </div>
              <dl className="mt-3 divide-y divide-[var(--hairline)]">
                {doc.due_date && state !== "credit" && (
                  <SummaryRow label="Échéance">
                    <span className={state === "overdue" ? "text-red-600 dark:text-red-400" : undefined}>{date(doc.due_date, "d MMM yyyy")}</span>
                  </SummaryRow>
                )}
                {state === "paid" && doc.paid_at && <SummaryRow label="Réglée le">{date(doc.paid_at, "d MMM yyyy")}</SummaryRow>}
                <SummaryRow label="Référence">
                  <span className="font-mono text-[12.5px]">{doc.number}</span>
                </SummaryRow>
              </dl>
              <Button variant={payable ? "glass" : "primary"} className="no-print mt-4 w-full" asChild>
                <a href={pdfHref} download={pdfName}>
                  <FileDown className="size-4" /> Télécharger la facture (PDF)
                </a>
              </Button>
              <p className="mt-2.5 text-center text-[11.5px] text-fg-3">PDF/A-3 Factur-X : données structurées prêtes pour votre logiciel comptable.</p>
            </Glass>
            {payable && <PaymentDetails doc={doc} overdue={state === "overdue"} />}
            {payable && <LatePaymentNotice doc={doc} emphasis={state === "overdue"} />}
            <div className="hidden lg:block">
              <ContactCard seller={doc.seller} subject={`${label} ${doc.number}`} />
            </div>
          </aside>
        </div>
        <div className="lg:hidden">
          <ContactCard seller={doc.seller} subject={`${label} ${doc.number}`} />
        </div>
      </div>
    </PublicLayout>
  );
}

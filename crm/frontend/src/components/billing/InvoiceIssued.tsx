import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileMinus2,
  FilePlus2,
  FileText,
  Fingerprint,
  Link2,
  Lock,
  MailCheck,
  MoreHorizontal,
  ReceiptText,
  Send,
  Stamp as StampIcon,
  Target,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Panel } from "@/components/data/blocks";
import { RelatedRow } from "@/components/entity/EntityBlocks";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/display";
import { Menu, type MenuItem } from "@/components/ui/overlay";
import { api, download } from "@/lib/api";
import { findOption, INVOICE_KIND, INVOICE_STATUS, labelOf, NATURES } from "@/lib/constants";
import { date, dateTime, money } from "@/lib/format";
import { keys, toastError, useInvalidate, useItem, useList } from "@/lib/hooks";
import type { Contact, Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { CreditNoteDialog } from "./CreditNoteDialog";
import { DocHeader } from "./DocHeader";
import type { BillingContext } from "./hooks";
import { InvoiceTermsReadOnly } from "./InvoiceTerms";
import { computeTotals, copyText, invoiceEmail, invoicePublicUrl, isOutstanding, lateDays, reminderEmail, shortHash } from "./lib";
import { LinesReadOnly } from "./LineItemsEditor";
import { BuyerSnapshot, DocHeading, MetaField, NotesBlock, PaperSheet, SellerBlock, SheetSection, Stamp } from "./Paper";
import { PaymentDialog, PaymentsPanel } from "./Payments";
import { PdfPreview } from "./PdfPreview";
import { SendDialog } from "./SendDialog";
import { StatusTimeline, type TimelineStep } from "./StatusTimeline";
import { TotalRow, TotalsCard } from "./TotalsCard";

export type InvoiceKind = Invoice["kind"];

export const KIND_TITLE: Record<InvoiceKind, string> = { invoice: "Facture", deposit: "Facture d'acompte", credit_note: "Avoir" };

/* Status frieze                                                              */
/* -------------------------------------------------------------------------- */

export function invoiceSteps(inv: Invoice | null): TimelineStep[] {
  const credit = inv?.kind === "credit_note";
  if (!inv || !inv.locked)
    return [
      { key: "draft", label: "Brouillon", icon: <FilePlus2 />, state: inv ? "done" : "current", date: inv?.created_at, detail: "Modifiable, sans numéro ni valeur légale." },
      { key: "issue", label: "Émission", icon: <StampIcon />, state: inv ? "current" : "todo", detail: "Numéro définitif, verrouillage, Factur-X." },
      { key: "sent", label: "Envoi au client", icon: <Send />, state: "todo" },
      ...(credit ? [] : [{ key: "paid", label: "Paiement", icon: <CircleDollarSign />, state: "todo" as const }]),
    ];
  const late = lateDays(inv);
  const steps: TimelineStep[] = [
    { key: "issued", label: credit ? "Émis" : "Émise", icon: <StampIcon />, state: "done", date: inv.issued_at, detail: `${inv.number} · verrouillé${credit ? "" : "e"} et scellé${credit ? "" : "e"} (SHA-256)` },
    { key: "sent", label: inv.sent_at ? "Envoyée" : "Envoi", icon: <Send />, state: inv.sent_at ? "done" : "current", date: inv.sent_at, detail: inv.sent_at ? undefined : "Pas encore envoyée au client." },
  ];
  if (inv.viewed_at) steps.push({ key: "viewed", label: "Consultée en ligne", icon: <Eye />, state: "done", date: inv.viewed_at });
  if (inv.reminders_sent > 0) steps.push({ key: "reminders", label: `${inv.reminders_sent} relance${inv.reminders_sent > 1 ? "s" : ""}`, icon: <BellRing />, state: "done", date: inv.last_reminder_at, detail: inv.last_reminder_at ? `Dernière le ${date(inv.last_reminder_at)}` : undefined });
  if (credit) steps.push({ key: "credited", label: "Imputé", icon: <FileMinus2 />, state: "done", detail: inv.credit_for ? `Sur la facture ${inv.credit_for.name}` : undefined });
  else if (inv.status === "cancelled") steps.push({ key: "cancelled", label: "Annulée par avoir", icon: <XCircle />, state: "warn", detail: `${money(inv.credited_amount)} crédités` });
  else if (inv.status === "paid") steps.push({ key: "paid", label: "Payée", icon: <CheckCircle2 />, state: "done", date: inv.paid_at });
  else if (late > 0) steps.push({ key: "late", label: `En retard de ${late} j`, icon: <AlertTriangle />, state: "error", detail: `Échéance dépassée le ${date(inv.due_date)} · reste dû ${money(inv.balance_due)}` });
  else steps.push({ key: "paid", label: inv.status === "partial" ? "Partiellement payée" : "Paiement attendu", icon: <CircleDollarSign />, state: "current", detail: inv.due_date ? `Avant le ${date(inv.due_date)} · reste dû ${money(inv.balance_due)}` : undefined });
  return steps;
}

/** Quote of origin, credited invoice, credit notes, project & deal. */
export function LinkedDocs({ invoice }: { invoice: Invoice }) {
  const credits = useList<Invoice>("invoices", { credit_for_id: invoice.id, sort: "issue_date", limit: 20 }, { enabled: invoice.locked && invoice.kind !== "credit_note" });
  const rows: ReactNode[] = [];
  if (invoice.credit_for)
    rows.push(<RelatedRow key="cf" to={`/invoices/${invoice.credit_for.id}`} icon={<ReceiptText className="size-4 shrink-0 text-fg-3" />} title={invoice.credit_for.name} meta="Facture d'origine" right={<StatusBadge options={INVOICE_STATUS} value={String(invoice.credit_for.status ?? "")} size="xs" />} />);
  if (invoice.quote) rows.push(<RelatedRow key="q" to={`/quotes/${invoice.quote.id}`} icon={<FileText className="size-4 shrink-0 text-fg-3" />} title={invoice.quote.name} meta="Devis d'origine" right={<span className="text-[12.5px] font-semibold tabular">{money(Number(invoice.quote.total ?? 0))}</span>} />);
  for (const c of credits.data?.items ?? [])
    rows.push(<RelatedRow key={`c${c.id}`} to={`/invoices/${c.id}`} icon={<FileMinus2 className="size-4 shrink-0 text-orange-500" />} title={c.number || "Avoir (brouillon)"} meta={c.number ? "Avoir émis" : "Avoir en préparation"} right={<span className="text-[12.5px] font-semibold tabular text-orange-600 dark:text-orange-400">{money(c.total)}</span>} />);
  if (invoice.project) rows.push(<RelatedRow key="p" to={`/projects/${invoice.project.id}`} icon={<Target className="size-4 shrink-0 text-fg-3" />} title={invoice.project.name} meta="Projet" />);
  if (!rows.length) return null;
  return (
    <Panel title="Documents liés" icon={<Link2 className="size-4" />} bodyClassName="px-2.5 pb-3">
      <div className="space-y-0.5">{rows}</div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Issued (locked) invoice                                                    */
/* -------------------------------------------------------------------------- */

function IntegrityPanel({ invoice }: { invoice: Invoice }) {
  return (
    <Panel title="Pièce verrouillée" icon={<Lock className="size-4" />}>
      <div className="space-y-2 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <span className="text-fg-3">Émise le</span>
          <span className="text-right">{dateTime(invoice.issued_at)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-fg-3">N° d'ordre</span>
          <span className="tabular">{invoice.sequence ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="flex items-center gap-1.5 text-fg-3">
            <Fingerprint className="size-3.5" /> Empreinte
          </span>
          <button type="button" onClick={() => copyText(invoice.hash ?? "", "Empreinte SHA-256 copiée")} className="font-mono text-[11.5px] text-fg-2 hover:text-fg" title="Copier l'empreinte complète">
            {shortHash(invoice.hash, 8, 6)}
          </button>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-fg-3">Format</span>
          <span className="text-right">Factur-X · EN 16931</span>
        </div>
        {invoice.einvoice_status && (
          <div className="flex justify-between gap-3">
            <span className="text-fg-3">E-facturation</span>
            <Badge tone="blue" size="xs">
              {invoice.einvoice_status}
            </Badge>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="glass" icon={<Download className="size-3.5" />} onClick={() => download(`/invoices/${invoice.id}/pdf`, `${invoice.number}.pdf`).catch(toastError)}>
          PDF/A-3
        </Button>
        <Button size="sm" variant="glass" icon={<FileCode2 className="size-3.5" />} onClick={() => download(`/invoices/${invoice.id}/facturx.xml`, `${invoice.number}-factur-x.xml`).catch(toastError)}>
          XML
        </Button>
      </div>
      <Button size="sm" variant="ghost" className="mt-1 w-full" icon={<Link2 className="size-3.5" />} onClick={() => copyText(invoicePublicUrl(invoice.public_token), "Lien public copié", "Votre client peut consulter et télécharger la facture.")}>
        Copier le lien public
      </Button>
    </Panel>
  );
}

/** Issued (locked) invoice or credit note: read-only document, payments, integrity, reminders, credit notes. */
export function IssuedInvoiceView({ invoice, settings }: { invoice: Invoice; settings: BillingContext }) {
  const { billing } = settings;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const me = useAuth((s) => s.user);
  const canWrite = can(me, "member");
  const [dialog, setDialog] = useState<null | "pdf" | "send" | "remind" | "payment" | "credit">(null);
  const contact = useItem<Contact>("contacts", invoice.contact_id);
  const credit = invoice.kind === "credit_note";
  const late = lateDays(invoice);
  const outstanding = isOutstanding(invoice) && invoice.balance_due > 0.005;
  const sellerFranchise = invoice.seller?.vat_regime === "franchise";
  const totals = useMemo(() => computeTotals(invoice.lines, invoice.discount, { franchise: sellerFranchise, defaultVat: billing.default_vat }), [invoice.lines, invoice.discount, sellerFranchise, billing.default_vat]);

  const setInvoice = (inv: Invoice) => {
    qc.setQueryData(keys.item("invoices", inv.id), inv);
    invalidate("invoices", "payments", "quotes");
  };

  const markSent = async () => {
    try {
      setInvoice(await api.post<Invoice>(`/invoices/${invoice.id}/mark-sent`));
      toast.success("Facture marquée comme envoyée");
    } catch (e) {
      toastError(e);
    }
  };

  const duplicate = async () => {
    try {
      const copy = await api.post<Invoice>(`/invoices/${invoice.id}/duplicate`);
      invalidate("invoices");
      toast.success("Nouveau brouillon créé à partir de cette pièce");
      navigate(`/invoices/${copy.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const mail = { to: invoice.buyer?.email ?? contact.data?.email, firstName: contact.data?.first_name, sender: me?.name ?? "", company: invoice.seller?.trade_name ? String(invoice.seller.trade_name) : invoice.seller?.name, publicUrl: settings.publicUrl };
  const stamp =
    invoice.status === "paid" ? <Stamp label="Payée" sub={invoice.paid_at ? date(invoice.paid_at) : undefined} /> : invoice.status === "cancelled" ? <Stamp label="Annulée" sub="par avoir" tone="gray" /> : credit ? <Stamp label="Avoir" tone="orange" /> : late > 0 ? <Stamp label="En retard" sub={`+${late} jours`} tone="red" /> : null;

  const menuItems: MenuItem[] = [
    { label: "Aperçu", icon: <Eye className="size-4" />, onSelect: () => setDialog("pdf") },
    ...(canWrite && late > 0 ? [{ label: invoice.sent_at ? "Renvoyer la facture" : "Envoyer la facture", icon: <Send className="size-4" />, onSelect: () => setDialog("send") }] : []),
    { label: "XML Factur-X", icon: <FileCode2 className="size-4" />, onSelect: () => download(`/invoices/${invoice.id}/facturx.xml`, `${invoice.number}-factur-x.xml`).catch(toastError) },
    { label: "Copier le lien public", icon: <Link2 className="size-4" />, onSelect: () => copyText(invoicePublicUrl(invoice.public_token), "Lien public copié") },
    ...(canWrite && invoice.status === "issued" && !invoice.sent_at ? [{ label: "Marquer comme envoyée", icon: <MailCheck className="size-4" />, onSelect: markSent }] : []),
    ...(canWrite && outstanding && !credit ? [{ label: `Relancer le client${invoice.reminders_sent ? ` (${invoice.reminders_sent} déjà)` : ""}`, icon: <BellRing className="size-4" />, onSelect: () => setDialog("remind") }] : []),
    { separator: true, label: "" },
    ...(canWrite && !credit && invoice.status !== "cancelled" ? [{ label: "Créer un avoir", icon: <FileMinus2 className="size-4" />, onSelect: () => setDialog("credit") }] : []),
    { label: "Dupliquer en brouillon", icon: <Copy className="size-4" />, onSelect: duplicate, disabled: !canWrite },
  ];

  return (
    <div>
      <DocHeader
        back="/invoices"
        backLabel="Factures"
        title={invoice.number}
        badges={
          <>
            <StatusBadge options={INVOICE_STATUS} value={invoice.status} />
            {invoice.kind !== "invoice" && (
              <Badge tone={findOption(INVOICE_KIND, invoice.kind)?.tone}>{labelOf(INVOICE_KIND, invoice.kind)}</Badge>
            )}
            <Badge tone="indigo">
              <Lock className="size-3" /> Verrouillée
            </Badge>
          </>
        }
        subtitle={
          <>
            {invoice.company ? (
              <Link to={`/companies/${invoice.company.id}`} className="font-medium text-fg hover:text-accent">
                {invoice.company.name}
              </Link>
            ) : (
              <span className="font-medium text-fg">{invoice.contact?.name ?? invoice.buyer?.name}</span>
            )}
            <span className="text-fg-3">·</span>
            <span className="tabular">{money(invoice.total, invoice.currency)} TTC</span>
            {!credit && invoice.due_date && (
              <>
                <span className="text-fg-3">·</span>
                <span className={cn(late > 0 && "font-medium text-red-500")}>
                  échéance {date(invoice.due_date)}
                  {late > 0 ? ` (+${late} j)` : ""}
                </span>
              </>
            )}
            {invoice.credit_for && (
              <Link to={`/invoices/${invoice.credit_for.id}`} className="inline-flex items-center gap-1 font-medium text-orange-600 hover:underline dark:text-orange-400">
                <FileMinus2 className="size-3.5" /> Avoir sur la facture {invoice.credit_for.name}
              </Link>
            )}
          </>
        }
        actions={
          <>
            {canWrite && outstanding && !credit && (
              <Button variant="primary" icon={<Banknote className="size-4" />} onClick={() => setDialog("payment")}>
                Enregistrer un paiement
              </Button>
            )}
            {canWrite && late > 0 && (
              <Button variant="glass" icon={<BellRing className="size-4" />} onClick={() => setDialog("remind")}>
                Relancer
                {invoice.reminders_sent > 0 && <span className="rounded-full bg-red-500/15 px-1.5 text-[11px] font-semibold text-red-600 tabular dark:text-red-300">{invoice.reminders_sent}</span>}
              </Button>
            )}
            {canWrite && late === 0 && (
              <Button variant="glass" icon={<Send className="size-4" />} onClick={() => setDialog("send")}>
                {invoice.sent_at ? "Renvoyer" : "Envoyer"}
              </Button>
            )}
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download(`/invoices/${invoice.id}/pdf`, `${invoice.number}.pdf`).catch(toastError)}>
              PDF
            </Button>
            <Menu
              width={260}
              trigger={
                <Button variant="glass" aria-label="Plus d'actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              }
              items={menuItems}
            />
          </>
        }
      />

      {!!invoice.warnings?.length && (
        <div className="mb-4 flex gap-2.5 rounded-[16px] bg-amber-400/[0.12] px-4 py-3 text-[12.5px] leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <div className="font-semibold">Émise avec des points d'attention</div>
            {invoice.warnings.map((w) => (
              <div key={w} className="text-fg-2">
                {w}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PaperSheet>
          <div className="flex flex-col gap-6 @lg:flex-row @lg:items-start @lg:justify-between">
            <SellerBlock seller={invoice.seller ?? {}} />
            <DocHeading kind={KIND_TITLE[invoice.kind]} number={invoice.number} placeholder="" stamp={stamp}>
              <div>Émise le {date(invoice.issue_date)}</div>
              {!credit && invoice.due_date && <div className={cn(late > 0 && "font-medium text-red-500")}>Échéance : {date(invoice.due_date)}</div>}
            </DocHeading>
          </div>

          <div className="mt-8 grid gap-6 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <BuyerSnapshot title="Facturé à" buyer={invoice.buyer ?? {}} companyId={invoice.company_id} />
            <div className="grid content-start grid-cols-2 gap-x-3 gap-y-4 text-[13.5px]">
              <MetaField label={invoice.service_period_end ? "Période de la prestation" : invoice.nature === "goods" ? "Date de livraison" : "Date de la prestation"} className="col-span-2">
                {invoice.service_period_end ? `du ${date(invoice.service_date)} au ${date(invoice.service_period_end)}` : date(invoice.service_date ?? invoice.issue_date)}
              </MetaField>
              <MetaField label="Nature de l'opération" className="col-span-2">
                {labelOf(NATURES, invoice.nature)}
              </MetaField>
              {!credit && invoice.payment_terms && (
                <MetaField label="Conditions" className="col-span-2">
                  {invoice.payment_terms}
                </MetaField>
              )}
              {invoice.credit_for && (
                <MetaField label="Facture d'origine" className="col-span-2">
                  <Link to={`/invoices/${invoice.credit_for.id}`} className="font-medium text-accent hover:underline">
                    {invoice.credit_for.name}
                  </Link>
                </MetaField>
              )}
            </div>
          </div>

          {invoice.title && <h2 className="mt-8 text-[21px] font-semibold tracking-[-0.02em]">{invoice.title}</h2>}

          <SheetSection title="Détail" className={invoice.title ? "mt-5" : "mt-8"}>
            <LinesReadOnly lines={invoice.lines} currency={invoice.currency} franchise={sellerFranchise} defaultVat={billing.default_vat} />
          </SheetSection>

          <div className="mt-8 grid gap-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(290px,360px)]">
            <div className="space-y-5">
              <NotesBlock label="Notes" value={invoice.notes ?? ""} readOnly onChange={() => undefined} placeholder="" />
              <NotesBlock label="Conditions" value={invoice.terms ?? ""} readOnly onChange={() => undefined} placeholder="" />
            </div>
            <TotalsCard totals={totals} currency={invoice.currency} franchise={sellerFranchise} discount={invoice.discount} totalLabel={credit ? "Total de l'avoir TTC" : "Total TTC"}>
              {!credit && (invoice.amount_paid > 0 || invoice.credited_amount > 0) ? (
                <>
                  {invoice.amount_paid > 0 && <TotalRow label="Déjà réglé" value={`− ${money(invoice.amount_paid, invoice.currency)}`} tone="good" />}
                  {invoice.credited_amount > 0 && <TotalRow label="Avoir(s) imputé(s)" value={`− ${money(invoice.credited_amount, invoice.currency)}`} tone="warn" />}
                  <TotalRow label="Net à payer" value={money(Math.max(0, invoice.balance_due), invoice.currency)} strong />
                </>
              ) : !credit ? (
                <TotalRow label="Net à payer" value={money(invoice.balance_due, invoice.currency)} strong />
              ) : null}
            </TotalsCard>
          </div>

          <div className="mt-6">
            <InvoiceTermsReadOnly penalties={invoice.late_penalty_rate} recoveryFee={invoice.recovery_fee} discount={invoice.early_payment_discount} vatMention={invoice.vat_mention} vatOnDebits={invoice.vat_on_debits} franchise={sellerFranchise} credit={credit} />
          </div>
          <p className="mt-4 break-all font-mono text-[10.5px] text-fg-3">Empreinte d'intégrité (SHA-256) : {invoice.hash}</p>
        </PaperSheet>

        <aside className="min-w-0 space-y-4">
          {!credit && <PaymentsPanel invoice={invoice} canWrite={canWrite} canDelete={can(me, "manager")} onAdd={() => setDialog("payment")} onChanged={setInvoice} />}
          <IntegrityPanel invoice={invoice} />
          <Panel title="Suivi" icon={<ReceiptText className="size-4" />}>
            <StatusTimeline steps={invoiceSteps(invoice)} />
          </Panel>
          <LinkedDocs invoice={invoice} />
        </aside>
      </div>

      <PdfPreview open={dialog === "pdf"} onOpenChange={(o) => setDialog(o ? "pdf" : null)} path={`/invoices/${invoice.id}/pdf`} version={invoice.updated_at} title={`${KIND_TITLE[invoice.kind]} ${invoice.number}`} filename={`${invoice.number}.pdf`} note="PDF/A-3 avec XML Factur-X (EN 16931) embarqué." />
      <SendDialog<Invoice>
        open={dialog === "send"}
        onOpenChange={(o) => setDialog(o ? "send" : null)}
        endpoint={`/invoices/${invoice.id}/send`}
        title={`Envoyer ${credit ? "l'avoir" : "la facture"} ${invoice.number}`}
        description="Le PDF Factur-X est joint ; le client peut aussi consulter la pièce en ligne."
        attachment={`${invoice.number}.pdf (Factur-X) joint automatiquement`}
        defaults={invoiceEmail(invoice, mail)}
        onSent={(inv) => {
          setInvoice(inv);
          toast.success(`${credit ? "Avoir" : "Facture"} envoyé${credit ? "" : "e"}`, { description: "L'envoi est tracé dans la chronologie du client." });
        }}
      />
      <SendDialog<Invoice>
        open={dialog === "remind"}
        onOpenChange={(o) => setDialog(o ? "remind" : null)}
        endpoint={`/invoices/${invoice.id}/remind`}
        icon={<BellRing className="size-5" />}
        title={`Relancer — ${invoice.number}`}
        description={invoice.reminders_sent ? `${invoice.reminders_sent} relance${invoice.reminders_sent > 1 ? "s" : ""} déjà envoyée${invoice.reminders_sent > 1 ? "s" : ""}${invoice.last_reminder_at ? `, la dernière le ${date(invoice.last_reminder_at)}` : ""}.` : "Première relance pour cette facture."}
        attachment={`${invoice.number}.pdf joint automatiquement`}
        sendLabel="Envoyer la relance"
        defaults={reminderEmail(invoice, mail)}
        onSent={(inv) => {
          setInvoice(inv);
          toast.success("Relance envoyée", { description: `${inv.reminders_sent} relance${inv.reminders_sent > 1 ? "s" : ""} au total.` });
        }}
      />
      <PaymentDialog open={dialog === "payment"} onOpenChange={(o) => setDialog(o ? "payment" : null)} invoice={invoice} onRecorded={setInvoice} />
      <CreditNoteDialog
        open={dialog === "credit"}
        onOpenChange={(o) => setDialog(o ? "credit" : null)}
        invoice={invoice}
        onCreated={(c) => {
          invalidate("invoices");
          navigate(`/invoices/${c.id}`);
        }}
      />
    </div>
  );
}

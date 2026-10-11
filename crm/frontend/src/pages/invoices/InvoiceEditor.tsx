import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  Save,
  Send,
  Stamp as StampIcon,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CreditNoteDialog } from "@/components/billing/CreditNoteDialog";
import { DocHeader, SaveIndicator, type SaveState } from "@/components/billing/DocHeader";
import { DateField, ghostBase } from "@/components/billing/fields";
import { useBillingSettings, useLeaveGuard, useSaveShortcut, type BillingContext } from "@/components/billing/hooks";
import { InvoiceTermsEditor, InvoiceTermsReadOnly, type TermsValue } from "@/components/billing/InvoiceTerms";
import { IssueDialog, type IssuedInvoice } from "@/components/billing/IssueDialog";
import { LegalChecksPanel, useInvoiceChecks } from "@/components/billing/LegalChecks";
import { LineItemsEditor, LinesReadOnly } from "@/components/billing/LineItemsEditor";
import {
  blankLine,
  comparableLines,
  computeTotals,
  copyText,
  daysBetween,
  inDays,
  invoiceEmail,
  invoicePublicUrl,
  isOutstanding,
  lateDays,
  lineKind,
  linesPayload,
  reminderEmail,
  shortHash,
  todayIso,
  withIds,
} from "@/components/billing/lib";
import { BuyerEditor, BuyerSnapshot, DocHeading, MetaField, NotesBlock, PaperSheet, SellerBlock, SheetSection, Stamp } from "@/components/billing/Paper";
import { PaymentDialog, PaymentsPanel } from "@/components/billing/Payments";
import { PdfPreview } from "@/components/billing/PdfPreview";
import { SendDialog } from "@/components/billing/SendDialog";
import { StatusTimeline, type TimelineStep } from "@/components/billing/StatusTimeline";
import { TotalRow, TotalsCard } from "@/components/billing/TotalsCard";
import { UnsavedBar } from "@/components/billing/UnsavedBar";
import { Panel } from "@/components/data/blocks";
import { NotFoundRecord, RelatedRow } from "@/components/entity/EntityBlocks";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton, StatusBadge } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/fields";
import { Menu, useConfirm, type MenuItem } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { findOption, INVOICE_KIND, INVOICE_STATUS, labelOf, NATURES } from "@/lib/constants";
import { date, dateTime, money } from "@/lib/format";
import { keys, toastError, useInvalidate, useItem, useList } from "@/lib/hooks";
import type { Company, Contact, Invoice, LineItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

type Kind = Invoice["kind"];

const KIND_TITLE: Record<Kind, string> = { invoice: "Facture", deposit: "Facture d'acompte", credit_note: "Avoir" };

/* -------------------------------------------------------------------------- */
/* Draft                                                                      */
/* -------------------------------------------------------------------------- */

interface InvoiceDraft extends TermsValue {
  kind: Kind;
  title: string;
  company_id: number | null;
  contact_id: number | null;
  deal_id: number | null;
  project_id: number | null;
  due_date: string | null;
  payment_terms: string;
  service_date: string | null;
  service_period_end: string | null;
  nature: string;
  lines: LineItem[];
  discount: number;
  notes: string;
  terms: string;
}

function draftFromInvoice(inv: Invoice): InvoiceDraft {
  return {
    kind: inv.kind,
    title: inv.title ?? "",
    company_id: inv.company_id ?? null,
    contact_id: inv.contact_id ?? null,
    deal_id: inv.deal_id ?? null,
    project_id: inv.project_id ?? null,
    due_date: inv.due_date ?? null,
    payment_terms: inv.payment_terms ?? "",
    service_date: inv.service_date ?? null,
    service_period_end: inv.service_period_end ?? null,
    nature: inv.nature || "services",
    lines: withIds(inv.lines),
    discount: inv.discount ?? 0,
    notes: inv.notes ?? "",
    terms: inv.terms ?? "",
    late_penalty_rate: inv.late_penalty_rate ?? "",
    early_payment_discount: inv.early_payment_discount ?? "",
    recovery_fee: inv.recovery_fee ?? 40,
    vat_mention: inv.vat_mention ?? "",
  };
}

const draftKey = (d: InvoiceDraft) => JSON.stringify({ ...d, lines: comparableLines(d.lines) });
const isBlank = (l: LineItem) => !l.description?.trim() && (lineKind(l) !== "item" || (!l.unit_price && !l.product_id));

function payload(d: InvoiceDraft) {
  return {
    ...(d.kind === "credit_note" ? {} : { kind: d.kind }),
    title: d.title.trim() || null,
    company_id: d.company_id,
    contact_id: d.contact_id,
    deal_id: d.deal_id,
    project_id: d.project_id,
    due_date: d.kind === "credit_note" ? null : d.due_date || null,
    payment_terms: d.payment_terms.trim() || null,
    service_date: d.service_date || null,
    service_period_end: d.service_date ? d.service_period_end || null : null,
    nature: d.nature,
    lines: linesPayload(d.lines.filter((l) => !isBlank(l))),
    discount: d.discount || 0,
    notes: d.notes.trim() || null,
    terms: d.terms.trim() || null,
    late_penalty_rate: d.late_penalty_rate.trim() || null,
    early_payment_discount: d.early_payment_discount.trim() || null,
    recovery_fee: d.recovery_fee ?? 40,
    vat_mention: d.vat_mention || null,
  };
}

const DUE_PRESETS = [
  { days: 0, label: "À réception" },
  { days: 15, label: "15 j" },
  { days: 30, label: "30 j" },
  { days: 45, label: "45 j" },
  { days: 60, label: "60 j" },
];

/* -------------------------------------------------------------------------- */
/* Status frieze                                                              */
/* -------------------------------------------------------------------------- */

function invoiceSteps(inv: Invoice | null): TimelineStep[] {
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
function LinkedDocs({ invoice }: { invoice: Invoice }) {
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
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function EditorSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-4 w-20" />
      <Skeleton className="mb-6 h-9 w-72" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[760px] rounded-[28px]" />
        <div className="space-y-4">
          <Skeleton className="h-[220px] rounded-[22px]" />
          <Skeleton className="h-[260px] rounded-[22px]" />
        </div>
      </div>
    </div>
  );
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const isNew = id === "new";
  const invoiceId = isNew ? null : Number(id);
  const settings = useBillingSettings();
  const invoice = useItem<Invoice>("invoices", invoiceId);

  if (invoice.error) return <NotFoundRecord label="Facture" back="/invoices" />;
  if (!settings.ready || (!isNew && !invoice.data)) return <EditorSkeleton />;
  const inv = invoice.data ?? null;
  if (inv?.locked) return <IssuedInvoice key={inv.id} invoice={inv} settings={settings} />;

  const num = (k: string) => Number(search.get(k)) || null;
  const prefill: Partial<InvoiceDraft> = { company_id: num("company_id"), contact_id: num("contact_id"), deal_id: num("deal_id"), project_id: num("project_id"), ...(search.get("kind") === "deposit" ? { kind: "deposit" as const } : {}) };
  return <DraftInvoice key={invoiceId ?? "new"} invoice={inv} settings={settings} prefill={prefill} />;
}

/* -------------------------------------------------------------------------- */
/* Draft editor                                                               */
/* -------------------------------------------------------------------------- */

function DraftInvoice({ invoice, settings, prefill }: { invoice: Invoice | null; settings: BillingContext; prefill: Partial<InvoiceDraft> }) {
  const { billing, company: seller, franchise } = settings;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const me = useAuth((s) => s.user);
  const isNew = !invoice;
  const readOnly = !can(me, "member");

  const [draft, setDraft] = useState<InvoiceDraft>(() =>
    invoice
      ? draftFromInvoice(invoice)
      : {
          kind: "invoice",
          title: "",
          company_id: null,
          contact_id: null,
          deal_id: null,
          project_id: null,
          due_date: inDays(Number(billing.payment_days) || 30),
          payment_terms: `Paiement à ${billing.payment_days} jours — ${billing.payment_methods}`,
          service_date: null,
          service_period_end: null,
          nature: billing.default_nature || "services",
          lines: [blankLine("item", billing.default_vat)],
          discount: 0,
          notes: "",
          terms: billing.invoice_terms ?? "",
          late_penalty_rate: billing.late_penalty_rate,
          early_payment_discount: billing.early_payment_discount,
          recovery_fee: Number(billing.recovery_fee) || 40,
          vat_mention: "",
          ...prefill,
        },
  );
  const [baseline, setBaseline] = useState(() => draftKey(draft));
  const [period, setPeriod] = useState(() => !!draft.service_period_end);
  const [dialog, setDialog] = useState<null | "pdf" | "issue">(null);
  const dirty = !readOnly && draftKey(draft) !== baseline;
  const patch = (p: Partial<InvoiceDraft>) => setDraft((d) => ({ ...d, ...p }));
  const totals = useMemo(() => computeTotals(draft.lines, draft.discount, { franchise, defaultVat: billing.default_vat }), [draft.lines, draft.discount, franchise, billing.default_vat]);
  const checks = useInvoiceChecks(invoice?.id, invoice?.updated_at);
  const company = useItem<Company>("companies", draft.company_id);
  const contact = useItem<Contact>("contacts", draft.contact_id);
  const credit = draft.kind === "credit_note";

  const setInvoice = (inv: Invoice) => {
    qc.setQueryData(keys.item("invoices", inv.id), inv);
    invalidate("invoices", "quotes", "payments");
  };

  const save = useMutation({
    mutationFn: () => (invoice ? api.patch<Invoice>(`/invoices/${invoice.id}`, payload(draft)) : api.post<Invoice>("/invoices", payload(draft))),
    onSuccess: (inv) => {
      setInvoice(inv);
      if (!invoice) {
        toast.success("Brouillon de facture créé", { description: "Le numéro définitif sera attribué à l'émission." });
        navigate(`/invoices/${inv.id}`, { replace: true });
        return;
      }
      const fresh = draftFromInvoice(inv);
      setDraft(fresh);
      setBaseline(draftKey(fresh));
      toast.success("Brouillon enregistré");
    },
    onError: toastError,
  });

  useLeaveGuard(dirty && !save.isPending);
  useSaveShortcut(() => (isNew || dirty) && !save.isPending && save.mutate(), !readOnly);

  const ensureSaved = async () => {
    if (!invoice) return null;
    if (!dirty) return invoice;
    try {
      return await save.mutateAsync();
    } catch {
      return null;
    }
  };
  const run = async (action: (inv: Invoice) => void | Promise<void>) => {
    const inv = await ensureSaved();
    if (inv) await action(inv);
  };

  const duplicate = () =>
    run(async (inv) => {
      try {
        const copy = await api.post<Invoice>(`/invoices/${inv.id}/duplicate`);
        invalidate("invoices");
        toast.success("Copie créée en brouillon");
        navigate(`/invoices/${copy.id}`);
      } catch (e) {
        toastError(e);
      }
    });

  const remove = async () => {
    if (!invoice) return;
    if (!(await confirm({ title: "Supprimer ce brouillon ?", description: "Un brouillon n'a pas encore de numéro : sa suppression n'a aucune incidence sur la numérotation.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/invoices/${invoice.id}`);
      setBaseline(draftKey(draft));
      invalidate("invoices");
      toast.success("Brouillon supprimé");
      navigate("/invoices");
    } catch (e) {
      toastError(e);
    }
  };

  const setDue = (days: number) => {
    const auto = /^Paiement (à réception|à \d+ jours)/.test(draft.payment_terms) || !draft.payment_terms.trim();
    patch({ due_date: inDays(days), ...(auto ? { payment_terms: `${days === 0 ? "Paiement à réception" : `Paiement à ${days} jours`} — ${billing.payment_methods}` } : {}) });
  };
  const dueIn = daysBetween(todayIso(), draft.due_date);
  const saveState: SaveState = readOnly ? "readonly" : save.isPending ? "saving" : isNew ? "new" : dirty ? "dirty" : "saved";
  const clientName = company.data?.name ?? contact.data?.full_name ?? invoice?.company?.name ?? invoice?.contact?.name;
  const errors = checks.data?.errors.length ?? 0;

  const actions = isNew ? (
    <>
      <Button variant="ghost" asChild>
        <Link to="/invoices">Annuler</Link>
      </Button>
      <Button variant="primary" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
        Enregistrer le brouillon
      </Button>
    </>
  ) : (
    <>
      {dirty && (
        <Button variant="glass" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
          Enregistrer
        </Button>
      )}
      <Button variant="glass" icon={<Eye className="size-4" />} onClick={() => run(() => setDialog("pdf"))}>
        Aperçu
      </Button>
      {!readOnly && (
        <Button variant="primary" icon={<StampIcon className="size-4" />} onClick={() => run(() => setDialog("issue"))}>
          {credit ? "Émettre l'avoir" : "Émettre la facture"}
        </Button>
      )}
      <Menu
        width={240}
        trigger={
          <Button variant="glass" aria-label="Plus d'actions">
            <MoreHorizontal className="size-4" />
          </Button>
        }
        items={[
          { label: "Télécharger l'aperçu PDF", icon: <Download className="size-4" />, onSelect: () => run((inv) => download(`/invoices/${inv.id}/pdf`, `brouillon-${inv.id}.pdf`).catch(toastError)) },
          { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: duplicate, disabled: readOnly },
          ...(readOnly ? [] : [{ separator: true, label: "" }, { label: "Supprimer le brouillon", icon: <Trash2 className="size-4" />, danger: true, onSelect: remove }]),
        ]}
      />
    </>
  );

  return (
    <div>
      <DocHeader
        back="/invoices"
        backLabel="Factures"
        title={isNew ? (credit ? "Nouvel avoir" : "Nouvelle facture") : `${KIND_TITLE[draft.kind]} — brouillon`}
        badges={
          <>
            <StatusBadge options={INVOICE_STATUS} value="draft" />
            <SaveIndicator state={saveState} savedAt={invoice?.updated_at} />
          </>
        }
        subtitle={
          <>
            {clientName ? <span className="font-medium text-fg">{clientName}</span> : <span className="text-fg-3">Client à choisir</span>}
            <span className="text-fg-3">·</span>
            <span className="tabular">{money(totals.total)} TTC</span>
            {invoice?.credit_for && (
              <Link to={`/invoices/${invoice.credit_for.id}`} className="inline-flex items-center gap-1 text-orange-600 hover:underline dark:text-orange-400">
                <FileMinus2 className="size-3.5" /> Avoir sur la facture {invoice.credit_for.name}
              </Link>
            )}
          </>
        }
        actions={actions}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PaperSheet>
          <div className="flex flex-col gap-6 @lg:flex-row @lg:items-start @lg:justify-between">
            <SellerBlock seller={seller} live />
            <DocHeading kind={KIND_TITLE[draft.kind]} placeholder="Numéro attribué à l'émission">
              <div>Date d'émission : à la validation</div>
              {!credit && draft.due_date && <div>Échéance : {date(draft.due_date)}</div>}
            </DocHeading>
          </div>

          {credit && invoice?.credit_for && (
            <div className="mt-6 flex items-center gap-2.5 rounded-[16px] bg-orange-500/[0.08] px-4 py-3 text-[13px] ring-1 ring-inset ring-orange-500/20">
              <FileMinus2 className="size-4 shrink-0 text-orange-500" />
              <span>
                Avoir rectificatif de la facture{" "}
                <Link to={`/invoices/${invoice.credit_for.id}`} className="font-semibold text-orange-700 hover:underline dark:text-orange-300">
                  {invoice.credit_for.name}
                </Link>{" "}
                — ajustez les montants (en négatif) puis émettez l'avoir.
              </span>
            </div>
          )}

          <div className="mt-8 grid gap-6 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div id="doc-buyer" className="rounded-[18px]">
              {readOnly ? <BuyerSnapshot title="Facturé à" buyer={{ name: clientName ?? undefined }} companyId={draft.company_id} /> : <BuyerEditor title="Facturé à" companyId={draft.company_id} contactId={draft.contact_id} onChange={patch} />}
            </div>
            <div className="grid content-start grid-cols-2 gap-x-3 gap-y-4">
              {!credit && (
                <MetaField label="Type de document" className="col-span-2">
                  <Segmented
                    value={draft.kind}
                    onChange={(kind) => !readOnly && patch({ kind })}
                    options={[
                      { value: "invoice" as Kind, label: "Facture" },
                      { value: "deposit" as Kind, label: "Facture d'acompte" },
                    ]}
                  />
                </MetaField>
              )}
              {!credit && (
                <div id="doc-due" className="col-span-2 rounded-[14px]">
                  <MetaField
                    label="Échéance"
                    hint={dueIn === null ? "Par défaut : selon vos conditions de paiement." : dueIn <= 0 ? "Payable à réception." : `${dueIn} jour${dueIn > 1 ? "s" : ""} après une émission aujourd'hui.`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <DateField value={draft.due_date} onChange={(v) => patch({ due_date: v })} disabled={readOnly} aria-label="Date d'échéance" className="w-[160px]" />
                      <div className="flex flex-wrap gap-1">
                        {DUE_PRESETS.map((p) => (
                          <button key={p.days} type="button" disabled={readOnly} onClick={() => setDue(p.days)} className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium transition", dueIn === p.days ? "bg-accent-soft text-accent" : "bg-black/[0.04] text-fg-2 hover:text-fg dark:bg-white/[0.06]")}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </MetaField>
                  {dueIn !== null && dueIn > 60 && (
                    <div className="mt-2 flex gap-2 rounded-[12px] bg-red-500/[0.08] px-3 py-2 text-[12px] leading-snug text-red-700 dark:text-red-300">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      Délai supérieur à 60 jours : au-delà du plafond légal entre professionnels (LME, art. L441-10 du Code de commerce).
                    </div>
                  )}
                </div>
              )}
              {!credit && (
                <MetaField label="Conditions de paiement" className="col-span-2">
                  <Input value={draft.payment_terms} onChange={(e) => patch({ payment_terms: e.target.value })} disabled={readOnly} placeholder={`Paiement à ${billing.payment_days} jours — ${billing.payment_methods}`} className="h-9 text-[13.5px]" />
                </MetaField>
              )}
              <MetaField
                label={period ? "Période de la prestation" : draft.nature === "goods" ? "Date de livraison" : "Date de la prestation"}
                className="col-span-2"
                hint={draft.service_date ? undefined : "Laissée vide, elle sera égale à la date d'émission."}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented
                    value={period ? "period" : "date"}
                    onChange={(v) => {
                      setPeriod(v === "period");
                      if (v === "date") patch({ service_period_end: null });
                    }}
                    options={[
                      { value: "date", label: "Date" },
                      { value: "period", label: "Période" },
                    ]}
                  />
                  <DateField value={draft.service_date} onChange={(v) => patch({ service_date: v })} disabled={readOnly} aria-label={period ? "Début de période" : "Date de prestation"} className="w-[150px]" />
                  {period && (
                    <>
                      <span className="text-[12.5px] text-fg-3">au</span>
                      <DateField value={draft.service_period_end} onChange={(v) => patch({ service_period_end: v })} disabled={readOnly} aria-label="Fin de période" className="w-[150px]" />
                    </>
                  )}
                </div>
              </MetaField>
              <MetaField label="Nature de l'opération" className="col-span-2">
                <Select options={NATURES} value={draft.nature} onChange={(v) => patch({ nature: v })} disabled={readOnly} className="[&_select]:h-9 [&_select]:text-[13.5px]" />
              </MetaField>
            </div>
          </div>

          <div className="mt-8">
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              disabled={readOnly}
              placeholder={credit ? "Objet de l'avoir" : "Objet de la facture — ex. Développement, sprint 4"}
              aria-label="Objet"
              className={cn(ghostBase, "-mx-2.5 h-12 w-[calc(100%+1.25rem)] text-[21px] font-semibold tracking-[-0.02em]")}
            />
          </div>

          <SheetSection title="Détail" className="mt-5">
            <div id="doc-lines" className="rounded-[18px]">
              {readOnly ? (
                <LinesReadOnly lines={draft.lines} franchise={franchise} defaultVat={billing.default_vat} />
              ) : (
                <LineItemsEditor lines={draft.lines} onChange={(lines) => patch({ lines })} franchise={franchise} defaultVat={billing.default_vat} aiBrief={credit ? null : [draft.title, clientName ? `pour ${clientName}` : ""].filter(Boolean).join(" ")} />
              )}
            </div>
          </SheetSection>

          <div className="mt-8 grid gap-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(290px,360px)]">
            <div className="space-y-5">
              <NotesBlock label="Notes" value={draft.notes} readOnly={readOnly} onChange={(notes) => patch({ notes })} placeholder="Référence de commande, message au client…" />
              <NotesBlock label="Conditions" value={draft.terms} readOnly={readOnly} onChange={(terms) => patch({ terms })} placeholder="Conditions particulières, modalités de règlement…" />
            </div>
            <TotalsCard totals={totals} franchise={franchise} discount={draft.discount} onDiscountChange={readOnly ? undefined : (discount) => patch({ discount })} totalLabel={credit ? "Total de l'avoir TTC" : "Total TTC"} />
          </div>

          <div className="mt-6">
            <InvoiceTermsEditor
              value={draft}
              onChange={patch}
              vatOnDebits={!!seller.vat_on_debits}
              franchise={franchise}
              credit={credit}
            />
          </div>
        </PaperSheet>

        <aside className="min-w-0 space-y-4">
          <LegalChecksPanel result={checks.data} loading={checks.isFetching} saved={!isNew} stale={dirty} companyId={draft.company_id} onRefresh={() => checks.refetch()} />
          {!isNew && !readOnly && (
            <Glass className="overflow-hidden p-4" glow>
              <div className="flex items-start gap-3">
                <span className="btn-primary flex size-9 shrink-0 items-center justify-center rounded-[12px]">
                  <StampIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{credit ? "Émettre l'avoir" : "Émettre la facture"}</div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">Numéro définitif, verrouillage et Factur-X. Ensuite, toute correction passera par un avoir.</p>
                </div>
              </div>
              <Button variant="primary" className="mt-3 w-full" icon={<Lock className="size-4" />} onClick={() => run(() => setDialog("issue"))}>
                {errors > 0 ? `${errors} point${errors > 1 ? "s" : ""} à corriger` : "Émettre…"}
              </Button>
            </Glass>
          )}
          <Panel title="Suivi" icon={<ReceiptText className="size-4" />}>
            <StatusTimeline steps={invoiceSteps(invoice)} />
          </Panel>
          {invoice && <LinkedDocs invoice={invoice} />}
        </aside>
      </div>

      <UnsavedBar
        visible={dirty && !isNew}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={() => {
          if (!invoice) return;
          const fresh = draftFromInvoice(invoice);
          setDraft(fresh);
          setBaseline(draftKey(fresh));
          setPeriod(!!fresh.service_period_end);
        }}
      />

      {invoice && (
        <>
          <PdfPreview open={dialog === "pdf"} onOpenChange={(o) => setDialog(o ? "pdf" : null)} path={`/invoices/${invoice.id}/pdf`} version={invoice.updated_at} title="Aperçu du brouillon" filename={`brouillon-${invoice.id}.pdf`} note="Aperçu filigrané « BROUILLON » : le numéro et le format Factur-X sont générés à l'émission." />
          <IssueDialog
            open={dialog === "issue"}
            onOpenChange={(o) => setDialog(o ? "issue" : null)}
            invoice={{ ...invoice, total: totals.total }}
            checks={checks.data}
            prefix={credit ? billing.credit_prefix : billing.invoice_prefix}
            onIssued={(issued: IssuedInvoice) => {
              setBaseline(draftKey(draft));
              setInvoice(issued);
              if (issued.warnings?.length) toast.warning("Points d'attention à l'émission", { description: issued.warnings.join("\n") });
            }}
          />
        </>
      )}
    </div>
  );
}

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

function IssuedInvoice({ invoice, settings }: { invoice: Invoice; settings: BillingContext }) {
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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Download,
  Eye,
  FileMinus2,
  Lock,
  MoreHorizontal,
  ReceiptText,
  Save,
  Stamp as StampIcon,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { DocHeader, SaveIndicator, type SaveState } from "@/components/billing/DocHeader";
import { DateField, ghostBase } from "@/components/billing/fields";
import { useBillingSettings, useLeaveGuard, useSaveShortcut, type BillingContext } from "@/components/billing/hooks";
import { invoiceSteps, IssuedInvoiceView, KIND_TITLE, LinkedDocs, type InvoiceKind } from "@/components/billing/InvoiceIssued";
import { InvoiceTermsEditor, type TermsValue } from "@/components/billing/InvoiceTerms";
import { IssueDialog, type IssuedInvoice } from "@/components/billing/IssueDialog";
import { LegalChecksPanel, useInvoiceChecks } from "@/components/billing/LegalChecks";
import { LineItemsEditor, LinesReadOnly } from "@/components/billing/LineItemsEditor";
import { blankLine, comparableLines, computeTotals, daysBetween, inDays, lineKind, linesPayload, todayIso, withIds } from "@/components/billing/lib";
import { BuyerEditor, BuyerSnapshot, DocHeading, MetaField, NotesBlock, PaperSheet, SellerBlock, SheetSection } from "@/components/billing/Paper";
import { PdfPreview } from "@/components/billing/PdfPreview";
import { StatusTimeline } from "@/components/billing/StatusTimeline";
import { TotalsCard } from "@/components/billing/TotalsCard";
import { UnsavedBar } from "@/components/billing/UnsavedBar";
import { Panel } from "@/components/data/blocks";
import { NotFoundRecord } from "@/components/entity/EntityBlocks";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Skeleton, StatusBadge } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/fields";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { INVOICE_STATUS, NATURES } from "@/lib/constants";
import { date, money } from "@/lib/format";
import { keys, toastError, useInvalidate, useItem } from "@/lib/hooks";
import type { Company, Contact, Invoice, LineItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

/* -------------------------------------------------------------------------- */
/* Draft                                                                      */
/* -------------------------------------------------------------------------- */

interface InvoiceDraft extends TermsValue {
  kind: InvoiceKind;
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
  if (inv?.locked) return <IssuedInvoiceView key={inv.id} invoice={inv} settings={settings} />;

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
                      { value: "invoice" as InvoiceKind, label: "Facture" },
                      { value: "deposit" as InvoiceKind, label: "Facture d'acompte" },
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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarX2,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Link2,
  Lock,
  MailCheck,
  MoreHorizontal,
  PenLine,
  ReceiptText,
  Save,
  Send,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ConvertDialog } from "@/components/billing/ConvertDialog";
import { DocHeader, SaveIndicator, type SaveState } from "@/components/billing/DocHeader";
import { DateField, ghostBase, NumField } from "@/components/billing/fields";
import { useBillingSettings, useLeaveGuard, useSaveShortcut, type BillingContext } from "@/components/billing/hooks";
import { LineItemsEditor, LinesReadOnly } from "@/components/billing/LineItemsEditor";
import {
  blankLine,
  comparableLines,
  computeTotals,
  copyText,
  daysBetween,
  formatDecimal,
  inDays,
  lineKind,
  linesPayload,
  quoteDisplayStatus,
  quoteEmail,
  quotePublicUrl,
  round2,
  shortHash,
  todayIso,
  withIds,
} from "@/components/billing/lib";
import { BuyerEditor, BuyerSnapshot, DocHeading, MetaField, NotesBlock, PaperSheet, SellerBlock, SheetSection, SignatureBox, Stamp } from "@/components/billing/Paper";
import { PdfPreview } from "@/components/billing/PdfPreview";
import { SendDialog } from "@/components/billing/SendDialog";
import { StatusTimeline, type TimelineStep } from "@/components/billing/StatusTimeline";
import { TotalRow, TotalsCard } from "@/components/billing/TotalsCard";
import { UnsavedBar } from "@/components/billing/UnsavedBar";
import { Panel } from "@/components/data/blocks";
import { NotFoundRecord, RelatedRow } from "@/components/entity/EntityBlocks";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Skeleton, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Select } from "@/components/ui/fields";
import { Menu, useConfirm, type MenuItem } from "@/components/ui/overlay";
import { api, download } from "@/lib/api";
import { INVOICE_KIND, INVOICE_STATUS, labelOf, NATURES, QUOTE_STATUS } from "@/lib/constants";
import { date, dateTime, money, relative } from "@/lib/format";
import { keys, toastError, useInvalidate, useItem, useList } from "@/lib/hooks";
import type { Company, Contact, Deal, Invoice, LineItem, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

/* -------------------------------------------------------------------------- */
/* Draft                                                                      */
/* -------------------------------------------------------------------------- */

interface QuoteDraft {
  title: string;
  company_id: number | null;
  contact_id: number | null;
  deal_id: number | null;
  issue_date: string;
  valid_until: string | null;
  nature: string;
  lines: LineItem[];
  discount: number;
  deposit_percent: number | null;
  notes: string;
  terms: string;
}

const LOCKED_STATUSES = ["accepted", "invoiced", "declined"];

function draftFromQuote(q: Quote): QuoteDraft {
  return {
    title: q.title ?? "",
    company_id: q.company_id ?? null,
    contact_id: q.contact_id ?? null,
    deal_id: q.deal_id ?? null,
    issue_date: q.issue_date,
    valid_until: q.valid_until ?? null,
    nature: q.nature || "services",
    lines: withIds(q.lines),
    discount: q.discount ?? 0,
    deposit_percent: q.deposit_percent ?? null,
    notes: q.notes ?? "",
    terms: q.terms ?? "",
  };
}

const draftKey = (d: QuoteDraft) => JSON.stringify({ ...d, lines: comparableLines(d.lines) });

const isBlank = (l: LineItem) => !l.description?.trim() && (lineKind(l) !== "item" || (!l.unit_price && !l.product_id));

function payload(d: QuoteDraft) {
  return {
    title: d.title.trim() || null,
    company_id: d.company_id,
    contact_id: d.contact_id,
    deal_id: d.deal_id,
    issue_date: d.issue_date,
    valid_until: d.valid_until || null,
    nature: d.nature,
    lines: linesPayload(d.lines.filter((l) => !isBlank(l))),
    discount: d.discount || 0,
    deposit_percent: d.deposit_percent || null,
    notes: d.notes.trim() || null,
    terms: d.terms.trim() || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Status frieze                                                              */
/* -------------------------------------------------------------------------- */

function quoteSteps(q: Quote | null): TimelineStep[] {
  if (!q)
    return [
      { key: "draft", label: "Brouillon", icon: <FilePlus2 />, state: "current", detail: "Le numéro est attribué au premier enregistrement." },
      { key: "sent", label: "Envoi au client", icon: <Send />, state: "todo" },
      { key: "signed", label: "Signature en ligne", icon: <PenLine />, state: "todo" },
    ];
  const display = quoteDisplayStatus(q);
  const decided = !!q.accepted_at || !!q.declined_at;
  const raw: (Omit<TimelineStep, "state"> & { done: boolean; tone?: "error" | "warn" })[] = [
    { key: "created", label: "Créé", icon: <FilePlus2 />, done: true, date: q.created_at, detail: q.owner ? `par ${q.owner.name}` : undefined },
    { key: "sent", label: "Envoyé", icon: <Send />, done: !!q.sent_at || q.status !== "draft", date: q.sent_at, detail: q.sent_at || q.status !== "draft" ? undefined : "Pas encore envoyé au client" },
    { key: "viewed", label: "Consulté", icon: <Eye />, done: !!q.viewed_at || decided, date: q.viewed_at, detail: q.viewed_at ? "Ouvert via le lien sécurisé" : decided ? undefined : q.status === "invoiced" ? "Non consulté en ligne" : "En attente d'ouverture du lien" },
  ];
  if (q.accepted_at)
    raw.push({
      key: "signed",
      label: "Signé",
      icon: <PenLine />,
      done: true,
      date: q.accepted_at,
      detail: (
        <>
          par <b className="font-semibold text-fg">{q.signed_by ?? "le client"}</b>
          {q.signer_email ? ` · ${q.signer_email}` : ""}
          {q.signature_hash && (
            <button type="button" onClick={() => copyText(q.signature_hash ?? "", "Empreinte de signature copiée")} className="mt-0.5 block font-mono text-[11px] text-fg-3 hover:text-fg" title="Copier l'empreinte SHA-256">
              SHA-256 {shortHash(q.signature_hash, 10, 6)}
            </button>
          )}
        </>
      ),
    });
  else if (q.declined_at) raw.push({ key: "declined", label: "Refusé", icon: <X />, done: true, tone: "error", date: q.declined_at, detail: "Le client a décliné la proposition." });
  else if (display === "expired") raw.push({ key: "expired", label: "Expiré", icon: <CalendarX2 />, done: true, tone: "warn", detail: `Validité dépassée depuis le ${date(q.valid_until)} — relancez ou dupliquez.` });
  else raw.push({ key: "signed", label: "Signature", icon: <PenLine />, done: false, detail: q.status === "invoiced" ? "Facturé sans signature en ligne" : q.valid_until ? `Valable jusqu'au ${date(q.valid_until)}` : undefined });
  if (q.status === "invoiced" || q.invoice_id)
    raw.push({
      key: "invoiced",
      label: "Facturé",
      icon: <ReceiptText />,
      done: true,
      detail: q.invoice_id ? (
        <Link to={`/invoices/${q.invoice_id}`} className="font-medium text-accent hover:underline">
          Voir la facture
        </Link>
      ) : undefined,
    });
  // Once the quote is closed (signed, refused, expired, invoiced) nothing is "in progress" any more.
  const closed = decided || display === "expired" || q.status === "invoiced";
  const firstOpen = closed ? -1 : raw.findIndex((s) => !s.done);
  return raw.map(({ done, tone, ...s }, i) => ({ ...s, state: tone ?? (done ? "done" : i === firstOpen ? "current" : "todo") }));
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
          <Skeleton className="h-[260px] rounded-[22px]" />
          <Skeleton className="h-[160px] rounded-[22px]" />
        </div>
      </div>
    </div>
  );
}

export default function QuoteEditor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const isNew = id === "new";
  const quoteId = isNew ? null : Number(id);
  const settings = useBillingSettings();
  const quote = useItem<Quote>("quotes", quoteId);
  const dealId = isNew ? Number(search.get("deal_id")) || null : null;
  const deal = useItem<Deal>("deals", dealId);

  if (quote.error) return <NotFoundRecord label="Devis" back="/quotes" />;
  if (!settings.ready || (!isNew && !quote.data) || (dealId && deal.isLoading)) return <EditorSkeleton />;

  const prefill: Partial<QuoteDraft> = {
    company_id: Number(search.get("company_id")) || deal.data?.company_id || null,
    contact_id: Number(search.get("contact_id")) || deal.data?.contact_id || null,
    deal_id: dealId,
    title: deal.data?.title ?? "",
    ...(deal.data?.products?.length ? { lines: withIds(deal.data.products) } : {}),
  };
  return <QuoteWorkspace key={quoteId ?? "new"} quote={quote.data ?? null} settings={settings} prefill={prefill} />;
}

function QuoteWorkspace({ quote, settings, prefill }: { quote: Quote | null; settings: BillingContext; prefill: Partial<QuoteDraft> }) {
  const { billing, company: sellerSettings, franchise } = settings;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const me = useAuth((s) => s.user);
  const isNew = !quote;

  const [draft, setDraft] = useState<QuoteDraft>(() =>
    quote
      ? draftFromQuote(quote)
      : {
          title: "",
          company_id: null,
          contact_id: null,
          deal_id: null,
          issue_date: todayIso(),
          valid_until: inDays(Number(billing.quote_validity_days) || 30),
          nature: billing.default_nature || "services",
          lines: [blankLine("item", billing.default_vat)],
          discount: 0,
          deposit_percent: null,
          notes: "",
          terms: billing.quote_terms ?? "",
          ...prefill,
        },
  );
  const [baseline, setBaseline] = useState(() => draftKey(draft));
  const [dialog, setDialog] = useState<null | "pdf" | "send" | "convert">(null);

  const status = quote?.status ?? "draft";
  const display = quote ? quoteDisplayStatus(quote) : "draft";
  const locked = LOCKED_STATUSES.includes(status);
  const readOnly = locked || !can(me, "member");

  // The quote may get signed (or invoiced) while it is open: drop local edits and show the signed version.
  const [lastStatus, setLastStatus] = useState(status);
  if (status !== lastStatus) {
    setLastStatus(status);
    if (locked && quote) {
      const fresh = draftFromQuote(quote);
      setDraft(fresh);
      setBaseline(draftKey(fresh));
    }
  }

  const dirty = !readOnly && draftKey(draft) !== baseline;
  const patch = (p: Partial<QuoteDraft>) => setDraft((d) => ({ ...d, ...p }));
  const totals = useMemo(() => computeTotals(draft.lines, draft.discount, { franchise, defaultVat: billing.default_vat }), [draft.lines, draft.discount, franchise, billing.default_vat]);

  const contact = useItem<Contact>("contacts", draft.contact_id);
  const company = useItem<Company>("companies", draft.company_id);
  const linked = useList<Invoice>("invoices", { quote_id: quote?.id, sort: "issue_date", limit: 50 }, { enabled: !!quote });
  const linkedInvoices = linked.data?.items ?? [];

  const setQuote = (q: Quote) => {
    qc.setQueryData(keys.item("quotes", q.id), q);
    invalidate("quotes", "deals");
  };

  const save = useMutation({
    mutationFn: () => (quote ? api.patch<Quote>(`/quotes/${quote.id}`, payload(draft)) : api.post<Quote>("/quotes", payload(draft))),
    onSuccess: (q) => {
      setQuote(q);
      if (!quote) {
        toast.success(`Devis ${q.number} créé`);
        navigate(`/quotes/${q.id}`, { replace: true });
        return;
      }
      const fresh = draftFromQuote(q);
      setDraft(fresh);
      setBaseline(draftKey(fresh));
      toast.success("Devis enregistré");
    },
    onError: toastError,
  });

  useLeaveGuard(dirty && !save.isPending);
  useSaveShortcut(() => (isNew || dirty) && !save.isPending && save.mutate(), !readOnly);

  /** Save pending edits before an action that relies on the stored quote. */
  const ensureSaved = async (): Promise<Quote | null> => {
    if (!quote) return null;
    if (!dirty) return quote;
    try {
      return await save.mutateAsync();
    } catch {
      return null;
    }
  };

  const run = async (action: (q: Quote) => Promise<void> | void) => {
    const q = await ensureSaved();
    if (q) await action(q);
  };

  const markSent = async (q: Quote, silent = false) => {
    try {
      const updated = await api.post<Quote>(`/quotes/${q.id}/mark-sent`);
      setQuote(updated);
      if (!silent) toast.success("Devis marqué comme envoyé", { description: "Le lien de signature est désormais actif." });
      return updated;
    } catch (e) {
      toastError(e);
      return null;
    }
  };

  const copyLink = (q: Quote) =>
    run(async () => {
      if (q.status === "draft") {
        const ok = await confirm({ title: "Activer le lien de signature ?", description: "Un brouillon n'est pas accessible en ligne. Le devis sera marqué comme envoyé (sans email) et ses identités figées, puis le lien sera copié.", confirmLabel: "Marquer envoyé et copier" });
        if (!ok || !(await markSent(q, true))) return;
      }
      await copyText(quotePublicUrl(q.public_token), "Lien de signature copié", "Le client peut consulter et signer le devis en ligne.");
    });

  const duplicate = (q: Quote) =>
    run(async () => {
      try {
        const copy = await api.post<Quote>(`/quotes/${q.id}/duplicate`);
        invalidate("quotes");
        toast.success(`Copie créée : ${copy.number}`);
        navigate(`/quotes/${copy.id}`);
      } catch (e) {
        toastError(e);
      }
    });

  const remove = async (q: Quote) => {
    if (!(await confirm({ title: `Supprimer le brouillon ${q.number} ?`, description: "Le devis sera définitivement supprimé.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/quotes/${q.id}`);
      setBaseline(draftKey(draft));
      invalidate("quotes");
      toast.success("Devis supprimé");
      navigate("/quotes");
    } catch (e) {
      toastError(e);
    }
  };

  /* --------------------------------- header -------------------------------- */

  const saveState: SaveState = readOnly ? "readonly" : save.isPending ? "saving" : isNew ? "new" : dirty ? "dirty" : "saved";
  const clientName = company.data?.name ?? quote?.company?.name ?? contact.data?.full_name ?? quote?.contact?.name;
  const canConvert = !!quote && can(me, "member") && !["declined", "invoiced"].includes(status) && display !== "expired";

  const menuItems: MenuItem[] = quote
    ? [
        ...(status === "draft" && !readOnly ? [{ label: "Marquer comme envoyé", icon: <MailCheck className="size-4" />, onSelect: () => run((q) => void markSent(q)) }] : []),
        { label: "Copier le lien de signature", icon: <Link2 className="size-4" />, onSelect: () => copyLink(quote) },
        { label: "Télécharger le PDF", icon: <Download className="size-4" />, onSelect: () => run((q) => download(`/quotes/${q.id}/pdf`, `Devis-${q.number}.pdf`).catch(toastError)) },
        { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: () => duplicate(quote), disabled: !can(me, "member") },
        ...(canConvert && status !== "accepted" ? [{ label: "Convertir en facture", icon: <ReceiptText className="size-4" />, onSelect: () => run(() => setDialog("convert")) }] : []),
        ...(status === "draft" && !readOnly ? [{ separator: true, label: "" }, { label: "Supprimer le brouillon", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(quote) }] : []),
      ]
    : [];

  const actions = isNew ? (
    <>
      <Button variant="ghost" asChild>
        <Link to="/quotes">Annuler</Link>
      </Button>
      <Button variant="primary" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
        Créer le devis
      </Button>
    </>
  ) : (
    <>
      {dirty && (
        <Button variant="primary" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
          Enregistrer
        </Button>
      )}
      {status === "accepted" && canConvert && (
        <Button variant="primary" icon={<ReceiptText className="size-4" />} onClick={() => setDialog("convert")}>
          Convertir en facture
        </Button>
      )}
      {status === "invoiced" && quote?.invoice_id && (
        <Button variant="primary" asChild>
          <Link to={`/invoices/${quote.invoice_id}`}>
            <ReceiptText className="size-4" /> Voir la facture
          </Link>
        </Button>
      )}
      <Button variant="glass" icon={<Eye className="size-4" />} onClick={() => run(() => setDialog("pdf"))}>
        Aperçu
      </Button>
      {!locked && can(me, "member") && (
        <Button variant={dirty || status !== "draft" ? "glass" : "primary"} icon={<Send className="size-4" />} onClick={() => run(() => setDialog("send"))}>
          {status === "draft" ? "Envoyer" : "Renvoyer"}
        </Button>
      )}
      <Menu
        trigger={
          <Button variant="glass" aria-label="Plus d'actions">
            <MoreHorizontal className="size-4" />
          </Button>
        }
        items={menuItems}
        width={250}
      />
    </>
  );

  /* -------------------------------- document ------------------------------- */

  const frozen = !!quote && status !== "draft" && !!quote.seller && Object.keys(quote.seller).length > 0;
  const validityDays = daysBetween(draft.issue_date, draft.valid_until);
  const depositAmount = draft.deposit_percent ? round2((totals.total * draft.deposit_percent) / 100) : 0;
  const stamp = status === "accepted" ? <Stamp label="Signé" sub={quote?.accepted_at ? date(quote.accepted_at) : undefined} /> : status === "invoiced" ? <Stamp label="Facturé" tone="indigo" /> : status === "declined" ? <Stamp label="Refusé" tone="red" /> : display === "expired" ? <Stamp label="Expiré" tone="orange" /> : null;

  return (
    <div>
      <DocHeader
        back="/quotes"
        backLabel="Devis"
        title={quote ? quote.number : "Nouveau devis"}
        badges={
          <>
            <StatusBadge options={QUOTE_STATUS} value={display} />
            {readOnly && quote && (
              <Badge tone="gray">
                <Lock className="size-3" /> Lecture seule
              </Badge>
            )}
            <SaveIndicator state={saveState} savedAt={quote?.updated_at} />
          </>
        }
        subtitle={
          <>
            {clientName ? <span className="font-medium text-fg">{clientName}</span> : <span className="text-fg-3">Client à choisir</span>}
            <span className="text-fg-3">·</span>
            <span className="tabular">{money(totals.total)} TTC</span>
            {quote?.deal && (
              <Link to={`/deals/${quote.deal.id}`} className="inline-flex items-center gap-1 text-fg-3 hover:text-accent">
                <Target className="size-3.5" /> {quote.deal.name}
              </Link>
            )}
          </>
        }
        actions={actions}
      />

      {quote && !locked && status !== "draft" && dirty && (
        <div className="mb-4 rounded-[16px] bg-sky-500/10 px-4 py-2.5 text-[12.5px] text-sky-800 dark:text-sky-200">
          Ce devis a été envoyé{quote.sent_at ? ` le ${date(quote.sent_at)}` : ""} : une fois enregistrées, vos modifications seront visibles sur le lien de signature. Pensez à prévenir le client.
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PaperSheet>
          <div className="flex flex-col gap-6 @lg:flex-row @lg:items-start @lg:justify-between">
            <SellerBlock seller={frozen && quote ? quote.seller : sellerSettings} live={!frozen} />
            <DocHeading kind="Devis" number={quote?.number} placeholder="Numéro attribué à l'enregistrement" stamp={stamp}>
              <div>Établi le {date(draft.issue_date)}</div>
              {draft.valid_until && <div>Valable jusqu'au {date(draft.valid_until)}</div>}
            </DocHeading>
          </div>

          <div className="mt-8 grid gap-6 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div id="doc-buyer" className="rounded-[18px]">
              {readOnly && quote ? (
                <BuyerSnapshot title="Destinataire" buyer={quote.buyer && Object.keys(quote.buyer).length ? quote.buyer : { name: quote.company?.name ?? quote.contact?.name }} companyId={quote.company_id} />
              ) : (
                <BuyerEditor title="Destinataire" companyId={draft.company_id} contactId={draft.contact_id} onChange={patch} />
              )}
            </div>
            <div className="grid content-start grid-cols-2 gap-x-3 gap-y-4">
              {readOnly ? (
                <>
                  <MetaField label="Date du devis">
                    <div className="text-[13.5px] tabular">{date(draft.issue_date)}</div>
                  </MetaField>
                  <MetaField label="Valable jusqu'au">
                    <div className={cn("text-[13.5px] tabular", display === "expired" && "font-medium text-red-500")}>{date(draft.valid_until)}</div>
                  </MetaField>
                  <MetaField label="Nature de l'opération" className="col-span-2">
                    <div className="text-[13.5px]">{labelOf(NATURES, draft.nature)}</div>
                  </MetaField>
                </>
              ) : (
                <>
                  <MetaField label="Date du devis">
                    <DateField value={draft.issue_date} onChange={(v) => v && patch({ issue_date: v })} aria-label="Date du devis" />
                  </MetaField>
                  <MetaField label="Valable jusqu'au" hint={validityDays !== null ? `${validityDays} jour${Math.abs(validityDays) > 1 ? "s" : ""} de validité` : undefined}>
                    <DateField value={draft.valid_until} onChange={(v) => patch({ valid_until: v })} aria-label="Date de fin de validité" />
                  </MetaField>
                  <div className="col-span-2 -mt-2 flex flex-wrap gap-1">
                    {[15, 30, 45, 60, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => patch({ valid_until: inDays(d, draft.issue_date) })}
                        className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium transition", validityDays === d ? "bg-accent-soft text-accent" : "bg-black/[0.04] text-fg-2 hover:text-fg dark:bg-white/[0.06]")}
                      >
                        {d} j
                      </button>
                    ))}
                  </div>
                  <MetaField label="Nature de l'opération" className="col-span-2" hint="Mention obligatoire de la réforme de la facturation électronique.">
                    <Select options={NATURES} value={draft.nature} onChange={(v) => patch({ nature: v })} className="[&_select]:h-9 [&_select]:text-[13.5px]" />
                  </MetaField>
                </>
              )}
            </div>
          </div>

          <div className="mt-8">
            {readOnly ? (
              <h2 className="text-[21px] font-semibold tracking-[-0.02em]">{draft.title || <span className="text-fg-3">Sans titre</span>}</h2>
            ) : (
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Objet du devis — ex. Refonte du site e-commerce" aria-label="Objet du devis" className={cn(ghostBase, "-mx-2.5 h-12 w-[calc(100%+1.25rem)] text-[21px] font-semibold tracking-[-0.02em]")} />
            )}
          </div>

          <SheetSection title="Détail de la proposition" className="mt-5">
            <div id="doc-lines" className="rounded-[18px]">
              {readOnly ? (
                <LinesReadOnly lines={draft.lines} franchise={franchise} defaultVat={billing.default_vat} />
              ) : (
                <LineItemsEditor lines={draft.lines} onChange={(lines) => patch({ lines })} franchise={franchise} defaultVat={billing.default_vat} aiBrief={[draft.title, clientName ? `pour ${clientName}` : ""].filter(Boolean).join(" ")} />
              )}
            </div>
          </SheetSection>

          <div className="mt-8 grid gap-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(290px,360px)]">
            <div className="space-y-5">
              <NotesBlock label="Notes" value={draft.notes} readOnly={readOnly} onChange={(notes) => patch({ notes })} placeholder="Message au client, contexte, planning prévisionnel…" />
              <NotesBlock label="Conditions" value={draft.terms} readOnly={readOnly} onChange={(terms) => patch({ terms })} placeholder="Conditions de règlement, validité, propriété intellectuelle…" />
            </div>
            <TotalsCard totals={totals} franchise={franchise} discount={draft.discount} onDiscountChange={readOnly ? undefined : (discount) => patch({ discount })}>
              {readOnly ? (
                draft.deposit_percent ? <TotalRow label={`Acompte à la commande (${formatDecimal(draft.deposit_percent)} %)`} value={money(depositAmount)} /> : <TotalRow label="Acompte à la commande" value="—" tone="muted" />
              ) : (
                <div className="flex items-center justify-between gap-3 py-1 text-[13.5px]">
                  <span className="flex items-center gap-2 text-fg-2">
                    Acompte
                    <NumField value={draft.deposit_percent} onChange={(v) => patch({ deposit_percent: v ? Math.min(100, Math.max(0, v)) : null })} placeholder="0" suffix="%" aria-label="Acompte à la commande en pourcentage" className="w-[82px]" />
                  </span>
                  <span className={cn("tabular", draft.deposit_percent ? "text-fg" : "text-fg-3")}>{draft.deposit_percent ? money(depositAmount) : "—"}</span>
                </div>
              )}
            </TotalsCard>
          </div>

          <div className="mt-8">
            <SignatureBox proof={quote ?? {}} declinedAt={quote?.declined_at} />
          </div>
        </PaperSheet>

        <aside className="min-w-0 space-y-4">
          <Panel title="Suivi" icon={<FileText className="size-4" />}>
            <StatusTimeline steps={quoteSteps(quote)} />
          </Panel>

          {quote && (
            <Panel title="Facturation" icon={<ReceiptText className="size-4" />}>
              {linked.isLoading ? (
                <Skeleton className="h-12 rounded-[14px]" />
              ) : linkedInvoices.length === 0 ? (
                <p className="text-[12.5px] text-fg-3">{status === "accepted" ? "Devis signé : créez la facture ou une facture d'acompte." : "Aucune facture liée à ce devis."}</p>
              ) : (
                <div className="-mx-2.5 space-y-0.5">
                  {linkedInvoices.map((inv) => (
                    <RelatedRow
                      key={inv.id}
                      to={`/invoices/${inv.id}`}
                      icon={<ReceiptText className="size-4 shrink-0 text-fg-3" />}
                      title={inv.number || "Brouillon"}
                      meta={`${labelOf(INVOICE_KIND, inv.kind)} · ${money(inv.total)}`}
                      right={<StatusBadge options={INVOICE_STATUS} value={inv.status} size="xs" />}
                    />
                  ))}
                </div>
              )}
              {canConvert && (
                <Button variant={status === "accepted" ? "primary" : "glass"} className="mt-3 w-full" icon={<ReceiptText className="size-4" />} onClick={() => run(() => setDialog("convert"))}>
                  {linkedInvoices.some((i) => i.kind === "deposit") ? "Facturer le solde" : "Convertir en facture"}
                </Button>
              )}
            </Panel>
          )}

          <Panel title="Rattachement" icon={<Target className="size-4" />}>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11.5px] font-medium text-fg-3">Opportunité</div>
                {readOnly ? (
                  quote?.deal ? (
                    <Link to={`/deals/${quote.deal.id}`} className="text-[13.5px] font-medium hover:text-accent">
                      {quote.deal.name}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-fg-3">Aucune</span>
                  )
                ) : (
                  <EntitySelect resource="deals" value={draft.deal_id} onChange={(id) => patch({ deal_id: id })} params={draft.company_id ? { company_id: draft.company_id } : undefined} placeholder="Lier à une opportunité" />
                )}
              </div>
              {quote?.owner && (
                <div className="flex items-center gap-2 text-[12.5px] text-fg-2">
                  <Avatar name={quote.owner.name} color={(quote.owner.color as string) ?? undefined} size={22} />
                  Responsable : <span className="font-medium text-fg">{quote.owner.name}</span>
                </div>
              )}
              {quote && (
                <p className="text-[11.5px] text-fg-3">
                  Créé {relative(quote.created_at)} · modifié le {dateTime(quote.updated_at)}
                </p>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <UnsavedBar
        visible={dirty && !isNew}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={() => {
          if (!quote) return;
          const fresh = draftFromQuote(quote);
          setDraft(fresh);
          setBaseline(draftKey(fresh));
        }}
      />

      {quote && (
        <>
          <PdfPreview open={dialog === "pdf"} onOpenChange={(o) => setDialog(o ? "pdf" : null)} path={`/quotes/${quote.id}/pdf`} version={quote.updated_at} title={`Aperçu — Devis ${quote.number}`} filename={`Devis-${quote.number}.pdf`} note="Rendu PDF officiel, identique à la pièce jointe envoyée au client." />
          <SendDialog<Quote>
            open={dialog === "send"}
            onOpenChange={(o) => setDialog(o ? "send" : null)}
            endpoint={`/quotes/${quote.id}/send`}
            title={`Envoyer le devis ${quote.number}`}
            description="Le client reçoit le PDF et un lien sécurisé pour consulter et signer en ligne."
            attachment={`Devis-${quote.number}.pdf joint automatiquement`}
            defaults={quoteEmail({ ...quote, total: totals.total }, { to: contact.data?.email ?? company.data?.email, firstName: contact.data?.first_name, sender: me?.name ?? "", company: sellerSettings.name, publicUrl: settings.publicUrl })}
            onSent={(q) => {
              setQuote(q);
              toast.success("Devis envoyé", { description: "Il apparaît dans la chronologie du client." });
            }}
          />
          <ConvertDialog open={dialog === "convert"} onOpenChange={(o) => setDialog(o ? "convert" : null)} quote={quote} depositsIssued={linkedInvoices.filter((i) => i.kind === "deposit" && i.locked)} onConverted={(inv) => navigate(`/invoices/${inv.id}`)} />
        </>
      )}
    </div>
  );
}

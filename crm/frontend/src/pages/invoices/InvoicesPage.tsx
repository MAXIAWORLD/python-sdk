import { subMonths } from "date-fns";
import { AlertTriangle, Banknote, Copy, Download, FileCode2, Fingerprint, MoreHorizontal, Plus, Receipt, ReceiptText, Timer, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useBillingSettings } from "@/components/billing/hooks";
import { IntegrityDialog } from "@/components/billing/IntegrityDialog";
import { copyText, daysBetween, inDays, invoicePublicUrl, isOutstanding, lateDays, OUTSTANDING_STATUSES, todayIso } from "@/components/billing/lib";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader, StatTile } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Badge, CompanyLogo, EmptyState, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { SearchInput, Select } from "@/components/ui/fields";
import { Menu, useConfirm, type MenuItem } from "@/components/ui/overlay";
import { api, download } from "@/lib/api";
import { findOption, INVOICE_KIND, INVOICE_STATUS } from "@/lib/constants";
import { date, isoDate, money, moneyShort, number, toDate } from "@/lib/format";
import { toastError, useInvalidate, useList, type Params } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Invoice, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-issue_date", label: "Plus récentes" },
  { value: "due_date", label: "Échéance la plus proche" },
  { value: "-total", label: "Montant décroissant" },
  { value: "-number", label: "Numéro" },
];

const OPEN = OUTSTANDING_STATUSES.join(",");

/** "unpaid" and "overdue" are computed views (overdue = due date passed with a balance left, like the dashboard). */
function queryParams(params: Params): Params {
  const { status, ...rest } = params;
  if (status === "unpaid") return { ...rest, status__in: OPEN, kind__ne: "credit_note" };
  if (status === "overdue") return { ...rest, status__in: OPEN, kind__ne: "credit_note", due_date__lt: todayIso() };
  return status ? { ...rest, status } : rest;
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function useInvoiceStats() {
  const today = todayIso();
  const sixMonthsStart = `${isoDate(subMonths(new Date(), 5)).slice(0, 8)}01`;
  const open = useList<Invoice>("invoices", { status__in: OPEN, kind__ne: "credit_note", limit: 1000, expand: 0 });
  const paid = useList<Invoice>("invoices", { status: "paid", issue_date__gte: inDays(-420), limit: 1000, expand: 0 });
  const payments = useList<Payment>("payments", { date__gte: sixMonthsStart, sort: "date", limit: 1000 });
  return useMemo(() => {
    const now = toDate(today) ?? new Date();
    const openRows = open.data?.items ?? [];
    const overdue = openRows.filter((i) => i.due_date && i.due_date < today);
    const monthStart = `${today.slice(0, 8)}01`;
    const prevStart = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevSameDay = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate())));
    const pays = payments.data?.items ?? [];
    const cashMonth = pays.filter((p) => p.date >= monthStart).reduce((s, p) => s + p.amount, 0);
    const cashPrev = pays.filter((p) => p.date >= prevStart && p.date <= prevSameDay).reduce((s, p) => s + p.amount, 0);
    const buckets = new Map<string, number>();
    for (let k = 5; k >= 0; k--) buckets.set(monthKey(isoDate(new Date(now.getFullYear(), now.getMonth() - k, 1))), 0);
    for (const p of pays) buckets.set(monthKey(p.date), (buckets.get(monthKey(p.date)) ?? 0) + p.amount);
    const yearAgo = inDays(-365);
    const delays = (paid.data?.items ?? [])
      .filter((i) => i.paid_at && i.paid_at.slice(0, 10) >= yearAgo && i.kind !== "credit_note")
      .map((i) => Math.max(0, daysBetween(i.issue_date, i.paid_at) ?? 0));
    return {
      loading: open.isLoading || payments.isLoading,
      receivables: openRows.reduce((s, i) => s + i.balance_due, 0),
      openCount: openRows.length,
      overdueAmount: overdue.reduce((s, i) => s + i.balance_due, 0),
      overdueCount: overdue.length,
      maxLate: overdue.reduce((m, i) => Math.max(m, lateDays(i)), 0),
      cashMonth,
      cashCount: pays.filter((p) => p.date >= monthStart).length,
      cashDelta: cashPrev > 0 ? ((cashMonth - cashPrev) / cashPrev) * 100 : null,
      cashTrend: [...buckets.values()],
      avgDelay: delays.length ? delays.reduce((s, d) => s + d, 0) / delays.length : null,
      delayCount: delays.length,
    };
  }, [open.data, paid.data, payments.data, open.isLoading, payments.isLoading, today]);
}

function DueCell({ invoice }: { invoice: Invoice }) {
  if (!invoice.due_date || invoice.kind === "credit_note") return <span className="text-fg-3">—</span>;
  const late = lateDays(invoice);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("tabular", late ? "font-medium text-red-500" : invoice.locked ? "text-fg-2" : "text-fg-3")}>{date(invoice.due_date)}</span>
      {late > 0 && <span className="rounded-full bg-red-500/12 px-1.5 text-[10.5px] font-semibold text-red-600 dark:text-red-300">+{late} j</span>}
    </span>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const canWrite = can(me, "member");
  const { billing } = useBillingSettings();
  const ls = useListState({ filters: ["status", "kind", "company_id"], defaultSort: "-issue_date" });
  const params = useMemo(() => queryParams(ls.params), [ls.params]);
  const { data, isLoading, isFetching } = useList<Invoice>("invoices", params);
  const stats = useInvoiceStats();
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const rows = data?.items ?? [];
  const status = ls.filters.status;
  const toggleStatus = (value: string) => ls.setFilter("status", status === value ? null : value);

  const duplicate = async (inv: Invoice) => {
    try {
      const copy = await api.post<Invoice>(`/invoices/${inv.id}/duplicate`);
      invalidate("invoices");
      toast.success("Brouillon créé à partir de la facture");
      navigate(`/invoices/${copy.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const removeDraft = async (inv: Invoice) => {
    if (!(await confirm({ title: "Supprimer ce brouillon ?", description: "Un brouillon n'a pas de numéro : il peut être supprimé sans incidence sur la numérotation.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/invoices/${inv.id}`);
      invalidate("invoices");
      toast.success("Brouillon supprimé");
    } catch (e) {
      toastError(e);
    }
  };

  const menuFor = (inv: Invoice): MenuItem[] => [
    { label: "Ouvrir", icon: <ReceiptText className="size-4" />, onSelect: () => navigate(`/invoices/${inv.id}`) },
    { label: inv.locked ? "Télécharger le PDF Factur-X" : "Télécharger l'aperçu PDF", icon: <Download className="size-4" />, onSelect: () => download(`/invoices/${inv.id}/pdf`, `${inv.number || `brouillon-${inv.id}`}.pdf`).catch(toastError) },
    ...(inv.locked ? [{ label: "Télécharger le XML Factur-X", icon: <FileCode2 className="size-4" />, onSelect: () => download(`/invoices/${inv.id}/facturx.xml`, `${inv.number}-factur-x.xml`).catch(toastError) }] : []),
    { label: "Dupliquer en brouillon", icon: <Copy className="size-4" />, onSelect: () => duplicate(inv), disabled: !canWrite },
    ...(inv.locked ? [{ label: "Copier le lien public", icon: <Receipt className="size-4" />, onSelect: () => copyText(invoicePublicUrl(inv.public_token), "Lien de la facture copié") }] : []),
    ...(!inv.locked && canWrite ? [{ separator: true, label: "" }, { label: "Supprimer le brouillon", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => removeDraft(inv) }] : []),
  ];

  const columns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Numéro",
      sortKey: "number",
      cell: (inv) => (
        <div className="min-w-0">
          {inv.number ? <div className="font-semibold tabular">{inv.number}</div> : <div className="font-medium italic text-fg-3">Brouillon</div>}
          <div className="truncate text-[12px] text-fg-3 md:hidden">{inv.company?.name ?? inv.contact?.name ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      hideOnMobile: true,
      cell: (inv) =>
        inv.kind === "invoice" ? (
          <span className="text-[13px] text-fg-2">Facture</span>
        ) : (
          <Badge tone={findOption(INVOICE_KIND, inv.kind)?.tone} size="xs">
            {inv.kind === "deposit" ? "Acompte" : "Avoir"}
          </Badge>
        ),
    },
    {
      key: "client",
      header: "Client",
      hideOnMobile: true,
      cell: (inv) =>
        inv.company ? (
          <Link to={`/companies/${inv.company.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2 hover:text-accent">
            <CompanyLogo name={inv.company.name} size={24} />
            <span className="truncate">{inv.company.name}</span>
          </Link>
        ) : (
          <span className="truncate text-fg-2">{inv.contact?.name ?? "—"}</span>
        ),
    },
    { key: "date", header: "Date", sortKey: "issue_date", hideOnMobile: true, cell: (inv) => <span className={cn("whitespace-nowrap tabular", inv.locked ? "text-fg-2" : "text-fg-3")}>{inv.locked ? date(inv.issue_date) : "—"}</span> },
    { key: "due", header: "Échéance", sortKey: "due_date", hideOnMobile: true, cell: (inv) => <DueCell invoice={inv} /> },
    { key: "total", header: "Total TTC", sortKey: "total", align: "right", cell: (inv) => <span className={cn("whitespace-nowrap font-semibold tabular", inv.total < 0 && "text-orange-600 dark:text-orange-400")}>{money(inv.total, inv.currency)}</span> },
    {
      key: "balance",
      header: "Reste dû",
      align: "right",
      hideOnMobile: true,
      cell: (inv) => (isOutstanding(inv) && inv.balance_due > 0 ? <span className={cn("whitespace-nowrap tabular", lateDays(inv) ? "font-semibold text-red-500" : "text-fg")}>{money(inv.balance_due, inv.currency)}</span> : <span className="text-fg-3">—</span>),
    },
    { key: "status", header: "Statut", cell: (inv) => <StatusBadge options={INVOICE_STATUS} value={inv.status} /> },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "52px",
      cell: (inv) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <Menu
            width={250}
            trigger={
              <button type="button" aria-label={`Actions pour ${inv.number || "le brouillon"}`} className="rounded-[10px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10">
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={menuFor(inv)}
          />
        </div>
      ),
    },
  ];

  const filtered = ls.activeFilterCount > 0;
  const empty = (
    <EmptyState
      icon={<ReceiptText className="size-6" />}
      title={filtered ? "Aucune facture ne correspond" : "Aucune facture pour l'instant"}
      description={filtered ? "Essayez d'élargir votre recherche ou vos filtres." : "Créez une facture ou convertissez un devis signé : numérotation, mentions légales et Factur-X sont gérées pour vous."}
      action={
        filtered ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : canWrite ? (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/invoices/new")}>
            Nouvelle facture
          </Button>
        ) : undefined
      }
    />
  );

  const chips = [{ value: "unpaid", label: "À encaisser", count: stats.openCount }, ...INVOICE_STATUS.map((o) => ({ value: o.value, label: o.label, count: o.value === "overdue" ? stats.overdueCount : undefined }))];

  return (
    <div>
      <PageHeader
        title="Factures"
        icon={<ReceiptText className="size-5" />}
        description={data ? `${number(data.total)} document${data.total > 1 ? "s" : ""}${status ? ` · ${chips.find((c) => c.value === status)?.label ?? ""}` : ""}` : "Chargement…"}
        actions={
          <>
            {can(me, "manager") && (
              <Button variant="glass" icon={<Fingerprint className="size-4" />} onClick={() => setIntegrityOpen(true)}>
                Vérifier l'intégrité
              </Button>
            )}
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/invoices.csv", `factures-${isoDate()}.csv`, { ...params, limit: undefined, offset: undefined }).catch(toastError)}>
              Exporter
            </Button>
            {canWrite && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/invoices/new")}>
                Nouvelle facture
              </Button>
            )}
          </>
        }
      />

      <div className={cn("mb-5 grid grid-cols-2 gap-3 sm:gap-4", stats.avgDelay === null ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        <StatTile label="À encaisser" value={stats.receivables} format={(v) => moneyShort(v)} hint={stats.loading ? "…" : `${number(stats.openCount)} facture${stats.openCount > 1 ? "s" : ""} en attente de règlement`} icon={<Wallet className="size-4" />} accent="linear-gradient(135deg,#5b6cff,#8b5cf6)" onClick={() => toggleStatus("unpaid")} />
        <StatTile
          label="En retard"
          value={stats.overdueAmount}
          format={(v) => moneyShort(v)}
          hint={stats.overdueCount ? `${number(stats.overdueCount)} facture${stats.overdueCount > 1 ? "s" : ""} · jusqu'à ${stats.maxLate} j de retard` : "Aucun retard de paiement 🎉"}
          icon={<AlertTriangle className="size-4" />}
          accent="linear-gradient(135deg,#ff9f0a,#ff375f)"
          onClick={() => toggleStatus("overdue")}
        />
        <StatTile
          label="Encaissé ce mois"
          value={stats.cashMonth}
          format={(v) => moneyShort(v)}
          {...(stats.cashDelta === null ? { hint: `${number(stats.cashCount)} paiement${stats.cashCount > 1 ? "s" : ""} reçu${stats.cashCount > 1 ? "s" : ""}` } : { delta: stats.cashDelta, period: "vs M-1" })}
          trend={stats.cashTrend} icon={<Banknote className="size-4" />} accent="linear-gradient(135deg,#1baf7a,#22d3ee)" onClick={() => toggleStatus("paid")} />
        {stats.avgDelay !== null && (
          <StatTile
            label="Délai moyen de paiement"
            value={stats.avgDelay}
            format={(v) => `${number(v)} j`}
            hint={`${number(stats.delayCount)} paiement${stats.delayCount > 1 ? "s" : ""} (12 mois) · objectif ${billing.payment_days} j`}
            icon={<Timer className="size-4" />}
            accent="linear-gradient(135deg,#8b5cf6,#ec4899)"
          />
        )}
      </div>

      <div className="mb-4 space-y-3">
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-1 pb-0.5 sm:flex-wrap sm:overflow-visible [&>*]:shrink-0">
          <FilterChip active={!status} onClick={() => ls.setFilter("status", null)}>
            Toutes
          </FilterChip>
          {chips.map((c) => (
            <FilterChip key={c.value} active={status === c.value} onClick={() => toggleStatus(c.value)} count={c.count || undefined}>
              {c.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Numéro, titre, note…" className="md:w-[300px]" />
          <div className="flex flex-wrap items-center gap-2 md:ml-auto md:flex-nowrap">
            <Select options={[{ value: "", label: "Tous les types" }, ...INVOICE_KIND]} value={ls.filters.kind ?? ""} onChange={(v) => ls.setFilter("kind", v)} className="w-[180px]" />
            <div className="min-w-0 flex-1 md:w-[220px] md:flex-none">
              <EntitySelect resource="companies" value={ls.filters.company_id ? Number(ls.filters.company_id) : null} onChange={(id) => ls.setFilter("company_id", id)} placeholder="Tous les clients" />
            </div>
            <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-[200px]" />
          </div>
        </div>
      </div>

      <Glass className="overflow-hidden" radius="lg">
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading || (isFetching && !rows.length)}
          sort={ls.sort}
          onSortChange={ls.setSort}
          onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
          empty={empty}
          page={ls.page}
          pageSize={ls.pageSize}
          total={data?.total}
          onPageChange={ls.setPage}
        />
      </Glass>

      <IntegrityDialog open={integrityOpen} onOpenChange={setIntegrityOpen} />
    </div>
  );
}

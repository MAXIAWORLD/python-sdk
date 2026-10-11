import { BadgeCheck, CalendarClock, Copy, Download, FileText, Hourglass, Link2, MoreHorizontal, Plus, Signature, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { copyText, inDays, quoteDisplayStatus, quotePublicUrl, todayIso } from "@/components/billing/lib";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader, StatTile } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { CompanyLogo, EmptyState, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { SearchInput, Select } from "@/components/ui/fields";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { api, download } from "@/lib/api";
import { QUOTE_STATUS } from "@/lib/constants";
import { date, daysFromNow, isoDate, money, moneyShort, number, percent } from "@/lib/format";
import { toastError, useInvalidate, useList, type Params } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Quote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-issue_date", label: "Plus récents" },
  { value: "valid_until", label: "Validité la plus proche" },
  { value: "-total", label: "Montant décroissant" },
  { value: "-number", label: "Numéro" },
];

/** Virtual statuses: a sent quote past its validity is "expired"; "pending" and "expiring" come from the tiles. */
const VIRTUAL_LABELS: Record<string, string> = { pending: "En attente de signature", expiring: "Expirent sous 7 jours" };

function queryParams(params: Params): Params {
  const { status, ...rest } = params;
  const today = todayIso();
  switch (status) {
    case "sent":
    case "viewed":
      return { ...rest, status, valid_until__gte: today };
    case "expired":
      return { ...rest, status__in: "sent,viewed,expired", valid_until__lt: today };
    case "pending":
      return { ...rest, status__in: "sent,viewed", valid_until__gte: today };
    case "expiring":
      return { ...rest, status__in: "sent,viewed", valid_until__gte: today, valid_until__lte: inDays(7) };
    default:
      return status ? { ...rest, status } : rest;
  }
}

/**
 * KPI tiles, computed client-side from the (1 000 most recent) non-draft quotes.
 * Datetime filters (sent_at__gte…) are not usable on the generic API, hence one broad query.
 */
function useQuoteStats() {
  const today = todayIso();
  const { data, isLoading } = useList<Quote>("quotes", { status__ne: "draft", sort: "-issue_date", limit: 1000, expand: 0 });
  return useMemo(() => {
    const rows = data?.items ?? [];
    const monthStart = `${today.slice(0, 8)}01`;
    const since90 = inDays(-90);
    const in7 = inDays(7);
    const open = rows.filter((q) => q.status === "sent" || q.status === "viewed");
    const live = open.filter((q) => !q.valid_until || q.valid_until >= today);
    const expiring = live.filter((q) => q.valid_until && q.valid_until <= in7);
    const sent = rows.filter((q) => (q.sent_at ?? q.issue_date).slice(0, 10) >= since90);
    const won = sent.filter((q) => q.accepted_at || q.status === "accepted" || q.status === "invoiced");
    const signed = rows.filter((q) => q.accepted_at && q.accepted_at.slice(0, 10) >= monthStart);
    return {
      loading: isLoading,
      pendingAmount: live.reduce((s, q) => s + q.total, 0),
      pendingCount: live.length,
      expiredOpen: open.length - live.length,
      signRate: sent.length ? (won.length / sent.length) * 100 : null,
      wonCount: won.length,
      sentCount: sent.length,
      expiringCount: expiring.length,
      expiringAmount: expiring.reduce((s, q) => s + q.total, 0),
      signedAmount: signed.reduce((s, q) => s + q.total, 0),
      signedCount: signed.length,
    };
  }, [data, isLoading, today]);
}

function ValidityCell({ quote }: { quote: Quote }) {
  if (!quote.valid_until) return <span className="text-fg-3">—</span>;
  const status = quoteDisplayStatus(quote);
  const left = daysFromNow(quote.valid_until) ?? 0;
  const open = quote.status === "sent" || quote.status === "viewed" || quote.status === "draft";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("tabular", status === "expired" || (quote.status === "draft" && left < 0) ? "font-medium text-red-500" : "text-fg-2")}>{date(quote.valid_until)}</span>
      {open && left >= 0 && left <= 7 && <span className="rounded-full bg-orange-500/14 px-1.5 text-[10.5px] font-semibold text-orange-600 dark:text-orange-300">J-{left}</span>}
    </span>
  );
}

export default function QuotesPage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const canWrite = can(me, "member");
  const ls = useListState({ filters: ["status", "company_id"], defaultSort: "-issue_date" });
  const params = useMemo(() => queryParams(ls.params), [ls.params]);
  const { data, isLoading, isFetching } = useList<Quote>("quotes", params);
  const stats = useQuoteStats();
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const rows = data?.items ?? [];
  const status = ls.filters.status;
  const toggleStatus = (value: string) => ls.setFilter("status", status === value ? null : value);

  const duplicate = async (q: Quote) => {
    try {
      const copy = await api.post<Quote>(`/quotes/${q.id}/duplicate`);
      invalidate("quotes");
      toast.success(`Devis dupliqué : ${copy.number}`);
      navigate(`/quotes/${copy.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (q: Quote) => {
    if (!(await confirm({ title: `Supprimer le brouillon ${q.number} ?`, description: "Le devis sera définitivement supprimé.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/quotes/${q.id}`);
      invalidate("quotes");
      toast.success("Devis supprimé");
    } catch (e) {
      toastError(e);
    }
  };

  const columns: Column<Quote>[] = [
    {
      key: "number",
      header: "Numéro",
      sortKey: "number",
      cell: (q) => (
        <div className="min-w-0">
          <div className="font-semibold tabular">{q.number}</div>
          <div className="truncate text-[12px] text-fg-3 md:hidden">{q.company?.name ?? q.contact?.name ?? "—"}</div>
        </div>
      ),
    },
    { key: "title", header: "Titre", hideOnMobile: true, cell: (q) => <span className="line-clamp-1 max-w-[260px] text-fg-2">{q.title || "—"}</span> },
    {
      key: "client",
      header: "Client",
      hideOnMobile: true,
      cell: (q) =>
        q.company ? (
          <Link to={`/companies/${q.company.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2 hover:text-accent">
            <CompanyLogo name={q.company.name} size={24} />
            <span className="truncate">{q.company.name}</span>
          </Link>
        ) : q.contact ? (
          <span className="truncate text-fg-2">{q.contact.name}</span>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    { key: "date", header: "Date", sortKey: "issue_date", hideOnMobile: true, cell: (q) => <span className="whitespace-nowrap tabular text-fg-2">{date(q.issue_date)}</span> },
    { key: "valid", header: "Validité", sortKey: "valid_until", hideOnMobile: true, cell: (q) => <ValidityCell quote={q} /> },
    { key: "total", header: "Total TTC", sortKey: "total", align: "right", cell: (q) => <span className="whitespace-nowrap font-semibold tabular">{money(q.total, q.currency)}</span> },
    { key: "status", header: "Statut", cell: (q) => <StatusBadge options={QUOTE_STATUS} value={quoteDisplayStatus(q)} /> },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "52px",
      cell: (q) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <Menu
            trigger={
              <button type="button" aria-label={`Actions pour ${q.number}`} className="rounded-[10px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10">
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={[
              { label: "Ouvrir", icon: <FileText className="size-4" />, onSelect: () => navigate(`/quotes/${q.id}`) },
              { label: "Télécharger le PDF", icon: <Download className="size-4" />, onSelect: () => download(`/quotes/${q.id}/pdf`, `Devis-${q.number}.pdf`).catch(toastError) },
              { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: () => duplicate(q), disabled: !canWrite },
              {
                label: "Copier le lien public",
                icon: <Link2 className="size-4" />,
                onSelect: () => copyText(quotePublicUrl(q.public_token), "Lien de signature copié", q.status === "draft" ? "Brouillon : le lien sera actif une fois le devis envoyé." : undefined),
              },
              ...(q.status === "draft" && canWrite ? [{ separator: true, label: "" }, { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(q) }] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const filtered = ls.activeFilterCount > 0;
  const empty = (
    <EmptyState
      icon={<FileText className="size-6" />}
      title={filtered ? "Aucun devis ne correspond" : "Aucun devis pour l'instant"}
      description={filtered ? "Essayez d'élargir votre recherche ou vos filtres." : "Créez votre premier devis : signature électronique en ligne et conversion en facture en un clic."}
      action={
        filtered ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : canWrite ? (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/quotes/new")}>
            Nouveau devis
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Devis"
        icon={<FileText className="size-5" />}
        description={data ? `${number(data.total)} devis${status ? ` · ${VIRTUAL_LABELS[status] ?? QUOTE_STATUS.find((o) => o.value === status)?.label ?? ""}` : ""}` : "Chargement…"}
        actions={
          <>
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/quotes.csv", `devis-${isoDate()}.csv`, { ...params, limit: undefined, offset: undefined }).catch(toastError)}>
              Exporter
            </Button>
            {canWrite && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/quotes/new")}>
                Nouveau devis
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="En attente de signature"
          value={stats.pendingAmount}
          format={(v) => moneyShort(v)}
          hint={stats.loading ? "…" : `${number(stats.pendingCount)} devis en cours${stats.expiredOpen ? ` · ${stats.expiredOpen} expiré${stats.expiredOpen > 1 ? "s" : ""} à relancer` : ""}`}
          icon={<Hourglass className="size-4" />}
          accent="linear-gradient(135deg,#5b6cff,#22d3ee)"
          onClick={() => toggleStatus("pending")}
        />
        <StatTile
          label="Taux de signature (90 j)"
          value={stats.signRate ?? 0}
          format={(v) => (stats.signRate === null ? "—" : percent(v, 0))}
          hint={stats.sentCount ? `${number(stats.wonCount)} signé${stats.wonCount > 1 ? "s" : ""} sur ${number(stats.sentCount)} envoyé${stats.sentCount > 1 ? "s" : ""}` : "Aucun devis envoyé sur 90 jours"}
          icon={<BadgeCheck className="size-4" />}
          accent="linear-gradient(135deg,#1baf7a,#34d399)"
        />
        <StatTile
          label="Expirent sous 7 jours"
          value={stats.expiringCount}
          format={(v) => number(v)}
          hint={stats.expiringCount ? `${moneyShort(stats.expiringAmount)} à relancer` : "Aucune échéance proche"}
          icon={<CalendarClock className="size-4" />}
          accent="linear-gradient(135deg,#ff9f0a,#ff375f)"
          onClick={() => toggleStatus("expiring")}
        />
        <StatTile
          label="Signés ce mois"
          value={stats.signedAmount}
          format={(v) => moneyShort(v)}
          hint={`${number(stats.signedCount)} devis signé${stats.signedCount > 1 ? "s" : ""} depuis le 1er`}
          icon={<Signature className="size-4" />}
          accent="linear-gradient(135deg,#8b5cf6,#ec4899)"
          onClick={() => toggleStatus("accepted")}
        />
      </div>

      <div className="mb-4 space-y-3">
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-1 pb-0.5 sm:flex-wrap sm:overflow-visible [&>*]:shrink-0">
          <FilterChip active={!status} onClick={() => ls.setFilter("status", null)}>
            Tous
          </FilterChip>
          {QUOTE_STATUS.map((o) => (
            <FilterChip key={o.value} active={status === o.value} onClick={() => toggleStatus(o.value)}>
              {o.label}
            </FilterChip>
          ))}
          {status && VIRTUAL_LABELS[status] && (
            <FilterChip active onClick={() => ls.setFilter("status", null)}>
              {VIRTUAL_LABELS[status]} <X className="size-3.5" />
            </FilterChip>
          )}
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Numéro, titre, note…" className="md:w-[300px]" />
          <div className="flex items-center gap-2 md:ml-auto">
            <div className="min-w-0 flex-1 md:w-[230px] md:flex-none">
              <EntitySelect resource="companies" value={ls.filters.company_id ? Number(ls.filters.company_id) : null} onChange={(id) => ls.setFilter("company_id", id)} placeholder="Tous les clients" />
            </div>
            <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-[200px] shrink-0" />
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
          onRowClick={(q) => navigate(`/quotes/${q.id}`)}
          empty={empty}
          page={ls.page}
          pageSize={ls.pageSize}
          total={data?.total}
          onPageChange={ls.setPage}
        />
      </Glass>
    </div>
  );
}

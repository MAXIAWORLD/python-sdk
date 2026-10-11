import { Ban, CirclePause, CirclePlay, Download, MoreHorizontal, PanelRightOpen, Pencil, Plus, Receipt, Repeat, RotateCcw, SlidersHorizontal, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { MetricTiles, MovementsRow, MrrHero, type OverviewExtras } from "@/components/subscriptions/SaasOverview";
import { CancelDialog, ChangePlanDialog } from "@/components/subscriptions/SubscriptionDialogs";
import { SubscriptionSheet } from "@/components/subscriptions/SubscriptionSheet";
import { ChurnPanel, RenewalsPanel, TrialsPanel } from "@/components/subscriptions/UpcomingPanels";
import { isBillable, monthlyValue, type SubscriptionMetrics } from "@/components/subscriptions/model";
import { useSubscriptionActions } from "@/components/subscriptions/useSubscriptionActions";
import { Button, IconButton } from "@/components/ui/button";
import { CompanyLogo, EmptyState, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { SearchInput, Select, Switch } from "@/components/ui/fields";
import { Menu, Tooltip, type MenuItem } from "@/components/ui/overlay";
import { download } from "@/lib/api";
import { INTERVALS, labelOf, SUBSCRIPTION_STATUS } from "@/lib/constants";
import { date, daysFromNow, isoDate, money, moneyShort, number, percent } from "@/lib/format";
import { toastError, useApi, useList } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

const SORTS = [
  { value: "current_period_end", label: "Prochaine échéance" },
  { value: "-amount", label: "Prix le plus élevé" },
  { value: "-start_date", label: "Plus récents" },
  { value: "start_date", label: "Plus anciens" },
  { value: "-quantity", label: "Plus de sièges" },
  { value: "plan", label: "Offre (A → Z)" },
];

function NextDue({ sub }: { sub: Subscription }) {
  if (sub.status === "canceled") return <span className="text-[12.5px] text-fg-3">Résilié {sub.canceled_at ? `le ${date(sub.canceled_at, "d MMM yyyy")}` : ""}</span>;
  if (sub.status === "paused") return <span className="text-[12.5px] text-fg-3">En pause</span>;
  const trial = sub.status === "trialing";
  const value = trial ? sub.trial_end : sub.current_period_end;
  if (!value) return <span className="text-fg-3">—</span>;
  const days = daysFromNow(value) ?? 0;
  return (
    <div className="whitespace-nowrap">
      <div className="text-[13px] tabular">{date(value, "d MMM yyyy")}</div>
      <div className={cn("text-[11.5px]", days < 0 ? "font-medium text-red-500" : days <= 7 ? "text-orange-600 dark:text-orange-400" : "text-fg-3")}>
        {trial ? `Fin d'essai · ${days < 0 ? "terminé" : days === 0 ? "aujourd'hui" : `J-${days}`}` : days < 0 ? `dépassée de ${-days} j` : days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} j`}
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const me = useAuth((s) => s.user);
  const openAssistant = useUI((s) => s.openAssistant);
  const ls = useListState({ filters: ["status", "interval", "company_id"], defaultSort: "current_period_end" });
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, isFetching } = useList<Subscription>("subscriptions", ls.params);
  const { data: metrics, isLoading: metricsLoading, isError: metricsError, refetch: refetchMetrics } = useApi<SubscriptionMetrics>(["subscription-metrics"], "/subscriptions/metrics");
  const overview = useList<Subscription>("subscriptions", { limit: 1000, sort: "id" });
  const actions = useSubscriptionActions();
  const listRef = useRef<HTMLDivElement>(null);

  const [creating, setCreating] = useState(false);
  /* Dialog targets outlive their `open` flag so exit animations keep their content */
  const [editTarget, setEditTarget] = useState<Subscription | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [planTarget, setPlanTarget] = useState<Subscription | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const openEdit = (sub: Subscription) => {
    setEditTarget(sub);
    setEditOpen(true);
  };
  const openPlan = (sub: Subscription) => {
    setPlanTarget(sub);
    setPlanOpen(true);
  };
  const openCancel = (sub: Subscription) => {
    setCancelTarget(sub);
    setCancelOpen(true);
  };

  const rows = data?.items ?? [];
  const all = overview.data?.items;

  /* Side sheet, deep-linkable with ?abonnement=<id> */
  const sheetId = Number(searchParams.get("abonnement")) || null;
  const [sheetSeed, setSheetSeed] = useState<Subscription | undefined>(undefined);
  /* Keep the last record while the sheet animates out */
  const [shownId, setShownId] = useState<number | null>(sheetId);
  if (sheetId && sheetId !== shownId) setShownId(sheetId);
  const openSheet = (sub: Subscription) => {
    setSheetSeed(sub);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("abonnement", String(sub.id));
      return next;
    });
  };
  const closeSheet = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("abonnement");
        return next;
      },
      { replace: true },
    );

  /* Derived overview figures (one light query instead of one per panel) */
  const derived = useMemo(() => {
    const list = all ?? [];
    const today = isoDate();
    const in30 = isoDate(new Date(Date.now() + 30 * 86_400_000));
    const counts: Record<string, number> = {};
    for (const s of list) counts[s.status] = (counts[s.status] ?? 0) + 1;
    const renewals = list.filter((s) => isBillable(s.status) && s.current_period_end && s.current_period_end >= today && s.current_period_end <= in30).sort((a, b) => (a.current_period_end ?? "").localeCompare(b.current_period_end ?? ""));
    const trials = list.filter((s) => s.status === "trialing").sort((a, b) => (a.trial_end ?? "9999").localeCompare(b.trial_end ?? "9999"));
    const churned = list
      .filter((s) => s.status === "canceled")
      .sort((a, b) => (b.canceled_at ?? "").localeCompare(a.canceled_at ?? ""))
      .slice(0, 4);
    const extras: OverviewExtras = {
      seats: list.filter((s) => isBillable(s.status)).reduce((n, s) => n + (s.quantity || 0), 0),
      trialsEndingSoon: trials.filter((s) => s.trial_end && (daysFromNow(s.trial_end) ?? 99) <= 7).length,
      trialsPotential: trials.reduce((n, s) => n + monthlyValue(s), 0),
      pastDue: counts.past_due ?? 0,
    };
    return { counts, renewals, trials, churned, extras };
  }, [all]);

  /* Links like /subscriptions?status=trialing land on the list */
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !ls.activeFilterCount) return;
    scrolled.current = true;
    const t = setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 450);
    return () => clearTimeout(t);
  }, [ls.activeFilterCount]);

  const focusList = (apply: () => void) => {
    apply();
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const menuItems = (s: Subscription): MenuItem[] => {
    const items: MenuItem[] = [
      { label: "Ouvrir la fiche", icon: <PanelRightOpen className="size-4" />, onSelect: () => openSheet(s) },
      { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => openEdit(s) },
    ];
    if (s.status !== "canceled") items.push({ label: "Changer quantité / prix", icon: <SlidersHorizontal className="size-4" />, onSelect: () => openPlan(s) });
    items.push({ label: "Générer la facture", icon: <Receipt className="size-4" />, onSelect: () => actions.generateInvoice(s), disabled: s.status === "canceled" });
    items.push({ separator: true, label: "" });
    if (s.status === "trialing") items.push({ label: "Convertir l'essai", icon: <Sparkles className="size-4" />, onSelect: () => actions.convertTrial(s) });
    if (isBillable(s.status)) items.push({ label: "Mettre en pause", icon: <CirclePause className="size-4" />, onSelect: () => actions.pause(s) });
    if (s.status === "paused") items.push({ label: "Reprendre", icon: <CirclePlay className="size-4" />, onSelect: () => actions.resume(s) });
    if (s.status === "canceled") items.push({ label: "Réactiver", icon: <RotateCcw className="size-4" />, onSelect: () => actions.reactivate(s) });
    else items.push({ label: "Résilier…", icon: <Ban className="size-4" />, danger: true, onSelect: () => openCancel(s) });
    return items;
  };

  const columns: Column<Subscription>[] = [
    {
      key: "client",
      header: "Client",
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo name={s.company?.name} size={32} />
          <div className="min-w-0">
            {s.company ? (
              <Link to={`/companies/${s.company.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:text-accent">
                {s.company.name}
              </Link>
            ) : (
              <span className="font-medium">—</span>
            )}
            <div className="truncate text-[12px] text-fg-3 md:hidden">{s.plan}</div>
            <div className="hidden truncate text-[12px] text-fg-3 md:block">Depuis {date(s.start_date, "MMMM yyyy")}</div>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Offre",
      sortKey: "plan",
      hideOnMobile: true,
      cell: (s) => (
        <div className="min-w-0 max-w-[190px]">
          <div className="truncate text-[13.5px]">{s.plan}</div>
          {s.discount > 0 && <div className="text-[11.5px] font-medium text-pink-600 dark:text-pink-400">Remise {percent(s.discount, s.discount % 1 ? 1 : 0)}</div>}
        </div>
      ),
    },
    { key: "quantity", header: "Qté", sortKey: "quantity", align: "right", hideOnMobile: true, cell: (s) => <span className="tabular text-fg-2">{number(s.quantity)}</span> },
    {
      key: "amount",
      header: "Prix HT",
      sortKey: "amount",
      align: "right",
      hideOnMobile: true,
      cell: (s) => (
        <div className="whitespace-nowrap">
          <div className="tabular">{moneyShort(s.amount)}</div>
          <div className="text-[11.5px] text-fg-3">{labelOf(INTERVALS, s.interval)}</div>
        </div>
      ),
    },
    {
      key: "mrr",
      header: "MRR",
      align: "right",
      cell: (s) => (
        <div className="flex flex-col items-end gap-1">
          {isBillable(s.status) ? (
            <span className="whitespace-nowrap font-semibold tabular">{moneyShort(s.mrr)}</span>
          ) : (
            <Tooltip content={s.status === "trialing" ? "MRR potentiel à la conversion de l'essai" : "Hors MRR"}>
              <span className="whitespace-nowrap tabular text-fg-3">{s.status === "trialing" ? `(${moneyShort(monthlyValue(s))})` : "—"}</span>
            </Tooltip>
          )}
          <StatusBadge options={SUBSCRIPTION_STATUS} value={s.status} size="xs" className="md:hidden" />
        </div>
      ),
    },
    { key: "status", header: "Statut", hideOnMobile: true, cell: (s) => <StatusBadge options={SUBSCRIPTION_STATUS} value={s.status} size="xs" /> },
    { key: "due", header: "Échéance", sortKey: "current_period_end", hideOnMobile: true, cell: (s) => <NextDue sub={s} /> },
    {
      key: "auto",
      header: (
        <Tooltip content="Facturation automatique : une facture brouillon est créée à chaque échéance">
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3" /> Auto
          </span>
        </Tooltip>
      ),
      align: "center",
      hideOnMobile: true,
      cell: (s) => (
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <Switch size="sm" checked={s.auto_invoice} disabled={s.status === "canceled" || actions.isBusy("auto", s)} onChange={(v) => actions.toggleAutoInvoice(s, v)} />
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "48px",
      hideOnMobile: true,
      cell: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            trigger={
              <IconButton label="Actions" size="sm">
                <MoreHorizontal className="size-4" />
              </IconButton>
            }
            items={menuItems(s)}
          />
        </div>
      ),
    },
  ];

  const empty = (
    <EmptyState
      icon={<Repeat className="size-6" />}
      title={ls.activeFilterCount ? "Aucun abonnement ne correspond" : "Aucun abonnement pour l'instant"}
      description={ls.activeFilterCount ? "Essayez d'élargir votre recherche ou vos filtres." : "Créez votre premier abonnement pour suivre le MRR, les renouvellements et le churn."}
      action={
        ls.activeFilterCount ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouvel abonnement
          </Button>
        )
      }
    />
  );

  const askIris = () =>
    openAssistant(
      metrics
        ? `Analyse mes revenus récurrents : MRR ${money(metrics.mrr, "EUR", { decimals: 0 })}, ARR ${moneyShort(metrics.arr)}, NRR ${percent(metrics.nrr, 1)}, churn MRR ${percent(metrics.churn_rate, 1)} sur 30 jours, ${metrics.customers} clients actifs et ${metrics.trialing} essais en cours. Identifie les risques de churn, les essais à convertir en priorité et les meilleures opportunités d'expansion parmi mes abonnements.`
        : "Analyse mes abonnements : risques de churn, essais à convertir et opportunités d'expansion.",
    );

  return (
    <div>
      <PageHeader
        title="Abonnements"
        icon={<Repeat className="size-5" />}
        description={
          metrics ? (
            <span>
              <b className="font-semibold text-fg tabular">{money(metrics.mrr, "EUR", { decimals: 0 })}</b> de MRR · {metrics.active_subscriptions} abonnement{metrics.active_subscriptions > 1 ? "s" : ""} actif{metrics.active_subscriptions > 1 ? "s" : ""} ·{" "}
              {metrics.customers} client{metrics.customers > 1 ? "s" : ""}
            </span>
          ) : (
            "Revenus récurrents, renouvellements et churn"
          )
        }
        actions={
          <>
            <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={askIris}>
              Analyse d'Iris
            </Button>
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/subscriptions.csv", `abonnements-${isoDate()}.csv`, { ...ls.filters, q: ls.params.q as string | undefined }).catch(toastError)}>
              Exporter
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvel abonnement
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {metricsError ? (
          <Glass radius="xl">
            <EmptyState
              icon={<TrendingUp className="size-6" />}
              title="Indicateurs momentanément indisponibles"
              description="Le calcul du MRR, du churn et du NRR n'a pas abouti. La liste des abonnements reste consultable ci-dessous."
              action={<Button onClick={() => refetchMetrics()}>Réessayer</Button>}
            />
          </Glass>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <MrrHero metrics={metrics} loading={metricsLoading} />
              <MetricTiles metrics={metrics} extras={derived.extras} onFilter={(status) => focusList(() => ls.setFilter("status", status))} />
            </div>
            <MovementsRow metrics={metrics} onPlan={(plan) => focusList(() => ls.setQ(plan))} />
          </>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RenewalsPanel rows={derived.renewals} loading={overview.isLoading} onOpen={openSheet} />
          <div className="flex flex-col gap-4">
            <TrialsPanel rows={derived.trials} loading={overview.isLoading} onOpen={openSheet} actions={actions} />
            <ChurnPanel rows={derived.churned} loading={overview.isLoading} onOpen={openSheet} className="flex-1" />
          </div>
        </div>
      </div>

      <div ref={listRef} className="scroll-mt-4 pt-8">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Tous les abonnements</h2>
            <p className="text-[13px] text-fg-3">{data ? `${data.total.toLocaleString("fr-FR")} abonnement${data.total > 1 ? "s" : ""}${ls.activeFilterCount ? " correspondant aux filtres" : ""}` : "Chargement…"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EntitySelect resource="companies" value={ls.filters.company_id ? Number(ls.filters.company_id) : null} onChange={(id) => ls.setFilter("company_id", id)} placeholder="Tous les clients" className="w-full sm:w-[210px]" />
            <Select options={[{ value: "", label: "Toutes périodicités" }, ...INTERVALS]} value={ls.filters.interval ?? ""} onChange={(v) => ls.setFilter("interval", v)} className="w-[calc(50%-4px)] sm:w-[170px]" aria-label="Périodicité" />
            <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-[calc(50%-4px)] sm:w-[185px]" aria-label="Tri" />
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Rechercher une offre, une note…" className="md:w-[300px]" />
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <FilterChip active={!ls.filters.status} onClick={() => ls.setFilter("status", null)} count={all?.length}>
              Tous
            </FilterChip>
            {SUBSCRIPTION_STATUS.map((st) => (
              <FilterChip key={st.value} active={ls.filters.status === st.value} onClick={() => ls.setFilter("status", ls.filters.status === st.value ? null : st.value)} count={all ? (derived.counts[st.value] ?? 0) : undefined}>
                {st.label}
              </FilterChip>
            ))}
          </div>
        </div>

        <Glass className="overflow-hidden" radius="lg">
          <DataTable
            columns={columns}
            rows={rows}
            loading={isLoading || (isFetching && !rows.length)}
            sort={ls.sort}
            onSortChange={ls.setSort}
            onRowClick={openSheet}
            empty={empty}
            page={ls.page}
            pageSize={ls.pageSize}
            total={data?.total}
            onPageChange={ls.setPage}
            rowClassName={(s) => (s.status === "canceled" ? "opacity-60" : undefined)}
          />
        </Glass>
      </div>

      <SubscriptionSheet
        id={shownId}
        initial={sheetSeed?.id === shownId ? sheetSeed : rows.find((r) => r.id === shownId)}
        open={!!sheetId}
        onOpenChange={(o) => !o && closeSheet()}
        actions={actions}
        handlers={{ onEdit: openEdit, onChangePlan: openPlan, onCancel: openCancel }}
      />

      <RecordDialog resource="subscriptions" open={creating} onOpenChange={setCreating} initial={{ owner_id: me?.id, start_date: isoDate() }} labels={{ owner_id: me?.name }} onSaved={(row) => openSheet(row as unknown as Subscription)} />
      <RecordDialog
        resource="subscriptions"
        open={editOpen}
        onOpenChange={setEditOpen}
        recordId={editTarget?.id}
        initial={editTarget ? (editTarget as unknown as Record<string, unknown>) : undefined}
        labels={{ company_id: editTarget?.company?.name, product_id: editTarget?.product?.name }}
      />
      <ChangePlanDialog sub={planTarget} open={planOpen} onOpenChange={setPlanOpen} />
      <CancelDialog sub={cancelTarget} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

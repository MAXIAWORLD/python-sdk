import { CalendarClock, CalendarDays, Check, Copy, LayoutGrid, MailOpen, MailX, Megaphone, MousePointerClick, MoreHorizontal, PencilLine, Plus, Rows3, Send, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader, StatTile } from "@/components/data/blocks";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { aggregateRecipients, campaignMetrics, humanizeVariables, isSent, TRACKING_NOTE, type CampaignMetrics, type CampaignRecipient } from "@/components/marketing/campaign-utils";
import { CampaignMetricsRow, MetricBar } from "@/components/marketing/CampaignMetrics";
import { MarketingTabs } from "@/components/marketing/MarketingTabs";
import { NewCampaignDialog } from "@/components/marketing/NewCampaignDialog";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/fields";
import { Menu, Tooltip, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { date, dateTime, number, percent, relative } from "@/lib/format";
import { toastError, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Campaign, Contact, Segment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-updated_at", label: "Modifiées récemment" },
  { value: "-sent_at", label: "Date d'envoi" },
  { value: "name", label: "Nom (A → Z)" },
];

const DAY = 86_400_000;

function whenLabel(c: Campaign) {
  if (c.status === "sent" || c.status === "sending") return { icon: <Send className="size-3.5" />, text: c.sent_at ? `Envoyée le ${date(c.sent_at)}` : "Envoi en cours" };
  if (c.status === "scheduled" && c.scheduled_at) return { icon: <CalendarClock className="size-3.5" />, text: `Programmée le ${dateTime(c.scheduled_at)}` };
  return { icon: <CalendarDays className="size-3.5" />, text: `Modifiée ${relative(c.updated_at)}` };
}

function DraftProgress({ c }: { c: Campaign }) {
  const items = [
    { label: "Audience", done: !!c.segment_id },
    { label: "Contenu", done: !!(c.subject && c.body) },
    { label: "Envoi", done: c.status === "scheduled" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => (
        <span key={it.label} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium", it.done ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-black/[0.05] text-fg-3 dark:bg-white/[0.07]")}>
          {it.done ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current opacity-60" />}
          {it.label}
        </span>
      ))}
      <span className="ml-auto text-[12px] font-medium text-accent">Continuer →</span>
    </div>
  );
}

function CampaignCard({ c, m, color, index, menu, onOpen }: { c: Campaign; m: CampaignMetrics; color?: string; index: number; menu: ReactNode; onOpen: () => void }) {
  const when = whenLabel(c);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.03, 0.3), type: "spring", stiffness: 260, damping: 26 }} className="h-full">
      <TiltCard className="flex h-full flex-col p-5" onClick={onOpen}>
        <div className="flex items-center justify-between gap-2">
          <StatusBadge options={CAMPAIGN_STATUS} value={c.status} size="xs" />
          <div onClick={(e) => e.stopPropagation()}>{menu}</div>
        </div>
        <div className="mt-2.5 line-clamp-1 text-[16px] font-semibold tracking-[-0.015em]">{c.name}</div>
        <div className={cn("mt-0.5 line-clamp-1 text-[13px]", c.subject ? "text-fg-2" : "italic text-fg-3")}>{c.subject ? humanizeVariables(c.subject) : "Objet à rédiger"}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: c.segment ? (color ?? "var(--accent)") : "var(--hairline-strong)" }} />
            <span className="truncate">{c.segment?.name ?? "Aucun segment"}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            {when.icon}
            {when.text}
          </span>
        </div>
        <div className="mt-auto border-t border-[var(--hairline)] pt-3.5">{isSent(c) ? <CampaignMetricsRow m={m} /> : <DraftProgress c={c} />}</div>
      </TiltCard>
    </motion.div>
  );
}

export default function CampaignsPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const ls = useListState({ filters: ["status"], defaultSort: "-updated_at" });
  const { data, isLoading, isFetching } = useList<Campaign>("campaigns", ls.params);
  const all = useList<Campaign>("campaigns", { limit: 500, expand: 0, sort: "-sent_at" }).data?.items;
  const engaged = useList<CampaignRecipient>("campaign-recipients", { status__in: "opened,clicked,unsubscribed", limit: 1000, expand: 0 }).data?.items;
  const unsubscribed = useList<Pick<Contact, "id" | "unsubscribed_at">>("contacts", { unsubscribed_at__isnull: false, sort: "-unsubscribed_at", limit: 500, expand: 0 }).data?.items;
  const segments = useList<Segment>("segments", { limit: 500, expand: 0 }).data?.items;
  const [view, setView] = useLocalStorage<"cards" | "table">("prisme-campaigns-view", "cards");
  const [creating, setCreating] = useState(false);
  const writable = can(user, "member");
  const rows = data?.items ?? [];

  const agg = useMemo(() => aggregateRecipients(engaged ?? []), [engaged]);
  const colors = useMemo(() => Object.fromEntries((segments ?? []).map((s) => [s.id, s.color])) as Record<number, string>, [segments]);

  const kpi = useMemo(() => {
    const now = Date.now();
    const recent = (all ?? []).filter((c) => c.sent_at && now - new Date(c.sent_at).getTime() <= 90 * DAY);
    const ms = recent.map((c) => campaignMetrics(c, agg[c.id]));
    const sent = ms.reduce((s, m) => s + m.sent, 0);
    const tracked = ms.filter((m) => m.opened !== null);
    const trackedSent = tracked.reduce((s, m) => s + m.sent, 0);
    const openRate = trackedSent ? (tracked.reduce((s, m) => s + (m.opened ?? 0), 0) / trackedSent) * 100 : null;
    const clickRate = trackedSent ? (tracked.reduce((s, m) => s + (m.clicked ?? 0), 0) / trackedSent) * 100 : null;
    const unsub = (unsubscribed ?? []).filter((c) => c.unsubscribed_at && now - new Date(c.unsubscribed_at).getTime() <= 90 * DAY).length;
    const weeks = Array.from({ length: 13 }, () => 0);
    for (const c of recent) {
      const w = Math.min(12, Math.floor((now - new Date(c.sent_at!).getTime()) / (7 * DAY)));
      weeks[12 - w] += Number(c.stats?.sent ?? 0);
    }
    return { sent, campaigns: recent.length, openRate, clickRate, unsub, weeks };
  }, [all, agg, unsubscribed]);

  const statusCount = (s: string) => all?.filter((c) => c.status === s).length ?? 0;

  const duplicate = async (c: Campaign) => {
    try {
      const copy = await api.post<Campaign>("/campaigns", { name: `${c.name} (copie)`, channel: c.channel, segment_id: c.segment_id, subject: c.subject, preheader: c.preheader, body: c.body, from_name: c.from_name, from_email: c.from_email, tags: c.tags });
      invalidate("campaigns");
      toast.success("Campagne dupliquée", { description: "La copie est un brouillon modifiable." });
      navigate(`/campaigns/${copy.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (c: Campaign) => {
    if (!(await confirm({ title: `Supprimer « ${c.name} » ?`, description: "Ce brouillon et son contenu seront définitivement supprimés.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/campaigns/${c.id}`);
      invalidate("campaigns");
      toast.success("Campagne supprimée");
    } catch (e) {
      toastError(e);
    }
  };

  const menuFor = (c: Campaign) => (
    <Menu
      trigger={
        <button className="rounded-[10px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Actions de la campagne">
          <MoreHorizontal className="size-4" />
        </button>
      }
      items={[
        { label: isSent(c) ? "Voir les résultats" : "Modifier", icon: <PencilLine className="size-4" />, onSelect: () => navigate(`/campaigns/${c.id}`) },
        { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: () => duplicate(c), disabled: !writable },
        ...(!isSent(c) ? [{ separator: true, label: "" }, { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(c), disabled: !writable }] : []),
      ]}
    />
  );

  const trackingHint = (
    <Tooltip content={TRACKING_NOTE}>
      <span className="cursor-help underline decoration-dotted underline-offset-2">Mesure non activée (CNIL)</span>
    </Tooltip>
  );

  const columns: Column<Campaign>[] = [
    {
      key: "name",
      header: "Campagne",
      sortKey: "name",
      cell: (c) => (
        <div className="min-w-0 max-w-[340px]">
          <div className="truncate font-medium">{c.name}</div>
          <div className="truncate text-[12px] text-fg-3">{c.subject ? humanizeVariables(c.subject) : "Objet à rédiger"}</div>
        </div>
      ),
    },
    { key: "status", header: "Statut", cell: (c) => <StatusBadge options={CAMPAIGN_STATUS} value={c.status} size="xs" /> },
    {
      key: "segment",
      header: "Segment",
      hideOnMobile: true,
      cell: (c) => (
        <span className="inline-flex max-w-[180px] items-center gap-1.5 text-[13px]">
          <span className="size-2 shrink-0 rounded-full" style={{ background: c.segment_id ? (colors[c.segment_id] ?? "var(--accent)") : "var(--hairline-strong)" }} />
          <span className="truncate">{c.segment?.name ?? "—"}</span>
        </span>
      ),
    },
    { key: "date", header: "Date", sortKey: "sent_at", hideOnMobile: true, cell: (c) => <span className="whitespace-nowrap text-[12.5px] text-fg-2">{c.sent_at ? date(c.sent_at) : c.scheduled_at && c.status === "scheduled" ? `Prévue ${date(c.scheduled_at, "d MMM HH:mm")}` : "—"}</span> },
    ...(["sent", "open", "click", "unsub"] as const).map((k) => ({
      key: k,
      header: { sent: "Envoyés", open: "Ouverture", click: "Clics", unsub: "Désinscrits" }[k],
      hideOnMobile: true,
      width: "112px",
      cell: (c: Campaign) => {
        if (!isSent(c)) return <span className="text-fg-3">—</span>;
        const m = campaignMetrics(c, agg[c.id]);
        if (k === "sent") return <MetricBar value={number(m.sent)} rate={m.deliveryRate} />;
        if (k === "open") return <MetricBar value={m.openRate === null ? "—" : percent(m.openRate, 1)} rate={m.openRate} untracked={m.openRate === null} />;
        if (k === "click") return <MetricBar value={m.clickRate === null ? "—" : percent(m.clickRate, 1)} rate={m.clickRate} untracked={m.clickRate === null} />;
        return <MetricBar value={number(m.unsubscribed)} rate={m.unsubRate} />;
      },
    })),
    { key: "menu", header: "", align: "right", width: "48px", cell: (c) => <div onClick={(e) => e.stopPropagation()}>{menuFor(c)}</div> },
  ];

  const empty = (
    <EmptyState
      icon={<Megaphone className="size-6" />}
      title={ls.activeFilterCount ? "Aucune campagne ne correspond" : "Lancez votre première campagne"}
      description={ls.activeFilterCount ? "Essayez d'élargir la recherche ou les filtres." : "Newsletter, invitation, lancement : rédigez avec Iris, ciblez un segment et envoyez dans le respect du RGPD."}
      action={
        ls.activeFilterCount ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : writable ? (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouvelle campagne
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div>
      <PageHeader
        kicker="Marketing"
        title="Campagnes"
        icon={<Megaphone className="size-5" />}
        description={data ? `${number(data.total)} campagne${data.total > 1 ? "s" : ""} · ${number(kpi.sent)} email${kpi.sent > 1 ? "s" : ""} envoyé${kpi.sent > 1 ? "s" : ""} sur 90 jours` : "Chargement…"}
        actions={
          writable && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvelle campagne
            </Button>
          )
        }
      />
      <MarketingTabs className="mb-5" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Emails envoyés (90 j)" value={kpi.sent} format={(v) => number(Math.round(v))} trend={kpi.weeks} hint={`${kpi.campaigns} campagne${kpi.campaigns > 1 ? "s" : ""} envoyée${kpi.campaigns > 1 ? "s" : ""}`} icon={<Send className="size-4" />} onClick={() => ls.setFilter("status", "sent")} />
        <StatTile label="Taux d'ouverture moyen" value={kpi.openRate ?? 0} format={(v) => (kpi.openRate === null ? "—" : percent(v, 1))} hint={kpi.openRate === null ? trackingHint : "Pondéré par le volume envoyé"} icon={<MailOpen className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
        <StatTile label="Taux de clic" value={kpi.clickRate ?? 0} format={(v) => (kpi.clickRate === null ? "—" : percent(v, 1))} hint={kpi.clickRate === null ? trackingHint : "Clics / emails envoyés"} icon={<MousePointerClick className="size-4" />} accent="linear-gradient(135deg,#22d3ee,#5b6cff)" />
        <StatTile label="Désinscriptions (90 j)" value={kpi.unsub} format={(v) => number(Math.round(v))} hint={kpi.sent ? `${percent((kpi.unsub / kpi.sent) * 100, 2)} des emails envoyés` : "Lien présent dans chaque email"} icon={<MailX className="size-4" />} accent="linear-gradient(135deg,#ff9f0a,#ff375f)" />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Nom ou objet…" className="lg:w-[280px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={!ls.filters.status} onClick={() => ls.setFilter("status", null)} count={all?.length}>
            Toutes
          </FilterChip>
          {CAMPAIGN_STATUS.filter((s) => s.value !== "sending" && (s.value !== "paused" || statusCount("paused") > 0)).map((s) => (
            <FilterChip key={s.value} active={ls.filters.status === s.value} onClick={() => ls.setFilter("status", ls.filters.status === s.value ? null : s.value)} count={statusCount(s.value)}>
              {s.value === "draft" ? "Brouillons" : s.value === "scheduled" ? "Programmées" : s.value === "sent" ? "Envoyées" : s.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-full sm:w-[215px]" />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "cards", label: <LayoutGrid className="size-4" aria-label="Cartes" /> },
              { value: "table", label: <Rows3 className="size-4" aria-label="Tableau" /> },
            ]}
          />
        </div>
      </div>

      {view === "table" ? (
        <Glass className="overflow-hidden" radius="lg">
          <DataTable columns={columns} rows={rows} loading={isLoading || (isFetching && !rows.length)} sort={ls.sort} onSortChange={ls.setSort} onRowClick={(c) => navigate(`/campaigns/${c.id}`)} empty={empty} page={ls.page} pageSize={ls.pageSize} total={data?.total} onPageChange={ls.setPage} />
        </Glass>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[196px] rounded-[22px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Glass>{empty}</Glass>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c, i) => (
              <CampaignCard key={c.id} c={c} m={campaignMetrics(c, agg[c.id])} color={c.segment_id ? colors[c.segment_id] : undefined} index={i} menu={menuFor(c)} onOpen={() => navigate(`/campaigns/${c.id}`)} />
            ))}
          </div>
          {data && data.total > ls.pageSize && (
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" disabled={ls.page === 0} onClick={() => ls.setPage(ls.page - 1)}>
                Précédent
              </Button>
              <Button size="sm" disabled={(ls.page + 1) * ls.pageSize >= data.total} onClick={() => ls.setPage(ls.page + 1)}>
                Suivant
              </Button>
            </div>
          )}
        </>
      )}

      <NewCampaignDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

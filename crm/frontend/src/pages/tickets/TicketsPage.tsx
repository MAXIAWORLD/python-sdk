import { AlarmClock, BookOpen, CircleCheck, Columns3, Download, Flag, LifeBuoy, Plus, Rows3, Trash2, UserCog, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { BulkBar } from "@/components/entity/EntityBlocks";
import { Glass } from "@/components/glass/Glass";
import { ChannelLabel } from "@/components/support/channels";
import { SlaBadge } from "@/components/support/sla";
import { TicketBoard } from "@/components/support/TicketBoard";
import { TicketStatTiles, UNRESOLVED, useTicketStats } from "@/components/support/TicketStats";
import { ago, useNow } from "@/components/support/time";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { SearchInput, Select } from "@/components/ui/fields";
import { Menu, Popover, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { labelOf, TICKET_CHANNELS, TICKET_PRIORITY, TICKET_STATUS } from "@/lib/constants";
import { relative } from "@/lib/format";
import { toastError, useInvalidate, useItem, useList, useLocalStorage, type Params } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Company, Contact, Ticket, User } from "@/lib/types";
import { useAuth } from "@/stores/auth";

const FILTERS = ["status", "priority", "assignee_id", "channel", "sla", "contact_id", "company_id"];

const SORTS = [
  { value: "-updated_at", label: "Dernière activité" },
  { value: "-created_at", label: "Plus récents" },
  { value: "sla_due_at", label: "Échéance SLA" },
  { value: "created_at", label: "Plus anciens" },
];

const STATUS_CHIPS = [{ value: "unresolved", label: "Non résolus" }, ...TICKET_STATUS];

/**
 * Translate the URL filters (incl. the « unresolved » and « breached » shortcuts) into API params.
 * « Hors SLA » is resolved to the ids counted by the tiles, so the list always matches the live counter.
 */
function toApiParams(params: Params, breachedIds: string): Params {
  const { status, sla, ...rest } = params;
  const out: Params = { ...rest };
  if (status === "unresolved") out.status__in = UNRESOLVED;
  else if (status) out.status = status;
  if (sla === "breached") out.id__in = breachedIds || "0";
  return out;
}

function Requester({ ticket }: { ticket: Ticket }) {
  if (!ticket.contact && !ticket.company) return <span className="text-fg-3">—</span>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={ticket.contact?.name ?? ticket.company?.name} src={(ticket.contact?.avatar_url as string) ?? undefined} size={30} />
      <div className="min-w-0">
        {ticket.contact ? (
          <Link to={`/contacts/${ticket.contact.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:text-accent">
            {ticket.contact.name}
          </Link>
        ) : null}
        {ticket.company ? (
          <Link to={`/companies/${ticket.company.id}`} onClick={(e) => e.stopPropagation()} className={ticket.contact ? "block truncate text-[12px] text-fg-3 hover:text-accent" : "block truncate font-medium hover:text-accent"}>
            {ticket.company.name}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const me = useAuth((s) => s.user);
  const now = useNow(30_000);
  const ls = useListState({ filters: FILTERS, defaultSort: "-updated_at" });
  const [view, setView] = useLocalStorage<"table" | "board">("prisme-tickets-view", "table");
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const stats = useTicketStats(now);
  const users = useList<User>("users", { limit: 200, sort: "name", is_active: true, expand: 0 });

  const breachedKey = stats.breachedIds.join(",");
  const params = useMemo(() => toApiParams(ls.params, breachedKey), [ls.params, breachedKey]);
  // The board shows every status as a column: drop the status filter, keep the others.
  const boardParams = useMemo<Params>(() => ({ ...params, status: undefined, status__in: undefined, offset: undefined, limit: 300, sort: "sla_due_at" }), [params]);

  // « Hors SLA » needs the breached ids first: wait for them instead of flashing an empty list.
  const waitingIds = ls.filters.sla === "breached" && stats.loading;
  const list = useList<Ticket>("tickets", params, { enabled: view === "table" && !waitingIds });
  const board = useList<Ticket>("tickets", boardParams, { enabled: view === "board" && !waitingIds });
  const rows = list.data?.items ?? [];

  const contactFilter = useItem<Contact>("contacts", ls.filters.contact_id ? Number(ls.filters.contact_id) : null);
  const companyFilter = useItem<Company>("companies", ls.filters.company_id ? Number(ls.filters.company_id) : null);

  const bulk = async (action: "update" | "delete", data?: Record<string, unknown>, message = "Tickets mis à jour") => {
    try {
      await api.post("/tickets/bulk", { action, ids: ls.selected, data });
      toast.success(message);
      ls.clearSelection();
      invalidate("tickets");
    } catch (e) {
      toastError(e);
    }
  };

  const moveTicket = async (ticket: Ticket, status: string) => {
    try {
      await api.patch(`/tickets/${ticket.id}`, { status });
      toast.success(`${ticket.number} · ${labelOf(TICKET_STATUS, status)}`);
      invalidate("tickets");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  // Both keys in a single navigation: two successive setFilter calls in one tick would overwrite each other.
  const applyTileFilter = ({ status, sla }: { status?: string; sla?: string }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of [
          ["status", status],
          ["sla", sla],
        ] as const) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
    ls.setPage(0);
    ls.clearSelection();
    setView("table");
  };

  const columns: Column<Ticket>[] = [
    {
      key: "subject",
      header: "Ticket",
      sortKey: "created_at",
      cell: (t) => (
        <div className="min-w-0 max-w-[200px] sm:max-w-[300px] md:max-w-[380px]">
          <div className="truncate font-medium">{t.subject}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-fg-3">
            <span className="tabular">{t.number}</span>
            {t.category && <span>· {t.category}</span>}
            <span className="md:hidden">· {labelOf(TICKET_STATUS, t.status)}</span>
            <ChannelLabel channel={t.channel} iconOnly className="2xl:hidden" />
          </div>
        </div>
      ),
    },
    { key: "requester", header: "Demandeur", hideOnMobile: true, cell: (t) => <Requester ticket={t} /> },
    { key: "priority", header: "Priorité", hideOnMobile: true, cell: (t) => <StatusBadge options={TICKET_PRIORITY} value={t.priority} size="xs" /> },
    { key: "status", header: "Statut", hideOnMobile: true, cell: (t) => <StatusBadge options={TICKET_STATUS} value={t.status} size="xs" /> },
    { key: "channel", header: "Canal", className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell", cell: (t) => <ChannelLabel channel={t.channel} className="text-[12.5px]" /> },
    {
      key: "assignee",
      header: "Assigné",
      hideOnMobile: true,
      cell: (t) =>
        t.assignee ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={t.assignee.name} color={(t.assignee.color as string) ?? undefined} size={24} />
            <span className="hidden truncate text-[12.5px] text-fg-2 2xl:inline">{t.assignee.name}</span>
          </span>
        ) : (
          <span className="inline-block size-6 rounded-full border border-dashed border-[var(--hairline-strong)]" title="Non assigné" />
        ),
    },
    { key: "sla", header: "SLA", sortKey: "sla_due_at", cell: (t) => <SlaBadge ticket={t} now={now} /> },
    {
      key: "updated",
      header: "Activité",
      sortKey: "updated_at",
      align: "right",
      hideOnMobile: true,
      cell: (t) => (
        <span title={`Mis à jour ${relative(t.updated_at)}`} className="whitespace-nowrap text-[12.5px] text-fg-3 tabular">
          {ago(t.updated_at, now)}
        </span>
      ),
    },
  ];

  const filtered = ls.activeFilterCount > 0;
  const empty = (
    <EmptyState
      icon={<LifeBuoy className="size-6" />}
      title={filtered ? "Aucun ticket ne correspond" : "Aucun ticket pour l'instant"}
      description={filtered ? "Essayez d'élargir votre recherche ou vos filtres." : "Les demandes de vos clients arriveront ici. Créez un premier ticket pour tester le flux."}
      action={
        filtered ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouveau ticket
          </Button>
        )
      }
    />
  );

  const assigneeOptions = [{ value: "", label: "Tous les agents" }, { value: "null", label: "Non assignés" }, ...(users.data?.items ?? []).map((u) => ({ value: String(u.id), label: u.name }))];

  return (
    <div>
      <PageHeader
        title="Tickets"
        icon={<LifeBuoy className="size-5" />}
        description={stats.loading ? "Chargement…" : `${stats.unresolved} ouvert${stats.unresolved > 1 ? "s" : ""} · ${stats.toHandle} à traiter${stats.breached ? ` · ${stats.breached} hors SLA` : ""}`}
        actions={
          <>
            <Button variant="glass" icon={<BookOpen className="size-4" />} onClick={() => navigate("/kb")}>
              Base de connaissances
            </Button>
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/tickets.csv", "tickets.csv", { ...params, limit: undefined, offset: undefined }).catch(toastError)}>
              Exporter
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouveau ticket
            </Button>
          </>
        }
      />

      <TicketStatTiles stats={stats} onFilter={applyTileFilter} />

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Sujet, numéro, catégorie…" className="lg:w-[300px]" />
        {view === "table" ? (
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <FilterChip active={!ls.filters.status} onClick={() => ls.setFilter("status", null)}>
              Tous
            </FilterChip>
            {STATUS_CHIPS.map((s) => (
              <FilterChip key={s.value} active={ls.filters.status === s.value} onClick={() => ls.setFilter("status", ls.filters.status === s.value ? null : s.value)}>
                {s.label}
              </FilterChip>
            ))}
          </div>
        ) : (
          <p className="flex-1 text-[12.5px] text-fg-3">Glissez une carte d'une colonne à l'autre pour changer son statut.</p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip active={ls.filters.sla === "breached"} onClick={() => ls.setFilter("sla", ls.filters.sla === "breached" ? null : "breached")} count={stats.breached || undefined}>
          <AlarmClock className="size-3.5" /> Hors SLA
        </FilterChip>
        {me && (
          <FilterChip active={ls.filters.assignee_id === String(me.id)} onClick={() => ls.setFilter("assignee_id", ls.filters.assignee_id === String(me.id) ? null : me.id)}>
            Mes tickets
          </FilterChip>
        )}
        <Select options={[{ value: "", label: "Toutes priorités" }, ...TICKET_PRIORITY]} value={ls.filters.priority ?? ""} onChange={(v) => ls.setFilter("priority", v)} className="w-[156px]" />
        <Select options={[{ value: "", label: "Tous les canaux" }, ...TICKET_CHANNELS]} value={ls.filters.channel ?? ""} onChange={(v) => ls.setFilter("channel", v)} className="w-[156px]" />
        <Select options={assigneeOptions} value={ls.filters.assignee_id ?? ""} onChange={(v) => ls.setFilter("assignee_id", v)} className="w-[170px]" />
        {ls.filters.contact_id && (
          <button onClick={() => ls.setFilter("contact_id", null)} className="glass-flat inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-fg-2 hover:text-fg">
            Contact : {contactFilter.data?.full_name ?? "…"} <X className="size-3.5" />
          </button>
        )}
        {ls.filters.company_id && (
          <button onClick={() => ls.setFilter("company_id", null)} className="glass-flat inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-fg-2 hover:text-fg">
            Entreprise : {companyFilter.data?.name ?? "…"} <X className="size-3.5" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {view === "table" && <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-[170px]" />}
          <Segmented
            value={view}
            onChange={setView}
            options={[
              {
                value: "table",
                label: (
                  <span className="flex items-center gap-1.5">
                    <Rows3 className="size-4" />
                    Liste
                  </span>
                ),
              },
              {
                value: "board",
                label: (
                  <span className="flex items-center gap-1.5">
                    <Columns3 className="size-4" />
                    Kanban
                  </span>
                ),
              },
            ]}
          />
        </div>
      </div>

      {view === "table" ? (
        <Glass className="overflow-hidden" radius="lg">
          <DataTable
            columns={columns}
            rows={rows}
            loading={waitingIds || list.isLoading || (list.isFetching && !rows.length)}
            sort={ls.sort}
            onSortChange={ls.setSort}
            onRowClick={(t) => navigate(`/tickets/${t.id}`)}
            selectable
            selected={ls.selected}
            onSelectedChange={ls.setSelected}
            empty={empty}
            page={ls.page}
            pageSize={ls.pageSize}
            total={list.data?.total}
            onPageChange={ls.setPage}
            rowClassName={(t) => (t.status === "closed" ? "opacity-70" : undefined)}
          />
        </Glass>
      ) : board.data && board.data.items.length === 0 && !board.isLoading ? (
        <Glass>{empty}</Glass>
      ) : (
        <TicketBoard tickets={board.data?.items ?? []} loading={waitingIds || board.isLoading} now={now} onMove={moveTicket} />
      )}

      <BulkBar count={ls.selected.length} onClear={ls.clearSelection}>
        <Button size="sm" variant="ghost" icon={<CircleCheck className="size-4" />} onClick={() => bulk("update", { status: "resolved" }, "Tickets résolus")}>
          Résoudre
        </Button>
        <Menu
          trigger={
            <Button size="sm" variant="ghost">
              Statut
            </Button>
          }
          items={TICKET_STATUS.map((s) => ({ label: s.label, onSelect: () => bulk("update", { status: s.value }) }))}
        />
        <Menu
          trigger={
            <Button size="sm" variant="ghost" icon={<Flag className="size-4" />}>
              Priorité
            </Button>
          }
          items={TICKET_PRIORITY.map((p) => ({ label: p.label, onSelect: () => bulk("update", { priority: p.value }) }))}
        />
        <Popover
          width={280}
          trigger={
            <Button size="sm" variant="ghost" icon={<UserCog className="size-4" />}>
              Assigner
            </Button>
          }
        >
          <div className="p-3">
            <div className="mb-2 text-[12.5px] font-medium text-fg-2">Assigner à</div>
            <EntitySelect resource="users" value={null} onChange={(id) => id && bulk("update", { assignee_id: id }, "Tickets assignés")} placeholder="Choisir un membre…" />
          </div>
        </Popover>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (await confirm({ title: `Supprimer ${ls.selected.length} ticket(s) ?`, description: "Les conversations associées seront également supprimées. Cette action est définitive.", danger: true, confirmLabel: "Supprimer" }))
              bulk("delete", undefined, "Tickets supprimés");
          }}
        >
          Supprimer
        </Button>
      </BulkBar>

      <RecordDialog resource="tickets" open={creating} onOpenChange={setCreating} navigateOnCreate initial={{ assignee_id: me?.id }} labels={{ assignee_id: me?.name }} />
    </div>
  );
}

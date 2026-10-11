import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Download, Factory, LayoutGrid, MapPin, Plus, Rows3, Shapes, Tag as TagIcon, Trash2, Upload, UserCog, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CompanyAvatar, HealthMeter } from "@/components/crm/visuals";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { BulkBar } from "@/components/entity/EntityBlocks";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton, Spinner, StatusBadge, Tag } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Input, SearchInput, Select } from "@/components/ui/fields";
import { Menu, Popover, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { COMPANY_STATUS, COMPANY_TYPES } from "@/lib/constants";
import { relative } from "@/lib/format";
import { errorMessage, toastError, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Company, Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-created_at", label: "Plus récentes" },
  { value: "name", label: "Nom (A → Z)" },
  { value: "-health_score", label: "Meilleure santé" },
  { value: "health_score", label: "Santé à surveiller" },
  { value: "-last_activity_at", label: "Dernière activité" },
];

function siteLabel(c: Company) {
  return c.domain || c.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || null;
}

/* -------------------------------------------------------------------------- */
/* Industry filter (values loaded on demand)                                  */
/* -------------------------------------------------------------------------- */

function IndustryFilter({ value, onChange }: { value?: string; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["companies", "industries"],
    queryFn: () => api.get<Paginated<Company>>("/companies", { limit: 1000, expand: 0, sort: "industry" }),
    enabled: open,
    staleTime: 60_000,
  });
  const industries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data?.items ?? []) {
      const name = c.industry?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
  }, [data]);
  const shown = industries.filter(([name]) => name.toLowerCase().includes(search.trim().toLowerCase()));

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={280}
      align="start"
      trigger={
        <button
          type="button"
          className={cn("inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-all", value ? "btn-primary" : "glass-flat text-fg-2 hover:text-fg")}
        >
          <Factory className="size-3.5 shrink-0" />
          <span className="truncate">{value ?? "Secteur"}</span>
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Retirer le filtre secteur"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              className="-mr-1 rounded-full p-0.5 hover:bg-white/25"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3.5 shrink-0 opacity-70" />
          )}
        </button>
      }
    >
      <div className="p-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un secteur…" className="h-9 text-[13px]" autoFocus />
        <div className="mt-1.5 max-h-[280px] overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6 text-fg-3">
              <Spinner className="size-4" />
            </div>
          )}
          {!isLoading && shown.length === 0 && <p className="px-3 py-5 text-center text-[12.5px] text-fg-3">Aucun secteur</p>}
          {value && !search && (
            <button type="button" onClick={() => pick(null)} className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] font-medium text-accent hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              Tous les secteurs
            </button>
          )}
          {shown.map(([name, count]) => (
            <button key={name} type="button" onClick={() => pick(name)} className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="text-[11.5px] text-fg-3 tabular">{count}</span>
              {value === name && <Check className="size-3.5 text-accent" />}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function CompaniesPage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const ls = useListState({ filters: ["type", "owner_id", "status", "industry"], defaultSort: "-created_at" });
  const { data, isLoading, isFetching } = useList<Company>("companies", ls.params);
  const [view, setView] = useLocalStorage<"table" | "cards">("prisme-companies-view", "table");
  const [creating, setCreating] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const rows = data?.items ?? [];
  const selectedRows = rows.filter((r) => ls.selected.includes(r.id));
  const mine = !!me && ls.filters.owner_id === String(me.id);

  const bulkUpdate = async (payload: Record<string, unknown>, message: string) => {
    try {
      await api.post("/companies/bulk", { action: "update", ids: ls.selected, data: payload });
      toast.success(message);
      ls.clearSelection();
      invalidate("companies", "contacts");
    } catch (e) {
      toastError(e);
    }
  };

  const addTag = async () => {
    const tag = tagDraft.trim().replace(/^#/, "");
    if (!tag) return;
    try {
      await Promise.all(selectedRows.map((c) => api.patch(`/companies/${c.id}`, { tags: Array.from(new Set([...(c.tags ?? []), tag])) })));
      toast.success(`Tag #${tag} ajouté`);
      setTagDraft("");
      invalidate("companies");
    } catch (e) {
      toastError(e);
    }
  };

  const bulkDelete = async () => {
    const n = ls.selected.length;
    const ok = await confirm({
      title: `Supprimer ${n} entreprise${n > 1 ? "s" : ""} ?`,
      description: "Les contacts et opportunités liés sont conservés mais détachés. Les entreprises ayant des factures émises sont conservées (obligation légale de 10 ans).",
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    const results = await Promise.allSettled(ls.selected.map((id) => api.delete(`/companies/${id}`)));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    const done = results.length - failures.length;
    if (!failures.length) toast.success(`${done} entreprise${done > 1 ? "s" : ""} supprimée${done > 1 ? "s" : ""}`);
    else
      toast.warning(`${done} supprimée${done > 1 ? "s" : ""}, ${failures.length} conservée${failures.length > 1 ? "s" : ""}`, {
        description: errorMessage(failures[0].reason),
      });
    ls.clearSelection();
    invalidate("companies", "contacts", "deals");
  };

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Entreprise",
      sortKey: "name",
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <CompanyAvatar name={c.name} logoUrl={c.logo_url} domain={c.domain} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{c.name}</span>
              {c.status !== "active" && <StatusBadge options={COMPANY_STATUS} value={c.status} size="xs" />}
            </div>
            <div className="truncate text-[12px] text-fg-3">{siteLabel(c) ?? c.email ?? "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", sortKey: "type", cell: (c) => <StatusBadge options={COMPANY_TYPES} value={c.type} /> },
    {
      key: "industry",
      header: "Secteur",
      sortKey: "industry",
      hideOnMobile: true,
      cell: (c) =>
        c.industry ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              ls.setFilter("industry", c.industry);
            }}
            className="line-clamp-1 text-left text-fg-2 decoration-[var(--hairline-strong)] underline-offset-4 hover:text-accent hover:underline"
            title={`Filtrer sur « ${c.industry} »`}
          >
            {c.industry}
          </button>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    { key: "city", header: "Ville", sortKey: "city", hideOnMobile: true, cell: (c) => <span className="line-clamp-1 text-fg-2">{c.city ?? "—"}</span> },
    { key: "health", header: "Santé", sortKey: "health_score", cell: (c) => <HealthMeter score={c.health_score} width={52} /> },
    {
      key: "tags",
      header: "Tags",
      hideOnMobile: true,
      cell: (c) => {
        const shown = c.tags.length > 1 && c.tags[0].length + c.tags[1].length > 16 ? 1 : 2;
        return (
          <div className="flex max-w-[190px] items-center gap-1" title={c.tags.map((t) => `#${t}`).join(" ") || undefined}>
            {c.tags.slice(0, shown).map((t) => (
              <Tag key={t} className="max-w-[140px] truncate">
                {t}
              </Tag>
            ))}
            {c.tags.length > shown && <span className="shrink-0 text-[11px] text-fg-3">+{c.tags.length - shown}</span>}
          </div>
        );
      },
    },
    { key: "owner", header: "Resp.", hideOnMobile: true, cell: (c) => (c.owner ? <Avatar name={c.owner.name} color={(c.owner.color as string) ?? undefined} size={24} /> : null) },
    {
      key: "last",
      header: "Dernière activité",
      sortKey: "last_activity_at",
      align: "right",
      hideOnMobile: true,
      cell: (c) => <span className="whitespace-nowrap text-[12.5px] text-fg-3">{c.last_activity_at ? relative(c.last_activity_at) : "—"}</span>,
    },
  ];

  const empty = (
    <EmptyState
      icon={<Building2 className="size-6" />}
      title={ls.activeFilterCount ? "Aucune entreprise ne correspond" : "Aucune entreprise pour l'instant"}
      description={ls.activeFilterCount ? "Essayez d'élargir votre recherche ou vos filtres." : "Ajoutez vos clients, prospects et partenaires, ou importez un fichier CSV."}
      action={
        ls.activeFilterCount ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouvelle entreprise
          </Button>
        )
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Entreprises"
        description={data ? `${data.total.toLocaleString("fr-FR")} entreprise${data.total > 1 ? "s" : ""}` : "Chargement…"}
        icon={<Building2 className="size-5" />}
        actions={
          <>
            <Button variant="glass" icon={<Upload className="size-4" />} onClick={() => navigate("/settings?tab=data")}>
              Importer
            </Button>
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/companies.csv", "entreprises.csv", { ...ls.filters, q: ls.params.q as string | undefined }).catch(toastError)}>
              Exporter
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvelle entreprise
            </Button>
          </>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Nom, domaine, ville, SIREN, tag…" className="sm:w-[340px]" />
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select options={[{ value: "", label: "Tous statuts" }, ...COMPANY_STATUS]} value={ls.filters.status ?? ""} onChange={(v) => ls.setFilter("status", v)} className="min-w-0 flex-1 sm:w-[140px] sm:flex-none" aria-label="Statut" />
            <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="min-w-0 flex-1 sm:w-[180px] sm:flex-none" aria-label="Tri" />
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: <Rows3 className="size-4" aria-label="Tableau" /> },
                { value: "cards", label: <LayoutGrid className="size-4" aria-label="Cartes" /> },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={!ls.filters.type} onClick={() => ls.setFilter("type", null)}>
            Toutes
          </FilterChip>
          {COMPANY_TYPES.map((t) => (
            <FilterChip key={t.value} active={ls.filters.type === t.value} onClick={() => ls.setFilter("type", ls.filters.type === t.value ? null : t.value)}>
              {t.label}
            </FilterChip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-[var(--hairline-strong)] sm:block" />
          <FilterChip active={mine} onClick={() => ls.setFilter("owner_id", mine ? null : me?.id)}>
            Mes entreprises
          </FilterChip>
          <IndustryFilter value={ls.filters.industry} onChange={(v) => ls.setFilter("industry", v)} />
          {ls.activeFilterCount > 0 && (
            <button type="button" onClick={ls.clearFilters} className="ml-1 text-[12.5px] font-medium text-fg-3 transition hover:text-fg">
              Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {view === "table" ? (
        <Glass className="overflow-hidden" radius="lg">
          <DataTable
            columns={columns}
            rows={rows}
            loading={isLoading || (isFetching && !rows.length)}
            sort={ls.sort}
            onSortChange={ls.setSort}
            onRowClick={(c) => navigate(`/companies/${c.id}`)}
            selectable
            selected={ls.selected}
            onSelectedChange={ls.setSelected}
            empty={empty}
            page={ls.page}
            pageSize={ls.pageSize}
            total={data?.total}
            onPageChange={ls.setPage}
          />
        </Glass>
      ) : (
        <>
          {isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-[164px] rounded-[22px]" />
              ))}
            </div>
          )}
          {!isLoading && rows.length === 0 && <Glass>{empty}</Glass>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                <TiltCard className="flex h-full flex-col p-4" onClick={() => navigate(`/companies/${c.id}`)}>
                  <div className="flex items-start gap-3">
                    <CompanyAvatar name={c.name} logoUrl={c.logo_url} domain={c.domain} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="truncate text-[12.5px] text-fg-3">{siteLabel(c) ?? "—"}</div>
                    </div>
                    <StatusBadge options={COMPANY_TYPES} value={c.type} size="xs" />
                  </div>
                  <div className="mt-3 space-y-1 text-[12.5px] text-fg-2">
                    <div className="flex items-center gap-1.5">
                      <Shapes className="size-3.5 shrink-0 text-fg-3" />
                      <span className="truncate">{c.industry ?? "Secteur non renseigné"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 text-fg-3" />
                      <span className="truncate">{[c.city, c.country && c.country !== "France" ? c.country : null].filter(Boolean).join(", ") || "Ville non renseignée"}</span>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3 text-[12px] text-fg-3">
                    <span className="flex items-center gap-2">
                      Santé
                      <HealthMeter score={c.health_score} width={46} />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1" title={c.tags.map((t) => `#${t}`).join(" ") || undefined}>
                        <TagIcon className="size-3.5" />
                        <span className="tabular">{c.tags.length}</span>
                      </span>
                      {c.owner && <Avatar name={c.owner.name} color={(c.owner.color as string) ?? undefined} size={22} />}
                    </span>
                  </div>
                </TiltCard>
              </motion.div>
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

      {/* Portaled: the page transition wrapper keeps a CSS filter that would trap `position: fixed`. */}
      {createPortal(
        <BulkBar count={ls.selected.length} onClear={ls.clearSelection}>
          <Menu
            trigger={
              <Button size="sm" variant="ghost">
                Type
              </Button>
            }
            items={COMPANY_TYPES.map((t) => ({ label: t.label, onSelect: () => bulkUpdate({ type: t.value }, `Type « ${t.label} » appliqué`) }))}
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
              <div className="mb-2 text-[12.5px] font-medium text-fg-2">Nouveau responsable</div>
              <EntitySelect resource="users" value={null} onChange={(id) => id && bulkUpdate({ owner_id: id }, "Responsable mis à jour")} placeholder="Choisir un membre…" />
            </div>
          </Popover>
          <Popover
            width={260}
            trigger={
              <Button size="sm" variant="ghost" icon={<TagIcon className="size-4" />}>
                Tag
              </Button>
            }
          >
            <div className="flex gap-2 p-3">
              <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="nouveau-tag" autoFocus />
              <Button variant="primary" onClick={addTag}>
                OK
              </Button>
            </div>
          </Popover>
          <Button size="sm" variant="ghost" className="text-red-500" icon={<Trash2 className="size-4" />} onClick={bulkDelete}>
            Supprimer
          </Button>
        </BulkBar>,
        document.body,
      )}

      <RecordDialog resource="companies" open={creating} onOpenChange={setCreating} navigateOnCreate initial={{ owner_id: me?.id }} labels={{ owner_id: me?.name }} />
    </div>
  );
}

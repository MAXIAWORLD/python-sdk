import { Download, LayoutGrid, Mail, Plus, Rows3, Tag as TagIcon, Trash2, Upload, UserCog, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { BulkBar } from "@/components/entity/EntityBlocks";
import { EmailComposer } from "@/components/entity/EmailComposer";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, CompanyLogo, EmptyState, ScoreDot, Skeleton, StatusBadge, Tag } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Input, SearchInput, Select } from "@/components/ui/fields";
import { Menu, Popover, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { LIFECYCLE, SOURCES } from "@/lib/constants";
import { relative } from "@/lib/format";
import { toastError, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Contact } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { toast } from "sonner";

const SORTS = [
  { value: "-created_at", label: "Plus récents" },
  { value: "-last_contacted_at", label: "Dernier contact" },
  { value: "-lead_score", label: "Meilleur score" },
  { value: "last_name", label: "Nom (A → Z)" },
];

export default function ContactsPage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const ls = useListState({ filters: ["lifecycle", "owner_id", "company_id", "source", "tags__contains"], defaultSort: "-created_at" });
  const { data, isLoading, isFetching } = useList<Contact>("contacts", ls.params);
  const [view, setView] = useLocalStorage<"table" | "cards">("prisme-contacts-view", "table");
  const [creating, setCreating] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const rows = data?.items ?? [];
  const selectedRows = rows.filter((r) => ls.selected.includes(r.id));

  const bulk = async (action: "update" | "delete", payload?: Record<string, unknown>, message = "Contacts mis à jour") => {
    try {
      await api.post("/contacts/bulk", { action, ids: ls.selected, data: payload });
      toast.success(message);
      ls.clearSelection();
      invalidate("contacts");
    } catch (e) {
      toastError(e);
    }
  };

  const addTag = async () => {
    const tag = tagDraft.trim().replace(/^#/, "");
    if (!tag) return;
    try {
      await Promise.all(selectedRows.map((c) => api.patch(`/contacts/${c.id}`, { tags: Array.from(new Set([...(c.tags ?? []), tag])) })));
      toast.success(`Tag #${tag} ajouté`);
      setTagDraft("");
      invalidate("contacts");
    } catch (e) {
      toastError(e);
    }
  };

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Contact",
      sortKey: "last_name",
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={c.full_name} src={c.avatar_url} size={34} />
          <div className="min-w-0">
            <div className="truncate font-medium">{c.full_name}</div>
            <div className="truncate text-[12px] text-fg-3">{c.email ?? c.phone ?? "—"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "company",
      header: "Entreprise",
      hideOnMobile: true,
      cell: (c) =>
        c.company ? (
          <Link to={`/companies/${c.company.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2 hover:text-accent">
            <CompanyLogo name={c.company.name} size={22} />
            <span className="truncate">{c.company.name}</span>
          </Link>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    { key: "job_title", header: "Poste", hideOnMobile: true, cell: (c) => <span className="line-clamp-1 text-fg-2">{c.job_title ?? "—"}</span> },
    { key: "lifecycle", header: "Cycle de vie", sortKey: "lifecycle", cell: (c) => <StatusBadge options={LIFECYCLE} value={c.lifecycle} /> },
    { key: "score", header: "Score", sortKey: "lead_score", align: "right", hideOnMobile: true, cell: (c) => <ScoreDot score={c.lead_score} /> },
    {
      key: "tags",
      header: "Tags",
      hideOnMobile: true,
      cell: (c) => (
        <div className="flex max-w-[180px] flex-wrap gap-1">
          {c.tags.slice(0, 2).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          {c.tags.length > 2 && <span className="text-[11px] text-fg-3">+{c.tags.length - 2}</span>}
        </div>
      ),
    },
    { key: "owner", header: "Resp.", hideOnMobile: true, cell: (c) => (c.owner ? <Avatar name={c.owner.name} color={(c.owner.color as string) ?? undefined} size={24} /> : null) },
    { key: "last", header: "Dernier contact", sortKey: "last_contacted_at", align: "right", hideOnMobile: true, cell: (c) => <span className="whitespace-nowrap text-[12.5px] text-fg-3">{c.last_contacted_at ? relative(c.last_contacted_at) : "—"}</span> },
  ];

  const empty = (
    <EmptyState
      icon={<Users className="size-6" />}
      title={ls.activeFilterCount ? "Aucun contact ne correspond" : "Aucun contact pour l'instant"}
      description={ls.activeFilterCount ? "Essayez d'élargir votre recherche ou vos filtres." : "Ajoutez vos premiers contacts ou importez un fichier CSV."}
      action={
        ls.activeFilterCount ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouveau contact
          </Button>
        )
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Contacts"
        description={data ? `${data.total.toLocaleString("fr-FR")} contact${data.total > 1 ? "s" : ""}` : "Chargement…"}
        icon={<Users className="size-5" />}
        actions={
          <>
            <Button variant="glass" icon={<Upload className="size-4" />} onClick={() => navigate("/settings?tab=data")}>
              Importer
            </Button>
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/contacts.csv", "contacts.csv", { ...ls.filters, q: ls.params.q as string | undefined }).catch(toastError)}>
              Exporter
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouveau contact
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Nom, email, entreprise, tag…" className="lg:w-[320px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={!ls.filters.lifecycle} onClick={() => ls.setFilter("lifecycle", null)}>
            Tous
          </FilterChip>
          {LIFECYCLE.filter((l) => l.value !== "lost").map((l) => (
            <FilterChip key={l.value} active={ls.filters.lifecycle === l.value} onClick={() => ls.setFilter("lifecycle", ls.filters.lifecycle === l.value ? null : l.value)}>
              {l.label}
            </FilterChip>
          ))}
          <FilterChip active={ls.filters.owner_id === String(me?.id)} onClick={() => ls.setFilter("owner_id", ls.filters.owner_id === String(me?.id) ? null : me?.id)}>
            Mes contacts
          </FilterChip>
        </div>
        <div className="flex items-center gap-2">
          <Select options={["", ...SOURCES].map((s) => ({ value: s, label: s || "Toutes sources" }))} value={ls.filters.source ?? ""} onChange={(v) => ls.setFilter("source", v)} className="w-[160px]" />
          <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-[160px]" />
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

      {view === "table" ? (
        <Glass className="overflow-hidden" radius="lg">
          <DataTable
            columns={columns}
            rows={rows}
            loading={isLoading || (isFetching && !rows.length)}
            sort={ls.sort}
            onSortChange={ls.setSort}
            onRowClick={(c) => navigate(`/contacts/${c.id}`)}
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
                <Skeleton key={i} className="h-[150px] rounded-[22px]" />
              ))}
            </div>
          )}
          {!isLoading && rows.length === 0 && <Glass>{empty}</Glass>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                <TiltCard className="h-full p-4" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <div className="flex items-start gap-3">
                    <Avatar name={c.full_name} src={c.avatar_url} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.full_name}</div>
                      <div className="truncate text-[12.5px] text-fg-2">{[c.job_title, c.company?.name].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <ScoreDot score={c.lead_score} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusBadge options={LIFECYCLE} value={c.lifecycle} size="xs" />
                    {c.tags.slice(0, 3).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[12px] text-fg-3">
                    <span className="truncate">{c.email ?? c.phone ?? "—"}</span>
                    <span className="shrink-0">{c.last_contacted_at ? relative(c.last_contacted_at) : ""}</span>
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

      <BulkBar count={ls.selected.length} onClear={ls.clearSelection}>
        <Button size="sm" variant="ghost" icon={<Mail className="size-4" />} onClick={() => setEmailOpen(true)}>
          Email
        </Button>
        <Menu
          trigger={
            <Button size="sm" variant="ghost">
              Cycle de vie
            </Button>
          }
          items={LIFECYCLE.map((l) => ({ label: l.label, onSelect: () => bulk("update", { lifecycle: l.value }) }))}
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
            <EntitySelect resource="users" value={null} onChange={(id) => id && bulk("update", { owner_id: id }, "Responsable mis à jour")} placeholder="Choisir un membre…" />
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
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (await confirm({ title: `Supprimer ${ls.selected.length} contact(s) ?`, description: "Cette action est définitive. Pour un droit à l'effacement RGPD, préférez l'anonymisation depuis la fiche.", danger: true, confirmLabel: "Supprimer" }))
              bulk("delete", undefined, "Contacts supprimés");
          }}
        >
          Supprimer
        </Button>
      </BulkBar>

      <RecordDialog resource="contacts" open={creating} onOpenChange={setCreating} navigateOnCreate initial={{ owner_id: me?.id }} labels={{ owner_id: me?.name }} />
      <EmailComposer
        open={emailOpen}
        onOpenChange={setEmailOpen}
        recipients={selectedRows.filter((c) => c.email && !c.do_not_contact).map((c) => ({ email: c.email!, contact_id: c.id, first_name: c.first_name, last_name: c.last_name, full_name: c.full_name }))}
      />
    </div>
  );
}

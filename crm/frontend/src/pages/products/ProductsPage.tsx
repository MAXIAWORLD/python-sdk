import { Briefcase, CopyPlus, Download, KeyRound, LayoutGrid, MoreHorizontal, Package, Pencil, Plus, Power, PowerOff, Repeat, Rows3, Trash2, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { BulkBar } from "@/components/entity/EntityBlocks";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { Checkbox, SearchInput, Select, Switch } from "@/components/ui/fields";
import { Menu, Tooltip, useConfirm, type MenuItem } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { INTERVALS, labelOf, PRODUCT_KINDS } from "@/lib/constants";
import { isoDate, money, moneyShort, number, percent, plural } from "@/lib/format";
import { toastError, useInvalidate, useList, useLocalStorage, useUpdate } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Product } from "@/lib/types";
import { cn, pick } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

type View = "grid" | "table";
type ActiveFilter = "all" | "true" | "false";

const SORTS = [
  { value: "name", label: "Nom (A → Z)" },
  { value: "-unit_price", label: "Prix décroissant" },
  { value: "unit_price", label: "Prix croissant" },
  { value: "category", label: "Catégorie" },
  { value: "-created_at", label: "Plus récents" },
];

const KIND_ICON: Record<string, LucideIcon> = { service: Briefcase, product: Package, subscription: Repeat, license: KeyRound };
const KIND_GRADIENT: Record<string, string> = {
  service: "linear-gradient(135deg,#38bdf8,#5b6cff)",
  product: "linear-gradient(135deg,#2dd4bf,#0f766e)",
  subscription: "linear-gradient(135deg,#a78bfa,#7c3aed)",
  license: "linear-gradient(135deg,#fdba74,#ea580c)",
};
const COPY_FIELDS = ["kind", "category", "description", "unit_price", "unit", "vat_rate", "recurring_interval", "cost", "active"] as const;

const vatLabel = (rate: number) => `${number(rate, rate % 1 ? 1 : 0)} %`;

/** Gross margin: amount, « taux de marque » (margin / price) and « taux de marge » (margin / cost). */
function marginOf(p: Product) {
  if (p.cost === null || p.cost === undefined) return null;
  const amount = p.unit_price - p.cost;
  return { amount, markup: p.unit_price > 0 ? (amount / p.unit_price) * 100 : null, rate: p.cost > 0 ? (amount / p.cost) * 100 : null };
}

function marginTone(markup: number | null, amount: number) {
  if (amount < 0) return "text-red-500 dark:text-red-400";
  if (markup !== null && markup < 20) return "text-orange-600 dark:text-orange-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function KindIcon({ kind, size = 40 }: { kind: string; size?: number }) {
  const Icon = KIND_ICON[kind] ?? Package;
  return (
    <span
      className="flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_6px_14px_-6px_rgba(0,0,0,.45)]"
      style={{ width: size, height: size, borderRadius: size * 0.32, background: KIND_GRADIENT[kind] ?? KIND_GRADIENT.product }}
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  );
}

function MarginInfo({ product, compact }: { product: Product; compact?: boolean }) {
  const m = marginOf(product);
  if (!m)
    return (
      <Tooltip content="Renseignez le coût de revient pour calculer la marge">
        <span className="text-[12.5px] text-fg-3">—</span>
      </Tooltip>
    );
  const tip = `Taux de marque ${m.markup === null ? "—" : percent(m.markup, 1)} (marge / prix HT) · taux de marge ${m.rate === null ? "—" : percent(m.rate, 1)} (marge / coût) · coût ${money(product.cost)}`;
  return (
    <Tooltip content={tip}>
      {compact ? (
        <span className="text-[12.5px] text-fg-2">
          Marge <b className="font-semibold text-fg tabular">{moneyShort(m.amount)}</b> <span className={cn("font-semibold tabular", marginTone(m.markup, m.amount))}>{m.markup === null ? "" : percent(m.markup, 0)}</span>
        </span>
      ) : (
        <span className="inline-flex flex-col items-end leading-tight">
          <span className="font-semibold tabular">{money(m.amount)}</span>
          <span className={cn("text-[11.5px] font-semibold tabular", marginTone(m.markup, m.amount))}>{m.markup === null ? "—" : percent(m.markup, 0)}</span>
        </span>
      )}
    </Tooltip>
  );
}

/** Stops clicks on controls from reaching the clickable row / card. */
function Stop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function ProductCard({
  product: p,
  selected,
  onSelect,
  onOpen,
  onToggle,
  menu,
  canEdit,
  index,
}: {
  product: Product;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
  onToggle: (v: boolean) => void;
  menu: MenuItem[];
  canEdit: boolean;
  index: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.3) }} className="h-full">
      <TiltCard className={cn("flex h-full flex-col p-4", selected && "ring-2 ring-[var(--accent)]/50")} onClick={canEdit ? onOpen : undefined}>
        <div className={cn("flex items-start gap-3", !p.active && "opacity-60")}>
          <KindIcon kind={p.kind} />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">{p.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-fg-3">{p.sku || "Sans référence"}</div>
          </div>
          {canEdit && (
            <Stop className="-mr-1 -mt-0.5">
              <Checkbox checked={selected} onChange={onSelect} />
            </Stop>
          )}
        </div>
        {p.description && <p className={cn("mt-2.5 line-clamp-2 text-[12.5px] text-fg-2", !p.active && "opacity-60")}>{p.description}</p>}
        <div className={cn("mt-auto pt-4", !p.active && "opacity-60")}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[24px] font-semibold leading-none tracking-[-0.03em] tabular">{money(p.unit_price, "EUR", { decimals: p.unit_price % 1 ? 2 : 0 })}</span>
            <span className="text-[12.5px] text-fg-3">HT / {p.unit}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge options={PRODUCT_KINDS} value={p.kind} size="xs" />
            {p.recurring_interval && (
              <Badge tone="violet" size="xs">
                <Repeat className="size-2.5" /> {labelOf(INTERVALS, p.recurring_interval)}
              </Badge>
            )}
            <Badge size="xs">TVA {vatLabel(p.vat_rate)}</Badge>
            {p.category && <span className="truncate text-[11.5px] text-fg-3">· {p.category}</span>}
          </div>
          {/* Fixed slot so prices stay aligned across a row, with or without a known cost */}
          <div className="mt-2 h-5">{p.cost !== null && p.cost !== undefined && <MarginInfo product={p} compact />}</div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3">
          <Stop className="flex items-center gap-2">
            <Switch size="sm" checked={p.active} disabled={!canEdit} onChange={onToggle} />
            <span className={cn("text-[12.5px] font-medium", p.active ? "text-fg-2" : "text-fg-3")}>{p.active ? "Actif" : "Inactif"}</span>
          </Stop>
          {canEdit && (
            <Stop>
              <Menu
                trigger={
                  <IconButton label="Actions" size="sm">
                    <MoreHorizontal className="size-4" />
                  </IconButton>
                }
                items={menu}
              />
            </Stop>
          )}
        </div>
      </TiltCard>
    </motion.div>
  );
}

function CatalogStats({ products }: { products?: Product[] }) {
  const stats = useMemo(() => {
    const list = products ?? [];
    const active = list.filter((p) => p.active);
    const recurring = active.filter((p) => p.recurring_interval || p.kind === "subscription").length;
    const withCost = active.filter((p) => p.cost !== null && p.cost !== undefined && p.unit_price > 0);
    const avgMarkup = withCost.length ? withCost.reduce((s, p) => s + ((p.unit_price - (p.cost ?? 0)) / p.unit_price) * 100, 0) / withCost.length : null;
    const avgPrice = active.length ? active.reduce((s, p) => s + p.unit_price, 0) / active.length : 0;
    return { total: list.length, active: active.length, recurring, avgMarkup, avgPrice, costCoverage: withCost.length };
  }, [products]);

  const items: { label: string; value: string; hint: string }[] = [
    { label: "Références actives", value: `${number(stats.active)} / ${number(stats.total)}`, hint: stats.total - stats.active ? `${stats.total - stats.active} inactive${stats.total - stats.active > 1 ? "s" : ""}` : "Tout le catalogue est actif" },
    { label: "Offres récurrentes", value: number(stats.recurring), hint: "Abonnements et licences" },
    { label: "Prix moyen HT", value: moneyShort(stats.avgPrice), hint: "Sur les références actives" },
    { label: "Marge moyenne", value: stats.avgMarkup === null ? "—" : percent(stats.avgMarkup, 0), hint: stats.costCoverage ? `${plural(stats.costCoverage, "produit")} avec coût renseigné` : "Renseignez les coûts de revient" },
  ];
  return (
    <Glass className="mb-5 grid grid-cols-2 lg:grid-cols-4" radius="lg">
      {items.map((it, i) => (
        <div key={it.label} className={cn("min-w-0 px-5 py-4", i % 2 === 1 && "border-l border-[var(--hairline)]", i >= 2 && "border-t border-[var(--hairline)] lg:border-t-0", i === 2 && "lg:border-l")}>
          <div className="truncate text-[12px] font-medium text-fg-3">{it.label}</div>
          {products ? <div className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular">{it.value}</div> : <Skeleton className="mt-1.5 h-6 w-20" />}
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-3">{it.hint}</div>
        </div>
      ))}
    </Glass>
  );
}

export default function ProductsPage() {
  const me = useAuth((s) => s.user);
  const canEdit = can(me, "manager");
  const ls = useListState({ filters: ["kind", "category", "active"], defaultSort: "name" });
  const { data, isLoading, isFetching } = useList<Product>("products", ls.params);
  const catalog = useList<Product>("products", { limit: 1000, sort: "name" });
  const [view, setView] = useLocalStorage<View>("prisme-products-view", "grid");
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const update = useUpdate("products", { silent: true });
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const rows = data?.items ?? [];

  const facets = useMemo(() => {
    const list = catalog.data?.items ?? [];
    const kinds: Record<string, number> = {};
    const categories = new Map<string, number>();
    for (const p of list) {
      kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      if (p.category) categories.set(p.category, (categories.get(p.category) ?? 0) + 1);
    }
    return { kinds, categories: [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")) };
  }, [catalog.data]);

  const openEdit = (p: Product) => {
    setEditTarget(p);
    setEditOpen(true);
  };

  const toggleActive = (p: Product, active: boolean) =>
    update.mutate(
      { id: p.id, data: { active } },
      { onSuccess: () => toast.success(active ? "Produit activé" : "Produit désactivé", { description: active ? `${p.name} est à nouveau proposé dans les devis.` : `${p.name} n'est plus proposé dans les nouveaux devis.` }) },
    );

  const duplicate = async (p: Product) => {
    try {
      const copy = await api.post<Product>("/products", { ...pick(p, [...COPY_FIELDS]), name: `${p.name} (copie)`, sku: p.sku ? `${p.sku}-COPIE` : null });
      invalidate("products");
      toast.success("Produit dupliqué", { description: "Ajustez la copie avant de l'utiliser." });
      openEdit(copy);
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (ids: number[]) => {
    const single = ids.length === 1 ? (catalog.data?.items.find((p) => p.id === ids[0]) ?? rows.find((p) => p.id === ids[0])) : undefined;
    const ok = await confirm({
      title: ids.length > 1 ? `Supprimer ${ids.length} produits ?` : single ? `Supprimer « ${single.name} » ?` : "Supprimer ce produit ?",
      description: "Les devis, factures et abonnements existants conservent leurs lignes. Pour retirer une référence du catalogue sans perdre l'historique, préférez la désactivation.",
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await api.post("/products/bulk", { action: "delete", ids });
      toast.success(ids.length > 1 ? `${ids.length} produits supprimés` : "Produit supprimé");
      ls.setSelected(ls.selected.filter((id) => !ids.includes(id)));
      invalidate("products");
    } catch (e) {
      toastError(e);
    }
  };

  const bulkActive = async (active: boolean) => {
    try {
      await api.post("/products/bulk", { action: "update", ids: ls.selected, data: { active } });
      toast.success(`${plural(ls.selected.length, "produit")} ${active ? "activé" : "désactivé"}${ls.selected.length > 1 ? "s" : ""}`);
      ls.clearSelection();
      invalidate("products");
    } catch (e) {
      toastError(e);
    }
  };

  const menuItems = (p: Product): MenuItem[] => [
    { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => openEdit(p) },
    { label: "Dupliquer", icon: <CopyPlus className="size-4" />, onSelect: () => duplicate(p) },
    { label: p.active ? "Désactiver" : "Activer", icon: p.active ? <PowerOff className="size-4" /> : <Power className="size-4" />, onSelect: () => toggleActive(p, !p.active) },
    { separator: true, label: "" },
    { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove([p.id]) },
  ];

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Produit",
      sortKey: "name",
      cell: (p) => (
        <div className={cn("flex min-w-0 items-center gap-3", !p.active && "opacity-60")}>
          <KindIcon kind={p.kind} size={30} />
          <div className="min-w-0">
            <div className="max-w-[140px] truncate font-medium sm:max-w-[260px]">{p.name}</div>
            <div className="truncate font-mono text-[11.5px] text-fg-3">{p.sku || "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "kind", header: "Type", sortKey: "kind", hideOnMobile: true, cell: (p) => <StatusBadge options={PRODUCT_KINDS} value={p.kind} size="xs" /> },
    { key: "category", header: "Catégorie", sortKey: "category", hideOnMobile: true, cell: (p) => <span className="text-fg-2">{p.category || "—"}</span> },
    {
      key: "price",
      header: "PU HT",
      sortKey: "unit_price",
      align: "right",
      cell: (p) => (
        <div className="whitespace-nowrap">
          <div className="font-semibold tabular">{money(p.unit_price)}</div>
          <div className="text-[11.5px] text-fg-3">/ {p.unit}</div>
        </div>
      ),
    },
    { key: "vat", header: "TVA", sortKey: "vat_rate", align: "right", hideOnMobile: true, cell: (p) => <span className="tabular text-fg-2">{vatLabel(p.vat_rate)}</span> },
    {
      key: "recurring",
      header: "Récurrence",
      hideOnMobile: true,
      cell: (p) =>
        p.recurring_interval ? (
          <Badge tone="violet" size="xs">
            <Repeat className="size-2.5" /> {labelOf(INTERVALS, p.recurring_interval)}
          </Badge>
        ) : (
          <span className="text-[12.5px] text-fg-3">Ponctuel</span>
        ),
    },
    { key: "margin", header: "Marge", align: "right", hideOnMobile: true, cell: (p) => <MarginInfo product={p} /> },
    {
      key: "active",
      header: "Actif",
      align: "center",
      cell: (p) => (
        <Stop className="flex justify-center">
          <Switch size="sm" checked={p.active} disabled={!canEdit} onChange={(v) => toggleActive(p, v)} />
        </Stop>
      ),
    },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            width: "48px",
            hideOnMobile: true,
            cell: (p: Product) => (
              <Stop>
                <Menu
                  trigger={
                    <IconButton label="Actions" size="sm">
                      <MoreHorizontal className="size-4" />
                    </IconButton>
                  }
                  items={menuItems(p)}
                />
              </Stop>
            ),
          },
        ]
      : []),
  ];

  const activeFilter: ActiveFilter = ls.filters.active === "true" || ls.filters.active === "false" ? ls.filters.active : "all";
  const empty = (
    <EmptyState
      icon={<Package className="size-6" />}
      title={ls.activeFilterCount ? "Aucun produit ne correspond" : "Votre catalogue est vide"}
      description={ls.activeFilterCount ? "Essayez d'élargir votre recherche ou vos filtres." : "Ajoutez vos produits et services pour les insérer en un clic dans vos devis, factures et abonnements."}
      action={
        ls.activeFilterCount ? (
          <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
        ) : canEdit ? (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouveau produit
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Catalogue"
        icon={<Package className="size-5" />}
        description={catalog.data ? `${plural(catalog.data.total, "produit et service", "produits et services")} · prix, TVA et marges` : "Produits, services, abonnements et licences"}
        actions={
          <>
            <Button variant="glass" icon={<Download className="size-4" />} onClick={() => download("/export/products.csv", `catalogue-${isoDate()}.csv`, { ...ls.filters, q: ls.params.q as string | undefined }).catch(toastError)}>
              Exporter
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Nouveau produit
              </Button>
            )}
          </>
        }
      />

      <CatalogStats products={catalog.data?.items} />

      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Nom, référence, catégorie…" className="lg:w-[300px]" />
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <FilterChip active={!ls.filters.kind} onClick={() => ls.setFilter("kind", null)} count={catalog.data?.total}>
              Tout
            </FilterChip>
            {PRODUCT_KINDS.map((k) => (
              <FilterChip key={k.value} active={ls.filters.kind === k.value} onClick={() => ls.setFilter("kind", ls.filters.kind === k.value ? null : k.value)} count={catalog.data ? (facets.kinds[k.value] ?? 0) : undefined}>
                {k.label}
              </FilterChip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            options={[{ value: "", label: "Toutes catégories" }, ...facets.categories.map(([c, n]) => ({ value: c, label: `${c} (${n})` }))]}
            value={ls.filters.category ?? ""}
            onChange={(v) => ls.setFilter("category", v)}
            className="w-[calc(50%-4px)] sm:w-[180px]"
            aria-label="Catégorie"
          />
          <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-[calc(50%-4px)] sm:w-[165px]" aria-label="Tri" />
          <Segmented<ActiveFilter>
            value={activeFilter}
            onChange={(v) => ls.setFilter("active", v === "all" ? null : v)}
            options={[
              { value: "all", label: "Tous" },
              { value: "true", label: "Actifs" },
              { value: "false", label: "Inactifs" },
            ]}
          />
          <Segmented<View>
            className="ml-auto"
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <LayoutGrid className="size-4" aria-label="Grille" /> },
              { value: "table", label: <Rows3 className="size-4" aria-label="Tableau" /> },
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
            onRowClick={canEdit ? openEdit : undefined}
            selectable={canEdit}
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
                <Skeleton key={i} className="h-[236px] rounded-[22px]" />
              ))}
            </div>
          )}
          {!isLoading && rows.length === 0 && <Glass>{empty}</Glass>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p, i) => (
              <ProductCard
                key={p.id}
                index={i}
                product={p}
                canEdit={canEdit}
                selected={ls.selected.includes(p.id)}
                onSelect={(v) => ls.setSelected(v ? [...ls.selected, p.id] : ls.selected.filter((id) => id !== p.id))}
                onOpen={() => openEdit(p)}
                onToggle={(v) => toggleActive(p, v)}
                menu={menuItems(p)}
              />
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
        <Button size="sm" variant="ghost" icon={<Power className="size-4" />} onClick={() => bulkActive(true)}>
          Activer
        </Button>
        <Button size="sm" variant="ghost" icon={<PowerOff className="size-4" />} onClick={() => bulkActive(false)}>
          Désactiver
        </Button>
        <Button size="sm" variant="ghost" className="text-red-500" icon={<Trash2 className="size-4" />} onClick={() => remove(ls.selected)}>
          Supprimer
        </Button>
      </BulkBar>

      <RecordDialog resource="products" open={creating} onOpenChange={setCreating} />
      <RecordDialog resource="products" open={editOpen} onOpenChange={setEditOpen} recordId={editTarget?.id} initial={editTarget ? (editTarget as unknown as Record<string, unknown>) : undefined} />
    </div>
  );
}

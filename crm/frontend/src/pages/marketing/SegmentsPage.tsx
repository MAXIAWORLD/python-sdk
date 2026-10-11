import { useQuery } from "@tanstack/react-query";
import { Building2, Copy, Filter, Megaphone, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { MarketingTabs } from "@/components/marketing/MarketingTabs";
import { describeRule, fieldsFor, findField, type SegmentEntity } from "@/components/marketing/segment-fields";
import { previewSegment, useUserNames } from "@/components/marketing/SegmentPanels";
import { SegmentSheet, useSegmentActions, useSegmentFields } from "@/components/marketing/SegmentSheet";
import { Button } from "@/components/ui/button";
import { AvatarStack, EmptyState, Skeleton } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/fields";
import { Menu } from "@/components/ui/overlay";
import { number, relative } from "@/lib/format";
import { useList } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Company, Contact, Segment } from "@/lib/types";
import { can, useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-updated_at", label: "Modifiés récemment" },
  { value: "name", label: "Nom (A → Z)" },
  { value: "-created_at", label: "Créés récemment" },
];

type SheetState = { open: boolean; segment: Segment | null; tab: "rules" | "members" };

function SegmentCard({ segment, index, onOpen }: { segment: Segment; index: number; onOpen: (tab: "rules" | "members") => void }) {
  const user = useAuth((s) => s.user);
  const { data: fieldsApi } = useSegmentFields();
  const names = useUserNames();
  const actions = useSegmentActions();
  const entity = segment.entity as SegmentEntity;
  const fields = useMemo(() => fieldsFor(entity, fieldsApi), [entity, fieldsApi]);
  const conditions = segment.rules?.conditions ?? [];
  const { data, isLoading, isError } = useQuery({
    queryKey: ["segments", "count", segment.id, segment.updated_at],
    queryFn: () => previewSegment(entity, segment.rules ?? { match: "all", conditions: [] }),
    staleTime: 60_000,
    retry: false,
  });
  const color = segment.color || "#5b6cff";
  const people = (data?.sample ?? []).slice(0, 5).map((r) => ({ name: entity === "contacts" ? (r as Contact).full_name : (r as Company).name, avatar_url: entity === "contacts" ? (r as Contact).avatar_url : null }));
  const writable = can(user, "member");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3), type: "spring", stiffness: 260, damping: 26 }} className="h-full">
      <TiltCard className="group relative flex h-full flex-col overflow-hidden p-5" onClick={() => onOpen("rules")}>
        <span aria-hidden className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-55" style={{ background: color }} />
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4)]" style={{ background: `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 55%, #000))`, boxShadow: `0 10px 22px -10px ${color}` }}>
            {entity === "contacts" ? <Users className="size-5" /> : <Building2 className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{segment.name}</div>
            <div className="mt-0.5 text-[12px] text-fg-3">
              {entity === "contacts" ? "Contacts" : "Entreprises"} · {conditions.length ? `${conditions.length} condition${conditions.length > 1 ? "s" : ""}${conditions.length > 1 ? (segment.rules.match === "any" ? " (OU)" : " (ET)") : ""}` : "sans condition"}
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Menu
              trigger={
                <button className="rounded-[10px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Actions du segment">
                  <MoreHorizontal className="size-4" />
                </button>
              }
              items={[
                { label: "Modifier les règles", icon: <Pencil className="size-4" />, onSelect: () => onOpen("rules") },
                { label: "Voir les membres", icon: <Users className="size-4" />, onSelect: () => onOpen("members") },
                ...(entity === "contacts" && writable ? [{ label: "Créer une campagne", icon: <Megaphone className="size-4" />, onSelect: () => actions.createCampaign(segment) }] : []),
                ...(writable
                  ? [
                      { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: () => actions.duplicate(segment) },
                      { separator: true, label: "" },
                      { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => actions.remove(segment) },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>

        {segment.description && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-fg-2">{segment.description}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {conditions.slice(0, 3).map((c, i) => (
            <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-[9px] bg-black/[0.045] px-2 py-1 text-[11.5px] font-medium text-fg-2 dark:bg-white/[0.07]">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate">{describeRule(findField(fields, c.field), c, names)}</span>
            </span>
          ))}
          {conditions.length > 3 && <span className="self-center text-[11.5px] text-fg-3">+{conditions.length - 3}</span>}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular">{isLoading ? <Skeleton className="h-6 w-12" /> : isError ? "—" : number(data?.count ?? 0)}</div>
            <div className="mt-1 text-[11.5px] text-fg-3">
              membre{(data?.count ?? 0) > 1 ? "s" : ""} · modifié {relative(segment.updated_at)}
            </div>
          </div>
          {people.length > 0 && <AvatarStack people={people} max={5} size={28} />}
        </div>
      </TiltCard>
    </motion.div>
  );
}

export default function SegmentsPage() {
  const user = useAuth((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const ls = useListState({ filters: ["entity"], defaultSort: "-updated_at", pageSize: 200 });
  const { data, isLoading } = useList<Segment>("segments", { ...ls.params, expand: 0 });
  const rows = data?.items ?? [];
  const counts = useList<Segment>("segments", { limit: 500, expand: 0 }).data?.items;
  const [sheet, setSheet] = useState<SheetState>({ open: false, segment: null, tab: "rules" });
  const writable = can(user, "member");

  // Deep links: /segments?new=1 or /segments?open=<id>
  const wantNew = searchParams.get("new") === "1";
  const wantOpen = Number(searchParams.get("open")) || null;
  const target = wantOpen ? (rows.find((s) => s.id === wantOpen) ?? null) : null;
  useEffect(() => {
    if (!wantNew && !target) return;
    setSheet({ open: true, segment: target, tab: "rules" });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        next.delete("open");
        return next;
      },
      { replace: true },
    );
  }, [wantNew, target, setSearchParams]);

  const byEntity = (e: string) => counts?.filter((s) => s.entity === e).length;

  return (
    <div>
      <PageHeader
        kicker="Marketing"
        title="Segments"
        icon={<Filter className="size-5" />}
        description={data ? `${number(data.total)} segment${data.total > 1 ? "s" : ""} dynamique${data.total > 1 ? "s" : ""}, recalculé${data.total > 1 ? "s" : ""} en temps réel` : "Chargement…"}
        actions={
          writable && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, segment: null, tab: "rules" })}>
              Nouveau segment
            </Button>
          )
        }
      />
      <MarketingTabs className="mb-5" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Rechercher un segment…" className="lg:w-[300px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={!ls.filters.entity} onClick={() => ls.setFilter("entity", null)} count={counts?.length}>
            Tous
          </FilterChip>
          <FilterChip active={ls.filters.entity === "contacts"} onClick={() => ls.setFilter("entity", ls.filters.entity === "contacts" ? null : "contacts")} count={byEntity("contacts")}>
            Contacts
          </FilterChip>
          <FilterChip active={ls.filters.entity === "companies"} onClick={() => ls.setFilter("entity", ls.filters.entity === "companies" ? null : "companies")} count={byEntity("companies")}>
            Entreprises
          </FilterChip>
        </div>
        <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-full sm:w-[200px]" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[214px] rounded-[22px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<Filter className="size-6" />}
            title={ls.activeFilterCount ? "Aucun segment ne correspond" : "Créez votre premier segment"}
            description={ls.activeFilterCount ? "Essayez d'élargir la recherche ou les filtres." : "Un segment regroupe automatiquement les contacts ou entreprises qui remplissent vos conditions : cycle de vie, score, tags, consentement…"}
            action={
              ls.activeFilterCount ? (
                <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
              ) : writable ? (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, segment: null, tab: "rules" })}>
                  Nouveau segment
                </Button>
              ) : undefined
            }
          />
        </Glass>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s, i) => (
            <SegmentCard key={s.id} segment={s} index={i} onOpen={(tab) => setSheet({ open: true, segment: s, tab })} />
          ))}
        </div>
      )}

      <SegmentSheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} segment={sheet.segment} initialTab={sheet.tab} onSaved={(saved) => setSheet((s) => ({ ...s, segment: saved }))} />
    </div>
  );
}

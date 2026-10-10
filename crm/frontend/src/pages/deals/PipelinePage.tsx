import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarDays, Columns3, Kanban, Plus, Repeat, Rows3, Target, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, CompanyLogo, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { Field, Input, SearchInput, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { DEAL_STATUS } from "@/lib/constants";
import { date, daysFromNow, money, moneyShort } from "@/lib/format";
import { toastError, useDebounced, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Deal, Pipeline } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

interface BoardColumn {
  id: number;
  name: string;
  color: string;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  rotting_days?: number | null;
  position: number;
  deals: Deal[];
  count: number;
  value: number;
  weighted: number;
}

interface Board {
  pipelines: Pipeline[];
  pipeline: Pipeline | null;
  stages: BoardColumn[];
}

const LOST_REASONS = ["Prix trop élevé", "Choix d'un concurrent", "Pas de budget", "Projet abandonné / reporté", "Pas de réponse", "Besoin mal qualifié", "Autre"];

/* -------------------------------------------------------------------------- */
/* Celebration                                                                */
/* -------------------------------------------------------------------------- */

function Celebration({ burst }: { burst: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: `${burst}-${i}`,
        x: (Math.random() - 0.5) * 900,
        y: -Math.random() * 520 - 120,
        r: Math.random() * 720 - 360,
        color: ["#5b6cff", "#8b5cf6", "#22d3ee", "#f472b6", "#fbbf24", "#34d399"][i % 6],
        size: 6 + Math.random() * 8,
        round: Math.random() > 0.5,
      })),
    [burst],
  );
  return (
    <AnimatePresence>
      {burst > 0 && (
        <div key={burst} className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center">
          {particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: [0, p.y, p.y + 700], opacity: [1, 1, 0], rotate: p.r }}
              transition={{ duration: 2.2, ease: [0.15, 0.7, 0.4, 1], times: [0, 0.45, 1] }}
              className="absolute bottom-10"
              style={{ width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? 999 : 2 }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards & columns                                                            */
/* -------------------------------------------------------------------------- */

function DealCard({ deal, column, overlay }: { deal: Deal; column?: BoardColumn; overlay?: boolean }) {
  const navigate = useNavigate();
  const late = deal.status === "open" && deal.expected_close_date && (daysFromNow(deal.expected_close_date) ?? 0) < 0;
  const rotting = deal.status === "open" && column?.rotting_days && (deal.days_in_stage ?? 0) > column.rotting_days;
  return (
    <div
      onClick={() => !overlay && navigate(`/deals/${deal.id}`)}
      className={cn(
        "glass group cursor-grab rounded-[16px] p-3 transition-shadow active:cursor-grabbing",
        overlay && "rotate-[2.5deg] scale-[1.03] shadow-[0_30px_60px_-20px_rgba(20,30,90,.55)] ring-1 ring-[var(--accent)]/40",
      )}
      style={{ ["--glass-blur" as string]: "18px" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-[13.5px] font-medium leading-snug">{deal.title}</div>
        {deal.priority === "high" && <span className="mt-1 size-2 shrink-0 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" title="Priorité haute" />}
      </div>
      {deal.company && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-fg-2">
          <CompanyLogo name={deal.company.name} size={16} />
          <span className="truncate">{deal.company.name}</span>
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[14.5px] font-semibold tracking-[-0.01em] tabular">{moneyShort(deal.value)}</span>
          {deal.mrr > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/12 px-1.5 text-[10.5px] font-semibold text-violet-700 dark:text-violet-300" title="Dont récurrent mensuel">
              <Repeat className="size-2.5" />
              {moneyShort(deal.mrr)}/m
            </span>
          )}
        </div>
        {deal.owner && <Avatar name={deal.owner.name} color={(deal.owner.color as string) ?? undefined} size={22} />}
      </div>
      {(deal.expected_close_date || rotting) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {deal.expected_close_date && (
            <span className={cn("inline-flex items-center gap-1", late ? "font-semibold text-red-500" : "text-fg-3")}>
              <CalendarDays className="size-3" />
              {date(deal.expected_close_date, "d MMM")}
            </span>
          )}
          {rotting && (
            <span className="inline-flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
              <AlarmClock className="size-3" />
              {deal.days_in_stage} j sans mouvement
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SortableDeal({ deal, column }: { deal: Deal; column: BoardColumn }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `deal-${deal.id}`, data: { type: "deal", deal } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-30")} {...attributes} {...listeners}>
      <DealCard deal={deal} column={column} />
    </div>
  );
}

function StageColumn({ column, onAdd }: { column: BoardColumn; onAdd: (stageId: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { type: "column", stageId: column.id } });
  return (
    <div className="flex w-[290px] shrink-0 flex-col">
      <div className="mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: column.color, boxShadow: `0 0 10px ${column.color}` }} />
          <span className="truncate text-[13.5px] font-semibold">{column.name}</span>
          <span className="rounded-full bg-black/[0.06] px-1.5 text-[11px] font-semibold tabular text-fg-2 dark:bg-white/10">{column.deals.length}</span>
          {!column.is_won && !column.is_lost && <span className="ml-auto text-[11px] text-fg-3 tabular">{column.probability} %</span>}
          {column.is_won && <Trophy className="ml-auto size-3.5 text-amber-500" />}
        </div>
        <div className="mt-1 flex items-baseline gap-2 pl-[18px]">
          <span className="text-[13px] font-semibold tabular">{moneyShort(column.deals.reduce((s, d) => s + d.value, 0))}</span>
          {!column.is_won && !column.is_lost && <span className="text-[11.5px] text-fg-3 tabular">pondéré {moneyShort(column.deals.reduce((s, d) => s + d.value * ((d.probability ?? column.probability) / 100), 0))}</span>}
        </div>
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
          <div className="h-full rounded-full" style={{ width: `${column.is_won ? 100 : column.probability}%`, background: column.color }} />
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[160px] flex-1 flex-col gap-2 rounded-[20px] p-2 transition-colors",
          isOver ? "bg-accent-soft ring-1 ring-[var(--accent)]/30" : "bg-black/[0.025] dark:bg-white/[0.03]",
        )}
      >
        <SortableContext items={column.deals.map((d) => `deal-${d.id}`)} strategy={verticalListSortingStrategy}>
          {column.deals.map((d) => (
            <SortableDeal key={d.id} deal={d} column={column} />
          ))}
        </SortableContext>
        {!column.is_won && !column.is_lost && (
          <button onClick={() => onAdd(column.id)} className="flex items-center justify-center gap-1.5 rounded-[14px] py-2 text-[12.5px] font-medium text-fg-3 transition hover:bg-black/[0.04] hover:text-fg-2 dark:hover:bg-white/[0.05]">
            <Plus className="size-3.5" /> Ajouter
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function PipelinePage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const invalidate = useInvalidate();
  const [pipelineId, setPipelineId] = useLocalStorage<number | null>("prisme-pipeline", null);
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [view, setView] = useLocalStorage<"board" | "list">("prisme-pipeline-view", "board");
  const [creating, setCreating] = useState<{ stage_id?: number } | null>(null);
  const [lost, setLost] = useState<{ dealId: number; stageId: number; position: number } | null>(null);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]);
  const [lostDetail, setLostDetail] = useState("");
  const [burst, setBurst] = useState(0);

  const { data: board, isLoading } = useQuery({
    queryKey: ["deals-board", pipelineId, mine ? me?.id : null, dq],
    queryFn: () => api.get<Board>("/deals/board", { pipeline_id: pipelineId ?? undefined, owner_id: mine ? me?.id : undefined, q: dq || undefined }),
  });

  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const dragging = useRef(false);
  useEffect(() => {
    if (board && !dragging.current) setColumns(board.stages);
  }, [board]);

  const [active, setActive] = useState<Deal | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const findColumn = (id: string | number) => {
    const key = String(id);
    if (key.startsWith("col-")) return columns.find((c) => `col-${c.id}` === key);
    return columns.find((c) => c.deals.some((d) => `deal-${d.id}` === key));
  };

  const onDragStart = (e: DragStartEvent) => {
    dragging.current = true;
    setActive((e.active.data.current as { deal: Deal }).deal);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active: a, over } = e;
    if (!over) return;
    const from = findColumn(a.id);
    const to = findColumn(over.id);
    if (!from || !to || from.id === to.id) return;
    setColumns((cols) => {
      const deal = from.deals.find((d) => `deal-${d.id}` === a.id)!;
      const overIndex = to.deals.findIndex((d) => `deal-${d.id}` === over.id);
      const index = overIndex >= 0 ? overIndex : to.deals.length;
      return cols.map((c) => {
        if (c.id === from.id) return { ...c, deals: c.deals.filter((d) => d.id !== deal.id) };
        if (c.id === to.id) return { ...c, deals: [...c.deals.slice(0, index), { ...deal, stage_id: to.id }, ...c.deals.slice(index)] };
        return c;
      });
    });
  };

  const commitMove = async (dealId: number, stageId: number, position: number, lostReasonText?: string) => {
    try {
      const updated = await api.post<Deal>(`/deals/${dealId}/move`, { stage_id: stageId, position, lost_reason: lostReasonText });
      if (updated.status === "won") {
        setBurst((b) => b + 1);
        toast.success("Affaire gagnée ! 🎉", { description: `${updated.title} · ${money(updated.value, "EUR", { decimals: 0 })}` });
      }
      invalidate("deals", "deals-board");
    } catch (err) {
      toastError(err);
      invalidate("deals-board");
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    dragging.current = false;
    setActive(null);
    const { active: a, over } = e;
    if (!over) return setColumns(board?.stages ?? []);
    const col = findColumn(over.id) ?? findColumn(a.id);
    if (!col) return;
    const dealId = Number(String(a.id).replace("deal-", ""));
    let list = col.deals;
    const oldIndex = list.findIndex((d) => d.id === dealId);
    const overIndex = String(over.id).startsWith("deal-") ? list.findIndex((d) => `deal-${d.id}` === over.id) : list.length - 1;
    if (oldIndex !== overIndex && overIndex >= 0) {
      const moved = [...list];
      const [item] = moved.splice(oldIndex, 1);
      moved.splice(overIndex, 0, item);
      list = moved;
      setColumns((cols) => cols.map((c) => (c.id === col.id ? { ...c, deals: moved } : c)));
    }
    const idx = list.findIndex((d) => d.id === dealId);
    const prev = list[idx - 1]?.position;
    const next = list[idx + 1]?.position;
    const position = prev !== undefined && next !== undefined ? (prev + next) / 2 : prev !== undefined ? prev + 1 : next !== undefined ? next - 1 : 0;
    const original = board?.stages.find((s) => s.deals.some((d) => d.id === dealId));
    if (col.is_lost && original?.id !== col.id) {
      setLost({ dealId, stageId: col.id, position });
      return;
    }
    if (original?.id === col.id && oldIndex === overIndex) return;
    commitMove(dealId, col.id, position);
  };

  const totals = useMemo(() => {
    const open = columns.filter((c) => !c.is_won && !c.is_lost);
    const value = open.reduce((s, c) => s + c.deals.reduce((a, d) => a + d.value, 0), 0);
    const weighted = open.reduce((s, c) => s + c.deals.reduce((a, d) => a + d.value * ((d.probability ?? c.probability) / 100), 0), 0);
    const count = open.reduce((s, c) => s + c.deals.length, 0);
    const won = columns.filter((c) => c.is_won).reduce((s, c) => s + c.deals.reduce((a, d) => a + d.value, 0), 0);
    return { value, weighted, count, won };
  }, [columns]);

  const ls = useListState({ defaultSort: "-value" });
  const listQuery = useList<Deal>("deals", { ...ls.params, q: dq || undefined, pipeline_id: board?.pipeline?.id, owner_id: mine ? me?.id : undefined }, { enabled: view === "list" && !!board?.pipeline });
  const listColumns: Column<Deal>[] = [
    {
      key: "title",
      header: "Opportunité",
      sortKey: "title",
      cell: (d) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{d.title}</div>
          <div className="flex items-center gap-1.5 truncate text-[12px] text-fg-3">{d.company?.name ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Étape",
      cell: (d) => (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <span className="size-2 rounded-full" style={{ background: d.stage?.color }} />
          {d.stage?.name}
        </span>
      ),
    },
    { key: "value", header: "Valeur", sortKey: "value", align: "right", cell: (d) => <span className="font-semibold tabular">{money(d.value, "EUR", { decimals: 0 })}</span> },
    { key: "mrr", header: "MRR", sortKey: "mrr", align: "right", hideOnMobile: true, cell: (d) => <span className="tabular text-fg-2">{d.mrr ? money(d.mrr, "EUR", { decimals: 0 }) : "—"}</span> },
    { key: "close", header: "Closing", sortKey: "expected_close_date", hideOnMobile: true, cell: (d) => <span className={cn("tabular", d.status === "open" && (daysFromNow(d.expected_close_date) ?? 0) < 0 && "text-red-500")}>{date(d.expected_close_date)}</span> },
    { key: "status", header: "Statut", cell: (d) => <StatusBadge options={DEAL_STATUS} value={d.status} size="xs" /> },
    { key: "owner", header: "Resp.", hideOnMobile: true, cell: (d) => (d.owner ? <Avatar name={d.owner.name} color={(d.owner.color as string) ?? undefined} size={24} /> : null) },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pipeline"
        icon={<Kanban className="size-5" />}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <b className="font-semibold text-fg tabular">{moneyShort(totals.value)}</b> en cours · {totals.count} affaires
            </span>
            <span>
              pondéré <b className="font-semibold text-fg tabular">{moneyShort(totals.weighted)}</b>
            </span>
            <span>
              gagné <b className="font-semibold text-emerald-600 tabular dark:text-emerald-400">{moneyShort(totals.won)}</b>
            </span>
          </span>
        }
        actions={
          <>
            {board && board.pipelines.length > 1 && <Select options={board.pipelines.map((p) => ({ value: String(p.id), label: p.name }))} value={String(board.pipeline?.id ?? "")} onChange={(v) => setPipelineId(Number(v))} className="w-[190px]" />}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating({})}>
              Nouvelle opportunité
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher une affaire…" className="w-full sm:w-[280px]" />
        <FilterChip active={mine} onClick={() => setMine((v) => !v)}>
          Mes affaires
        </FilterChip>
        <div className="ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: <span className="flex items-center gap-1.5"><Columns3 className="size-4" />Kanban</span> },
              { value: "list", label: <span className="flex items-center gap-1.5"><Rows3 className="size-4" />Liste</span> },
            ]}
          />
        </div>
      </div>

      {view === "board" ? (
        isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[520px] w-[290px] shrink-0 rounded-[22px]" />
            ))}
          </div>
        ) : columns.length === 0 ? (
          <Glass>
            <EmptyState icon={<Target className="size-6" />} title="Aucun pipeline" description="Créez un pipeline et ses étapes dans Paramètres › Pipelines." action={<Button onClick={() => navigate("/settings?tab=pipelines")}>Configurer</Button>} />
          </Glass>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { dragging.current = false; setActive(null); setColumns(board?.stages ?? []); }}>
            <div className="-mx-4 flex flex-1 gap-4 overflow-x-auto px-4 pb-6 sm:-mx-6 sm:px-6">
              {columns.map((c) => (
                <StageColumn key={c.id} column={c} onAdd={(stageId) => setCreating({ stage_id: stageId })} />
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>{active ? <DealCard deal={active} overlay /> : null}</DragOverlay>
          </DndContext>
        )
      ) : (
        <Glass className="overflow-hidden">
          <DataTable columns={listColumns} rows={listQuery.data?.items ?? []} loading={listQuery.isLoading} sort={ls.sort} onSortChange={ls.setSort} onRowClick={(d) => navigate(`/deals/${d.id}`)} page={ls.page} pageSize={ls.pageSize} total={listQuery.data?.total} onPageChange={ls.setPage} empty={<EmptyState icon={<Target className="size-6" />} title="Aucune affaire" />} />
        </Glass>
      )}

      <RecordDialog
        resource="deals"
        open={!!creating}
        onOpenChange={(o) => !o && setCreating(null)}
        initial={{ pipeline_id: board?.pipeline?.id, owner_id: me?.id, ...(creating ?? {}) }}
        labels={{ pipeline_id: board?.pipeline?.name, owner_id: me?.name }}
        onSaved={() => invalidate("deals-board")}
      />

      <Dialog
        open={!!lost}
        onOpenChange={(o) => {
          if (!o) {
            setLost(null);
            setColumns(board?.stages ?? []);
          }
        }}
        size="sm"
        title="Pourquoi cette affaire est-elle perdue ?"
        description="Ces raisons alimentent l'analyse gains / pertes des rapports."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setLost(null); setColumns(board?.stages ?? []); }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (lost) commitMove(lost.dealId, lost.stageId, lost.position, lostDetail ? `${lostReason} — ${lostDetail}` : lostReason);
                setLost(null);
                setLostDetail("");
              }}
            >
              Marquer perdue
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {LOST_REASONS.map((r) => (
              <FilterChip key={r} active={lostReason === r} onClick={() => setLostReason(r)}>
                {r}
              </FilterChip>
            ))}
          </div>
          <Field label="Précisions (facultatif)">
            <Input value={lostDetail} onChange={(e) => setLostDetail(e.target.value)} placeholder="Ex. : concurrent X moins cher de 20 %" />
          </Field>
        </div>
      </Dialog>

      <Celebration burst={burst} />
    </div>
  );
}

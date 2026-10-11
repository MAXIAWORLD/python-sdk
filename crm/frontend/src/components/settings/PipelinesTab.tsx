import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Check, GripVertical, Kanban, MoreHorizontal, Plus, Star, Trash2, Trophy, XCircle } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, Spinner } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/fields";
import { Dialog, Menu, Popover, Tooltip, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { moneyShort } from "@/lib/format";
import { keys, toastError, useInvalidate, useList } from "@/lib/hooks";
import type { Deal, Paginated, Pipeline, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { Callout, ChoiceCards, ColorPicker, ReadOnlyNotice, SettingsCard, SWATCHES, TabHeader } from "./shared";

const KINDS = [
  { value: "sales", label: "Ventes" },
  { value: "services", label: "Projets & services" },
  { value: "partnership", label: "Partenariats" },
  { value: "custom", label: "Personnalisé" },
];

const STAGE_COLORS = ["#8e8e93", "#64d2ff", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#ffd60a", "#30d5c8", "#30d158", "#ff453a", "#64748b"];

type StageTemplate = Pick<Stage, "name" | "probability" | "color" | "is_won" | "is_lost"> & { rotting_days: number | null };
const st = (name: string, probability: number, color: string, kind: "open" | "won" | "lost" = "open"): StageTemplate => ({ name, probability, color, is_won: kind === "won", is_lost: kind === "lost", rotting_days: kind === "open" ? 21 : null });

const TEMPLATES: Record<string, { label: string; description: string; stages: StageTemplate[] }> = {
  sales: {
    label: "Ventes B2B",
    description: "Lead, qualification, démo, proposition, négociation.",
    stages: [st("Nouveau lead", 10, "#8e8e93"), st("Qualification", 20, "#64d2ff"), st("Démo", 40, "#5e5ce6"), st("Proposition", 60, "#bf5af2"), st("Négociation", 80, "#ff9f0a"), st("Gagné", 100, "#30d158", "won"), st("Perdu", 0, "#ff453a", "lost")],
  },
  services: {
    label: "Projets & services",
    description: "Brief, cadrage, devis, validation.",
    stages: [st("Brief reçu", 10, "#8e8e93"), st("Cadrage", 30, "#64d2ff"), st("Devis envoyé", 60, "#5e5ce6"), st("Validation", 80, "#ff9f0a"), st("Signé", 100, "#30d158", "won"), st("Perdu", 0, "#ff453a", "lost")],
  },
  partnership: {
    label: "Partenariats",
    description: "Identification, échanges, accord.",
    stages: [st("Identifié", 10, "#8e8e93"), st("Premier échange", 30, "#64d2ff"), st("Term sheet", 60, "#bf5af2"), st("Signé", 100, "#30d158", "won"), st("Abandonné", 0, "#ff453a", "lost")],
  },
  empty: {
    label: "Minimal",
    description: "Uniquement « Gagné » et « Perdu » : ajoutez vos étapes.",
    stages: [st("En cours", 30, "#5e5ce6"), st("Gagné", 100, "#30d158", "won"), st("Perdu", 0, "#ff453a", "lost")],
  },
};

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

type StageType = "open" | "won" | "lost";
const stageType = (s: Pick<Stage, "is_won" | "is_lost">): StageType => (s.is_won ? "won" : s.is_lost ? "lost" : "open");

interface BoardColumn {
  id: number;
  count: number;
  value: number;
}

/* -------------------------------------------------------------------------- */
/* Stage row                                                                  */
/* -------------------------------------------------------------------------- */

function StageRow({ stage, count, value, canEdit, onPatch, onDelete }: { stage: Stage; count: number; value: number; canEdit: boolean; onPatch: (data: Partial<Stage>) => Promise<boolean>; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id, disabled: !canEdit });
  const [name, setName] = useState(stage.name);
  const [probability, setProbability] = useState(String(stage.probability));
  const [rotting, setRotting] = useState(stage.rotting_days ? String(stage.rotting_days) : "");
  const [synced, setSynced] = useState(stage.updated_at);
  const [saved, setSaved] = useState(false);
  if (synced !== stage.updated_at) {
    setSynced(stage.updated_at);
    setName(stage.name);
    setProbability(String(stage.probability));
    setRotting(stage.rotting_days ? String(stage.rotting_days) : "");
  }
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(t);
  }, [saved]);

  const type = stageType(stage);
  const commit = async (data: Partial<Stage>) => {
    if (await onPatch(data)) setSaved(true);
  };
  const commitName = () => {
    const v = name.trim();
    if (!v) return setName(stage.name);
    if (v !== stage.name) commit({ name: v });
  };
  const commitProbability = () => {
    const n = Math.max(0, Math.min(100, Math.round(Number(probability) || 0)));
    setProbability(String(n));
    if (n !== stage.probability) commit({ probability: n });
  };
  const commitRotting = () => {
    const n = rotting.trim() ? Math.max(1, Math.round(Number(rotting) || 0)) : null;
    setRotting(n ? String(n) : "");
    if (n !== (stage.rotting_days ?? null)) commit({ rotting_days: n });
  };
  const changeType = (t: StageType) => commit({ is_won: t === "won", is_lost: t === "lost", probability: t === "won" ? 100 : t === "lost" ? 0 : stage.is_won || stage.is_lost ? 50 : stage.probability, rotting_days: t === "open" ? (stage.rotting_days ?? 21) : null });

  const countBadge = (
    <Tooltip content={count ? `${count} affaire${count > 1 ? "s" : ""} · ${moneyShort(value)}` : "Aucune affaire dans cette étape"}>
      <span className={cn("inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular", count ? "bg-accent-soft text-accent" : "bg-black/[0.04] text-fg-3 dark:bg-white/[0.06]")}>{count}</span>
    </Tooltip>
  );
  const deleteButton = canEdit ? (
    <Tooltip content={count ? "Déplacez d'abord les affaires de cette étape" : "Supprimer l'étape"}>
      <span>
        <IconButton label="Supprimer l'étape" size="sm" disabled={count > 0} onClick={onDelete} className="text-fg-3 hover:text-red-500">
          <Trash2 className="size-4" />
        </IconButton>
      </span>
    </Tooltip>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex flex-col gap-2 rounded-[16px] p-2 transition-[background-color,box-shadow] md:grid md:grid-cols-[20px_28px_minmax(0,1fr)_84px_84px_120px_40px_32px] md:items-center md:gap-2",
        isDragging ? "z-10 bg-[var(--glass-solid)] shadow-[var(--glass-shadow-lg)] ring-1 ring-[color-mix(in_oklab,var(--accent)_40%,transparent)]" : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]",
      )}
    >
      <div className="flex items-center gap-2 md:contents">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          disabled={!canEdit}
          className={cn("flex h-8 w-5 items-center justify-center rounded-[8px] text-fg-3 transition", canEdit ? "cursor-grab hover:bg-black/[0.05] hover:text-fg active:cursor-grabbing dark:hover:bg-white/[0.08]" : "opacity-30")}
          aria-label={`Déplacer l'étape ${stage.name}`}
        >
          <GripVertical className="size-4" />
        </button>
        <Popover
          width={244}
          align="start"
          trigger={
            <button type="button" disabled={!canEdit} className="flex size-7 items-center justify-center rounded-full ring-1 ring-inset ring-[var(--hairline-strong)]" aria-label="Couleur de l'étape">
              <span className="size-4 rounded-full" style={{ background: stage.color, boxShadow: `0 0 10px ${stage.color}` }} />
            </button>
          }
        >
          <div className="p-3">
            <div className="mb-2 text-[12px] font-medium text-fg-2">Couleur de l'étape</div>
            <ColorPicker value={stage.color} onChange={(c) => commit({ color: c })} colors={STAGE_COLORS} />
          </div>
        </Popover>
        <div className="relative min-w-0 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} disabled={!canEdit} className="h-9" aria-label="Nom de l'étape" />
          <AnimatePresence>
            {saved && (
              <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <span className="md:hidden">{countBadge}</span>
        <span className="md:hidden">{deleteButton}</span>
      </div>
      <div className="grid grid-cols-[80px_80px_minmax(0,1fr)] gap-x-2 gap-y-1 md:contents">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-3 md:hidden">Probabilité</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-3 md:hidden">Inactivité</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-3 md:hidden">Type</span>
        <Input value={probability} onChange={(e) => setProbability(e.target.value.replace(/[^\d]/g, ""))} onBlur={commitProbability} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} disabled={!canEdit || type !== "open"} suffix="%" inputMode="numeric" className="tabular [&_input]:h-9" aria-label="Probabilité de gain" />
        <Input
          value={rotting}
          onChange={(e) => setRotting(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commitRotting}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          disabled={!canEdit || type !== "open"}
          placeholder="—"
          suffix="j"
          inputMode="numeric"
          className="tabular [&_input]:h-9"
          aria-label="Alerte d'inactivité en jours"
        />
        <Select
          value={type}
          onChange={(v) => changeType(v as StageType)}
          disabled={!canEdit}
          className="[&_select]:h-9"
          options={[
            { value: "open", label: "En cours" },
            { value: "won", label: "Gagnée" },
            { value: "lost", label: "Perdue" },
          ]}
          aria-label="Type d'étape"
        />
      </div>
      <span className="hidden justify-center md:flex">{countBadge}</span>
      <span className="hidden md:block">{deleteButton}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* New pipeline dialog                                                        */
/* -------------------------------------------------------------------------- */

function NewPipelineDialog({ open, onOpenChange, position, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; position: number; onCreated: (p: Pipeline) => void }) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("sales");
  const [color, setColor] = useState(SWATCHES[0]);
  const [template, setTemplate] = useState("sales");
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName("");
      setKind("sales");
      setTemplate("sales");
      setColor(SWATCHES[position % SWATCHES.length]);
    }
  }

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const pipeline = await api.post<Pipeline>("/pipelines", { name: name.trim(), kind, color, position, is_default: false });
      const stages = TEMPLATES[template].stages;
      for (let i = 0; i < stages.length; i++) await api.post("/stages", { ...stages[i], pipeline_id: pipeline.id, position: i });
      invalidate("pipelines", "stages", "deals-board");
      toast.success(`Pipeline « ${pipeline.name} » créé`, { description: `${stages.length} étapes prêtes à être personnalisées.` });
      onCreated(pipeline);
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Kanban className="size-5" />}
      title="Nouveau pipeline"
      description="Un pipeline regroupe les étapes d'un processus commercial (ventes, projets, partenariats…)."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>
            Créer le pipeline
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nom" required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Ventes grands comptes" />
          </Field>
          <Field label="Type">
            <Select options={KINDS} value={kind} onChange={setKind} />
          </Field>
        </div>
        <Field label="Couleur">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Étapes de départ</div>
          <ChoiceCards
            value={template}
            onChange={setTemplate}
            className="grid-cols-1 sm:grid-cols-2"
            options={Object.entries(TEMPLATES).map(([value, t]) => ({
              value,
              label: t.label,
              description: (
                <span className="block">
                  {t.description}
                  <span className="mt-1.5 flex gap-1">
                    {t.stages.map((s) => (
                      <span key={s.name} className="h-1.5 flex-1 rounded-full" style={{ background: s.color }} />
                    ))}
                  </span>
                </span>
              ),
            }))}
          />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Pipeline editor                                                            */
/* -------------------------------------------------------------------------- */

function PipelineHeader({ pipeline, canEdit, canDelete, dealCount, onDeleted }: { pipeline: Pipeline; canEdit: boolean; canDelete: boolean; dealCount: number; onDeleted: () => void }) {
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const [name, setName] = useState(pipeline.name);
  const [synced, setSynced] = useState(pipeline.updated_at);
  if (synced !== pipeline.updated_at) {
    setSynced(pipeline.updated_at);
    setName(pipeline.name);
  }

  const patch = async (data: Partial<Pipeline>, message?: string) => {
    try {
      await api.patch(`/pipelines/${pipeline.id}`, data);
      invalidate("pipelines", "deals-board");
      if (message) toast.success(message);
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: `Supprimer le pipeline « ${pipeline.name} » ?`, description: "Ses étapes seront supprimées. Cette action est définitive.", confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/pipelines/${pipeline.id}`);
      invalidate("pipelines", "stages", "deals-board");
      toast.success("Pipeline supprimé");
      onDeleted();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Popover
        width={260}
        align="start"
        trigger={
          <button type="button" disabled={!canEdit} className="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_8px_20px_-8px_rgba(0,0,0,.4)]" style={{ background: `linear-gradient(140deg, ${pipeline.color}, color-mix(in oklab, ${pipeline.color} 55%, #000))` }} aria-label="Couleur du pipeline">
            <Kanban className="size-5" />
          </button>
        }
      >
        <div className="p-3">
          <div className="mb-2 text-[12px] font-medium text-fg-2">Couleur du pipeline</div>
          <ColorPicker value={pipeline.color} onChange={(c) => patch({ color: c })} />
        </div>
      </Popover>
      <div className="min-w-0 flex-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (!v) setName(pipeline.name);
            else if (v !== pipeline.name) patch({ name: v }, "Pipeline renommé");
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          disabled={!canEdit}
          className="h-11 text-[17px] font-semibold tracking-[-0.015em]"
          aria-label="Nom du pipeline"
        />
      </div>
      <div className="flex items-center gap-2">
        <Select options={KINDS} value={pipeline.kind} onChange={(kind) => patch({ kind }, "Type mis à jour")} disabled={!canEdit} className="w-[170px]" aria-label="Type de pipeline" />
        {pipeline.is_default ? (
          <Badge tone="violet">
            <Star className="size-3 fill-current" /> Par défaut
          </Badge>
        ) : (
          canEdit && (
            <Button size="sm" variant="glass" icon={<Star className="size-3.5" />} onClick={() => patch({ is_default: true }, `« ${pipeline.name} » est le pipeline par défaut`)}>
              Par défaut
            </Button>
          )
        )}
        {canDelete && (
          <Menu
            trigger={
              <IconButton label="Plus d'actions" size="sm" variant="glass">
                <MoreHorizontal className="size-4" />
              </IconButton>
            }
            items={[{ label: dealCount ? `Supprimer (${dealCount} affaire${dealCount > 1 ? "s" : ""} à déplacer)` : "Supprimer le pipeline", icon: <Trash2 className="size-4" />, danger: true, disabled: dealCount > 0 || pipeline.is_default, onSelect: remove }]}
          />
        )}
      </div>
    </div>
  );
}

function StagesEditor({ pipeline, canEdit }: { pipeline: Pipeline; canEdit: boolean }) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const params = useMemo(() => ({ pipeline_id: pipeline.id, sort: "position", limit: 200 }), [pipeline.id]);
  const { data, isLoading } = useList<Stage>("stages", params);
  const stages = useMemo(() => data?.items ?? [], [data]);
  const board = useQuery({ queryKey: ["deals-board", "settings", pipeline.id], queryFn: () => api.get<{ stages: (BoardColumn & { deals: Deal[] })[] }>("/deals/board", { pipeline_id: pipeline.id }) });
  const stats = useMemo(() => new Map((board.data?.stages ?? []).map((s) => [s.id, { count: s.count, value: s.value }])), [board.data]);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const setCache = (items: Stage[]) => qc.setQueryData<Paginated<Stage>>(keys.list("stages", params), (old) => (old ? { ...old, items } : old));

  const patchStage = async (stage: Stage, payload: Partial<Stage>) => {
    try {
      const updated = await api.patch<Stage>(`/stages/${stage.id}`, payload);
      setCache(stages.map((s) => (s.id === stage.id ? { ...s, ...updated } : s)));
      invalidate("deals-board");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = stages.findIndex((s) => s.id === active.id);
    const to = stages.findIndex((s) => s.id === over.id);
    const next = arrayMove(stages, from, to).map((s, i) => ({ ...s, position: i }));
    setCache(next);
    try {
      await api.post(`/pipelines/${pipeline.id}/stages/reorder`, { order: next.map((s) => s.id) });
      invalidate("deals-board");
      toast.success("Ordre des étapes enregistré");
    } catch (e) {
      toastError(e);
      invalidate("stages");
    }
  };

  const addStage = async () => {
    setAdding(true);
    try {
      const firstClosed = stages.findIndex((s) => s.is_won || s.is_lost);
      const insertAt = firstClosed === -1 ? stages.length : firstClosed;
      const created = await api.post<Stage>("/stages", { pipeline_id: pipeline.id, name: "Nouvelle étape", probability: 50, color: STAGE_COLORS[(insertAt + 2) % STAGE_COLORS.length], position: insertAt, rotting_days: 21 });
      const next = [...stages.slice(0, insertAt), created, ...stages.slice(insertAt)].map((s, i) => ({ ...s, position: i }));
      setCache(next);
      await api.post(`/pipelines/${pipeline.id}/stages/reorder`, { order: next.map((s) => s.id) });
      invalidate("stages", "deals-board");
    } catch (e) {
      toastError(e);
    } finally {
      setAdding(false);
    }
  };

  const removeStage = async (stage: Stage) => {
    if (!(await confirm({ title: `Supprimer l'étape « ${stage.name} » ?`, description: "Cette action est définitive.", confirmLabel: "Supprimer", danger: true }))) return;
    try {
      await api.delete(`/stages/${stage.id}`);
      setCache(stages.filter((s) => s.id !== stage.id));
      invalidate("stages", "deals-board");
      toast.success("Étape supprimée");
    } catch (e) {
      toastError(e);
    }
  };

  const hasWon = stages.some((s) => s.is_won);
  const hasLost = stages.some((s) => s.is_lost);
  const open = stages.filter((s) => !s.is_won && !s.is_lost);

  return (
    <div className="space-y-4">
      {!isLoading && stages.length > 0 && (!hasWon || !hasLost) && (
        <Callout tone="warn" title="Étape de clôture manquante">
          {!hasWon && "Ajoutez une étape « Gagnée » pour pouvoir marquer les affaires comme gagnées. "}
          {!hasLost && "Ajoutez une étape « Perdue » pour enregistrer les affaires perdues et leurs motifs."}
        </Callout>
      )}

      {open.length > 0 && (
        <div className="glass-inset rounded-[16px] p-3">
          <div className="mb-2 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">
            <span>Aperçu de l'entonnoir</span>
            <span className="normal-case tracking-normal">probabilité de gain</span>
          </div>
          <div className="flex items-end gap-1.5">
            {stages.map((s) => (
              <Tooltip key={s.id} content={`${s.name} · ${s.probability} %`}>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end overflow-hidden rounded-[8px] bg-black/[0.04] dark:bg-white/[0.05]">
                    <motion.div layout className="w-full rounded-[8px]" style={{ background: s.color, opacity: s.is_lost ? 0.45 : 0.9 }} initial={false} animate={{ height: `${Math.max(s.probability, 6)}%` }} transition={{ type: "spring", stiffness: 200, damping: 26 }} />
                  </div>
                  <span className="w-full truncate text-center text-[10.5px] text-fg-3">{s.name}</span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 hidden px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3 md:grid md:grid-cols-[20px_28px_minmax(0,1fr)_84px_84px_120px_40px_32px] md:gap-2">
          <span />
          <span />
          <span>Étape</span>
          <span>Probabilité</span>
          <span>Inactivité</span>
          <span>Type</span>
          <span className="text-center">Aff.</span>
          <span />
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-[14px]" />
            ))}
          </div>
        ) : stages.length === 0 ? (
          <EmptyState icon={<Kanban className="size-6" />} title="Aucune étape" description="Ajoutez les étapes de votre processus, de la prise de contact à la signature." />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={onDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {stages.map((s) => {
                  const stat = stats.get(s.id);
                  return <StageRow key={s.id} stage={s} count={stat?.count ?? 0} value={stat?.value ?? 0} canEdit={canEdit} onPatch={(payload) => patchStage(s, payload)} onDelete={() => removeStage(s)} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-[12px] text-fg-3">
          <AlarmClock className="size-3.5" /> Inactivité : nombre de jours sans mouvement avant qu'une affaire soit signalée « à relancer » sur le Kanban.
        </p>
        {canEdit && (
          <Button variant="glass" icon={adding ? <Spinner className="size-4" /> : <Plus className="size-4" />} disabled={adding} onClick={addStage}>
            Ajouter une étape
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab                                                                        */
/* -------------------------------------------------------------------------- */

export default function PipelinesTab() {
  const me = useAuth((s) => s.user);
  const canEdit = can(me, "manager");
  const canDelete = can(me, "admin");
  const { data, isLoading } = useList<Pipeline>("pipelines", { sort: "position", limit: 100 });
  const pipelines = useMemo(() => data?.items ?? [], [data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = pipelines.find((p) => p.id === selectedId) ?? pipelines.find((p) => p.is_default) ?? pipelines[0];
  const stagesCount = useList<Stage>("stages", { limit: 500 });
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of stagesCount.data?.items ?? []) m.set(s.pipeline_id, (m.get(s.pipeline_id) ?? 0) + 1);
    return m;
  }, [stagesCount.data]);
  const dealCounts = useList<Deal>("deals", { pipeline_id: selected?.id, limit: 1 }, { enabled: !!selected });

  return (
    <div className="space-y-5">
      <TabHeader
        title="Pipelines & étapes"
        description="Organisez vos processus commerciaux : étapes, probabilités de gain (prévisions pondérées) et alertes d'inactivité."
        actions={
          canEdit && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouveau pipeline
            </Button>
          )
        }
      />
      {!canEdit && <ReadOnlyNotice role="manager" />}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[62px] rounded-[18px]" />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-[22px]" />
        </div>
      ) : !selected ? (
        <Glass>
          <EmptyState icon={<Kanban className="size-6" />} title="Aucun pipeline" description="Créez votre premier pipeline à partir d'un modèle d'étapes." action={canEdit ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Nouveau pipeline</Button> : undefined} />
        </Glass>
      ) : (
        <div className="space-y-4">
          <LayoutGroup id="pipeline-picker">
            <div role="tablist" aria-label="Pipelines" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pipelines.map((p) => {
                const active = p.id === selected.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(p.id)}
                    className={cn("relative flex items-center gap-3 rounded-[18px] px-3.5 py-3 text-left transition-colors", active ? "text-fg" : "glass-flat text-fg-2 hover:text-fg")}
                  >
                    {active && <motion.span layoutId="pipeline-pill" className="glass absolute inset-0 rounded-[18px] ring-2 ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                    <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]" style={{ background: `linear-gradient(140deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #000))` }}>
                      <Kanban className="size-4" />
                    </span>
                    <span className="relative z-10 min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[11.5px] text-fg-3">
                        {KINDS.find((k) => k.value === p.kind)?.label ?? p.kind} · {counts.get(p.id) ?? 0} étapes
                      </span>
                    </span>
                    {p.is_default && <Star className="relative z-10 size-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Pipeline par défaut" />}
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <SettingsCard bodyClassName="space-y-5">
            <PipelineHeader key={`header-${selected.id}`} pipeline={selected} canEdit={canEdit} canDelete={canDelete} dealCount={dealCounts.data?.total ?? 0} onDeleted={() => setSelectedId(null)} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg-3">
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="size-3.5 text-amber-500" /> « Gagnée » clôture l'affaire en succès (100 %)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="size-3.5 text-red-500" /> « Perdue » demande un motif de perte
              </span>
              {canEdit && (
                <span className="inline-flex items-center gap-1.5">
                  <GripVertical className="size-3.5" /> Glissez pour réordonner
                </span>
              )}
            </div>
            <StagesEditor key={`stages-${selected.id}`} pipeline={selected} canEdit={canEdit} />
          </SettingsCard>
        </div>
      )}

      <NewPipelineDialog open={creating} onOpenChange={setCreating} position={pipelines.length} onCreated={(p) => setSelectedId(p.id)} />
    </div>
  );
}

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Check, FlaskConical, History, Lightbulb, Lock, Plus, Workflow } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/fields";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toastError, useInvalidate, useList } from "@/lib/hooks";
import type { Automation, LeadForm, Pipeline, Stage, User } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { actionDefaults, conditionFields, findConditionField, triggerVisual, variablesFor, type AutomationCatalog } from "./catalog";
import { emptyDraft, toDraft, toPayload, validateDraft, type Draft, type DraftAction } from "./draft";
import type { FieldContext } from "./fields";
import { AddActionPicker, ConditionsNode, Connector, SortableActionNode, TriggerNode } from "./nodes";
import type { AutomationTemplate } from "./templates";
import { RunHistory, TestPanel } from "./TestRunPanel";

export interface BuilderSource {
  key: number;
  automation?: Automation;
  template?: AutomationTemplate;
  tab?: "test" | "history";
}

function initialDraft(source: BuilderSource): Draft {
  if (source.automation) return toDraft(source.automation);
  if (source.template) return toDraft(source.template);
  return emptyDraft();
}

function PlusBubble({ label = "Insérer une action ici" }: { label?: string }) {
  return (
    <button type="button" aria-label={label} title={label} className="glass flex size-7 items-center justify-center rounded-full text-fg-2 transition hover:scale-110 hover:text-accent">
      <Plus className="size-3.5" strokeWidth={2.4} />
    </button>
  );
}

export function AutomationBuilder({ open, onClose, source, catalog }: { open: boolean; onClose: () => void; source: BuilderSource; catalog?: AutomationCatalog }) {
  const me = useAuth((s) => s.user);
  const canEdit = can(me, "manager");
  const confirm = useConfirm();
  const invalidate = useInvalidate();

  const [draft, setDraft] = useState<Draft>(() => initialDraft(source));
  const [baseline, setBaseline] = useState(() => (source.automation ? JSON.stringify(toPayload(draft)) : ""));
  const [savedId, setSavedId] = useState<number | undefined>(source.automation?.id);
  const [tab, setTab] = useState<"test" | "history">(source.tab ?? "test");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const users = useList<User>("users", { limit: 200, expand: 0, sort: "name" }, { enabled: open });
  const pipelines = useList<Pipeline>("pipelines", { limit: 50, expand: 0, sort: "position" }, { enabled: open });
  const stages = useList<Stage>("stages", { limit: 500, expand: 0, sort: "position" }, { enabled: open });
  const forms = useList<LeadForm>("forms", { limit: 200, expand: 0 }, { enabled: open });

  const trigger = triggerVisual(catalog, draft.trigger.type);
  const variables = useMemo(() => variablesFor(draft.trigger.type, trigger.entity), [draft.trigger.type, trigger.entity]);
  const ctx: FieldContext = {
    users: (users.data?.items ?? []).filter((u) => u.is_active),
    pipelines: pipelines.data?.items ?? [],
    stages: stages.data?.items ?? [],
    forms: forms.data?.items ?? [],
    entity: trigger.entity,
    variables,
    disabled: !canEdit,
  };

  const payloadJson = JSON.stringify(toPayload(draft));
  const dirty = payloadJson !== baseline;
  const hasContent = !!(draft.name.trim() || draft.trigger.type || draft.actions.length);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  /* ---------------------------------------------------------------- edits */
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const setTrigger = (next: Draft["trigger"]) =>
    setDraft((d) => {
      const groups = conditionFields(next.type, triggerVisual(catalog, next.type).entity);
      // Drop conditions that no longer make sense for the new trigger.
      const conditions = d.conditions.filter((c) => c.custom || !!findConditionField(groups, c.field));
      return { ...d, trigger: next, conditions };
    });

  const addAction = (type: string, index?: number) => {
    const action: DraftAction = { uid: uid(), type, config: actionDefaults(type) };
    setDraft((d) => {
      const actions = [...d.actions];
      actions.splice(index ?? actions.length, 0, action);
      return { ...d, actions };
    });
    setExpanded((s) => new Set(s).add(action.uid));
  };

  const updateAction = (id: string, config: Record<string, unknown>) => setDraft((d) => ({ ...d, actions: d.actions.map((a) => (a.uid === id ? { ...a, config } : a)) }));
  const removeAction = (id: string) => setDraft((d) => ({ ...d, actions: d.actions.filter((a) => a.uid !== id) }));
  const duplicateAction = (id: string) =>
    setDraft((d) => {
      const i = d.actions.findIndex((a) => a.uid === id);
      if (i < 0) return d;
      const copy = { uid: uid(), type: d.actions[i].type, config: { ...d.actions[i].config } };
      return { ...d, actions: [...d.actions.slice(0, i + 1), copy, ...d.actions.slice(i + 1)] };
    });
  const moveAction = (id: string, delta: -1 | 1) =>
    setDraft((d) => {
      const i = d.actions.findIndex((a) => a.uid === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.actions.length) return d;
      return { ...d, actions: arrayMove(d.actions, i, j) };
    });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((d) => ({ ...d, actions: arrayMove(d.actions, d.actions.findIndex((a) => a.uid === active.id), d.actions.findIndex((a) => a.uid === over.id)) }));
  };
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ----------------------------------------------------------------- save */
  const save = async (close: boolean): Promise<number | null> => {
    const errs = validateDraft(draft, catalog);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setExpanded((s) => {
        const n = new Set(s);
        for (const a of draft.actions) if (Object.keys(errs).some((k) => k.startsWith(`${a.uid}.`))) n.add(a.uid);
        return n;
      });
      if (errs.name || errs.trigger) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      toast.error("Complétez les champs signalés", { description: Object.values(errs)[0] });
      return null;
    }
    setSaving(true);
    try {
      const payload = toPayload(draft);
      let id = savedId;
      if (id) await api.patch(`/automations/${id}`, payload);
      else {
        const created = await api.post<Automation>("/automations", payload);
        id = created.id;
        setSavedId(id);
      }
      setBaseline(JSON.stringify(payload));
      invalidate("automations");
      toast.success(savedId ? "Automatisation enregistrée" : "Automatisation créée", { description: draft.active ? "Elle réagira aux prochains événements." : "Elle est inactive : activez-la pour qu'elle s'exécute." });
      if (close) onClose();
      return id ?? null;
    } catch (e) {
      toastError(e);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const requestClose = async () => {
    if (canEdit && dirty && (savedId || hasContent)) {
      const ok = await confirm({ title: "Quitter sans enregistrer ?", description: "Les modifications apportées à cette automatisation seront perdues.", confirmLabel: "Quitter", danger: true });
      if (!ok) return;
    }
    onClose();
  };

  const actionIds = draft.actions.map((a) => a.uid);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && requestClose()}
      size="xl"
      icon={<Workflow className="size-5" />}
      title={savedId ? "Modifier l'automatisation" : "Nouvelle automatisation"}
      description="Quand un événement survient, vérifiez vos conditions puis enchaînez les actions. Testez sans risque avant d'activer."
      footer={
        <>
          {canEdit && (
            <div className="mr-auto flex items-center gap-2.5">
              <Switch checked={draft.active} onChange={(v) => patch({ active: v })} />
              <span className="text-[13.5px] font-medium">{draft.active ? "Active" : "Inactive"}</span>
              {dirty && savedId && <span className="hidden text-[12px] text-fg-3 sm:inline">· modifications non enregistrées</span>}
            </div>
          )}
          <Button variant="ghost" onClick={requestClose}>
            {canEdit ? "Annuler" : "Fermer"}
          </Button>
          {canEdit && (
            <Button variant="primary" loading={saving} icon={<Check className="size-4" />} onClick={() => save(true)}>
              {savedId ? "Enregistrer" : "Créer l'automatisation"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div ref={top} className="min-w-0 scroll-mt-4 space-y-4">
          {!canEdit && (
            <div className="flex items-center gap-2 rounded-[14px] bg-black/[0.035] px-3 py-2 text-[12.5px] text-fg-2 dark:bg-white/[0.05]">
              <Lock className="size-3.5" /> Lecture seule : seuls les managers et administrateurs peuvent modifier les automatisations.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" required error={errors.name}>
              <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex. : Relance des factures en retard" disabled={!canEdit} className={cn(errors.name && "rounded-[12px] ring-2 ring-red-500/50")} />
            </Field>
            <Field label="Description">
              <Input value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="À quoi sert ce scénario ?" disabled={!canEdit} />
            </Field>
          </div>

          <div className="glass-inset relative rounded-[26px] px-3 py-5 sm:px-6 sm:py-7" style={{ backgroundImage: "radial-gradient(var(--hairline-strong) 1px, transparent 1.3px)", backgroundSize: "18px 18px" }}>
            <div className="mx-auto max-w-[580px]">
              <TriggerNode catalog={catalog} trigger={draft.trigger} onChange={setTrigger} ctx={ctx} error={errors.trigger} readOnly={!canEdit} />
              <Connector />
              <ConditionsNode triggerType={draft.trigger.type} entity={trigger.entity} conditions={draft.conditions} onChange={(conditions) => patch({ conditions })} errors={errors} readOnly={!canEdit} />
              <Connector>{canEdit && draft.actions.length > 0 && <AddActionPicker catalog={catalog} onPick={(type) => addAction(type, 0)} trigger={<PlusBubble />} />}</Connector>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={actionIds} strategy={verticalListSortingStrategy}>
                  {draft.actions.map((a, i) => (
                    <SortableActionNode
                      key={a.uid}
                      action={a}
                      index={i}
                      count={draft.actions.length}
                      catalog={catalog}
                      ctx={ctx}
                      expanded={expanded.has(a.uid)}
                      errors={errors}
                      readOnly={!canEdit}
                      onToggle={() => toggle(a.uid)}
                      onChange={(config) => updateAction(a.uid, config)}
                      onRemove={() => removeAction(a.uid)}
                      onDuplicate={() => duplicateAction(a.uid)}
                      onMove={(delta) => moveAction(a.uid, delta)}
                      after={<Connector>{canEdit && i < draft.actions.length - 1 && <AddActionPicker catalog={catalog} onPick={(type) => addAction(type, i + 1)} trigger={<PlusBubble />} />}</Connector>}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {canEdit ? (
                <AddActionPicker
                  catalog={catalog}
                  onPick={(type) => addAction(type)}
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed py-4 text-[13.5px] font-medium transition hover:border-[color-mix(in_oklab,var(--accent)_55%,transparent)] hover:bg-accent-soft hover:text-accent",
                        errors.actions ? "border-red-500/50 text-red-500" : "border-[var(--hairline-strong)] text-fg-2",
                      )}
                    >
                      <Plus className="size-4" /> {draft.actions.length ? "Ajouter une autre action" : "Ajouter une action"}
                    </button>
                  }
                />
              ) : (
                draft.actions.length === 0 && <p className="text-center text-[13px] text-fg-3">Aucune action.</p>
              )}
              {errors.actions && <p className="mt-2 text-center text-[12px] text-red-500">{errors.actions}</p>}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <Glass radius="lg" className="p-4">
            <Tabs
              size="sm"
              className="mb-4 flex w-full [&>button]:flex-1 [&>button]:justify-center"
              value={tab}
              onChange={setTab}
              items={[
                { value: "test", label: "Tester", icon: <FlaskConical className="size-3.5" /> },
                { value: "history", label: "Historique", icon: <History className="size-3.5" /> },
              ]}
            />
            {tab === "test" ? (
              <TestPanel catalog={catalog} triggerType={draft.trigger.type} ctx={ctx} canRun={canEdit} needsSave={!savedId || dirty} prepare={async () => (!savedId || dirty ? save(false) : savedId)} />
            ) : (
              <RunHistory automationId={savedId} triggerType={draft.trigger.type} catalog={catalog} ctx={ctx} />
            )}
          </Glass>
          <div className="rounded-[18px] bg-accent-soft p-3.5 text-[12.5px] leading-relaxed text-fg-2">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-accent">
              <Lightbulb className="size-3.5" /> Bon à savoir
            </div>
            Cliquez sur <span className="font-mono font-semibold text-fg">{"{ }"}</span> dans un champ pour insérer une variable (nom du contact, numéro de facture…). Les scénarios planifiés s'exécutent à 8 h ; une automatisation peut en déclencher d'autres, sur trois niveaux au plus.
          </div>
        </aside>
      </div>
    </Dialog>
  );
}

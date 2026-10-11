import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Filter, GripVertical, MoreHorizontal, Plus, Repeat2, Trash2, X, Zap, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { fieldBase, NumberInput, SearchInput, Select } from "@/components/ui/fields";
import { Menu, Popover } from "@/components/ui/overlay";
import type { Option } from "@/lib/constants";
import { cn, uid } from "@/lib/utils";
import {
  actionFields,
  actionVisual,
  BOOL_OPTIONS,
  conditionFields,
  ENTITY_LABEL,
  findConditionField,
  OPERATORS,
  operatorsFor,
  TRIGGER_FIELDS,
  triggerVisual,
  variableLabel,
  writableFields,
  type AutomationCatalog,
  type ConditionField,
  type FieldGroup,
  type FieldSpec,
} from "./catalog";
import type { Draft, DraftAction, DraftCondition } from "./draft";
import { ConfigField, GroupedSelect, type FieldContext } from "./fields";
import { IconTile, VarText } from "./parts";

/* -------------------------------------------------------------------------- */
/* Shell & connector                                                          */
/* -------------------------------------------------------------------------- */

function NodeShell({ kicker, title, icon, accent, right, handle, invalid, className, children }: { kicker: ReactNode; title: ReactNode; icon: LucideIcon; accent: string; right?: ReactNode; handle?: ReactNode; invalid?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("glass rounded-[22px] transition-shadow duration-200", invalid && "ring-2 ring-red-500/45", className)}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        {handle}
        <IconTile icon={icon} accent={accent} size={38} />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">{kicker}</div>
          <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{title}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Vertical link between two nodes, with a flowing dash and an optional « + » slot. */
export function Connector({ children }: { children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto flex h-14 w-12 items-center justify-center">
      <svg width="12" height="56" viewBox="0 0 12 56" className="absolute inset-x-0 top-0 mx-auto overflow-visible" aria-hidden>
        <motion.line
          x1="6"
          y1="0"
          x2="6"
          y2="56"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="3 5"
          style={{ stroke: "var(--accent)", strokeOpacity: 0.45 }}
          animate={reduce ? undefined : { strokeDashoffset: [0, -16] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
        {!reduce && <motion.circle cx="6" r="2.6" style={{ fill: "var(--accent)" }} initial={{ cy: 2, opacity: 0 }} animate={{ cy: [2, 54], opacity: [0, 1, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />}
      </svg>
      <ChevronDown className="absolute -bottom-1.5 left-1/2 size-3.5 -translate-x-1/2 text-accent opacity-60" aria-hidden />
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

function TriggerList({ catalog, value, onPick, compact }: { catalog: AutomationCatalog; value?: string; onPick: (type: string) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: { group: string; items: AutomationCatalog["triggers"] }[] = [];
    for (const t of catalog.triggers) {
      if (needle && !`${t.label} ${t.group}`.toLowerCase().includes(needle)) continue;
      const g = out.find((x) => x.group === t.group);
      if (g) g.items.push(t);
      else out.push({ group: t.group, items: [t] });
    }
    return out;
  }, [catalog, q]);
  return (
    <div>
      <SearchInput value={q} onChange={setQ} placeholder="Rechercher un événement…" autoFocus={compact} />
      <div className={cn("mt-3 grid gap-x-4 gap-y-3", compact ? "max-h-[340px] overflow-y-auto pr-1" : "sm:grid-cols-2")}>
        {groups.length === 0 && <p className="py-6 text-center text-[12.5px] text-fg-3 sm:col-span-2">Aucun événement ne correspond.</p>}
        {groups.map((g) => (
          <div key={g.group}>
            <div className="mb-1 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-3">{g.group}</div>
            {g.items.map((t) => {
              const v = triggerVisual(catalog, t.type);
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => onPick(t.type)}
                  className={cn("flex w-full items-center gap-2.5 rounded-[12px] px-1.5 py-1.5 text-left text-[13px] transition hover:bg-black/[0.045] dark:hover:bg-white/[0.07]", value === t.type && "bg-accent-soft font-medium text-accent")}
                >
                  <IconTile icon={v.icon} accent={v.accent} size={26} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AddActionPicker({ catalog, onPick, trigger, align = "center" }: { catalog?: AutomationCatalog; onPick: (type: string) => void; trigger: ReactNode; align?: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} width={350} align={align} trigger={trigger}>
      <div className="max-h-[420px] overflow-y-auto p-2">
        <div className="px-2 pb-1.5 pt-1 text-[12px] font-semibold text-fg-2">Ajouter une action</div>
        {!catalog && <Skeleton className="m-2 h-40" />}
        {catalog?.actions.map((a) => {
          const v = actionVisual(catalog, a.type);
          return (
            <button
              key={a.type}
              type="button"
              onClick={() => {
                onPick(a.type);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 rounded-[12px] px-2 py-2 text-left transition hover:bg-black/[0.045] dark:hover:bg-white/[0.07]"
            >
              <IconTile icon={v.icon} accent={v.accent} size={30} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium">{v.label}</span>
                <span className="block text-[12px] leading-snug text-fg-3">{v.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Trigger                                                                    */
/* -------------------------------------------------------------------------- */

export function TriggerNode({ catalog, trigger, onChange, ctx, error, readOnly }: { catalog?: AutomationCatalog; trigger: Draft["trigger"]; onChange: (t: Draft["trigger"]) => void; ctx: FieldContext; error?: string; readOnly?: boolean }) {
  const [picking, setPicking] = useState(false);
  const choose = (type: string) => {
    onChange({ type, config: {} });
    setPicking(false);
  };

  if (!trigger.type)
    return (
      <NodeShell kicker="1 · Quand" title="Choisissez l'événement déclencheur" icon={Zap} accent="linear-gradient(135deg,var(--accent),var(--accent-2))" invalid={!!error}>
        <div className="border-t border-[var(--hairline)] px-4 pb-4 pt-3">
          {catalog ? <TriggerList catalog={catalog} onPick={choose} /> : <Skeleton className="h-64" />}
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        </div>
      </NodeShell>
    );

  const v = triggerVisual(catalog, trigger.type);
  const specs = TRIGGER_FIELDS[trigger.type] ?? [];
  return (
    <NodeShell
      kicker="1 · Quand"
      title={v.label}
      icon={v.icon}
      accent={v.accent}
      right={
        !readOnly &&
        catalog && (
          <Popover
            open={picking}
            onOpenChange={setPicking}
            width={360}
            trigger={
              <Button size="xs" variant="ghost" icon={<Repeat2 className="size-3.5" />}>
                Changer
              </Button>
            }
          >
            <div className="p-3">
              <TriggerList catalog={catalog} value={trigger.type} onPick={choose} compact />
            </div>
          </Popover>
        )
      }
    >
      <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3.5">
        <p className="text-[12.5px] leading-relaxed text-fg-2">
          {v.entity ? (
            <>
              Élément transmis : <span className="font-medium text-fg">{ENTITY_LABEL[v.entity]}</span>. Ses champs, son contact et son entreprise sont accessibles via les variables.
            </>
          ) : (
            "Exécution planifiée, sans élément associé : idéal pour confier une revue périodique à Iris."
          )}
        </p>
        {specs.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {specs.map((spec) => (
              <ConfigField key={spec.key} spec={spec} value={trigger.config[spec.key]} config={trigger.config} onChange={(val) => onChange({ ...trigger, config: { ...trigger.config, [spec.key]: val } })} ctx={ctx} />
            ))}
          </div>
        )}
      </div>
    </NodeShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Conditions                                                                 */
/* -------------------------------------------------------------------------- */

function ChipMulti({ options, value, onChange, disabled }: { options: Option[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const selected = value.split(",").map((v) => v.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange((on ? selected.filter((v) => v !== o.value) : [...selected, o.value]).join(","))}
            className={cn("h-7 rounded-full px-2.5 text-[12px] font-medium transition", on ? "btn-primary" : "glass-flat text-fg-2 hover:text-fg")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ConditionValue({ field, op, value, onChange, disabled, invalid }: { field?: ConditionField; op: string; value: string; onChange: (v: string) => void; disabled?: boolean; invalid?: boolean }) {
  if (field?.type === "bool") return <Select options={BOOL_OPTIONS} value={value} onChange={onChange} placeholder="Choisir…" disabled={disabled} />;
  if (field?.options && op === "in") return <ChipMulti options={field.options} value={value} onChange={onChange} disabled={disabled} />;
  if (field?.options) return <Select options={field.options} value={value} onChange={onChange} placeholder="Choisir une valeur…" disabled={disabled} />;
  if (field?.type === "number") return <NumberInput value={value} onChange={(n) => onChange(n === null ? "" : String(n))} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={op === "in" ? "Valeurs séparées par des virgules" : "Valeur"} className={cn(fieldBase, "h-10 text-[13.5px]", invalid && "ring-2 ring-red-500/50")} />;
}

function ConditionRow({ cond, index, groups, triggerType, onChange, onRemove, errors, readOnly }: { cond: DraftCondition; index: number; groups: FieldGroup[]; triggerType: string; onChange: (patch: Partial<DraftCondition>) => void; onRemove: () => void; errors: Record<string, string>; readOnly?: boolean }) {
  const known = findConditionField(groups, cond.field);
  const custom = cond.custom || (!known && !!cond.field);
  const ops = operatorsFor(known?.type ?? "text", triggerType);
  const op = OPERATORS.find((o) => o.value === cond.op) ?? ops[0];
  const fieldGroups = [...groups.map((g) => ({ label: g.label, options: g.fields.map((f) => ({ value: f.path, label: f.label })) })), { label: "Avancé", options: [{ value: "__custom", label: "Chemin personnalisé…" }] }];

  const pickField = (path: string) => {
    if (path === "__custom") return onChange({ custom: true, field: "", op: "eq", value: "" });
    const f = findConditionField(groups, path);
    const next = operatorsFor(f?.type ?? "text", triggerType);
    onChange({ custom: false, field: path, op: next.some((o) => o.value === cond.op) ? cond.op : (next[0]?.value ?? "eq"), value: "" });
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }} className="rounded-[16px] bg-black/[0.025] p-2.5 dark:bg-white/[0.035]">
      <div className="mb-1.5 flex h-6 items-center justify-between pl-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-3">{index === 0 ? "Si" : "Et"}</span>
        {!readOnly && (
          <IconButton size="xs" label="Retirer la condition" onClick={onRemove}>
            <X className="size-3.5" />
          </IconButton>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <GroupedSelect groups={fieldGroups} value={custom ? "__custom" : cond.field} onChange={pickField} placeholder="Champ…" disabled={readOnly} invalid={!!errors[`${cond.uid}.field`]} />
          {custom && <input value={cond.field} onChange={(e) => onChange({ field: e.target.value })} disabled={readOnly} placeholder="entity.champ" className={cn(fieldBase, "h-10 font-mono text-[12.5px]", errors[`${cond.uid}.field`] && "ring-2 ring-red-500/50")} />}
        </div>
        <Select options={ops.map((o) => ({ value: o.value, label: o.label }))} value={op?.value ?? ""} onChange={(v) => onChange({ op: v, value: OPERATORS.find((o) => o.value === v)?.noValue ? "" : cond.value })} disabled={readOnly} />
        {op && !op.noValue && (
          <div className="sm:col-span-2">
            <ConditionValue field={known} op={op.value} value={cond.value} onChange={(v) => onChange({ value: v })} disabled={readOnly} invalid={!!errors[`${cond.uid}.value`]} />
            {errors[`${cond.uid}.value`] && <p className="mt-1 text-[12px] text-red-500">{errors[`${cond.uid}.value`]}</p>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ConditionsNode({ triggerType, entity, conditions, onChange, errors, readOnly }: { triggerType: string; entity: string | null; conditions: DraftCondition[]; onChange: (c: DraftCondition[]) => void; errors: Record<string, string>; readOnly?: boolean }) {
  const groups = conditionFields(triggerType, entity);
  const invalid = conditions.some((c) => errors[`${c.uid}.field`] || errors[`${c.uid}.value`]);
  const add = () => {
    const first = groups[0]?.fields[0];
    onChange([...conditions, { uid: uid(), field: first?.path ?? "", op: first ? (operatorsFor(first.type, triggerType)[0]?.value ?? "eq") : "eq", value: "", custom: !first }]);
  };
  return (
    <NodeShell
      kicker="2 · Si"
      title={conditions.length ? `${conditions.length} condition${conditions.length > 1 ? "s" : ""} · toutes requises` : "Aucune condition"}
      icon={Filter}
      accent="linear-gradient(135deg,#94a3b8,#64748b)"
      invalid={invalid}
    >
      <div className="space-y-2.5 border-t border-[var(--hairline)] px-4 py-3.5">
        {conditions.length === 0 && <p className="text-[12.5px] text-fg-2">L'automatisation s'exécute à chaque déclenchement. Ajoutez des conditions pour la limiter (montant, priorité, statut…).</p>}
        <AnimatePresence initial={false}>
          {conditions.map((c, i) => (
            <ConditionRow
              key={c.uid}
              cond={c}
              index={i}
              groups={groups}
              triggerType={triggerType}
              errors={errors}
              readOnly={readOnly}
              onChange={(patch) => onChange(conditions.map((x) => (x.uid === c.uid ? { ...x, ...patch } : x)))}
              onRemove={() => onChange(conditions.filter((x) => x.uid !== c.uid))}
            />
          ))}
        </AnimatePresence>
        {!readOnly && (
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={add} disabled={!triggerType}>
            Ajouter une condition
          </Button>
        )}
      </div>
    </NodeShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

const PEOPLE: Record<string, string> = { owner: "Responsable du dossier", actor: "Auteur de l'événement", all: "Toute l'équipe" };

/** Human-readable value of a configuration field (labels instead of codes). */
export function displayValue(spec: FieldSpec, value: unknown, ctx: FieldContext) {
  const raw = String(value);
  if (spec.kind === "number") return spec.key === "due_in_days" ? (raw === "0" ? "le jour même" : `J+${raw}`) : `${raw}${spec.suffix ? ` ${spec.suffix}` : ""}`;
  if (spec.kind === "assignee" || spec.kind === "target") return PEOPLE[raw] ?? ctx.users.find((u) => String(u.id) === raw)?.name ?? raw;
  if (spec.kind === "pipeline") return ctx.pipelines.find((p) => String(p.id) === raw)?.name ?? raw;
  if (spec.kind === "record-field") return writableFields(ctx.entity).find((f) => f.path === raw)?.label ?? raw;
  if (spec.options) return spec.options.find((o) => o.value === raw)?.label ?? raw;
  return raw.replace(/\s+/g, " ");
}

interface ActionNodeProps {
  action: DraftAction;
  index: number;
  count: number;
  catalog?: AutomationCatalog;
  ctx: FieldContext;
  expanded: boolean;
  errors: Record<string, string>;
  readOnly?: boolean;
  onToggle: () => void;
  onChange: (config: Record<string, unknown>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  after?: ReactNode;
}

function ActionCard({ action, index, count, catalog, ctx, expanded, errors, readOnly, onToggle, onChange, onRemove, onDuplicate, onMove, handle, dragging }: ActionNodeProps & { handle?: ReactNode; dragging?: boolean }) {
  const v = actionVisual(catalog, action.type);
  const specs = actionFields(
    catalog?.actions.find((a) => a.type === action.type),
    action.type,
  ).filter((s) => !s.visible || s.visible(action.config));
  const invalid = specs.some((s) => errors[`${action.uid}.${s.key}`]);
  const summary = specs.filter((s) => action.config[s.key] !== undefined && action.config[s.key] !== null && action.config[s.key] !== "").slice(0, 3);

  return (
    <NodeShell
      kicker={`${index === 0 ? "3 · Alors" : "Puis"} — action ${index + 1}`}
      title={v.label}
      icon={v.icon}
      accent={v.accent}
      invalid={invalid}
      handle={handle}
      className={cn(dragging && "shadow-[var(--glass-shadow-lg)]")}
      right={
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton size="sm" label={expanded ? "Replier" : "Configurer"} onClick={onToggle}>
            <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} />
          </IconButton>
          {!readOnly && (
            <Menu
              trigger={
                <IconButton size="sm" label="Plus d'options">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              }
              items={[
                { label: "Monter", icon: <ArrowUp className="size-4" />, onSelect: () => onMove(-1), disabled: index === 0 },
                { label: "Descendre", icon: <ArrowDown className="size-4" />, onSelect: () => onMove(1), disabled: index === count - 1 },
                { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: onDuplicate },
                { separator: true, label: "" },
                { label: "Supprimer l'action", icon: <Trash2 className="size-4" />, danger: true, onSelect: onRemove },
              ]}
            />
          )}
        </div>
      }
    >
      <AnimatePresence initial={false} mode="popLayout">
        {expanded ? (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
            <div className="border-t border-[var(--hairline)] px-4 pb-4 pt-3">
              <p className="mb-3 text-[12.5px] text-fg-2">{v.description}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {specs.map((spec) => (
                  <ConfigField key={spec.key} spec={spec} value={action.config[spec.key]} config={action.config} onChange={(val) => onChange({ ...action.config, [spec.key]: val })} ctx={ctx} error={errors[`${action.uid}.${spec.key}`]} />
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          summary.length > 0 && (
            <motion.button key="summary" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onToggle} className="block w-full space-y-0.5 border-t border-[var(--hairline)] px-4 py-2.5 text-left">
              {summary.map((spec) => (
                <span key={spec.key} className="block truncate text-[12.5px]">
                  <span className="text-fg-3">{spec.label} : </span>
                  <VarText text={displayValue(spec, action.config[spec.key], ctx)} label={(p) => variableLabel(ctx.variables, p)} className="text-fg-2" />
                </span>
              ))}
            </motion.button>
          )
        )}
      </AnimatePresence>
    </NodeShell>
  );
}

/** Action node, reorderable by its grip handle (dnd-kit). */
export function SortableActionNode(props: ActionNodeProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.action.uid, disabled: props.readOnly });
  const handle =
    !props.readOnly && props.count > 1 ? (
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="-ml-1.5 flex h-9 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-[8px] text-fg-3 transition hover:text-fg active:cursor-grabbing" aria-label="Glisser pour réordonner">
        <GripVertical className="size-4" />
      </button>
    ) : undefined;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }} className={cn("relative", isDragging && "z-20")}>
      <ActionCard {...props} handle={handle} dragging={isDragging} />
      <div className={cn("transition-opacity", isDragging && "opacity-0")}>{props.after}</div>
    </div>
  );
}

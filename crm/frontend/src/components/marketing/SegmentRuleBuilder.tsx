import { ChevronDown, CircleAlert, Hash, Plus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { fieldBase, Input, NumberInput, Select } from "@/components/ui/fields";
import { Segmented } from "@/components/ui/tabs";
import type { SegmentRule } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import {
  adaptValue,
  defaultCondition,
  DEFAULT_FIELD,
  findField,
  isComplete,
  NO_VALUE_OPS,
  OPERATORS_BY_KIND,
  operatorLabel,
  QUICK_RULES,
  type SegmentEntity,
  type SegmentFieldDef,
  type SegmentFieldsResponse,
} from "./segment-fields";

export type DraftRule = SegmentRule & { id: string };
export type Match = "all" | "any";

/** Rules loaded from the API, with "in" values normalised to lists (the seed stores "lead,mql,sql"). */
export function toDraftRules(conditions: SegmentRule[] | undefined): DraftRule[] {
  return (conditions ?? []).map((c) => ({
    ...c,
    value: c.op === "in" && typeof c.value === "string" ? c.value.split(",").map((v) => v.trim()).filter(Boolean) : c.value,
    id: uid(),
  }));
}

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

function FieldPicker({ fields, value, onChange }: { fields: SegmentFieldDef[]; value: string; onChange: (key: string) => void }) {
  const groups = fields.reduce<Record<string, SegmentFieldDef[]>>((acc, f) => {
    (acc[f.group] ??= []).push(f);
    return acc;
  }, {});
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldBase, "h-10 appearance-none pr-9 font-medium")} aria-label="Champ">
        {Object.entries(groups).map(([group, defs]) => (
          <optgroup key={group} label={group} className="bg-[var(--glass-solid)] text-fg">
            {defs.map((d) => (
              <option key={d.key} value={d.key} className="bg-[var(--glass-solid)] text-fg">
                {d.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

function MultiChoice({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn("h-8 rounded-full px-3 text-[12.5px] font-medium transition-all", on ? "btn-primary" : "glass-flat text-fg-2 hover:text-fg")}
            aria-pressed={on}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ValueInput({ def, rule, onChange }: { def: SegmentFieldDef; rule: SegmentRule; onChange: (value: unknown) => void }) {
  const listId = useId();
  const op = rule.op;
  if (NO_VALUE_OPS.has(op)) return <div className="glass-inset flex h-10 items-center rounded-[12px] px-3 text-[13px] text-fg-3">Aucune valeur requise</div>;
  if (op === "within_days" || op === "older_than_days") return <NumberInput value={rule.value as number} onChange={(v) => onChange(v ?? "")} min={1} step={1} suffix="jours" placeholder="30" />;
  if (op === "in" && def.options) return <MultiChoice options={def.options} value={Array.isArray(rule.value) ? rule.value.map(String) : []} onChange={onChange} />;
  switch (def.kind) {
    case "number":
      return <NumberInput value={rule.value as number} onChange={(v) => onChange(v ?? "")} placeholder={def.placeholder} />;
    case "money":
      return <NumberInput value={rule.value as number} onChange={(v) => onChange(v ?? "")} suffix="€" placeholder={def.placeholder} />;
    case "select":
      return <Select options={def.options ?? []} value={String(rule.value ?? "")} onChange={onChange} />;
    case "user":
      return <EntitySelect resource="users" value={rule.value ? Number(rule.value) : null} onChange={(id) => onChange(id ?? "")} placeholder="Choisir un membre…" />;
    case "company":
      return <EntitySelect resource="companies" value={rule.value ? Number(rule.value) : null} onChange={(id) => onChange(id ?? "")} placeholder="Choisir une entreprise…" />;
    case "tags":
      return <Input icon={<Hash className="size-3.5" />} value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value.replace(/^#/, ""))} placeholder={def.placeholder ?? "tag"} />;
    default:
      return (
        <>
          <Input value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} list={def.options ? listId : undefined} />
          {def.options && (
            <datalist id={listId}>
              {def.options.map((o) => (
                <option key={o.value} value={o.value} />
              ))}
            </datalist>
          )}
        </>
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

function RuleRow({ rule, fields, api, onChange, onRemove }: { rule: DraftRule; fields: SegmentFieldDef[]; api?: SegmentFieldsResponse | null; onChange: (r: DraftRule) => void; onRemove: () => void }) {
  const def = findField(fields, rule.field);
  const ops = OPERATORS_BY_KIND[def.kind];
  const boolean = def.kind === "boolean" || def.kind === "flag";
  const complete = isComplete(rule);

  const pickField = (key: string) => {
    const next = findField(fields, key);
    onChange({ ...defaultCondition(next), id: rule.id });
  };
  const pickOp = (op: string) => onChange({ ...rule, op, value: adaptValue(def, op, rule.value) });

  return (
    <motion.div layout initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="glass-inset rounded-[18px] p-2">
      <div className={cn("grid items-start gap-2", boolean ? "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,2.1fr)_auto]" : "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto]", "grid-cols-[minmax(0,1fr)_auto]")}>
        <div className="min-w-0">
          <FieldPicker fields={fields} value={rule.field} onChange={pickField} />
        </div>
        <IconButton label="Retirer la condition" size="md" onClick={onRemove} className="text-fg-3 hover:text-red-500 sm:order-last">
          <X className="size-4" />
        </IconButton>
        {boolean ? (
          <div className="col-span-2 flex h-10 items-center sm:col-span-1">
            <Segmented
              value={rule.op === "is_false" ? "is_false" : "is_true"}
              onChange={(op) => onChange({ ...rule, op, value: undefined })}
              options={[
                { value: "is_true", label: def.kind === "flag" ? "Oui" : "Oui (vrai)" },
                { value: "is_false", label: def.kind === "flag" ? "Non" : "Non (faux)" },
              ]}
            />
          </div>
        ) : (
          <>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <Select options={ops.map((o) => ({ value: o, label: operatorLabel(o, api) }))} value={rule.op} onChange={pickOp} aria-label="Opérateur" />
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <ValueInput def={def} rule={rule} onChange={(value) => onChange({ ...rule, value })} />
            </div>
          </>
        )}
      </div>
      {!complete && (
        <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[11.5px] font-medium text-amber-600 dark:text-amber-300">
          <CircleAlert className="size-3.5" /> Valeur à compléter : cette condition est ignorée pour l'instant.
        </div>
      )}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                    */
/* -------------------------------------------------------------------------- */

export function SegmentRuleBuilder({
  entity,
  match,
  conditions,
  fields,
  api,
  onMatchChange,
  onChange,
}: {
  entity: SegmentEntity;
  match: Match;
  conditions: DraftRule[];
  fields: SegmentFieldDef[];
  api?: SegmentFieldsResponse | null;
  onMatchChange: (m: Match) => void;
  onChange: (rules: DraftRule[]) => void;
}) {
  const add = (rule?: SegmentRule) => {
    const base = rule ?? defaultCondition(findField(fields, DEFAULT_FIELD[entity]));
    onChange([...conditions, { ...base, id: uid() }]);
  };
  const joiner = match === "all" ? "ET" : "OU";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-fg-2">
        <span>Inclure les {entity === "contacts" ? "contacts" : "entreprises"} qui remplissent</span>
        <Segmented
          value={match}
          onChange={onMatchChange}
          options={[
            { value: "all", label: "toutes les conditions" },
            { value: "any", label: "au moins une" },
          ]}
        />
      </div>

      {conditions.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[var(--hairline-strong)] px-4 py-5">
          <p className="text-[13.5px] font-medium">Aucune condition pour l'instant</p>
          <p className="mt-0.5 text-[12.5px] text-fg-3">Sans condition, le segment regroupe {entity === "contacts" ? "tous les contacts (hors anonymisés)" : "toutes les entreprises"}. Partez d'une suggestion :</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_RULES[entity].map((q) => (
              <button key={q.label} type="button" onClick={() => add(q.rule)} className="glass-flat inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-fg-2 transition hover:text-fg">
                <Sparkles className="size-3.5 text-accent" />
                {q.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-0">
          <AnimatePresence initial={false}>
            {conditions.map((rule, i) => (
              <motion.div key={rule.id} layout exit={{ opacity: 0, height: 0 }}>
                {i > 0 && (
                  <div className="relative flex h-7 items-center justify-center">
                    <span className="absolute inset-x-6 top-1/2 h-px bg-[var(--hairline)]" />
                    <button
                      type="button"
                      onClick={() => onMatchChange(match === "all" ? "any" : "all")}
                      title="Basculer ET / OU"
                      className={cn("relative rounded-full px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.12em] ring-1 ring-inset transition", match === "all" ? "bg-accent-soft text-accent ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]" : "bg-amber-400/15 text-amber-700 ring-amber-500/30 dark:text-amber-300")}
                    >
                      {joiner}
                    </button>
                  </div>
                )}
                <RuleRow rule={rule} fields={fields} api={api} onChange={(r) => onChange(conditions.map((c) => (c.id === rule.id ? r : c)))} onRemove={() => onChange(conditions.filter((c) => c.id !== rule.id))} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Button variant="subtle" size="sm" className="mt-3" icon={<Plus className="size-4" />} onClick={() => add()}>
        Ajouter une condition
      </Button>
    </div>
  );
}

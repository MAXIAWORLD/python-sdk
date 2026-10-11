import type { Automation } from "@/lib/types";
import { uid } from "@/lib/utils";
import { actionFields, OPERATORS, type AutomationCatalog } from "./catalog";
import type { AutomationTemplate } from "./templates";

export interface DraftCondition {
  uid: string;
  field: string;
  op: string;
  value: string;
  /** UI only: the field is typed as a free path. */
  custom?: boolean;
}

export interface DraftAction {
  uid: string;
  type: string;
  config: Record<string, unknown>;
}

export interface Draft {
  name: string;
  description: string;
  active: boolean;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: DraftCondition[];
  actions: DraftAction[];
}

export type DraftSource = Pick<Automation, "name" | "trigger" | "conditions" | "actions"> & { description?: string | null; active?: boolean };

export function emptyDraft(): Draft {
  return { name: "", description: "", active: true, trigger: { type: "", config: {} }, conditions: [], actions: [] };
}

export function toDraft(source: DraftSource | AutomationTemplate, overrides: Partial<Draft> = {}): Draft {
  return {
    name: source.name,
    description: source.description ?? "",
    active: "active" in source && source.active !== undefined ? source.active : true,
    trigger: { type: source.trigger?.type ?? "", config: { ...(source.trigger?.config ?? {}) } },
    conditions: (source.conditions ?? []).map((c) => ({ uid: uid(), field: c.field, op: c.op, value: c.value === undefined || c.value === null ? "" : String(c.value) })),
    actions: (source.actions ?? []).map((a) => ({ uid: uid(), type: a.type, config: { ...(a.config ?? {}) } })),
    ...overrides,
  };
}

const clean = (config: Record<string, unknown>) => Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export function toPayload(d: Draft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    active: d.active,
    trigger: { type: d.trigger.type, config: clean(d.trigger.config) },
    conditions: d.conditions.map((c) => (OPERATORS.find((o) => o.value === c.op)?.noValue ? { field: c.field, op: c.op } : { field: c.field, op: c.op, value: c.value })),
    actions: d.actions.map((a) => ({ type: a.type, config: clean(a.config) })),
  };
}

/** Returns a map of error messages keyed by « name », « trigger », « actions », « <uid> » or « <uid>.<field> ». */
export function validateDraft(d: Draft, catalog?: AutomationCatalog): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "Donnez un nom à l'automatisation.";
  if (!d.trigger.type) errors.trigger = "Choisissez l'événement déclencheur.";
  if (d.actions.length === 0) errors.actions = "Ajoutez au moins une action.";
  for (const c of d.conditions) {
    if (!c.field.trim()) errors[`${c.uid}.field`] = "Choisissez un champ.";
    const op = OPERATORS.find((o) => o.value === c.op);
    if (op && !op.noValue && !c.value.trim()) errors[`${c.uid}.value`] = "Indiquez une valeur.";
  }
  for (const a of d.actions) {
    const specs = actionFields(
      catalog?.actions.find((x) => x.type === a.type),
      a.type,
    );
    for (const spec of specs) {
      if (!spec.required || (spec.visible && !spec.visible(a.config))) continue;
      const v = a.config[spec.key];
      if (v === undefined || v === null || String(v).trim() === "") errors[`${a.uid}.${spec.key}`] = "Champ obligatoire.";
    }
  }
  return errors;
}

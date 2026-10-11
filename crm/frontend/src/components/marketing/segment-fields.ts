import { COMPANY_SIZES, COMPANY_STATUS, COMPANY_TYPES, LIFECYCLE, SOURCES, labelOf, type Option } from "@/lib/constants";
import { number } from "@/lib/format";
import type { SegmentRule } from "@/lib/types";

/**
 * The API (`GET /segments/fields`) only lists field keys and operator labels:
 * this catalog adds what the rule builder needs — French label, value type, options.
 */

export type FieldKind = "text" | "number" | "money" | "select" | "boolean" | "flag" | "date" | "tags" | "user" | "company";
export type SegmentEntity = "contacts" | "companies";

export interface SegmentFieldDef {
  key: string;
  label: string;
  group: string;
  kind: FieldKind;
  options?: Option[];
  placeholder?: string;
}

export interface SegmentFieldsResponse {
  operators: Record<string, string>;
  contact_fields: string[];
  company_fields: string[];
}

const LANGUAGES: Option[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol" },
  { value: "de", label: "Allemand" },
  { value: "it", label: "Italien" },
  { value: "nl", label: "Néerlandais" },
  { value: "pt", label: "Portugais" },
];

const SOURCE_OPTIONS: Option[] = SOURCES.map((s) => ({ value: s, label: s }));
const SIZE_OPTIONS: Option[] = COMPANY_SIZES.map((s) => ({ value: s, label: `${s} salariés` }));

type Def = Omit<SegmentFieldDef, "key" | "group">;

const COMPANY_DEFS: Record<string, Def> = {
  type: { label: "Type", kind: "select", options: COMPANY_TYPES },
  status: { label: "Statut", kind: "select", options: COMPANY_STATUS },
  industry: { label: "Secteur", kind: "text", placeholder: "Ex. : Web3, SaaS…" },
  size: { label: "Taille", kind: "select", options: SIZE_OPTIONS },
  employees: { label: "Effectif", kind: "number", placeholder: "50" },
  annual_revenue: { label: "CA annuel", kind: "money", placeholder: "1000000" },
  health_score: { label: "Score de santé", kind: "number", placeholder: "70" },
  city: { label: "Ville", kind: "text", placeholder: "Paris" },
  country: { label: "Pays", kind: "text", placeholder: "France" },
  source: { label: "Source", kind: "text", options: SOURCE_OPTIONS, placeholder: "Site web" },
  owner_id: { label: "Responsable", kind: "user" },
  tags: { label: "Tags", kind: "tags", placeholder: "client-vip" },
  created_at: { label: "Date de création", kind: "date" },
};

const CONTACT_DEFS: Record<string, Def & { group: string }> = {
  first_name: { label: "Prénom", kind: "text", group: "Contact", placeholder: "Camille" },
  last_name: { label: "Nom", kind: "text", group: "Contact", placeholder: "Durand" },
  email: { label: "Email", kind: "text", group: "Contact", placeholder: "@exemple.fr" },
  job_title: { label: "Poste", kind: "text", group: "Contact", placeholder: "Ex. : CEO, directeur…" },
  department: { label: "Service", kind: "text", group: "Contact", placeholder: "Marketing" },
  lifecycle: { label: "Cycle de vie", kind: "select", group: "Contact", options: LIFECYCLE },
  lead_score: { label: "Score lead", kind: "number", group: "Contact", placeholder: "70" },
  source: { label: "Source", kind: "text", group: "Contact", options: SOURCE_OPTIONS, placeholder: "LinkedIn" },
  owner_id: { label: "Responsable", kind: "user", group: "Contact" },
  company_id: { label: "Entreprise", kind: "company", group: "Contact" },
  city: { label: "Ville", kind: "text", group: "Contact", placeholder: "Lyon" },
  country: { label: "Pays", kind: "text", group: "Contact", placeholder: "France" },
  language: { label: "Langue", kind: "select", group: "Contact", options: LANGUAGES },
  tags: { label: "Tags", kind: "tags", group: "Contact", placeholder: "newsletter" },
  consent_marketing: { label: "Consentement marketing", kind: "boolean", group: "Consentement (RGPD)" },
  do_not_contact: { label: "Opposition (ne pas contacter)", kind: "boolean", group: "Consentement (RGPD)" },
  created_at: { label: "Date de création", kind: "date", group: "Activité" },
  last_contacted_at: { label: "Dernier contact", kind: "date", group: "Activité" },
  has_open_deal: { label: "Opportunité en cours", kind: "flag", group: "Activité" },
};

const CONTACT_ORDER = Object.keys(CONTACT_DEFS);
const COMPANY_ORDER = Object.keys(COMPANY_DEFS);

/** Field definitions available for an entity, following the keys exposed by the API when known. */
export function fieldsFor(entity: SegmentEntity, api?: SegmentFieldsResponse | null): SegmentFieldDef[] {
  if (entity === "companies") {
    const keys = api?.company_fields ?? COMPANY_ORDER;
    return sortByOrder(keys, COMPANY_ORDER).map((key) => ({ key, group: key === "created_at" ? "Activité" : "Entreprise", ...(COMPANY_DEFS[key] ?? fallback(key)) }));
  }
  const keys = api?.contact_fields ?? [...CONTACT_ORDER, ...COMPANY_ORDER.map((k) => `company.${k}`)];
  const own = keys.filter((k) => !k.startsWith("company."));
  const nested = keys.filter((k) => k.startsWith("company."));
  return [
    ...sortByOrder(own, CONTACT_ORDER).map((key) => ({ key, ...(CONTACT_DEFS[key] ?? { ...fallback(key), group: "Contact" }) })),
    ...sortByOrder(
      nested.map((k) => k.slice(8)),
      COMPANY_ORDER,
    ).map((sub) => ({ key: `company.${sub}`, group: "Entreprise du contact", ...(COMPANY_DEFS[sub] ?? fallback(sub)) })),
  ];
}

function sortByOrder(keys: string[], order: string[]) {
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

function fallback(key: string): Def {
  return { label: key.replace(/_/g, " "), kind: "text" };
}

export function findField(defs: SegmentFieldDef[], key: string): SegmentFieldDef {
  return defs.find((d) => d.key === key) ?? { key, group: "Autres", ...fallback(key) };
}

/* -------------------------------------------------------------------------- */
/* Operators                                                                  */
/* -------------------------------------------------------------------------- */

export const OPERATORS_BY_KIND: Record<FieldKind, string[]> = {
  text: ["contains", "not_contains", "eq", "ne", "is_empty", "is_not_empty"],
  number: ["gte", "lte", "gt", "lt", "eq", "ne", "is_empty", "is_not_empty"],
  money: ["gte", "lte", "gt", "lt", "is_empty", "is_not_empty"],
  select: ["eq", "ne", "in", "is_empty", "is_not_empty"],
  boolean: ["is_true", "is_false"],
  flag: ["is_true", "is_false"],
  date: ["within_days", "older_than_days", "is_empty", "is_not_empty"],
  tags: ["has_tag", "not_has_tag", "is_empty", "is_not_empty"],
  user: ["eq", "ne", "is_empty", "is_not_empty"],
  company: ["eq", "ne", "is_empty", "is_not_empty"],
};

const FALLBACK_OPERATOR_LABELS: Record<string, string> = {
  eq: "est égal à",
  ne: "est différent de",
  contains: "contient",
  not_contains: "ne contient pas",
  gt: "supérieur à",
  gte: "supérieur ou égal à",
  lt: "inférieur à",
  lte: "inférieur ou égal à",
  in: "fait partie de",
  is_empty: "est vide",
  is_not_empty: "n'est pas vide",
  has_tag: "a le tag",
  not_has_tag: "n'a pas le tag",
  within_days: "dans les N derniers jours",
  older_than_days: "il y a plus de N jours",
  is_true: "est vrai",
  is_false: "est faux",
};

export function operatorLabel(op: string, api?: SegmentFieldsResponse | null) {
  return api?.operators?.[op] ?? FALLBACK_OPERATOR_LABELS[op] ?? op;
}

export const NO_VALUE_OPS = new Set(["is_empty", "is_not_empty", "is_true", "is_false"]);
const NUMERIC_OPS = new Set(["gt", "gte", "lt", "lte"]);
const DAY_OPS = new Set(["within_days", "older_than_days"]);

/** Default operator + value when a field is picked. */
export function defaultCondition(def: SegmentFieldDef): SegmentRule {
  const op = OPERATORS_BY_KIND[def.kind][0];
  if (def.kind === "date") return { field: def.key, op, value: 30 };
  if (def.kind === "select" && def.options?.length) return { field: def.key, op, value: def.options[0].value };
  return { field: def.key, op, value: NO_VALUE_OPS.has(op) ? undefined : "" };
}

/** Keeps the value coherent when the operator changes (e.g. "eq" → "in" makes a list). */
export function adaptValue(def: SegmentFieldDef, op: string, value: unknown): unknown {
  if (NO_VALUE_OPS.has(op)) return undefined;
  if (op === "in") {
    if (Array.isArray(value)) return value;
    const v = value === undefined || value === null || value === "" ? [] : String(value).split(",").map((s) => s.trim()).filter(Boolean);
    return v;
  }
  if (Array.isArray(value)) return value[0] ?? "";
  if (DAY_OPS.has(op)) return typeof value === "number" ? value : 30;
  if (def.kind === "select" && (value === undefined || value === "") && def.options?.length) return def.options[0].value;
  return value ?? "";
}

/** A condition can be evaluated by the API (empty numeric values would make it fail). */
export function isComplete(rule: SegmentRule) {
  if (!rule.field || !rule.op) return false;
  if (NO_VALUE_OPS.has(rule.op)) return true;
  const v = rule.value;
  if (NUMERIC_OPS.has(rule.op) || DAY_OPS.has(rule.op)) return v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
  if (rule.op === "in") return Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "";
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/** Serializes a condition the way the API expects (numbers as numbers, ids as numbers). */
export function cleanRule(def: SegmentFieldDef, rule: SegmentRule): SegmentRule {
  if (NO_VALUE_OPS.has(rule.op)) return { field: rule.field, op: rule.op };
  let value = rule.value;
  if (NUMERIC_OPS.has(rule.op) || DAY_OPS.has(rule.op) || ((def.kind === "number" || def.kind === "money") && (rule.op === "eq" || rule.op === "ne"))) value = Number(value);
  else if (def.kind === "user" || def.kind === "company") value = Number(value);
  else if (def.kind === "tags" && typeof value === "string") value = value.trim().replace(/^#/, "");
  else if (typeof value === "string") value = value.trim();
  return { field: rule.field, op: rule.op, value };
}

/* -------------------------------------------------------------------------- */
/* Human-readable summaries                                                   */
/* -------------------------------------------------------------------------- */

const SHORT_OPS: Record<string, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contient",
  not_contains: "ne contient pas",
  is_empty: "non renseigné",
  is_not_empty: "renseigné",
  has_tag: "a le tag",
  not_has_tag: "n'a pas le tag",
};

function valueText(def: SegmentFieldDef, value: unknown, names?: Record<number, string>): string {
  if (Array.isArray(value)) return value.map((v) => valueText(def, v, names)).join(", ");
  if (def.kind === "select" && def.options) return labelOf(def.options, String(value ?? ""));
  if (def.kind === "user" || def.kind === "company") return names?.[Number(value)] ?? `#${value}`;
  if (def.kind === "money") return `${number(Number(value))} €`;
  if (def.kind === "tags") return `#${String(value ?? "").replace(/^#/, "")}`;
  if (def.kind === "text") return `« ${String(value ?? "")} »`;
  return String(value ?? "");
}

/** "Cycle de vie : Lead, MQL ou SQL", "Score lead ≥ 70", "Créé il y a moins de 30 j"… */
export function describeRule(def: SegmentFieldDef, rule: SegmentRule, names?: Record<number, string>) {
  const label = def.key.startsWith("company.") ? `${def.label} (entreprise)` : def.label;
  switch (rule.op) {
    case "is_true":
      return def.kind === "flag" ? def.label : `${label} : oui`;
    case "is_false":
      return def.kind === "flag" ? `Sans ${def.label.toLowerCase()}` : `${label} : non`;
    case "in": {
      const items = (Array.isArray(rule.value) ? rule.value : String(rule.value ?? "").split(",")).map((v) => valueText(def, typeof v === "string" ? v.trim() : v, names));
      return `${label} : ${items.length > 1 ? `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}` : items[0] ?? "—"}`;
    }
    case "within_days":
      return `${label} : moins de ${rule.value} j`;
    case "older_than_days":
      return `${label} : plus de ${rule.value} j`;
    case "is_empty":
    case "is_not_empty":
      return `${label} ${SHORT_OPS[rule.op]}`;
    default:
      return `${label} ${SHORT_OPS[rule.op] ?? rule.op} ${valueText(def, rule.value, names)}`;
  }
}

/** Field used when the user clicks « Ajouter une condition ». */
export const DEFAULT_FIELD: Record<SegmentEntity, string> = { contacts: "lifecycle", companies: "type" };

export const SEGMENT_COLORS =["#5b6cff", "#8b5cf6", "#ec4899", "#ff375f", "#ff9f0a", "#eab308", "#30d158", "#30d5c8", "#0a84ff", "#64748b"];

/** Suggested starting points shown in an empty rule builder. */
export const QUICK_RULES: Record<SegmentEntity, { label: string; rule: SegmentRule }[]> = {
  contacts: [
    { label: "Clients", rule: { field: "lifecycle", op: "eq", value: "customer" } },
    { label: "Leads chauds (score ≥ 70)", rule: { field: "lead_score", op: "gte", value: 70 } },
    { label: "Opt-in marketing", rule: { field: "consent_marketing", op: "is_true" } },
    { label: "Créés depuis 30 j", rule: { field: "created_at", op: "within_days", value: 30 } },
    { label: "Sans contact depuis 90 j", rule: { field: "last_contacted_at", op: "older_than_days", value: 90 } },
    { label: "Opportunité en cours", rule: { field: "has_open_deal", op: "is_true" } },
  ],
  companies: [
    { label: "Clients", rule: { field: "type", op: "eq", value: "client" } },
    { label: "Prospects", rule: { field: "type", op: "eq", value: "prospect" } },
    { label: "Santé < 50", rule: { field: "health_score", op: "lt", value: 50 } },
    { label: "Plus de 50 salariés", rule: { field: "employees", op: "gte", value: 50 } },
  ],
};

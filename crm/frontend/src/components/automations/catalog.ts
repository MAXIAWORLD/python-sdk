import {
  AlarmClock,
  ArrowRightLeft,
  BadgeEuro,
  BellRing,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CircleX,
  ClipboardPen,
  Eye,
  FileX2,
  FolderKanban,
  FolderPlus,
  LifeBuoy,
  ListChecks,
  Mail,
  MessageSquareWarning,
  PenLine,
  Receipt,
  RefreshCw,
  Repeat,
  Signature,
  Sparkles,
  SquareCheckBig,
  Tag,
  Target,
  Trophy,
  UserPen,
  UserPlus,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  BILLING_MODES,
  COMPANY_TYPES,
  INTERVALS,
  INVOICE_KIND,
  INVOICE_STATUS,
  LIFECYCLE,
  PRIORITY,
  PROJECT_STATUS,
  QUOTE_STATUS,
  SOURCES,
  SUBSCRIPTION_STATUS,
  TASK_STATUS,
  TASK_TYPES,
  TICKET_CHANNELS,
  TICKET_PRIORITY,
  TICKET_STATUS,
  type Option,
} from "@/lib/constants";
import { useApi } from "@/lib/hooks";
import type { Ref } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* API shapes                                                                 */
/* -------------------------------------------------------------------------- */

export interface CatalogTrigger {
  type: string;
  label: string;
  group: string;
  entity: string | null;
}

export interface CatalogAction {
  type: string;
  label: string;
  fields: string[];
}

export interface AutomationCatalog {
  triggers: CatalogTrigger[];
  actions: CatalogAction[];
}

export interface AutomationRun {
  id: number;
  created_at: string;
  automation_id: number;
  automation?: Ref | null;
  status: string;
  event?: string | null;
  payload: Record<string, unknown>;
  log: string[];
  error?: string | null;
}

export interface TestResult {
  status: string;
  log: string[];
}

export function useAutomationCatalog() {
  return useApi<AutomationCatalog>(["automation-catalog"], "/automations/catalog", undefined, { staleTime: Infinity });
}

/* -------------------------------------------------------------------------- */
/* Visual identity of triggers and actions                                    */
/* -------------------------------------------------------------------------- */

export const GROUP_ACCENT: Record<string, string> = {
  Contacts: "linear-gradient(135deg,#5b6cff,#22d3ee)",
  Marketing: "linear-gradient(135deg,#f472b6,#fb923c)",
  Ventes: "linear-gradient(135deg,#8b5cf6,#ec4899)",
  Facturation: "linear-gradient(135deg,#10b981,#22d3ee)",
  Abonnements: "linear-gradient(135deg,#6366f1,#a855f7)",
  Support: "linear-gradient(135deg,#fb923c,#f43f5e)",
  Projets: "linear-gradient(135deg,#0ea5e9,#14b8a6)",
  Planifié: "linear-gradient(135deg,#64748b,#a1a1aa)",
};

const TRIGGER_ICONS: Record<string, LucideIcon> = {
  "contact.created": UserPlus,
  "contact.updated": UserPen,
  "company.created": Building2,
  "form.submitted": ClipboardPen,
  "deal.created": Target,
  "deal.stage_changed": ArrowRightLeft,
  "deal.won": Trophy,
  "deal.lost": CircleX,
  "quote.viewed": Eye,
  "quote.accepted": Signature,
  "quote.declined": FileX2,
  "invoice.issued": Receipt,
  "invoice.paid": BadgeEuro,
  "invoice.overdue": AlarmClock,
  "subscription.created": Repeat,
  "subscription.updated": RefreshCw,
  "ticket.created": LifeBuoy,
  "ticket.updated": MessageSquareWarning,
  "task.completed": SquareCheckBig,
  "project.created": FolderPlus,
  "schedule.daily": CalendarClock,
  "schedule.weekly": CalendarDays,
};

export function triggerVisual(catalog: AutomationCatalog | undefined, type: string) {
  const t = catalog?.triggers.find((x) => x.type === type);
  return {
    icon: TRIGGER_ICONS[type] ?? Zap,
    accent: GROUP_ACCENT[t?.group ?? ""] ?? "linear-gradient(135deg,var(--accent),var(--accent-2))",
    label: t?.label ?? type,
    group: t?.group ?? "",
    entity: t?.entity ?? null,
  };
}

export interface ActionMeta {
  icon: LucideIcon;
  accent: string;
  description: string;
}

export const ACTION_META: Record<string, ActionMeta> = {
  create_task: { icon: ListChecks, accent: "linear-gradient(135deg,#5b6cff,#8b5cf6)", description: "Ajoute une tâche liée à l'élément déclencheur." },
  send_email: { icon: Mail, accent: "linear-gradient(135deg,#0ea5e9,#22d3ee)", description: "Envoie un email au contact, au responsable ou à une adresse." },
  notify: { icon: BellRing, accent: "linear-gradient(135deg,#f59e0b,#f97316)", description: "Envoie une notification dans Prisme." },
  update_record: { icon: PenLine, accent: "linear-gradient(135deg,#64748b,#94a3b8)", description: "Modifie un champ de l'élément déclencheur." },
  add_tag: { icon: Tag, accent: "linear-gradient(135deg,#14b8a6,#22d3ee)", description: "Ajoute un tag à l'élément déclencheur." },
  create_deal: { icon: Briefcase, accent: "linear-gradient(135deg,#8b5cf6,#ec4899)", description: "Crée une opportunité pour le contact ou l'entreprise." },
  create_project: { icon: FolderKanban, accent: "linear-gradient(135deg,#0ea5e9,#6366f1)", description: "Crée un projet de delivery pour le client." },
  webhook: { icon: Webhook, accent: "linear-gradient(135deg,#475569,#94a3b8)", description: "Transmet l'événement à une URL externe (POST JSON)." },
  ai_agent: { icon: Sparkles, accent: "linear-gradient(120deg,#7c8cff,#b26bff 40%,#ff6ec7 70%,#ffb86b)", description: "Iris exécute vos consignes avec les outils du CRM." },
};

export function actionVisual(catalog: AutomationCatalog | undefined, type: string) {
  const meta = ACTION_META[type] ?? { icon: Zap, accent: "linear-gradient(135deg,var(--accent),var(--accent-2))", description: "" };
  return { ...meta, label: catalog?.actions.find((a) => a.type === type)?.label ?? type };
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                   */
/* -------------------------------------------------------------------------- */

export const ENTITY_LABEL: Record<string, string> = {
  contact: "contact",
  company: "entreprise",
  deal: "opportunité",
  quote: "devis",
  invoice: "facture",
  subscription: "abonnement",
  ticket: "ticket",
  task: "tâche",
  project: "projet",
};

export const ENTITY_RESOURCE: Record<string, string> = {
  contact: "contacts",
  company: "companies",
  deal: "deals",
  quote: "quotes",
  invoice: "invoices",
  subscription: "subscriptions",
  ticket: "tickets",
  task: "tasks",
  project: "projects",
};

/** Front-end route of a record, when the app has a detail page for it. */
export function entityLink(entity: string | null | undefined, id: unknown) {
  if (!entity || id === undefined || id === null || id === "") return null;
  const detail: Record<string, string> = { contact: "/contacts", company: "/companies", deal: "/deals", quote: "/quotes", invoice: "/invoices", project: "/projects", ticket: "/tickets" };
  if (detail[entity]) return `${detail[entity]}/${id}`;
  const lists: Record<string, string> = { subscription: "/subscriptions", task: "/tasks" };
  return lists[entity] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Configuration schema (field names come from the catalog)                   */
/* -------------------------------------------------------------------------- */

export type FieldKind = "text" | "textarea" | "number" | "select" | "assignee" | "target" | "pipeline" | "record-field" | "record-value" | "stage" | "form";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  options?: Option[];
  template?: boolean;
  suffix?: string;
  required?: boolean;
  /** Only shown when this returns true for the current configuration. */
  visible?: (config: Record<string, unknown>) => boolean;
}

const ACTION_FIELDS: Record<string, Record<string, Omit<FieldSpec, "key">>> = {
  create_task: {
    title: { label: "Titre de la tâche", kind: "text", template: true, required: true, placeholder: "Rappeler {{contact.full_name}}" },
    description: { label: "Description", kind: "textarea", template: true, placeholder: "Contexte, points à aborder…" },
    due_in_days: { label: "Échéance", kind: "number", suffix: "jour(s)", hint: "0 = le jour même ; laissez vide pour ne pas fixer d'échéance." },
    priority: { label: "Priorité", kind: "select", options: PRIORITY },
    assignee: { label: "Assignée à", kind: "assignee" },
  },
  send_email: {
    to: {
      label: "Destinataire",
      kind: "select",
      options: [
        { value: "contact", label: "Le contact lié" },
        { value: "owner", label: "Le responsable du dossier" },
        { value: "custom", label: "Une adresse précise" },
      ],
    },
    email: { label: "Adresse email", kind: "text", template: true, placeholder: "compta@exemple.fr", visible: (c) => c.to === "custom", required: true },
    subject: { label: "Objet", kind: "text", template: true, required: true, placeholder: "Votre devis {{entity.number}}" },
    body: { label: "Message", kind: "textarea", template: true, placeholder: "Bonjour {{contact.first_name}},…" },
  },
  notify: {
    target: { label: "Destinataires", kind: "target" },
    title: { label: "Titre", kind: "text", template: true, required: true, placeholder: "Nouveau lead : {{contact.full_name}}" },
    body: { label: "Message", kind: "textarea", template: true },
    link: { label: "Lien à ouvrir (facultatif)", kind: "text", template: true, placeholder: "/deals/{{entity.id}}" },
  },
  update_record: {
    field: { label: "Champ à modifier", kind: "record-field", required: true },
    value: { label: "Nouvelle valeur", kind: "record-value", template: true },
  },
  add_tag: { tag: { label: "Tag à ajouter", kind: "text", required: true, placeholder: "client-vip" } },
  create_deal: {
    title: { label: "Titre de l'opportunité", kind: "text", template: true, placeholder: "Opportunité — {{company.name}}" },
    pipeline_id: { label: "Pipeline", kind: "pipeline" },
    amount: { label: "Montant HT", kind: "number", suffix: "€" },
  },
  create_project: {
    name: { label: "Nom du projet", kind: "text", template: true, placeholder: "Onboarding — {{company.name}}" },
    billing_mode: { label: "Mode de facturation", kind: "select", options: BILLING_MODES },
  },
  webhook: { url: { label: "URL appelée", kind: "text", required: true, placeholder: "https://…", hint: "Prisme envoie un POST JSON { event, data }." } },
  ai_agent: {
    instructions: {
      label: "Consignes pour Iris",
      kind: "textarea",
      template: true,
      required: true,
      placeholder: "Analyse ce lead et mets à jour son score…",
      hint: "En automatisation, Iris ne peut ni supprimer, ni émettre de facture, ni enregistrer de paiement.",
    },
  },
};

/** Extra fields supported by the engine but not listed by the catalog. */
const EXTRA_FIELDS: Record<string, string[]> = { notify: ["link"] };

export function actionFields(action: CatalogAction | undefined, type: string): FieldSpec[] {
  const names = [...(action?.fields ?? Object.keys(ACTION_FIELDS[type] ?? {})), ...(EXTRA_FIELDS[type] ?? [])];
  return Array.from(new Set(names)).map((key) => ({ key, ...(ACTION_FIELDS[type]?.[key] ?? { label: key, kind: "text" as const, template: true }) }));
}

export function actionDefaults(type: string): Record<string, unknown> {
  switch (type) {
    case "create_task":
      return { title: "", due_in_days: 1, priority: "medium", assignee: "owner" };
    case "send_email":
      return { to: "contact", subject: "", body: "" };
    case "notify":
      return { target: "owner", title: "" };
    case "create_project":
      return { billing_mode: "fixed" };
    default:
      return {};
  }
}

/** Trigger-specific filters understood by the engine (see `_trigger_config_ok`). */
export const TRIGGER_FIELDS: Record<string, FieldSpec[]> = {
  "deal.stage_changed": [{ key: "to_stage", label: "Vers l'étape", kind: "stage", hint: "Laissez vide pour réagir à tout changement d'étape." }],
  "form.submitted": [{ key: "form_id", label: "Formulaire", kind: "form", hint: "Laissez vide pour tous les formulaires." }],
};

/* -------------------------------------------------------------------------- */
/* Conditions                                                                 */
/* -------------------------------------------------------------------------- */

export type ValueType = "text" | "number" | "enum" | "bool" | "tags";

export interface ConditionField {
  path: string;
  label: string;
  type: ValueType;
  options?: Option[];
}

const opt = (values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));

const FIELDS: Record<string, [string, string, ValueType, Option[]?][]> = {
  contact: [
    ["lifecycle", "Cycle de vie", "enum", LIFECYCLE],
    ["lead_score", "Score lead", "number"],
    ["source", "Source", "enum", opt(SOURCES)],
    ["email", "Email", "text"],
    ["job_title", "Poste", "text"],
    ["country", "Pays", "text"],
    ["tags", "Tags", "tags"],
    ["consent_marketing", "Consentement marketing", "bool"],
  ],
  company: [
    ["type", "Type", "enum", COMPANY_TYPES],
    ["industry", "Secteur", "text"],
    ["city", "Ville", "text"],
    ["health_score", "Santé du compte", "number"],
    ["tags", "Tags", "tags"],
  ],
  deal: [
    ["amount", "Montant HT", "number"],
    ["mrr", "MRR", "number"],
    ["priority", "Priorité", "enum", PRIORITY],
    ["source", "Source", "enum", opt(SOURCES)],
    ["stage.name", "Étape", "text"],
    ["probability", "Probabilité", "number"],
    ["tags", "Tags", "tags"],
  ],
  quote: [
    ["subtotal", "Total HT", "number"],
    ["total", "Total TTC", "number"],
    ["status", "Statut", "enum", QUOTE_STATUS],
    ["deposit_percent", "Acompte (%)", "number"],
  ],
  invoice: [
    ["kind", "Type", "enum", INVOICE_KIND],
    ["status", "Statut", "enum", INVOICE_STATUS],
    ["total", "Total TTC", "number"],
    ["balance_due", "Reste à payer", "number"],
    ["reminders_sent", "Relances envoyées", "number"],
  ],
  subscription: [
    ["plan", "Formule", "text"],
    ["status", "Statut", "enum", SUBSCRIPTION_STATUS],
    ["interval", "Périodicité", "enum", INTERVALS],
    ["mrr", "MRR", "number"],
  ],
  ticket: [
    ["priority", "Priorité", "enum", TICKET_PRIORITY],
    ["status", "Statut", "enum", TICKET_STATUS],
    ["channel", "Canal", "enum", TICKET_CHANNELS],
    ["category", "Catégorie", "text"],
    ["tags", "Tags", "tags"],
  ],
  task: [
    ["priority", "Priorité", "enum", PRIORITY],
    ["type", "Type", "enum", TASK_TYPES],
    ["status", "Statut", "enum", TASK_STATUS],
    ["title", "Titre", "text"],
  ],
  project: [
    ["status", "Statut", "enum", PROJECT_STATUS],
    ["billing_mode", "Facturation", "enum", BILLING_MODES],
    ["budget_amount", "Budget", "number"],
    ["tags", "Tags", "tags"],
  ],
};

const CONTACT_CONTEXT: [string, string, ValueType, Option[]?][] = [
  ["contact.lifecycle", "Cycle de vie du contact", "enum", LIFECYCLE],
  ["contact.email", "Email du contact", "text"],
  ["contact.lead_score", "Score du contact", "number"],
];
const COMPANY_CONTEXT: [string, string, ValueType, Option[]?][] = [
  ["company.type", "Type d'entreprise", "enum", COMPANY_TYPES],
  ["company.name", "Nom de l'entreprise", "text"],
  ["company.industry", "Secteur", "text"],
];

export interface FieldGroup {
  label: string;
  fields: ConditionField[];
}

const toField = ([path, label, type, options]: [string, string, ValueType, Option[]?]): ConditionField => ({ path, label, type, options });

export function conditionFields(triggerType: string, entity: string | null): FieldGroup[] {
  const groups: FieldGroup[] = [];
  if (entity && FIELDS[entity]) groups.push({ label: `Élément déclencheur (${ENTITY_LABEL[entity]})`, fields: FIELDS[entity].map(([k, ...rest]) => toField([`entity.${k}`, ...rest])) });
  if (triggerType === "deal.stage_changed")
    groups.push({
      label: "Événement",
      fields: [
        { path: "data.from_stage", label: "Étape de départ", type: "text" },
        { path: "data.to_stage", label: "Étape d'arrivée", type: "text" },
      ],
    });
  if (triggerType === "form.submitted") groups.push({ label: "Événement", fields: [{ path: "data.form", label: "Nom du formulaire", type: "text" }] });
  if (entity && entity !== "contact" && entity !== "company") groups.push({ label: "Contact lié", fields: CONTACT_CONTEXT.map(toField) });
  if (entity && entity !== "company") groups.push({ label: "Entreprise liée", fields: COMPANY_CONTEXT.map(toField) });
  return groups;
}

export function findConditionField(groups: FieldGroup[], path: string): ConditionField | undefined {
  for (const g of groups) {
    const f = g.fields.find((x) => x.path === path);
    if (f) return f;
  }
  return undefined;
}

/** Writable fields of the triggering record (for the « Modifier l'élément » action). */
export function writableFields(entity: string | null): ConditionField[] {
  if (!entity || !FIELDS[entity]) return [];
  return FIELDS[entity].filter(([k, , type]) => !k.includes(".") && type !== "tags" && !["balance_due", "reminders_sent", "mrr", "total", "subtotal"].includes(k)).map(([k, ...rest]) => toField([k, ...rest]));
}

export interface Operator {
  value: string;
  label: string;
  types: ValueType[];
  noValue?: boolean;
  updatesOnly?: boolean;
}

/**
 * The engine compares « est / n'est pas / vient de passer à » as strings (1500.0 ≠ "1500"),
 * so numbers only get ordering operators.
 */
export const OPERATORS: Operator[] = [
  { value: "eq", label: "est", types: ["text", "enum", "bool"] },
  { value: "ne", label: "n'est pas", types: ["text", "enum"] },
  { value: "contains", label: "contient", types: ["text", "tags"] },
  { value: "not_contains", label: "ne contient pas", types: ["text", "tags"] },
  { value: "gt", label: "est supérieur à", types: ["number"] },
  { value: "gte", label: "est supérieur ou égal à", types: ["number"] },
  { value: "lt", label: "est inférieur à", types: ["number"] },
  { value: "lte", label: "est inférieur ou égal à", types: ["number"] },
  { value: "in", label: "est l'une des valeurs", types: ["text", "enum"] },
  { value: "is_empty", label: "est vide", types: ["text", "number", "enum", "tags"], noValue: true },
  { value: "is_not_empty", label: "est renseigné", types: ["text", "number", "enum", "tags"], noValue: true },
  { value: "changed", label: "a été modifié", types: ["text", "number", "enum", "bool", "tags"], noValue: true, updatesOnly: true },
  { value: "changed_to", label: "vient de passer à", types: ["text", "enum", "bool"], updatesOnly: true },
];

export function operatorsFor(type: ValueType, triggerType: string) {
  const updates = triggerType.endsWith(".updated");
  return OPERATORS.filter((o) => o.types.includes(type) && (!o.updatesOnly || updates));
}

export const BOOL_OPTIONS: Option[] = [
  { value: "True", label: "Oui" },
  { value: "False", label: "Non" },
];

export function conditionLabel(groups: FieldGroup[], cond: { field: string; op: string; value?: unknown }) {
  const field = findConditionField(groups, cond.field);
  const op = OPERATORS.find((o) => o.value === cond.op);
  const raw = cond.value === undefined || cond.value === null ? "" : String(cond.value);
  const valueLabel = op?.noValue
    ? ""
    : field?.type === "bool"
      ? (BOOL_OPTIONS.find((o) => o.value === raw)?.label ?? raw)
      : field?.options
        ? raw
            .split(",")
            .map((v) => field.options?.find((o) => o.value === v.trim())?.label ?? v.trim())
            .join(", ")
        : raw;
  return { field: field?.label ?? cond.field, op: op?.label ?? cond.op, value: valueLabel };
}

/* -------------------------------------------------------------------------- */
/* Variables {{…}}                                                            */
/* -------------------------------------------------------------------------- */

export interface VariableGroup {
  label: string;
  /** Prefix shown in variable chips (« Contact · Prénom »). */
  short?: string;
  items: { path: string; label: string }[];
}

const ENTITY_VARS: Record<string, [string, string][]> = {
  contact: [["full_name", "Nom complet"], ["first_name", "Prénom"], ["last_name", "Nom"], ["email", "Email"], ["phone", "Téléphone"], ["job_title", "Poste"], ["lead_score", "Score lead"]],
  company: [["name", "Nom"], ["city", "Ville"], ["industry", "Secteur"], ["email", "Email"], ["website", "Site web"]],
  deal: [["title", "Titre"], ["amount", "Montant HT"], ["stage.name", "Étape"], ["expected_close_date", "Date de closing prévue"], ["next_step", "Prochaine étape"], ["lost_reason", "Motif de perte"]],
  quote: [["number", "Numéro"], ["title", "Objet"], ["subtotal", "Total HT"], ["total", "Total TTC"], ["valid_until", "Valable jusqu'au"]],
  invoice: [["number", "Numéro"], ["total", "Total TTC"], ["balance_due", "Reste à payer"], ["issue_date", "Date d'émission"], ["due_date", "Date d'échéance"]],
  subscription: [["plan", "Formule"], ["mrr", "MRR"], ["status", "Statut"], ["current_period_end", "Fin de période"]],
  ticket: [["number", "Numéro"], ["subject", "Sujet"], ["priority", "Priorité"], ["status", "Statut"]],
  task: [["title", "Titre"], ["due_date", "Échéance"]],
  project: [["name", "Nom"], ["code", "Code"], ["budget_amount", "Budget"]],
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function variablesFor(triggerType: string, entity: string | null): VariableGroup[] {
  const groups: VariableGroup[] = [];
  const contactGroup = (label: string): VariableGroup => ({ label, short: "Contact", items: ENTITY_VARS.contact.map(([k, l]) => ({ path: `contact.${k}`, label: l })) });
  const companyGroup = (label: string): VariableGroup => ({ label, short: "Entreprise", items: ENTITY_VARS.company.map(([k, l]) => ({ path: `company.${k}`, label: l })) });
  if (entity === "contact") groups.push(contactGroup("Contact déclencheur"));
  else if (entity === "company") groups.push(companyGroup("Entreprise déclencheuse"));
  else if (entity && ENTITY_VARS[entity]) groups.push({ label: `Élément déclencheur (${ENTITY_LABEL[entity]})`, short: capitalize(ENTITY_LABEL[entity]), items: ENTITY_VARS[entity].map(([k, label]) => ({ path: `entity.${k}`, label })) });
  if (entity) groups[0]?.items.push({ path: "entity.id", label: "Identifiant" });
  if (triggerType === "deal.stage_changed")
    groups.push({
      label: "Événement",
      short: "Événement",
      items: [
        { path: "data.from_stage", label: "Étape de départ" },
        { path: "data.to_stage", label: "Étape d'arrivée" },
      ],
    });
  if (triggerType === "form.submitted") groups.push({ label: "Événement", short: "Événement", items: [{ path: "data.form", label: "Nom du formulaire" }] });
  if (entity && entity !== "contact") groups.push(contactGroup("Contact lié"));
  if (entity && entity !== "company") groups.push(companyGroup("Entreprise liée"));
  groups.push({
    label: "Responsable & contexte",
    items: [
      { path: "owner.name", label: "Nom du responsable" },
      { path: "owner.email", label: "Email du responsable" },
      { path: "today", label: "Date du jour" },
    ],
  });
  return groups;
}

export function variableLabel(groups: VariableGroup[], path: string) {
  for (const g of groups) {
    const it = g.items.find((i) => i.path === path);
    if (it) return g.short ? `${g.short} · ${/^\p{Lu}\p{Ll}/u.test(it.label) ? it.label.charAt(0).toLowerCase() + it.label.slice(1) : it.label}` : it.label;
  }
  return path;
}

/* -------------------------------------------------------------------------- */
/* Run statuses & test logs                                                   */
/* -------------------------------------------------------------------------- */

export const RUN_STATUS: Option[] = [
  { value: "success", label: "Succès", tone: "green" },
  { value: "error", label: "Erreur", tone: "red" },
  { value: "skipped", label: "Ignorée", tone: "gray" },
];

/** Parses the dry-run log line « [test] type : {python dict} » into a readable structure. */
export function parseTestLog(line: string): { type: string; config: Record<string, string> } | null {
  const m = /^\[test\]\s+([\w.]+)\s+:\s+(\{[\s\S]*\})\s*$/.exec(line);
  if (!m) return null;
  const config = parsePyDict(m[2]);
  return config ? { type: m[1], config } : null;
}

function parsePyDict(src: string): Record<string, string> | null {
  let i = 0;
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const str = (): string | null => {
    const quote = src[i];
    if (quote !== "'" && quote !== '"') return null;
    i++;
    let out = "";
    while (i < src.length && src[i] !== quote) {
      if (src[i] === "\\") {
        const next = src[i + 1];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next;
        i += 2;
      } else out += src[i++];
    }
    i++;
    return out;
  };
  const scalar = (): string | null => {
    const m = /^(-?\d+(?:\.\d+)?|None|True|False)/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return m[0] === "None" ? "" : m[0] === "True" ? "oui" : m[0] === "False" ? "non" : m[0];
  };
  skip();
  if (src[i] !== "{") return null;
  i++;
  const out: Record<string, string> = {};
  for (;;) {
    skip();
    if (src[i] === "}") return out;
    const key = str();
    if (key === null) return null;
    skip();
    if (src[i] !== ":") return null;
    i++;
    skip();
    const value = src[i] === "'" || src[i] === '"' ? str() : scalar();
    if (value === null) return null;
    out[key] = value;
    skip();
    if (src[i] === ",") {
      i++;
      continue;
    }
    if (src[i] === "}") return out;
    return null;
  }
}

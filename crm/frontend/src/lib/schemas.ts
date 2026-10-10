import {
  BILLING_MODES,
  CHAINS,
  COMPANY_SIZES,
  COMPANY_STATUS,
  COMPANY_TYPES,
  EVENT_TYPES,
  INTERVALS,
  LIFECYCLE,
  PRIORITY,
  PRODUCT_KINDS,
  PROJECT_HEALTH,
  PROJECT_STATUS,
  SOURCES,
  SUBSCRIPTION_STATUS,
  TASK_STATUS,
  TASK_TYPES,
  TICKET_CHANNELS,
  TICKET_PRIORITY,
  TICKET_STATUS,
  UNITS,
  VAT_RATES,
  type Option,
} from "./constants";

export type FieldType = "text" | "email" | "tel" | "url" | "textarea" | "number" | "money" | "percent" | "date" | "datetime" | "time" | "select" | "entity" | "tags" | "switch" | "color";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: (Option | string)[];
  resource?: string;
  required?: boolean;
  placeholder?: string;
  span?: 1 | 2;
  hint?: string;
  section?: string;
  default?: unknown;
  entityParams?: Record<string, string | number>;
}

export interface ResourceSchema {
  singular: string;
  newLabel: string;
  plural: string;
  fields: FieldDef[];
  detailPath?: (id: number) => string;
}

const vat = VAT_RATES.map((v) => ({ value: String(v), label: `${v} %` }));

export const SCHEMAS: Record<string, ResourceSchema> = {
  contacts: {
    newLabel: "Nouveau contact",
    singular: "contact",
    plural: "contacts",
    detailPath: (id) => `/contacts/${id}`,
    fields: [
      { name: "first_name", label: "Prénom", type: "text", required: true },
      { name: "last_name", label: "Nom", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Téléphone", type: "tel" },
      { name: "job_title", label: "Poste", type: "text" },
      { name: "company_id", label: "Entreprise", type: "entity", resource: "companies" },
      { name: "lifecycle", label: "Cycle de vie", type: "select", options: LIFECYCLE, default: "lead" },
      { name: "source", label: "Source", type: "select", options: SOURCES },
      { name: "owner_id", label: "Responsable", type: "entity", resource: "users" },
      { name: "lead_score", label: "Score", type: "number", hint: "0 à 100" },
      { name: "mobile", label: "Mobile", type: "tel", section: "Plus d'infos" },
      { name: "linkedin", label: "LinkedIn", type: "url", section: "Plus d'infos" },
      { name: "city", label: "Ville", type: "text", section: "Plus d'infos" },
      { name: "country", label: "Pays", type: "text", section: "Plus d'infos" },
      { name: "wallet_address", label: "Adresse wallet (Web3)", type: "text", section: "Plus d'infos", span: 2 },
      { name: "tags", label: "Tags", type: "tags", span: 2, section: "Plus d'infos" },
      { name: "consent_marketing", label: "Consentement prospection email (RGPD)", type: "switch", span: 2, section: "Plus d'infos", hint: "À cocher uniquement si la personne a donné son accord explicite." },
      { name: "notes", label: "Notes", type: "textarea", span: 2, section: "Plus d'infos" },
    ],
  },
  companies: {
    newLabel: "Nouvelle entreprise",
    singular: "entreprise",
    plural: "entreprises",
    detailPath: (id) => `/companies/${id}`,
    fields: [
      { name: "name", label: "Nom", type: "text", required: true, span: 2 },
      { name: "type", label: "Type", type: "select", options: COMPANY_TYPES, default: "prospect" },
      { name: "status", label: "Statut", type: "select", options: COMPANY_STATUS, default: "active" },
      { name: "industry", label: "Secteur", type: "text" },
      { name: "size", label: "Taille", type: "select", options: COMPANY_SIZES },
      { name: "website", label: "Site web", type: "url" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Téléphone", type: "tel" },
      { name: "owner_id", label: "Responsable", type: "entity", resource: "users" },
      { name: "address", label: "Adresse", type: "text", span: 2, section: "Facturation & légal" },
      { name: "zip", label: "Code postal", type: "text", section: "Facturation & légal" },
      { name: "city", label: "Ville", type: "text", section: "Facturation & légal" },
      { name: "country", label: "Pays", type: "text", default: "France", section: "Facturation & légal" },
      { name: "legal_form", label: "Forme juridique", type: "text", section: "Facturation & légal", placeholder: "SAS, SARL…" },
      { name: "siren", label: "SIREN", type: "text", section: "Facturation & légal", hint: "Obligatoire sur les factures B2B (réforme e-facturation)" },
      { name: "siret", label: "SIRET", type: "text", section: "Facturation & légal" },
      { name: "vat_number", label: "N° TVA intracommunautaire", type: "text", section: "Facturation & légal" },
      { name: "delivery_address", label: "Adresse de livraison (si différente)", type: "text", span: 2, section: "Facturation & légal" },
      { name: "is_public_entity", label: "Entité publique (Chorus Pro)", type: "switch", span: 2, section: "Facturation & légal" },
      { name: "source", label: "Source", type: "select", options: SOURCES, section: "Plus d'infos" },
      { name: "employees", label: "Effectif", type: "number", section: "Plus d'infos" },
      { name: "linkedin", label: "LinkedIn", type: "url", section: "Plus d'infos" },
      { name: "chain", label: "Blockchain", type: "select", options: CHAINS, section: "Plus d'infos" },
      { name: "wallet_address", label: "Adresse wallet / trésorerie", type: "text", span: 2, section: "Plus d'infos" },
      { name: "tags", label: "Tags", type: "tags", span: 2, section: "Plus d'infos" },
      { name: "description", label: "Description", type: "textarea", span: 2, section: "Plus d'infos" },
    ],
  },
  deals: {
    newLabel: "Nouvelle opportunité",
    singular: "opportunité",
    plural: "opportunités",
    detailPath: (id) => `/deals/${id}`,
    fields: [
      { name: "title", label: "Titre", type: "text", required: true, span: 2 },
      { name: "company_id", label: "Entreprise", type: "entity", resource: "companies" },
      { name: "contact_id", label: "Contact", type: "entity", resource: "contacts" },
      { name: "amount", label: "Montant one-shot HT", type: "money" },
      { name: "mrr", label: "Récurrent mensuel HT (MRR)", type: "money" },
      { name: "pipeline_id", label: "Pipeline", type: "entity", resource: "pipelines" },
      { name: "expected_close_date", label: "Date de closing prévue", type: "date" },
      { name: "priority", label: "Priorité", type: "select", options: PRIORITY.filter((p) => p.value !== "urgent"), default: "medium" },
      { name: "owner_id", label: "Responsable", type: "entity", resource: "users" },
      { name: "source", label: "Source", type: "select", options: SOURCES },
      { name: "next_step", label: "Prochaine étape", type: "text" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ],
  },
  products: {
    newLabel: "Nouveau produit",
    singular: "produit",
    plural: "produits",
    fields: [
      { name: "name", label: "Nom", type: "text", required: true, span: 2 },
      { name: "kind", label: "Type", type: "select", options: PRODUCT_KINDS, default: "service" },
      { name: "sku", label: "Référence", type: "text" },
      { name: "unit_price", label: "Prix unitaire HT", type: "money", required: true },
      { name: "unit", label: "Unité", type: "select", options: UNITS, default: "unité" },
      { name: "vat_rate", label: "TVA", type: "select", options: vat, default: "20" },
      { name: "recurring_interval", label: "Récurrence", type: "select", options: INTERVALS },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "cost", label: "Coût de revient", type: "money" },
      { name: "active", label: "Actif", type: "switch", default: true },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ],
  },
  subscriptions: {
    newLabel: "Nouvel abonnement",
    singular: "abonnement",
    plural: "abonnements",
    fields: [
      { name: "company_id", label: "Client", type: "entity", resource: "companies", required: true, span: 2 },
      { name: "plan", label: "Offre", type: "text", required: true },
      { name: "product_id", label: "Produit du catalogue", type: "entity", resource: "products", entityParams: { kind: "subscription" } },
      { name: "amount", label: "Prix par période HT", type: "money", required: true },
      { name: "quantity", label: "Quantité / sièges", type: "number", default: 1 },
      { name: "interval", label: "Facturation", type: "select", options: INTERVALS, default: "month" },
      { name: "status", label: "Statut", type: "select", options: SUBSCRIPTION_STATUS, default: "active" },
      { name: "start_date", label: "Début", type: "date" },
      { name: "trial_end", label: "Fin d'essai", type: "date" },
      { name: "discount", label: "Remise", type: "percent" },
      { name: "vat_rate", label: "TVA", type: "select", options: vat, default: "20" },
      { name: "auto_invoice", label: "Générer automatiquement les factures (brouillons) à chaque échéance", type: "switch", span: 2 },
      { name: "notes", label: "Notes", type: "textarea", span: 2 },
    ],
  },
  projects: {
    newLabel: "Nouveau projet",
    singular: "projet",
    plural: "projets",
    detailPath: (id) => `/projects/${id}`,
    fields: [
      { name: "name", label: "Nom du projet", type: "text", required: true, span: 2 },
      { name: "company_id", label: "Client", type: "entity", resource: "companies" },
      { name: "deal_id", label: "Opportunité liée", type: "entity", resource: "deals" },
      { name: "status", label: "Statut", type: "select", options: PROJECT_STATUS, default: "active" },
      { name: "health", label: "Santé", type: "select", options: PROJECT_HEALTH, default: "on_track" },
      { name: "billing_mode", label: "Facturation", type: "select", options: BILLING_MODES, default: "fixed" },
      { name: "hourly_rate", label: "Taux horaire HT", type: "money" },
      { name: "budget_amount", label: "Budget HT", type: "money" },
      { name: "budget_hours", label: "Budget heures", type: "number" },
      { name: "start_date", label: "Début", type: "date" },
      { name: "due_date", label: "Échéance", type: "date" },
      { name: "owner_id", label: "Chef de projet", type: "entity", resource: "users" },
      { name: "color", label: "Couleur", type: "color", default: "#5b6cff" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ],
  },
  tasks: {
    newLabel: "Nouvelle tâche",
    singular: "tâche",
    plural: "tâches",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true, span: 2 },
      { name: "type", label: "Type", type: "select", options: TASK_TYPES, default: "todo" },
      { name: "priority", label: "Priorité", type: "select", options: PRIORITY, default: "medium" },
      { name: "status", label: "Statut", type: "select", options: TASK_STATUS, default: "todo" },
      { name: "due_date", label: "Échéance", type: "date" },
      { name: "due_time", label: "Heure", type: "time" },
      { name: "assignee_id", label: "Assignée à", type: "entity", resource: "users" },
      { name: "project_id", label: "Projet", type: "entity", resource: "projects" },
      { name: "contact_id", label: "Contact", type: "entity", resource: "contacts" },
      { name: "company_id", label: "Entreprise", type: "entity", resource: "companies" },
      { name: "deal_id", label: "Opportunité", type: "entity", resource: "deals" },
      { name: "estimate_hours", label: "Estimation (h)", type: "number" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ],
  },
  events: {
    newLabel: "Nouvel événement",
    singular: "événement",
    plural: "événements",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true, span: 2 },
      { name: "type", label: "Type", type: "select", options: EVENT_TYPES, default: "meeting" },
      { name: "location", label: "Lieu", type: "text" },
      { name: "start_at", label: "Début", type: "datetime", required: true },
      { name: "end_at", label: "Fin", type: "datetime" },
      { name: "meeting_url", label: "Lien visio", type: "url", span: 2 },
      { name: "contact_id", label: "Contact", type: "entity", resource: "contacts" },
      { name: "company_id", label: "Entreprise", type: "entity", resource: "companies" },
      { name: "deal_id", label: "Opportunité", type: "entity", resource: "deals" },
      { name: "reminder_minutes", label: "Rappel (minutes avant)", type: "number", default: 15 },
      { name: "description", label: "Notes", type: "textarea", span: 2 },
    ],
  },
  tickets: {
    newLabel: "Nouveau ticket",
    singular: "ticket",
    plural: "tickets",
    detailPath: (id) => `/tickets/${id}`,
    fields: [
      { name: "subject", label: "Sujet", type: "text", required: true, span: 2 },
      { name: "contact_id", label: "Client (contact)", type: "entity", resource: "contacts" },
      { name: "company_id", label: "Entreprise", type: "entity", resource: "companies" },
      { name: "priority", label: "Priorité", type: "select", options: TICKET_PRIORITY, default: "normal" },
      { name: "status", label: "Statut", type: "select", options: TICKET_STATUS, default: "open" },
      { name: "channel", label: "Canal", type: "select", options: TICKET_CHANNELS, default: "email" },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "assignee_id", label: "Assigné à", type: "entity", resource: "users" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ],
  },
  "time-entries": {
    newLabel: "Saisir du temps",
    singular: "temps",
    plural: "temps",
    fields: [
      { name: "project_id", label: "Projet", type: "entity", resource: "projects", span: 2 },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "minutes", label: "Durée (minutes)", type: "number", required: true },
      { name: "billable", label: "Facturable", type: "switch", default: true },
      { name: "hourly_rate", label: "Taux horaire HT", type: "money" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ],
  },
  "kb-articles": {
    newLabel: "Nouvel article",
    singular: "article",
    plural: "articles",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true, span: 2 },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "status", label: "Statut", type: "select", options: [{ value: "draft", label: "Brouillon" }, { value: "published", label: "Publié" }], default: "draft" },
      { name: "summary", label: "Résumé", type: "text", span: 2 },
      { name: "body", label: "Contenu (markdown)", type: "textarea", span: 2 },
    ],
  },
  "email-templates": {
    newLabel: "Nouveau modèle",
    singular: "modèle d'email",
    plural: "modèles",
    fields: [
      { name: "name", label: "Nom", type: "text", required: true },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "subject", label: "Objet", type: "text", span: 2, hint: "Variables : {{contact.first_name}}, {{user.name}}…" },
      { name: "body", label: "Message", type: "textarea", span: 2 },
    ],
  },
  users: {
    newLabel: "Nouvel utilisateur",
    singular: "utilisateur",
    plural: "utilisateurs",
    fields: [
      { name: "name", label: "Nom complet", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "role", label: "Rôle", type: "select", options: [{ value: "admin", label: "Administrateur" }, { value: "manager", label: "Manager" }, { value: "member", label: "Membre" }, { value: "viewer", label: "Lecteur" }], default: "member" },
      { name: "title", label: "Fonction", type: "text" },
      { name: "phone", label: "Téléphone", type: "tel" },
      { name: "hourly_cost", label: "Coût horaire (rentabilité)", type: "money" },
      { name: "color", label: "Couleur", type: "color", default: "#5b6cff" },
      { name: "is_active", label: "Actif", type: "switch", default: true },
    ],
  },
};

export function defaultsFor(resource: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of SCHEMAS[resource]?.fields ?? []) if (f.default !== undefined) out[f.name] = f.default;
  return out;
}

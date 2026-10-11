import { AlignLeft, AtSign, ListChecks, Phone, SquareCheck, Type, type LucideIcon } from "lucide-react";
import type { Option } from "@/lib/constants";
import type { FormField, LeadForm, Ref } from "@/lib/types";
import { uid } from "@/lib/utils";
import { slugify } from "./ui";
import type { MarketingSettings } from "./useCampaignDraft";

export const FIELD_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "text", label: "Texte court", icon: Type },
  { value: "email", label: "Email", icon: AtSign },
  { value: "tel", label: "Téléphone", icon: Phone },
  { value: "textarea", label: "Texte long", icon: AlignLeft },
  { value: "select", label: "Liste déroulante", icon: ListChecks },
  { value: "checkbox", label: "Case à cocher", icon: SquareCheck },
];

export const fieldIcon = (type: string) => FIELD_TYPES.find((t) => t.value === type)?.icon ?? Type;

/** Contact fields filled by `POST /public/forms/{slug}` (anything else goes to the contact notes). */
export const MAP_TO_OPTIONS: Option[] = [
  { value: "", label: "Notes du contact" },
  { value: "first_name", label: "Prénom" },
  { value: "last_name", label: "Nom" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Téléphone" },
  { value: "mobile", label: "Mobile" },
  { value: "job_title", label: "Poste" },
  { value: "company", label: "Entreprise (créée ou rattachée)" },
  { value: "city", label: "Ville" },
  { value: "country", label: "Pays" },
  { value: "linkedin", label: "LinkedIn" },
];

const MAPPABLE = new Set(MAP_TO_OPTIONS.map((o) => o.value));
export const mapLabel = (v?: string) => MAP_TO_OPTIONS.find((o) => o.value === (v ?? ""))?.label ?? "Notes du contact";

/** Browser autofill hints per mapped field. */
export const AUTOCOMPLETE: Record<string, string> = {
  first_name: "given-name",
  last_name: "family-name",
  email: "email",
  phone: "tel",
  mobile: "tel",
  job_title: "organization-title",
  company: "organization",
  city: "address-level2",
  country: "country-name",
  linkedin: "url",
};

export type DraftField = FormField & { uid: string; autoName?: boolean };

/** A form as returned by the API, with its expanded relations. */
export type FormRecord = LeadForm & { owner?: Ref | null; pipeline?: Ref | null; stage?: Ref | null };

export function toDraftFields(fields: FormField[] | undefined): DraftField[] {
  return (fields ?? []).map((f) => ({ ...f, map_to: MAPPABLE.has(f.map_to ?? "") ? (f.map_to ?? "") : "", uid: uid() }));
}

export function cleanFields(fields: DraftField[]): FormField[] {
  return fields.map(({ uid: _uid, autoName: _auto, ...f }) => {
    const out: FormField = { name: f.name, label: f.label.trim(), type: f.type, required: !!f.required };
    if (f.map_to) out.map_to = f.map_to;
    if (f.placeholder?.trim()) out.placeholder = f.placeholder.trim();
    if (f.type === "select") out.options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
    return out;
  });
}

export function uniqueName(base: string, taken: string[]) {
  const root = slugify(base, "_") || "champ";
  let name = root;
  let n = 2;
  while (taken.includes(name)) name = `${root}_${n++}`;
  return name;
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

export const FIELD_PRESETS: { label: string; field: FormField }[] = [
  { label: "Prénom", field: { name: "first_name", label: "Prénom", type: "text", required: true, map_to: "first_name", placeholder: "Camille" } },
  { label: "Nom", field: { name: "last_name", label: "Nom", type: "text", required: true, map_to: "last_name", placeholder: "Durand" } },
  { label: "Email professionnel", field: { name: "email", label: "Email professionnel", type: "email", required: true, map_to: "email", placeholder: "camille@entreprise.fr" } },
  { label: "Téléphone", field: { name: "phone", label: "Téléphone", type: "tel", required: false, map_to: "phone", placeholder: "06 12 34 56 78" } },
  { label: "Entreprise", field: { name: "company", label: "Entreprise", type: "text", required: false, map_to: "company", placeholder: "Nom de votre société" } },
  { label: "Poste", field: { name: "job_title", label: "Poste", type: "text", required: false, map_to: "job_title", placeholder: "Directrice marketing" } },
  { label: "Taille de l'entreprise", field: { name: "company_size", label: "Taille de l'entreprise", type: "select", required: false, options: ["1-10", "11-50", "51-200", "201-500", "Plus de 500"] } },
  { label: "Message", field: { name: "message", label: "Votre besoin", type: "textarea", required: false, placeholder: "Décrivez votre projet en quelques lignes…" } },
];

export interface FormTemplate {
  key: string;
  label: string;
  description: string;
  title: string;
  intro: string;
  fields: FormField[];
  submit_label: string;
  success_message: string;
  lifecycle: string;
  tags: string[];
}

const P = (name: string) => FIELD_PRESETS.find((p) => p.field.name === name)!.field;

export const FORM_TEMPLATES: FormTemplate[] = [
  { key: "contact", label: "Contact", description: "Prénom, nom, email, message", title: "Contactez-nous", intro: "Une question, un projet ? Nous vous répondons sous 24 h ouvrées.", fields: [P("first_name"), P("last_name"), P("email"), P("company"), P("message")], submit_label: "Envoyer", success_message: "Merci ! Nous revenons vers vous très vite.", lifecycle: "lead", tags: ["contact-site"] },
  { key: "demo", label: "Demande de démo", description: "Qualifie le besoin et l'équipe", title: "Demandez votre démo personnalisée", intro: "30 minutes avec un expert pour voir la solution appliquée à votre cas.", fields: [P("first_name"), P("last_name"), P("email"), P("company"), P("job_title"), P("company_size"), P("message")], submit_label: "Planifier ma démo", success_message: "Merci ! Un expert vous contacte sous 24 h pour fixer un créneau.", lifecycle: "mql", tags: ["demande-demo"] },
  { key: "newsletter", label: "Newsletter", description: "Email et prénom seulement", title: "Recevez nos actualités", intro: "Une fois par mois, l'essentiel de nos nouveautés et conseils. Sans spam.", fields: [P("email"), { ...P("first_name"), required: false }], submit_label: "Je m'inscris", success_message: "C'est noté ! Vous recevrez notre prochaine newsletter.", lifecycle: "lead", tags: ["newsletter"] },
  { key: "event", label: "Événement", description: "Inscription à un webinar", title: "Inscrivez-vous au webinar", intro: "45 minutes d'échanges et de démonstrations. Le lien de connexion vous sera envoyé par email.", fields: [P("first_name"), P("last_name"), P("email"), P("company"), P("job_title")], submit_label: "Je réserve ma place", success_message: "Votre place est réservée ! Le lien de connexion vous sera envoyé la veille.", lifecycle: "lead", tags: ["webinar"] },
];

/* -------------------------------------------------------------------------- */
/* Rendering helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Short fields go two by two on wide screens; an unpaired short field takes the full row. */
export function layoutSpans(fields: FormField[]): ("half" | "full")[] {
  const half = (f: FormField) => f.type === "text" || f.type === "tel" || f.type === "select";
  const spans: ("half" | "full")[] = fields.map((f) => (half(f) ? "half" : "full"));
  let i = 0;
  while (i < fields.length) {
    if (spans[i] === "half") {
      if (spans[i + 1] === "half") i += 2;
      else {
        spans[i] = "full";
        i += 1;
      }
    } else i += 1;
  }
  return spans;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEL_RE = /^[+(]?[\d\s().-]{6,20}$/;

export function validateField(field: FormField, value: string | boolean | undefined): string | null {
  if (field.type === "checkbox") return field.required && !value ? "Cette case doit être cochée." : null;
  const v = String(value ?? "").trim();
  if (!v) return field.required ? "Ce champ est obligatoire." : null;
  if (field.type === "email" && !EMAIL_RE.test(v)) return "Adresse email invalide.";
  if (field.type === "tel" && !TEL_RE.test(v)) return "Numéro de téléphone invalide.";
  return null;
}

/** Wording of the opt-in checkbox (identical to the backend `consent_label`). */
export const CONSENT_LABEL = "J'accepte de recevoir des informations commerciales par email (désinscription possible à tout moment).";

/** Same template as the backend `_notice()` (settings › RGPD › form_notice). */
export function formNotice(s?: MarketingSettings | null) {
  const template =
    s?.rgpd?.form_notice ||
    "Les informations recueillies sont traitées par {company} pour répondre à votre demande et, si vous l'acceptez, vous adresser des informations commerciales. Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de portabilité : {contact}.";
  const company = s?.rgpd?.controller_name || s?.company?.legal_name || s?.company?.name || "l'entreprise";
  const contact = s?.rgpd?.dpo_email || s?.company?.email || "notre service client";
  return template.replace("{company}", company).replace("{contact}", contact);
}

export function publicFormUrl(slug: string) {
  return `${window.location.origin}/f/${slug}`;
}

export function embedCode(form: Pick<LeadForm, "slug" | "title" | "name">) {
  return `<iframe src="${publicFormUrl(form.slug)}?embed=1" title="${(form.title || form.name).replace(/"/g, "&quot;")}" width="100%" height="760" style="border:0;max-width:680px;border-radius:24px" loading="lazy"></iframe>`;
}

export function safeRedirect(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

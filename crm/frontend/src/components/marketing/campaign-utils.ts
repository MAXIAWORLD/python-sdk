import { splitSubject } from "@/components/ai/AiGenerate";
import type { Option } from "@/lib/constants";
import type { Campaign, Ref } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Recipients                                                                 */
/* -------------------------------------------------------------------------- */

export interface CampaignRecipient {
  id: number;
  created_at: string;
  campaign_id: number;
  contact_id?: number | null;
  contact?: Ref | null;
  email: string;
  status: string;
  sent_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  error?: string | null;
}

export const RECIPIENT_STATUS: Option[] = [
  { value: "pending", label: "En attente", tone: "gray" },
  { value: "sent", label: "Envoyé", tone: "blue" },
  { value: "opened", label: "Ouvert", tone: "violet" },
  { value: "clicked", label: "Cliqué", tone: "green" },
  { value: "failed", label: "Échec", tone: "red" },
  { value: "bounced", label: "Rejeté", tone: "orange" },
  { value: "unsubscribed", label: "Désinscrit", tone: "orange" },
];

export interface Audience {
  count: number;
  excluded_count: number;
  excluded: { id: number; name: string; reason: string }[];
  sample: { id: number; name: string; email?: string | null }[];
}

/** Reasons returned by `rgpd.can_receive_marketing`, explained to the user. */
export const EXCLUSION_REASONS: Record<string, { label: string; help: string }> = {
  "opposition / désinscription": { label: "Désinscrits ou opposés", help: "Ces personnes ont exercé leur droit d'opposition : elles ne doivent plus recevoir de prospection." },
  "particulier sans consentement": { label: "Particuliers sans consentement", help: "Pour un particulier, le consentement préalable est obligatoire (art. L34-5 du CPCE)." },
  "consentement explicite requis": { label: "Consentement explicite manquant", help: "Vos paramètres RGPD exigent un consentement explicite pour chaque contact." },
  "pas d'email": { label: "Sans adresse email", help: "Aucune adresse à laquelle envoyer la campagne." },
};

export function exclusionLabel(reason: string) {
  return EXCLUSION_REASONS[reason]?.label ?? reason.charAt(0).toUpperCase() + reason.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export interface RecipientAgg {
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface CampaignMetrics {
  recipients: number;
  sent: number;
  failed: number;
  excluded: number;
  opened: number | null;
  clicked: number | null;
  unsubscribed: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  unsubRate: number | null;
}

/** Aggregates recipient rows per campaign (opens/clicks only exist if tracking is enabled). */
export function aggregateRecipients(rows: CampaignRecipient[]) {
  const out: Record<number, RecipientAgg> = {};
  for (const r of rows) {
    const a = (out[r.campaign_id] ??= { opened: 0, clicked: 0, unsubscribed: 0 });
    if (r.opened_at || r.status === "opened" || r.status === "clicked") a.opened++;
    if (r.clicked_at || r.status === "clicked") a.clicked++;
    if (r.status === "unsubscribed") a.unsubscribed++;
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function campaignMetrics(c: Campaign, agg?: RecipientAgg): CampaignMetrics {
  const s = c.stats ?? {};
  const sent = num(s.sent) ?? 0;
  const recipients = num(s.recipients) ?? sent;
  const tracked = num(s.opened) !== null || (agg?.opened ?? 0) > 0;
  const opened = num(s.opened) ?? (tracked ? (agg?.opened ?? 0) : null);
  const clicked = num(s.clicked) ?? (tracked ? (agg?.clicked ?? 0) : null);
  const unsubscribed = num(s.unsubscribed) ?? agg?.unsubscribed ?? 0;
  const rate = (v: number | null) => (v !== null && sent > 0 ? (v / sent) * 100 : null);
  return {
    recipients,
    sent,
    failed: num(s.failed) ?? 0,
    excluded: num(s.excluded) ?? 0,
    opened,
    clicked,
    unsubscribed,
    deliveryRate: recipients > 0 ? (sent / recipients) * 100 : null,
    openRate: rate(opened),
    clickRate: rate(clicked),
    unsubRate: rate(unsubscribed),
  };
}

export const TRACKING_NOTE = "Mesure non activée : les pixels de suivi d'ouverture sont soumis au consentement des destinataires (recommandations CNIL).";

export const isSent = (c?: Pick<Campaign, "status"> | null) => c?.status === "sent" || c?.status === "sending";

/* -------------------------------------------------------------------------- */
/* Personalisation                                                            */
/* -------------------------------------------------------------------------- */

export interface SampleContact {
  id?: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  job_title: string;
}

export const FICTIVE_CONTACT: SampleContact = { first_name: "Camille", last_name: "Durand", full_name: "Camille Durand", email: "camille.durand@exemple.fr", job_title: "Directrice marketing" };

/** Variables rendered by the backend for each recipient (`_personalize`). */
export const CAMPAIGN_VARIABLES = [
  { key: "contact.first_name", label: "Prénom" },
  { key: "contact.last_name", label: "Nom" },
  { key: "contact.full_name", label: "Nom complet" },
  { key: "contact.job_title", label: "Poste" },
  { key: "contact.email", label: "Email" },
];

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;
const KNOWN = new Set(CAMPAIGN_VARIABLES.map((v) => v.key));

export function personalize(text: string, c: SampleContact) {
  return text.replace(VAR_RE, (_, key: string) => {
    if (!KNOWN.has(key)) return "";
    return c[key.slice(8) as keyof Omit<SampleContact, "id">] ?? "";
  });
}

/** "{{contact.first_name}}, bonjour" → "{Prénom}, bonjour" (readable outside the editor). */
export function humanizeVariables(text?: string | null) {
  return (text ?? "").replace(VAR_RE, (_, key: string) => `{${CAMPAIGN_VARIABLES.find((v) => v.key === key)?.label ?? key}}`);
}

export function unknownVariables(...texts: (string | null | undefined)[]) {
  const found = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(VAR_RE)) if (!KNOWN.has(m[1])) found.add(m[1]);
  return [...found];
}

export function usesPersonalization(...texts: (string | null | undefined)[]) {
  return texts.some((t) => [...(t ?? "").matchAll(VAR_RE)].some((m) => KNOWN.has(m[1])));
}

/** The backend renders single line breaks as <br> (python-markdown "nl2br"): mimic it in previews. */
export function softBreaks(markdown: string) {
  return markdown.replace(/([^\n])\n(?=[^\n])/g, "$1  \n");
}

export function hasCallToAction(body: string) {
  return /\]\(\s*https?:\/\/[^)\s]+/i.test(body) || /https?:\/\/\S+/i.test(body);
}

/* -------------------------------------------------------------------------- */
/* AI copy                                                                    */
/* -------------------------------------------------------------------------- */

/** Parses a `campaign_copy` generation: « Objet : … / Pré-en-tête : … / corps ». Returns null while the subject line is still streaming. */
export function splitCampaignCopy(text: string): { subject: string; preheader: string; body: string } | null {
  const trimmed = text.trimStart();
  if (/^(\*\*)?\s*(objet|subject)\s*:/i.test(trimmed) && !trimmed.includes("\n")) return null;
  const preheader = text.match(/^\s*\**\s*Pré-?en-?tête\s*\**\s*:\s*\**(.+)$/im)?.[1]?.replace(/\*+$/, "").trim() ?? "";
  const { subject, body } = splitSubject(text.replace(/^\s*\*\*(Objet|Subject)\s*:\s*\*\*/i, "Objet : "));
  return { subject: subject.replace(/^\*+|\*+$/g, "").trim(), preheader, body: body.replace(/^\s*\**\s*Pré-?en-?tête\s*\**\s*:.*\n*/im, "").trim() };
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

export interface CampaignPreset {
  key: string;
  label: string;
  description: string;
  name: string;
  subject: string;
  preheader: string;
  body: string;
}

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  { key: "blank", label: "Vierge", description: "Partir d'une page blanche", name: "", subject: "", preheader: "", body: "" },
  {
    key: "newsletter",
    label: "Newsletter",
    description: "Nouveautés, conseils et agenda du mois",
    name: "Newsletter",
    subject: "{{contact.first_name}}, l'essentiel du mois ✨",
    preheader: "Nouveautés, conseils pratiques et rendez-vous à ne pas manquer.",
    body: "Bonjour {{contact.first_name}},\n\nVoici l'essentiel du mois, en trois minutes de lecture.\n\n## Nouveautés\n- **Première nouveauté** — ce qu'elle change concrètement pour vous.\n- **Deuxième nouveauté** — en une phrase.\n\n## Le conseil du mois\nUn conseil actionnable, illustré par un exemple client.\n\n[Lire la suite →](https://)\n\nÀ très vite,\nL'équipe",
  },
  {
    key: "launch",
    label: "Lancement",
    description: "Annoncer un produit ou une offre",
    name: "Lancement produit",
    subject: "Nouveau : découvrez [produit] en avant-première",
    preheader: "Ce qui change pour vous, et comment en profiter dès aujourd'hui.",
    body: "Bonjour {{contact.first_name}},\n\nNous lançons aujourd'hui **[produit]**, conçu pour vous aider à [bénéfice principal].\n\n- **Gain de temps** : [détail]\n- **Plus de visibilité** : [détail]\n- **Sans engagement** : [détail]\n\n[Découvrir [produit] →](https://)\n\nUne question ? Répondez simplement à cet email.\n\nL'équipe",
  },
  {
    key: "event",
    label: "Invitation",
    description: "Webinar, salon ou petit-déjeuner",
    name: "Invitation événement",
    subject: "{{contact.first_name}}, vous êtes invité(e) le [date]",
    preheader: "45 minutes pour [thème] — places limitées.",
    body: "Bonjour {{contact.first_name}},\n\nNous serions ravis de vous accueillir à **[nom de l'événement]**, le **[date] à [heure]** ([lieu ou en ligne]).\n\nAu programme :\n1. [Sujet 1]\n2. [Sujet 2]\n3. Questions / réponses\n\n[Je réserve ma place →](https://)\n\nAu plaisir de vous y retrouver,\nL'équipe",
  },
  {
    key: "reactivation",
    label: "Relance",
    description: "Renouer avec des contacts inactifs",
    name: "Réactivation",
    subject: "{{contact.first_name}}, on ne s'est pas parlé depuis un moment",
    preheader: "Quelques nouveautés qui pourraient vous intéresser.",
    body: "Bonjour {{contact.first_name}},\n\nCela fait quelque temps que nous n'avons pas échangé. Depuis, nous avons [nouveauté marquante].\n\nSeriez-vous disponible 15 minutes la semaine prochaine pour en parler ?\n\n[Choisir un créneau →](https://)\n\nBien à vous,\nL'équipe",
  },
];

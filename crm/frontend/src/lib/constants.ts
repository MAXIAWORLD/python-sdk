/** French labels and colors for every enumerated value. */

export type Tone = "gray" | "blue" | "indigo" | "violet" | "pink" | "red" | "orange" | "yellow" | "green" | "teal" | "cyan";

export interface Option {
  value: string;
  label: string;
  tone?: Tone;
}

const o = (value: string, label: string, tone: Tone = "gray"): Option => ({ value, label, tone });

export const LIFECYCLE = [o("lead", "Lead", "gray"), o("mql", "MQL", "cyan"), o("sql", "SQL", "blue"), o("opportunity", "Opportunité", "violet"), o("customer", "Client", "green"), o("evangelist", "Ambassadeur", "pink"), o("lost", "Perdu", "red")];

export const COMPANY_TYPES = [o("prospect", "Prospect", "blue"), o("client", "Client", "green"), o("partner", "Partenaire", "violet"), o("supplier", "Fournisseur", "orange"), o("investor", "Investisseur", "teal"), o("other", "Autre", "gray")];

export const COMPANY_STATUS = [o("active", "Actif", "green"), o("inactive", "Inactif", "gray"), o("churned", "Perdu", "red")];

export const DEAL_STATUS = [o("open", "En cours", "blue"), o("won", "Gagné", "green"), o("lost", "Perdu", "red")];

export const PRIORITY = [o("low", "Basse", "gray"), o("medium", "Moyenne", "blue"), o("high", "Haute", "orange"), o("urgent", "Urgente", "red")];

export const QUOTE_STATUS = [o("draft", "Brouillon", "gray"), o("sent", "Envoyé", "blue"), o("viewed", "Consulté", "cyan"), o("accepted", "Signé", "green"), o("declined", "Refusé", "red"), o("expired", "Expiré", "orange"), o("invoiced", "Facturé", "violet")];

export const INVOICE_STATUS = [o("draft", "Brouillon", "gray"), o("issued", "Émise", "indigo"), o("sent", "Envoyée", "blue"), o("partial", "Partiellement payée", "yellow"), o("paid", "Payée", "green"), o("overdue", "En retard", "red"), o("cancelled", "Annulée", "gray")];

export const INVOICE_KIND = [o("invoice", "Facture", "blue"), o("deposit", "Facture d'acompte", "violet"), o("credit_note", "Avoir", "orange")];

export const SUBSCRIPTION_STATUS = [o("trialing", "Essai", "cyan"), o("active", "Actif", "green"), o("past_due", "Impayé", "orange"), o("paused", "En pause", "gray"), o("canceled", "Résilié", "red")];

export const INTERVALS = [o("month", "Mensuel"), o("quarter", "Trimestriel"), o("year", "Annuel")];

export const PROJECT_STATUS = [o("planned", "Planifié", "gray"), o("active", "En cours", "blue"), o("on_hold", "En pause", "orange"), o("completed", "Terminé", "green"), o("cancelled", "Annulé", "red")];

export const PROJECT_HEALTH = [o("on_track", "Dans les temps", "green"), o("at_risk", "À risque", "orange"), o("off_track", "En dérive", "red")];

export const BILLING_MODES = [o("fixed", "Forfait"), o("time", "Régie (temps passé)"), o("retainer", "Abonnement / retainer"), o("non_billable", "Non facturable")];

export const TASK_STATUS = [o("todo", "À faire", "gray"), o("in_progress", "En cours", "blue"), o("review", "En revue", "violet"), o("done", "Terminé", "green"), o("cancelled", "Annulé", "red")];

export const TASK_TYPES = [o("todo", "Tâche"), o("call", "Appel"), o("email", "Email"), o("meeting", "Réunion"), o("follow_up", "Relance"), o("deadline", "Échéance")];

export const EVENT_TYPES = [o("meeting", "Réunion", "blue"), o("call", "Appel", "green"), o("demo", "Démo", "violet"), o("deadline", "Échéance", "red"), o("focus", "Focus", "orange"), o("personal", "Personnel", "pink"), o("other", "Autre", "gray")];

export const TICKET_STATUS = [o("new", "Nouveau", "cyan"), o("open", "Ouvert", "blue"), o("pending", "En attente client", "yellow"), o("on_hold", "Suspendu", "gray"), o("resolved", "Résolu", "green"), o("closed", "Fermé", "gray")];

export const TICKET_PRIORITY = [o("low", "Basse", "gray"), o("normal", "Normale", "blue"), o("high", "Haute", "orange"), o("urgent", "Urgente", "red")];

export const TICKET_CHANNELS = [o("email", "Email"), o("chat", "Chat"), o("phone", "Téléphone"), o("portal", "Portail"), o("form", "Formulaire"), o("social", "Réseaux sociaux")];

export const ACTIVITY_TYPES = [o("note", "Note", "yellow"), o("call", "Appel", "green"), o("email", "Email", "blue"), o("meeting", "Réunion", "violet"), o("task", "Tâche", "teal"), o("deal", "Opportunité", "indigo"), o("quote", "Devis", "cyan"), o("invoice", "Facture", "orange"), o("ticket", "Ticket", "pink"), o("system", "Système", "gray"), o("ai", "IA", "violet")];

export const CAMPAIGN_STATUS = [o("draft", "Brouillon", "gray"), o("scheduled", "Programmée", "violet"), o("sending", "Envoi en cours", "blue"), o("sent", "Envoyée", "green"), o("paused", "En pause", "orange")];

export const PRODUCT_KINDS = [o("service", "Service", "blue"), o("product", "Produit", "teal"), o("subscription", "Abonnement", "violet"), o("license", "Licence", "orange")];

export const UNITS = ["unité", "heure", "jour", "semaine", "mois", "an", "forfait", "licence", "utilisateur", "pièce", "km", "kg", "m²"];

export const VAT_RATES = [20, 10, 8.5, 5.5, 2.1, 0];

export const PAYMENT_METHODS = [o("transfer", "Virement"), o("card", "Carte bancaire"), o("direct_debit", "Prélèvement"), o("crypto", "Crypto-actifs"), o("check", "Chèque"), o("cash", "Espèces"), o("stripe", "Stripe"), o("paypal", "PayPal"), o("other", "Autre")];

export const NATURES = [o("services", "Prestation de services"), o("goods", "Livraison de biens"), o("mixed", "Biens et services")];

export const ROLES = [o("admin", "Administrateur", "violet"), o("manager", "Manager", "blue"), o("member", "Membre", "green"), o("viewer", "Lecteur", "gray")];

export const SOURCES = ["Site web", "LinkedIn", "Recommandation", "Salon / événement", "Partenaire", "Prospection", "Webinar", "Formulaire", "Publicité", "Autre"];

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

export const CHAINS = ["Ethereum", "Solana", "Base", "Polygon", "Arbitrum", "Optimism", "Avalanche", "BNB Chain", "Bitcoin", "TON", "SUI", "XRP", "Tron"];

export const TONE_STYLES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  gray: { bg: "bg-zinc-500/12 dark:bg-zinc-400/12", fg: "text-zinc-700 dark:text-zinc-300", dot: "bg-zinc-400" },
  blue: { bg: "bg-sky-500/14 dark:bg-sky-400/14", fg: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  indigo: { bg: "bg-indigo-500/14 dark:bg-indigo-400/16", fg: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  violet: { bg: "bg-violet-500/14 dark:bg-violet-400/16", fg: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  pink: { bg: "bg-pink-500/14 dark:bg-pink-400/16", fg: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  red: { bg: "bg-red-500/14 dark:bg-red-400/16", fg: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  orange: { bg: "bg-orange-500/15 dark:bg-orange-400/16", fg: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  yellow: { bg: "bg-amber-400/20 dark:bg-amber-300/16", fg: "text-amber-800 dark:text-amber-200", dot: "bg-amber-400" },
  green: { bg: "bg-emerald-500/15 dark:bg-emerald-400/16", fg: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  teal: { bg: "bg-teal-500/15 dark:bg-teal-400/16", fg: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
  cyan: { bg: "bg-cyan-500/15 dark:bg-cyan-400/16", fg: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
};

export function findOption(options: Option[], value?: string | null) {
  return options.find((x) => x.value === value);
}

export function labelOf(options: Option[], value?: string | null) {
  return findOption(options, value)?.label ?? value ?? "—";
}

export const CHART_COLORS = ["#5b6cff", "#8b5cf6", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#fb7185", "#60a5fa", "#a78bfa", "#2dd4bf"];

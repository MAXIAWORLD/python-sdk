import { ChevronRight, CircleAlert, CircleCheck, CircleX, Info } from "lucide-react";
import { motion } from "motion/react";
import { number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FICTIVE_CONTACT, hasCallToAction, personalize, unknownVariables, usesPersonalization, type Audience } from "../campaign-utils";
import type { CampaignDraft } from "../useCampaignDraft";

export type CheckLevel = "ok" | "warning" | "error" | "info";
export type StepKey = "audience" | "content" | "test" | "send" | "results";

export interface Check {
  key: string;
  level: CheckLevel;
  title: string;
  detail?: string;
  step?: StepKey;
}

const plural = (n: number, s: string, p = `${s}s`) => `${number(n)} ${n > 1 ? p : s}`;

/** Checks run before sending (Mailchimp-style checklist). Errors block the send. */
export function preflight({ draft, audience, tested, smtp }: { draft: CampaignDraft; audience?: Audience | null; tested: string | null; smtp: boolean | null }): Check[] {
  const checks: Check[] = [];
  const subjectLength = [...personalize(draft.subject, FICTIVE_CONTACT).trim()].length;

  if (!draft.segment_id) checks.push({ key: "segment", level: "error", title: "Aucun segment choisi", detail: "Choisissez les destinataires.", step: "audience" });
  else if (!audience) checks.push({ key: "segment", level: "info", title: "Audience en cours de calcul…", step: "audience" });
  else if (audience.count === 0) checks.push({ key: "segment", level: "error", title: "Aucun destinataire éligible", detail: "Aucun contact du segment ne peut recevoir de prospection.", step: "audience" });
  else checks.push({ key: "segment", level: "ok", title: `${plural(audience.count, "destinataire éligible", "destinataires éligibles")}`, detail: audience.excluded_count ? `${plural(audience.excluded_count, "contact exclu", "contacts exclus")} au titre du RGPD` : "Aucun contact exclu", step: "audience" });

  if (!subjectLength) checks.push({ key: "subject", level: "error", title: "Objet manquant", step: "content" });
  else if (subjectLength > 70) checks.push({ key: "subject", level: "warning", title: `Objet long (${subjectLength} caractères)`, detail: "Au-delà de 70 caractères, il sera tronqué sur la plupart des mobiles.", step: "content" });
  else checks.push({ key: "subject", level: "ok", title: `Objet prêt (${subjectLength} caractères)`, step: "content" });

  if (!draft.preheader.trim()) checks.push({ key: "preheader", level: "warning", title: "Pré-en-tête vide", detail: "Sans lui, les messageries affichent le début du message.", step: "content" });
  else checks.push({ key: "preheader", level: "ok", title: "Pré-en-tête renseigné", step: "content" });

  if (draft.body.trim().length < 20) checks.push({ key: "body", level: "error", title: "Message vide ou trop court", step: "content" });
  else checks.push({ key: "body", level: "ok", title: "Message rédigé", step: "content" });

  const unknown = unknownVariables(draft.subject, draft.preheader, draft.body);
  if (unknown.length) checks.push({ key: "vars", level: "warning", title: "Variables inconnues", detail: unknown.map((u) => `{{${u}}}`).join(", "), step: "content" });
  else if (usesPersonalization(draft.subject, draft.preheader, draft.body)) checks.push({ key: "vars", level: "ok", title: "Message personnalisé", detail: "Les variables sont remplacées pour chaque destinataire.", step: "content" });
  else checks.push({ key: "vars", level: "warning", title: "Aucune personnalisation", detail: "Ajoutez au moins le prénom : {{contact.first_name}}.", step: "content" });

  const placeholders = [...new Set([...`${draft.subject}\n${draft.body}`.matchAll(/\[([^[\]\n]{2,40})\](?!\()/g)].map((m) => `[${m[1]}]`))];
  if (placeholders.length) checks.push({ key: "placeholders", level: "warning", title: "Passages à compléter", detail: placeholders.slice(0, 4).join(", "), step: "content" });
  if (/\]\(\s*https?:\/\/\s*\)/.test(draft.body)) checks.push({ key: "emptylink", level: "warning", title: "Lien sans adresse", detail: "Un lien pointe vers « https:// » : indiquez l'URL complète.", step: "content" });
  else if (!hasCallToAction(draft.body)) checks.push({ key: "cta", level: "warning", title: "Pas d'appel à l'action", detail: "Ajoutez un lien ou un bouton vers votre offre.", step: "content" });
  else checks.push({ key: "cta", level: "ok", title: "Appel à l'action présent", step: "content" });

  checks.push({ key: "unsubscribe", level: "ok", title: "Lien de désinscription", detail: "Ajouté automatiquement à chaque email." });

  if (smtp === false) checks.push({ key: "smtp", level: "error", title: "Envoi d'emails non configuré", detail: "Renseignez votre serveur SMTP dans Paramètres › Emails." });

  checks.push(tested ? { key: "test", level: "ok", title: "Email de test envoyé", detail: tested, step: "test" } : { key: "test", level: "info", title: "Aucun test envoyé", detail: "Recommandé avant tout envoi.", step: "test" });
  return checks;
}

const ICONS = {
  ok: <CircleCheck className="size-[18px] text-emerald-500" />,
  warning: <CircleAlert className="size-[18px] text-amber-500" />,
  error: <CircleX className="size-[18px] text-red-500" />,
  info: <Info className="size-[18px] text-fg-3" />,
};

export function PreflightList({ checks, onGo }: { checks: Check[]; onGo?: (step: StepKey) => void }) {
  const errors = checks.filter((c) => c.level === "error").length;
  const warnings = checks.filter((c) => c.level === "warning").length;
  return (
    <div>
      <div className={cn("mb-3 rounded-[14px] px-3.5 py-2.5 text-[13px] font-medium", errors ? "bg-red-500/[0.08] text-red-700 dark:text-red-300" : warnings ? "bg-amber-400/[0.13] text-amber-800 dark:text-amber-200" : "bg-emerald-500/[0.09] text-emerald-700 dark:text-emerald-300")}>
        {errors ? `${errors} point${errors > 1 ? "s" : ""} bloquant${errors > 1 ? "s" : ""} à corriger avant l'envoi` : warnings ? `Prête à partir — ${warnings} recommandation${warnings > 1 ? "s" : ""}` : "Tout est prêt pour l'envoi ✨"}
      </div>
      <ul className="space-y-0.5">
        {checks.map((c, i) => (
          <motion.li key={c.key} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025 }}>
            <button type="button" disabled={!c.step || !onGo} onClick={() => c.step && onGo?.(c.step)} className="group flex w-full items-start gap-2.5 rounded-[12px] px-2 py-2 text-left transition enabled:hover:bg-black/[0.03] disabled:cursor-default dark:enabled:hover:bg-white/[0.04]">
              <span className="mt-px shrink-0">{ICONS[c.level]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{c.title}</span>
                {c.detail && <span className="block break-words text-[12px] text-fg-3">{c.detail}</span>}
              </span>
              {c.step && onGo && <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100" />}
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

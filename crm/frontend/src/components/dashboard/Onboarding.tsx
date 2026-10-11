import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, FileText, Mail, Sparkles, Upload, Users, X } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { Ring } from "@/components/ui/display";
import { api } from "@/lib/api";
import { useList, useLocalStorage } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

interface SettingsPayload {
  company?: Record<string, unknown>;
  email?: Record<string, unknown>;
}

interface Step {
  key: string;
  title: string;
  hint: string;
  to: string;
  icon: ReactNode;
  done: boolean;
  extra?: { label: string; to: string };
}

/** "Bien démarrer" checklist for new workspaces; disappears once everything is set up (or when dismissed). */
export function OnboardingCard() {
  const user = useAuth((s) => s.user);
  const admin = can(user, "admin");
  const [hidden, setHidden] = useLocalStorage("prisme-onboarding-hidden", false);
  const enabled = admin && !hidden;
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<SettingsPayload>("/settings"), enabled });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: () => api.get<{ configured: boolean }>("/ai/status"), enabled });
  const contacts = useList("contacts", { limit: 1 }, { enabled });
  const quotes = useList("quotes", { limit: 1 }, { enabled });
  const users = useList("users", { limit: 1 }, { enabled });

  if (!enabled || !settings.data || !ai.data || !contacts.data || !quotes.data || !users.data) return null;

  const company = settings.data.company ?? {};
  const email = settings.data.email ?? {};
  const steps: Step[] = [
    {
      key: "company",
      title: "Compléter l'identité légale",
      hint: "SIREN, forme juridique, adresse, TVA : indispensables sur vos factures.",
      to: "/settings?tab=company",
      icon: <Building2 className="size-4" />,
      done: Boolean(company.siren && company.legal_form && company.address && company.city),
    },
    {
      key: "ai",
      title: "Connecter une IA",
      hint: "Clé API (Claude, OpenAI, Mistral…), modèle local, ou votre abonnement Claude via MCP.",
      to: "/settings?tab=ai",
      icon: <Sparkles className="size-4" />,
      done: ai.data.configured,
      extra: { label: "Abonnement Claude (MCP)", to: "/settings?tab=mcp" },
    },
    {
      key: "email",
      title: "Configurer l'envoi d'emails",
      hint: "Votre serveur SMTP pour envoyer devis, factures et relances depuis Prisme.",
      to: "/settings?tab=email",
      icon: <Mail className="size-4" />,
      done: Boolean(email.smtp_host),
    },
    {
      key: "contacts",
      title: "Importer vos contacts",
      hint: "Fichier CSV depuis votre ancien outil ou votre tableur.",
      to: "/settings?tab=data",
      icon: <Upload className="size-4" />,
      done: contacts.data.total > 0,
    },
    {
      key: "quote",
      title: "Créer votre premier devis",
      hint: "Signature électronique en ligne, puis conversion en facture.",
      to: "/quotes/new",
      icon: <FileText className="size-4" />,
      done: quotes.data.total > 0,
    },
    {
      key: "team",
      title: "Inviter votre équipe",
      hint: "Rôles administrateur, manager, membre ou lecteur.",
      to: "/settings?tab=team",
      icon: <Users className="size-4" />,
      done: users.data.total > 1,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Glass glow className="relative overflow-hidden p-5 sm:p-6">
        <button onClick={() => setHidden(true)} className="absolute right-3 top-3 rounded-full p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Masquer">
          <X className="size-4" />
        </button>
        <div className="mb-4 flex items-center gap-4">
          <Ring value={(done / steps.length) * 100} size={52} stroke={5}>
            <span className="text-[12px]">
              {done}/{steps.length}
            </span>
          </Ring>
          <div>
            <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Bien démarrer avec Prisme</h3>
            <p className="text-[13px] text-fg-2">Quelques minutes pour un espace prêt à vendre, facturer et automatiser.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((s) => (
            <div key={s.key} className={cn("group flex items-start gap-3 rounded-[16px] p-3 transition", s.done ? "opacity-60" : "glass-inset hover:bg-[var(--field-hover)]")}>
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px]", s.done ? "bg-emerald-500 text-white" : "bg-accent-soft text-accent")}>{s.done ? <Check className="size-4" strokeWidth={3} /> : s.icon}</span>
              <div className="min-w-0 flex-1">
                <Link to={s.to} className={cn("flex items-center gap-1 text-[13.5px] font-medium", s.done ? "line-through" : "hover:text-accent")}>
                  {s.title}
                  {!s.done && <ArrowRight className="size-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />}
                </Link>
                <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{s.hint}</p>
                {s.extra && !s.done && (
                  <Link to={s.extra.to} className="mt-1 inline-block text-[12px] font-medium text-accent hover:underline">
                    {s.extra.label} →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </Glass>
    </motion.div>
  );
}

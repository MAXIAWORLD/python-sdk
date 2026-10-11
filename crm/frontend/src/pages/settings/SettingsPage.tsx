import { Bot, Building2, Database, Mail, Palette, Receipt, Search, Settings, ShieldCheck, Sparkles, SquareKanban, UserRound, Users, Webhook, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSearchParams } from "react-router";
import { useAiStatus } from "@/components/ai/ChatView";
import { PageHeader } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import AiTab from "@/components/settings/AiTab";
import AppearanceTab from "@/components/settings/AppearanceTab";
import BillingTab from "@/components/settings/BillingTab";
import CompanyTab from "@/components/settings/CompanyTab";
import DataTab from "@/components/settings/DataTab";
import EmailTab from "@/components/settings/EmailTab";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import McpTab from "@/components/settings/McpTab";
import PipelinesTab from "@/components/settings/PipelinesTab";
import ProfileTab from "@/components/settings/ProfileTab";
import { readiness } from "@/components/settings/readiness";
import RgpdTab from "@/components/settings/RgpdTab";
import { DirtyProvider, useSettings } from "@/components/settings/shared";
import TeamTab from "@/components/settings/TeamTab";
import { fieldBase } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

type TabId = "profile" | "appearance" | "company" | "team" | "billing" | "pipelines" | "ai" | "mcp" | "email" | "integrations" | "rgpd" | "data";

interface TabDef {
  id: TabId;
  label: string;
  group: string;
  icon: LucideIcon;
  keywords: string;
  component: ComponentType;
  minRole?: "member" | "manager" | "admin";
}

const GROUPS = ["Compte", "Organisation", "Ventes", "Intelligence", "Communication", "Conformité", "Système"];

const TABS: TabDef[] = [
  { id: "profile", label: "Mon profil", group: "Compte", icon: UserRound, keywords: "nom fonction téléphone photo couleur signature mot de passe sécurité préférences", component: ProfileTab },
  { id: "appearance", label: "Apparence", group: "Compte", icon: Palette, keywords: "thème clair sombre système effets verre animations accent", component: AppearanceTab },
  { id: "company", label: "Entreprise", group: "Organisation", icon: Building2, keywords: "raison sociale siren siret tva iban bic adresse logo marque couleur mentions légales", component: CompanyTab },
  { id: "team", label: "Équipe", group: "Organisation", icon: Users, keywords: "utilisateurs membres rôles inviter administrateur permissions", component: TeamTab },
  { id: "billing", label: "Facturation", group: "Ventes", icon: Receipt, keywords: "numérotation préfixe tva débits délai paiement pénalités indemnité escompte devis cgv factur-x facturation électronique plateforme agréée comptabilité journaux comptes", component: BillingTab },
  { id: "pipelines", label: "Pipelines", group: "Ventes", icon: SquareKanban, keywords: "étapes probabilité kanban inactivité gagnée perdue", component: PipelinesTab },
  { id: "ai", label: "Intelligence artificielle", group: "Intelligence", icon: Sparkles, keywords: "iris assistant fournisseur clé api claude anthropic openai mistral gemini ollama modèle effort pseudonymisation", component: AiTab },
  { id: "mcp", label: "Claude (MCP)", group: "Intelligence", icon: Bot, keywords: "claude desktop code abonnement jeton mcp connecteur", component: McpTab },
  { id: "email", label: "Email", group: "Communication", icon: Mail, minRole: "admin", keywords: "smtp imap envoi réception test suivi ouverture pixel", component: EmailTab },
  { id: "integrations", label: "Intégrations", group: "Communication", icon: Webhook, keywords: "api jetons webhooks agenda ics calendrier zapier make n8n", component: IntegrationsTab },
  { id: "rgpd", label: "RGPD", group: "Conformité", icon: ShieldCheck, keywords: "dpo conservation registre traitements purge anonymisation audit journal consentement mention", component: RgpdTab },
  { id: "data", label: "Import / export", group: "Système", icon: Database, keywords: "csv import export fec comptable sauvegarde backup portabilité", component: DataTab },
];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function useTabBadges() {
  const { data } = useSettings();
  const ai = useAiStatus();
  return useMemo(() => {
    const badges: Partial<Record<TabId, { tone: "red" | "amber"; label: string }>> = {};
    if (data?.company) {
      const missing = readiness(data.company).filter((i) => i.required && !i.ok).length;
      if (missing) badges.company = { tone: "red", label: `${missing} mention${missing > 1 ? "s" : ""} obligatoire${missing > 1 ? "s" : ""} manquante${missing > 1 ? "s" : ""}` };
    }
    if (ai.data && !ai.data.configured) badges.ai = { tone: "amber", label: "Aucun fournisseur d'IA configuré" };
    return badges;
  }, [data, ai.data]);
}

function SettingsNav({ tabs, active, onSelect, badges }: { tabs: TabDef[]; active: TabId; onSelect: (id: TabId) => void; badges: ReturnType<typeof useTabBadges> }) {
  const [q, setQ] = useState("");
  const query = normalize(q.trim());
  const filtered = query ? tabs.filter((t) => normalize(`${t.label} ${t.group} ${t.keywords}`).includes(query)) : tabs;
  return (
    <Glass className="flex max-h-[calc(100vh-108px)] flex-col p-2.5" radius="xl">
      <div className="relative mb-1 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un réglage…" className={cn(fieldBase, "h-9 pl-9 pr-8 text-[13px]")} aria-label="Rechercher un réglage" />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-fg-3 hover:text-fg" aria-label="Effacer">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]" aria-label="Sections des paramètres">
        <LayoutGroup id="settings-nav">
          {GROUPS.map((group) => {
            const items = filtered.filter((t) => t.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mt-2.5 first:mt-1">
                <div className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-3">{group}</div>
                <div className="space-y-0.5">
                  {items.map((t) => {
                    const isActive = t.id === active;
                    const badge = badges[t.id];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onSelect(t.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={cn("group relative flex h-9 w-full items-center gap-2.5 rounded-[12px] px-2.5 text-left text-[13.5px] font-medium transition-colors", isActive ? "text-fg" : "text-fg-2 hover:text-fg")}
                      >
                        {isActive ? (
                          <motion.span layoutId="settings-pill" className="glass liquid absolute inset-0 rounded-[12px]" transition={{ type: "spring", stiffness: 480, damping: 36 }} />
                        ) : (
                          <span className="absolute inset-0 rounded-[12px] opacity-0 transition-opacity group-hover:bg-black/[0.04] group-hover:opacity-100 dark:group-hover:bg-white/[0.05]" />
                        )}
                        <t.icon className={cn("relative z-10 size-[17px] shrink-0 transition-colors", isActive ? "text-accent" : "text-fg-3 group-hover:text-fg-2", t.id === "ai" && !isActive && "text-[#b26bff]")} strokeWidth={isActive ? 2.2 : 1.9} />
                        <span className="relative z-10 min-w-0 flex-1 truncate">{t.label}</span>
                        {badge && <span className={cn("relative z-10 size-2 shrink-0 rounded-full", badge.tone === "red" ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-amber-400 shadow-[0_0_8px_#fbbf24]")} title={badge.label} aria-label={badge.label} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!filtered.length && <p className="px-3 py-6 text-center text-[12.5px] text-fg-3">Aucun réglage ne correspond à « {q} ».</p>}
        </LayoutGroup>
      </nav>
    </Glass>
  );
}

function MobileTabSelect({ tabs, active, onSelect }: { tabs: TabDef[]; active: TabId; onSelect: (id: TabId) => void }) {
  const current = tabs.find((t) => t.id === active);
  const Icon = current?.icon ?? Settings;
  return (
    <Glass className="flex items-center gap-3 p-2.5 lg:hidden" radius="lg">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
        <Icon className="size-[18px]" />
      </span>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Section des paramètres</span>
        <select value={active} onChange={(e) => onSelect(e.target.value as TabId)} className={cn(fieldBase, "h-10 appearance-none pr-9 font-medium")}>
          {GROUPS.map((group) => {
            const items = tabs.filter((t) => t.group === group);
            if (!items.length) return null;
            return (
              <optgroup key={group} label={group}>
                {items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </label>
    </Glass>
  );
}

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [params, setParams] = useSearchParams();
  const confirm = useConfirm();
  const badges = useTabBadges();
  const tabs = useMemo(() => TABS.filter((t) => !t.minRole || can(user, t.minRole)), [user]);
  const requested = params.get("tab");
  const active = tabs.find((t) => t.id === requested)?.id ?? "profile";
  const Content = tabs.find((t) => t.id === active)?.component ?? ProfileTab;

  // Unsaved changes registry fed by the tab forms.
  const dirty = useRef(new Set<string>());
  const report = useCallback((key: string, isDirty: boolean) => {
    if (isDirty) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const select = async (id: TabId) => {
    if (id === active) return;
    if (dirty.current.size) {
      const leave = await confirm({ title: "Quitter sans enregistrer ?", description: "Les modifications non enregistrées de cette section seront perdues.", confirmLabel: "Quitter sans enregistrer", cancelLabel: "Rester", danger: true });
      if (!leave) return;
    }
    setParams({ tab: id });
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      <PageHeader title="Paramètres" description="Votre compte, votre organisation, la facturation, l'IA et la conformité, au même endroit." icon={<Settings className="size-5" />} />
      <div className="grid items-start gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-[88px] hidden lg:block">
          <SettingsNav tabs={tabs} active={active} onSelect={select} badges={badges} />
        </aside>
        <MobileTabSelect tabs={tabs} active={active} onSelect={select} />
        <div className="min-w-0">
          <DirtyProvider value={report}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
                <Content />
              </motion.div>
            </AnimatePresence>
          </DirtyProvider>
        </div>
      </div>
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Brain, CheckCircle2, Cpu, EyeOff, KeyRound, ListRestart, MoreHorizontal, Pencil, Plug, Plus, ServerCog, ShieldCheck, Sparkles, Star, Trash2, XCircle, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { IrisOrb, useAiStatus } from "@/components/ai/ChatView";
import { Glass } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Switch } from "@/components/ui/fields";
import { Dialog, Menu, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { errorMessage, toastError, useInvalidate, useList } from "@/lib/hooks";
import type { AIProvider } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { Callout, ChoiceCards, FormGrid, PasswordInput, ReadOnlyNotice, SaveBar, SettingsCard, SwitchField, TabHeader, TextareaField, TextField, useSectionForm } from "./shared";
import { isHttpUrl } from "./validators";

interface Preset {
  label: string;
  base_url: string;
  models: string[];
  needs_key: boolean;
  default_model: string;
}

const LOCAL_KINDS = new Set(["ollama", "lmstudio"]);
const DEFAULT_NAMES: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  mistral: "Mistral AI",
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  xai: "Grok",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  custom: "API personnalisée",
};
const MONOGRAM: Record<string, { text: string; color: string }> = {
  anthropic: { text: "Cl", color: "#d97757" },
  openai: { text: "AI", color: "#10a37f" },
  mistral: { text: "Mi", color: "#ff7000" },
  gemini: { text: "Ge", color: "#4285f4" },
  groq: { text: "Gq", color: "#f55036" },
  openrouter: { text: "OR", color: "#6467f2" },
  deepseek: { text: "DS", color: "#4d6bfe" },
  xai: { text: "xA", color: "#3f3f46" },
  ollama: { text: "Ol", color: "#64748b" },
  lmstudio: { text: "LM", color: "#8b5cf6" },
  custom: { text: "</>", color: "#94a3b8" },
};

const EFFORTS = [
  { value: "low", label: "Faible", description: "Réponses rapides et économiques, pour les tâches simples." },
  { value: "medium", label: "Moyen", description: "Bon équilibre entre vitesse et qualité. Recommandé." },
  { value: "high", label: "Élevé", description: "Réflexion approfondie pour l'analyse et la rédaction." },
  { value: "xhigh", label: "Très élevé", description: "Pour les tâches longues et complexes en plusieurs étapes." },
  { value: "max", label: "Maximal", description: "Qualité maximale, plus lent et plus coûteux." },
];

/** Preset label without flag emoji (e.g. « Mistral AI 🇫🇷 » → « Mistral AI »). */
const cleanLabel = (label: string) => label.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim();

function usePresets() {
  return useQuery({ queryKey: ["ai-presets"], queryFn: () => api.get<{ presets: Record<string, Preset> }>("/ai/presets"), staleTime: Infinity, select: (d) => d.presets });
}

function Monogram({ kind, size = 40 }: { kind: string; size?: number }) {
  const m = MONOGRAM[kind] ?? MONOGRAM.custom;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-10px_rgba(0,0,0,.5)]" style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(145deg, ${m.color}, color-mix(in oklab, ${m.color} 60%, #000))` }}>
      {m.text}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Provider dialog                                                            */
/* -------------------------------------------------------------------------- */

interface ProviderDraft {
  name: string;
  kind: string;
  base_url: string;
  api_key: string;
  default_model: string;
  enabled: boolean;
  is_default: boolean;
}

type TestResult = { ok: boolean; message: string } | null;

function ProviderDialog({ open, onOpenChange, provider, presets, isFirst }: { open: boolean; onOpenChange: (o: boolean) => void; provider: AIProvider | null; presets: Record<string, Preset>; isFirst: boolean }) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [draft, setDraft] = useState<ProviderDraft>({ name: "", kind: "anthropic", base_url: "", api_key: "", default_model: "", enabled: true, is_default: false });
  const [customModel, setCustomModel] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [test, setTest] = useState<TestResult>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTest(null);
      if (provider) {
        setStep("form");
        setDraft({ name: provider.name, kind: provider.kind, base_url: provider.base_url ?? "", api_key: "", default_model: provider.default_model, enabled: provider.enabled, is_default: provider.is_default });
        const known = Array.from(new Set([...(provider.models ?? []), ...(presets[provider.kind]?.models ?? [])]));
        setModels(known);
        setCustomModel(!!provider.default_model && !known.includes(provider.default_model));
      } else {
        setStep("pick");
      }
    }
  }

  const preset = presets[draft.kind];
  const pick = (kind: string) => {
    const p = presets[kind];
    setDraft({ name: DEFAULT_NAMES[kind] ?? p?.label ?? kind, kind, base_url: p?.base_url ?? "", api_key: "", default_model: p?.default_model ?? "", enabled: true, is_default: isFirst });
    setModels(p?.models ?? []);
    setCustomModel(!p?.models.length);
    setTest(null);
    setStep("form");
  };
  const set = <K extends keyof ProviderDraft>(k: K, v: ProviderDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k !== "name" && k !== "enabled" && k !== "is_default") setTest(null);
  };

  const needsKey = preset?.needs_key ?? false;
  const keyMissing = needsKey && !draft.api_key && !provider?.api_key_set;
  const urlRequired = draft.kind === "custom";
  const urlError = draft.base_url && !isHttpUrl(draft.base_url) ? "Adresse invalide (http:// ou https://)." : urlRequired && !draft.base_url ? "URL requise pour un fournisseur personnalisé." : null;
  const valid = draft.name.trim().length > 0 && !!draft.default_model.trim() && !urlError;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const sameConfig = provider && !draft.api_key && draft.kind === provider.kind && (draft.base_url || "") === (provider.base_url || "");
      const body = sameConfig ? { provider_id: provider.id, model: draft.default_model } : { kind: draft.kind, api_key: draft.api_key || undefined, base_url: draft.base_url || undefined, model: draft.default_model || undefined };
      setTest(await api.post<{ ok: boolean; message: string }>("/ai/providers/test", body));
    } catch (e) {
      setTest({ ok: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const loadModels = async () => {
    if (!provider) return;
    setLoadingModels(true);
    try {
      const res = await api.get<{ models: string[] }>(`/ai/providers/${provider.id}/models`);
      setModels(res.models);
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
      toast.success(`${res.models.length} modèle${res.models.length > 1 ? "s" : ""} disponible${res.models.length > 1 ? "s" : ""}`);
    } catch (e) {
      toastError(e);
    } finally {
      setLoadingModels(false);
    }
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const payload: Record<string, unknown> = { name: draft.name.trim(), kind: draft.kind, base_url: draft.base_url.trim() || null, default_model: draft.default_model.trim(), enabled: draft.enabled, is_default: draft.is_default };
    if (draft.api_key) payload.api_key = draft.api_key.trim();
    if (!provider) payload.models = models;
    try {
      const saved = provider ? await api.patch<AIProvider>(`/ai-providers/${provider.id}`, payload) : await api.post<AIProvider>("/ai-providers", payload);
      invalidate("ai-providers", "ai-status");
      if (draft.api_key && !saved.api_key_set) toast.warning("La clé API n'a pas été conservée par le serveur", { description: "Le fournisseur est enregistré mais sans clé : contactez votre administrateur technique." });
      else toast.success(provider ? "Fournisseur mis à jour" : `${saved.name} est connecté à Prisme`);
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const kinds = Object.entries(presets);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size={step === "pick" ? "lg" : "md"}
      icon={step === "pick" ? <Sparkles className="size-5" /> : <Monogram kind={draft.kind} size={40} />}
      title={step === "pick" ? "Ajouter un fournisseur d'IA" : provider ? `Modifier ${provider.name}` : cleanLabel(presets[draft.kind]?.label ?? "Fournisseur")}
      description={step === "pick" ? "Choisissez un préréglage : l'URL et les modèles sont préremplis." : "La clé API est chiffrée sur le serveur et n'est jamais réaffichée."}
      footer={
        step === "pick" ? (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        ) : (
          <>
            {!provider && (
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep("pick")} className="mr-auto">
                Préréglages
              </Button>
            )}
            <Button variant="glass" icon={<Zap className="size-4" />} loading={testing} disabled={!draft.default_model || !!urlError} onClick={runTest}>
              Tester la connexion
            </Button>
            <Button variant="primary" loading={saving} disabled={!valid} onClick={save}>
              {provider ? "Enregistrer" : "Ajouter"}
            </Button>
          </>
        )
      }
    >
      {step === "pick" ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {kinds.map(([kind, p]) => (
            <button key={kind} type="button" onClick={() => pick(kind)} className="group flex items-center gap-3 rounded-[16px] p-3 text-left ring-1 ring-inset ring-[var(--hairline-strong)] transition hover:bg-black/[0.03] hover:ring-[color-mix(in_oklab,var(--accent)_45%,transparent)] dark:hover:bg-white/[0.04]">
              <Monogram kind={kind} size={38} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold">{DEFAULT_NAMES[kind] ?? cleanLabel(p.label)}</span>
                  {LOCAL_KINDS.has(kind) && (
                    <Badge tone="teal" size="xs">
                      Local
                    </Badge>
                  )}
                  {kind === "mistral" && (
                    <Badge tone="blue" size="xs">
                      UE
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-[11.5px] text-fg-3">{LOCAL_KINDS.has(kind) ? "Gratuit, sans clé API" : kind === "custom" ? "Toute API compatible OpenAI" : p.models.length ? p.models.slice(0, 2).join(", ") : "Catalogue de modèles"}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-3 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <FormGrid>
            <Field label="Nom affiché" required>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Claude (équipe)" />
            </Field>
            <Field
              label="Modèle par défaut"
              required
              action={
                provider ? (
                  <button type="button" onClick={loadModels} disabled={loadingModels} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent disabled:opacity-50">
                    <ListRestart className="size-3.5" /> {loadingModels ? "Chargement…" : "Actualiser la liste"}
                  </button>
                ) : undefined
              }
            >
              {models.length > 0 && !customModel ? (
                <Select
                  value={draft.default_model}
                  onChange={(v) => {
                    if (v === "__custom__") {
                      setCustomModel(true);
                      set("default_model", "");
                    } else set("default_model", v);
                  }}
                  options={[...models.map((m) => ({ value: m, label: m })), { value: "__custom__", label: "Autre modèle…" }]}
                  placeholder="Choisir un modèle"
                />
              ) : (
                <Input value={draft.default_model} onChange={(e) => set("default_model", e.target.value)} placeholder="identifiant-du-modele" className="font-mono" />
              )}
            </Field>
            <Field
              label={needsKey ? "Clé API" : "Clé API (facultative)"}
              className="sm:col-span-2"
              hint={provider?.api_key_set ? `Clé enregistrée : ${provider.api_key_preview ?? "••••"}. Laissez vide pour la conserver.` : LOCAL_KINDS.has(draft.kind) ? "Les modèles locaux ne nécessitent généralement pas de clé." : "Créez une clé dans la console du fournisseur, avec un plafond de dépenses."}
            >
              <PasswordInput value={draft.api_key} onChange={(v) => set("api_key", v)} placeholder={provider?.api_key_set ? `Enregistrée ${provider.api_key_preview ?? ""} — saisissez pour remplacer` : "Collez votre clé API"} autoComplete="off" />
            </Field>
            <Field
              label={draft.kind === "anthropic" ? "URL de l'API (facultative)" : "URL de base de l'API"}
              required={urlRequired}
              className="sm:col-span-2"
              error={urlError}
              hint={draft.kind === "anthropic" ? "Laissez vide pour l'API officielle. Renseignez-la uniquement pour une passerelle compatible." : LOCAL_KINDS.has(draft.kind) ? "Le serveur Prisme doit pouvoir joindre cette adresse." : preset?.base_url ? `Par défaut : ${preset.base_url}` : "Adresse compatible avec l'API OpenAI (…/v1)."}
            >
              <Input value={draft.base_url} onChange={(e) => set("base_url", e.target.value)} placeholder={preset?.base_url || "https://…/v1"} className="font-mono text-[13px]" inputMode="url" />
            </Field>
          </FormGrid>
          <div className="space-y-3 rounded-[16px] bg-black/[0.03] p-3.5 dark:bg-white/[0.04]">
            <Switch size="sm" checked={draft.enabled} onChange={(v) => set("enabled", v)} label={<span className="text-[13.5px]">Activé</span>} description="Disponible pour l'assistant et les actions « ✨ »." />
            <Switch size="sm" checked={draft.is_default} onChange={(v) => set("is_default", v)} label={<span className="text-[13.5px]">Fournisseur par défaut</span>} description="Utilisé par Iris quand aucun fournisseur n'est choisi." />
          </div>
          {keyMissing && !test && (
            <Callout tone="warn" icon={<KeyRound className="size-4" />}>
              Ce fournisseur nécessite une clé API pour fonctionner.
            </Callout>
          )}
          <AnimatePresence mode="wait">
            {test && (
              <motion.div key={String(test.ok) + test.message} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Callout tone={test.ok ? "success" : "danger"} icon={test.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} title={test.ok ? "Connexion réussie" : "Échec de la connexion"}>
                  {test.message}
                </Callout>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Provider card                                                              */
/* -------------------------------------------------------------------------- */

function ProviderCard({ provider, preset, canEdit, onEdit }: { provider: AIProvider; preset?: Preset; canEdit: boolean; onEdit: () => void }) {
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const [test, setTest] = useState<TestResult>(null);
  const [testing, setTesting] = useState(false);
  const local = LOCAL_KINDS.has(provider.kind);
  const missingKey = preset?.needs_key && !provider.api_key_set;
  const kindLabel = preset ? cleanLabel(preset.label) : provider.kind;

  const patch = async (data: Partial<AIProvider>, message: string) => {
    try {
      await api.patch(`/ai-providers/${provider.id}`, data);
      invalidate("ai-providers", "ai-status");
      toast.success(message);
    } catch (e) {
      toastError(e);
    }
  };
  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await api.post<{ ok: boolean; message: string }>("/ai/providers/test", { provider_id: provider.id }));
    } catch (e) {
      setTest({ ok: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Supprimer ${provider.name} ?`, description: "Sa clé API est effacée. Les conversations existantes restent consultables.", confirmLabel: "Supprimer", danger: true }))) return;
    try {
      await api.delete(`/ai-providers/${provider.id}`);
      invalidate("ai-providers", "ai-status");
      toast.success("Fournisseur supprimé");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Glass glow className={cn("flex h-full flex-col p-4", !provider.enabled && "opacity-70")}>
        <div className="flex items-start gap-3">
          <Monogram kind={provider.kind} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[14.5px] font-semibold">{provider.name}</span>
              {provider.is_default && (
                <Badge tone="violet" size="xs">
                  <Star className="size-2.5 fill-current" /> Par défaut
                </Badge>
              )}
              {local && (
                <Badge tone="teal" size="xs">
                  Local
                </Badge>
              )}
            </div>
            {kindLabel.toLowerCase() !== provider.name.toLowerCase() && <div className="truncate text-[12px] text-fg-3">{kindLabel}</div>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1">
              <Switch size="sm" checked={provider.enabled} onChange={(v) => patch({ enabled: v }, v ? `${provider.name} activé` : `${provider.name} désactivé`)} />
              <Menu
                trigger={
                  <IconButton label="Actions" size="sm">
                    <MoreHorizontal className="size-4" />
                  </IconButton>
                }
                items={[
                  { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: onEdit },
                  { label: "Définir par défaut", icon: <Star className="size-4" />, onSelect: () => patch({ is_default: true }, `${provider.name} est le fournisseur par défaut`), disabled: provider.is_default },
                  { separator: true, label: "" },
                  { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: remove },
                ]}
              />
            </div>
          )}
        </div>
        <dl className="mt-4 space-y-1.5 text-[12.5px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-fg-3">
              <Cpu className="size-3.5" /> Modèle
            </dt>
            <dd className="truncate font-mono text-[12px] font-medium">{provider.default_model || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-fg-3">
              <KeyRound className="size-3.5" /> Clé API
            </dt>
            <dd className={cn("truncate font-mono text-[12px]", missingKey && "font-sans font-medium text-amber-600 dark:text-amber-400")}>{provider.api_key_set ? provider.api_key_preview : missingKey ? "Manquante" : "Non requise"}</dd>
          </div>
          {provider.base_url && (
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-fg-3">
                <ServerCog className="size-3.5" /> URL
              </dt>
              <dd className="truncate font-mono text-[12px]" title={provider.base_url}>
                {provider.base_url.replace(/^https?:\/\//, "")}
              </dd>
            </div>
          )}
        </dl>
        <AnimatePresence>
          {test && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className={cn("mt-3 flex items-start gap-2 rounded-[12px] px-3 py-2 text-[12px]", test.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300")}>
                {test.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <XCircle className="mt-px size-3.5 shrink-0" />}
                <span className="min-w-0 break-words">{test.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="text-[11.5px] text-fg-3">Ajouté {relative(provider.created_at)}</span>
          {canEdit && (
            <Button size="xs" variant="glass" icon={<Zap className="size-3.5" />} loading={testing} onClick={runTest}>
              Tester
            </Button>
          )}
        </div>
      </Glass>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab                                                                        */
/* -------------------------------------------------------------------------- */

export default function AiTab() {
  const me = useAuth((s) => s.user);
  const isAdmin = can(me, "admin");
  const canRead = can(me, "member");
  const navigate = useNavigate();
  const status = useAiStatus();
  const presets = usePresets();
  const providers = useList<AIProvider>("ai-providers", { sort: "-is_default,name", limit: 100 }, { enabled: canRead });
  const ai = useSectionForm("ai");
  const [dialog, setDialog] = useState<{ provider: AIProvider | null } | null>(null);
  const items = useMemo(() => providers.data?.items ?? [], [providers.data]);
  const s = status.data;

  return (
    <div className="space-y-5">
      <TabHeader
        title="Intelligence artificielle"
        description="Connectez les modèles qui animent l'assistante, les rédactions « ✨ » et les automatisations. Vous gardez le choix du fournisseur et la maîtrise des données."
        actions={
          isAdmin && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({ provider: null })} disabled={!presets.data}>
              Ajouter un fournisseur
            </Button>
          )
        }
      />

      <Glass glow className="relative overflow-hidden" radius="xl">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full opacity-25 blur-3xl ai-gradient" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <IrisOrb size={64} thinking={status.isLoading} />
          <div className="min-w-0 flex-1">
            {status.isLoading ? (
              <Skeleton className="h-12 w-72" />
            ) : s?.configured ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{s.assistant_name} est opérationnelle</h3>
                  <Badge tone="green" dot>
                    Active
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] text-fg-2">
                  {s.default_provider ? (
                    <>
                      Fournisseur par défaut : <b className="font-semibold text-fg">{s.default_provider.name}</b> · modèle <code className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[12px]">{s.default_provider.model}</code>
                    </>
                  ) : (
                    "Aucun fournisseur par défaut : le premier fournisseur actif est utilisé."
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{s?.assistant_name ?? "Iris"} attend un fournisseur</h3>
                  <Badge tone="orange" dot>
                    Non configurée
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] text-fg-2">Ajoutez une clé API (Claude, Mistral, OpenAI…) ou un modèle local (Ollama). Vous avez un abonnement Claude ? Pilotez Prisme depuis Claude Desktop ou Claude Code, sans clé API.</p>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="glass" icon={<Plug className="size-4" />} onClick={() => navigate("/settings?tab=mcp")}>
              Claude via MCP
            </Button>
          </div>
        </div>
      </Glass>

      {!canRead ? (
        <ReadOnlyNotice>Les fournisseurs d'IA ne sont visibles que par les membres de l'équipe.</ReadOnlyNotice>
      ) : providers.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-[190px] rounded-[22px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<Brain className="size-6" />}
            title="Aucun fournisseur d'IA"
            description="Anthropic Claude, OpenAI, Mistral (hébergé en France), Gemini, Groq, OpenRouter, DeepSeek, xAI, ou un modèle local avec Ollama ou LM Studio."
            action={
              isAdmin ? (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({ provider: null })} disabled={!presets.data}>
                  Ajouter un fournisseur
                </Button>
              ) : undefined
            }
          />
        </Glass>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((p) => (
            <ProviderCard key={p.id} provider={p} preset={presets.data?.[p.kind]} canEdit={isAdmin} onEdit={() => setDialog({ provider: p })} />
          ))}
          {isAdmin && (
            <button type="button" onClick={() => setDialog({ provider: null })} className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-[var(--hairline-strong)] text-[13px] font-medium text-fg-3 transition hover:border-[color-mix(in_oklab,var(--accent)_50%,transparent)] hover:text-accent">
              <Plus className="size-5" />
              Ajouter un fournisseur
            </button>
          )}
        </div>
      )}

      {ai.ready && (
        <SettingsCard title="Réglages de l'assistante" description="Comportement d'Iris pour toute l'organisation." icon={<Sparkles className="size-4" />}>
          {!ai.canEdit && <ReadOnlyNotice />}
          <div className="space-y-5">
            <FormGrid>
              <TextField form={ai} name="assistant_name" label="Nom de l'assistante" placeholder="Iris" maxLength={30} hint="Affiché dans le panneau de conversation et les suggestions." />
            </FormGrid>
            <div>
              <div className="mb-1 text-[12.5px] font-medium text-fg-2">Niveau de réflexion</div>
              <p className="mb-2.5 text-[12px] text-fg-3">Plus l'effort est élevé, plus Iris réfléchit avant d'agir : réponses plus fiables sur les tâches complexes, mais plus lentes et plus coûteuses. S'applique aux modèles Claude.</p>
              <ChoiceCards options={EFFORTS} value={ai.values.effort || "medium"} onChange={(v) => ai.set("effort", v)} disabled={!ai.canEdit} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-5" />
            </div>
            <div className="space-y-4 rounded-[18px] bg-black/[0.025] p-4 dark:bg-white/[0.035]">
              <SwitchField
                form={ai}
                name="require_approval"
                label={
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-500" />
                    Validation humaine des actions d'écriture
                  </span>
                }
                description="Iris vous demande de confirmer chaque création ou modification avant de l'exécuter. Les actions sensibles (suppression, émission de facture, paiement, envoi d'email) demandent toujours votre validation."
              />
              <SwitchField
                form={ai}
                name="mask_personal_data"
                label={
                  <span className="flex items-center gap-2">
                    <EyeOff className="size-4 text-accent" />
                    Pseudonymiser les données personnelles
                  </span>
                }
                description="Emails, numéros de téléphone et IBAN sont remplacés par des alias (<email-1>…) avant l'envoi au fournisseur d'IA, puis restaurés dans Prisme. Recommandé si votre fournisseur traite les données hors de l'Union européenne."
              />
            </div>
            <TextareaField form={ai} name="custom_instructions" label="Instructions personnalisées" rows={4} placeholder="Ex. : Nous sommes une agence web à Lyon. Vouvoie toujours les clients. Propose systématiquement un rendez-vous de suivi." hint="Contexte et consignes ajoutés aux nouvelles conversations d'Iris." />
          </div>
        </SettingsCard>
      )}

      <Callout tone="neutral" icon={<ShieldCheck className="size-4" />}>
        Les données transmises au fournisseur d'IA relèvent de la sous-traitance (RGPD art. 28) : vérifiez son accord de traitement des données (DPA) et le lieu d'hébergement. Le traitement « Assistant IA » figure dans votre registre (onglet RGPD).
      </Callout>

      {presets.data && <ProviderDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} provider={dialog?.provider ?? null} presets={presets.data} isFirst={items.length === 0} />}
      <SaveBar forms={[ai]} />
    </div>
  );
}

import { KeyRound, Mail, PanelLeftClose, Phone, ShieldCheck, Signature, SlidersHorizontal, Sparkles, UserRound, Wand2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { Button } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/display";
import { Field, Input, Switch, Textarea } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/markdown";
import { Segmented } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { ROLES } from "@/lib/constants";
import { date, relative } from "@/lib/format";
import { errorMessage, toastError } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";
import { Callout, ColorPicker, FieldGroup, FormGrid, PasswordInput, PasswordStrength, SaveBar, SettingsCard, TabHeader, useReportDirty, useSettings, type SaveableForm } from "./shared";
import { generatePassword, isUrl, passwordValid } from "./validators";

type ProfileValues = Pick<User, "name" | "title" | "phone" | "color" | "avatar_url" | "signature">;
const PROFILE_KEYS: (keyof ProfileValues)[] = ["name", "title", "phone", "color", "avatar_url", "signature"];

/** Draft of the current user's profile, saved with PATCH /auth/me. */
function useProfileForm(user: User): SaveableForm & { values: ProfileValues; set: <K extends keyof ProfileValues>(k: K, v: ProfileValues[K]) => void; errors: Partial<Record<keyof ProfileValues, string>> } {
  const setAuth = useAuth((s) => s.set);
  const [draft, setDraft] = useState<Partial<ProfileValues>>({});
  const [saving, setSaving] = useState(false);
  const values = useMemo(() => {
    const base = Object.fromEntries(PROFILE_KEYS.map((k) => [k, user[k] ?? ""])) as ProfileValues;
    return { ...base, ...draft };
  }, [user, draft]);
  const changes = useMemo(() => {
    const out: Partial<ProfileValues> = {};
    for (const k of Object.keys(draft) as (keyof ProfileValues)[]) if ((draft[k] ?? "") !== (user[k] ?? "")) Object.assign(out, { [k]: draft[k] });
    return out;
  }, [draft, user]);
  const errors = useMemo(() => {
    const out: Partial<Record<keyof ProfileValues, string>> = {};
    if (!String(values.name ?? "").trim()) out.name = "Votre nom est requis.";
    if (values.avatar_url && !isUrl(values.avatar_url)) out.avatar_url = "Adresse d'image invalide.";
    if (values.phone && !/^[+\d\s().-]{6,20}$/.test(values.phone)) out.phone = "Numéro de téléphone invalide.";
    return out;
  }, [values]);
  const changeCount = Object.keys(changes).length;
  useReportDirty("profile", changeCount > 0);

  const save = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!changeCount) return true;
    const firstError = Object.values(errors)[0];
    if (firstError) {
      toast.error("Certains champs sont invalides", { description: firstError });
      return false;
    }
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
      const updated = await api.patch<User>("/auth/me", payload);
      setAuth({ user: updated });
      setDraft({});
      if (!silent) toast.success("Profil mis à jour");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    values,
    errors,
    set: (k, v) => setDraft((d) => ({ ...d, [k]: v })),
    dirty: changeCount > 0,
    changeCount,
    saving,
    save,
    reset: () => setDraft({}),
  };
}

function PasswordCard() {
  const email = useAuth((s) => s.user?.email ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirmation.length > 0 && confirmation !== next;
  const sameAsCurrent = next.length > 0 && next === current;
  const canSubmit = current.length > 0 && passwordValid(next) && next === confirmation && !sameAsCurrent;
  useReportDirty("password", current.length + next.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password", { current, new: next });
      setCurrent("");
      setNext("");
      setConfirmation("");
      toast.success("Mot de passe modifié", { description: "Vos autres sessions ont été déconnectées par sécurité." });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError("Mot de passe actuel incorrect.");
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const suggest = () => {
    const pwd = generatePassword();
    setNext(pwd);
    setConfirmation(pwd);
    toast("Mot de passe généré", { description: "Enregistrez-le dans votre gestionnaire de mots de passe avant de valider." });
  };

  return (
    <SettingsCard
      title="Mot de passe"
      description="Changer de mot de passe déconnecte vos autres sessions (ordinateurs, mobiles)."
      icon={<KeyRound className="size-4" />}
      actions={
        <Button size="sm" variant="ghost" icon={<Wand2 className="size-3.5" />} onClick={suggest}>
          Générer
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <input type="text" autoComplete="username" value={email} readOnly hidden />
        <Field label="Mot de passe actuel" error={error}>
          <PasswordInput
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setError(null);
            }}
            autoComplete="current-password"
            invalid={!!error}
          />
        </Field>
        <FormGrid>
          <Field label="Nouveau mot de passe" error={sameAsCurrent ? "Choisissez un mot de passe différent de l'actuel." : null}>
            <PasswordInput value={next} onChange={setNext} autoComplete="new-password" />
          </Field>
          <Field label="Confirmation" error={mismatch ? "Les deux mots de passe ne correspondent pas." : null}>
            <PasswordInput value={confirmation} onChange={setConfirmation} autoComplete="new-password" invalid={mismatch} />
          </Field>
        </FormGrid>
        <PasswordStrength password={next} />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit} icon={<ShieldCheck className="size-4" />}>
            Mettre à jour le mot de passe
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

function SignatureEditor({ value, onChange, user }: { value: string; onChange: (v: string) => void; user: User }) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const ai = useAiGenerate();
  const { data: settings } = useSettings();

  const generate = async () => {
    const company = settings?.company;
    const facts = [
      `Nom : ${user.name}`,
      user.title && `Fonction : ${user.title}`,
      company?.name && `Entreprise : ${company.name}`,
      user.phone && `Téléphone : ${user.phone}`,
      `Email : ${user.email}`,
      company?.website && `Site : ${company.website}`,
    ]
      .filter(Boolean)
      .join("\n");
    const text = await ai.run("improve_text", {
      text: facts,
      instruction: "transforme ces informations en signature email professionnelle et sobre, en markdown simple (3 à 5 lignes, nom en gras, sans emoji ni formule de politesse)",
    });
    if (text.trim()) onChange(text.trim());
  };

  const preview = (
    <div className="glass-inset min-h-[168px] rounded-[16px] p-4">
      <div className="mb-3 text-[12px] text-fg-3">… votre message</div>
      <div className="border-t border-dashed border-[var(--hairline-strong)] pt-3">{value.trim() ? <Markdown streaming={ai.loading}>{value}</Markdown> : <p className="text-[13px] text-fg-3">Aucune signature : rien ne sera ajouté à vos emails.</p>}</div>
    </div>
  );

  return (
    <SettingsCard
      title="Signature email"
      description="Ajoutée automatiquement à la fin des emails envoyés depuis Prisme. Markdown accepté (**gras**, [liens](https://…))."
      icon={<Signature className="size-4" />}
      actions={
        <>
          <div className="md:hidden">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "edit", label: "Écrire" },
                { value: "preview", label: "Aperçu" },
              ]}
            />
          </div>
          <Button size="sm" variant="ai" icon={<Sparkles className="size-3.5" />} loading={ai.loading} onClick={generate}>
            Proposer avec Iris
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className={mode === "preview" ? "hidden md:block" : undefined}>
          <Textarea value={ai.loading ? ai.text : value} onChange={(e) => onChange(e.target.value)} rows={7} placeholder={`**${user.name}**\n${user.title ?? "Fonction"}\n${user.phone ?? "01 23 45 67 89"}`} className="font-mono text-[13px]" />
        </div>
        <div className={mode === "edit" ? "hidden md:block" : undefined}>{ai.loading ? <div className="glass-inset min-h-[168px] rounded-[16px] p-4"><Markdown streaming>{ai.text || "…"}</Markdown></div> : preview}</div>
      </div>
    </SettingsCard>
  );
}

function InterfacePreferences() {
  const { sidebarCollapsed, toggleSidebar, assistantWide, setAssistantWide } = useUI();
  const { data } = useSettings();
  const general = data?.general;
  return (
    <SettingsCard title="Préférences" description="Réglages d'interface propres à cet appareil." icon={<SlidersHorizontal className="size-4" />}>
      <div className="space-y-4">
        <Switch checked={sidebarCollapsed} onChange={() => toggleSidebar()} label={<span className="flex items-center gap-2"><PanelLeftClose className="size-4 text-fg-3" />Menu latéral compact</span>} description="Affiche uniquement les icônes dans la barre de navigation (écrans larges)." />
        <Switch checked={assistantWide} onChange={setAssistantWide} label={<span className="flex items-center gap-2"><Sparkles className="size-4 text-[#b26bff]" />Assistant Iris en grand format</span>} description="Ouvre le panneau de l'assistant en pleine largeur pour les longues conversations." />
        <div className="grid grid-cols-1 gap-2 rounded-[16px] bg-black/[0.03] p-3 text-[12.5px] dark:bg-white/[0.04] sm:grid-cols-3">
          <div>
            <div className="text-fg-3">Langue</div>
            <div className="font-medium">Français (France)</div>
          </div>
          <div>
            <div className="text-fg-3">Fuseau horaire</div>
            <div className="font-medium">{general?.timezone ?? "Europe/Paris"}</div>
          </div>
          <div>
            <div className="text-fg-3">Devise</div>
            <div className="font-medium">{general?.currency ?? "EUR"} · {general?.week_start === 0 ? "semaine au dimanche" : "semaine au lundi"}</div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

export default function ProfileTab() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return <ProfileContent user={user} />;
}

function ProfileContent({ user }: { user: User }) {
  const form = useProfileForm(user);
  const v = form.values;
  const role = ROLES.find((r) => r.value === user.role);
  return (
    <div className="space-y-5">
      <TabHeader title="Mon profil" description="Vos informations personnelles, visibles par votre équipe et utilisées dans vos emails." />

      <SettingsCard title="Identité" description="Nom, fonction et couleur qui vous représentent dans Prisme." icon={<UserRound className="size-4" />}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative">
            <Avatar name={v.name || user.name} color={v.color} src={v.avatar_url && !form.errors.avatar_url ? v.avatar_url : null} size={72} className="shadow-[0_14px_34px_-12px_rgba(0,0,0,.55)]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[19px] font-semibold tracking-[-0.02em]">{v.name || user.name}</div>
            <div className="truncate text-[13px] text-fg-2">{v.title || "Fonction non renseignée"}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
              <Badge tone={role?.tone} dot>
                {role?.label ?? user.role}
              </Badge>
              <span>Membre depuis {date(user.created_at, "MMMM yyyy")}</span>
              {user.last_login_at && <span>· dernière connexion {relative(user.last_login_at)}</span>}
            </div>
          </div>
        </div>
        <FormGrid>
          <Field label="Nom complet" required error={form.errors.name}>
            <Input value={v.name ?? ""} onChange={(e) => form.set("name", e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Fonction" hint="Ex. : Directrice commerciale">
            <Input value={v.title ?? ""} onChange={(e) => form.set("title", e.target.value)} autoComplete="organization-title" />
          </Field>
          <Field label="Email de connexion" hint="Pour le modifier, contactez un administrateur.">
            <Input value={user.email} disabled icon={<Mail className="size-4" />} />
          </Field>
          <Field label="Téléphone" error={form.errors.phone}>
            <Input value={v.phone ?? ""} onChange={(e) => form.set("phone", e.target.value)} icon={<Phone className="size-4" />} inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" />
          </Field>
          <Field label="Photo (URL)" hint="Lien vers une image carrée (LinkedIn, Gravatar…). Laissez vide pour afficher vos initiales." error={form.errors.avatar_url} className="sm:col-span-2">
            <Input value={v.avatar_url ?? ""} onChange={(e) => form.set("avatar_url", e.target.value)} placeholder="https://…" inputMode="url" />
          </Field>
          <FieldGroup label="Couleur" hint="Utilisée pour votre avatar, vos événements et vos affectations." className="sm:col-span-2">
            <ColorPicker value={v.color} onChange={(c) => form.set("color", c)} />
          </FieldGroup>
        </FormGrid>
      </SettingsCard>

      <SignatureEditor value={v.signature ?? ""} onChange={(s) => form.set("signature", s)} user={user} />

      <PasswordCard />

      <InterfacePreferences />

      <Callout tone="neutral" icon={<ShieldCheck className="size-4" />}>
        Vos données de compte sont traitées pour la gestion des accès et la traçabilité (journal d'audit). Vous pouvez demander leur rectification à un administrateur.
      </Callout>

      <SaveBar forms={[form]} />
    </div>
  );
}

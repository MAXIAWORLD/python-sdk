import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Copy, Eye, EyeOff, Info, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { EmptyState, Kbd } from "@/components/ui/display";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/fields";
import { api } from "@/lib/api";
import type { Option } from "@/lib/constants";
import { toastError } from "@/lib/hooks";
import { cn, isMac } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import type { AllSettings, KeysOfType, SectionName, SectionValues } from "./types";
import { passwordChecks, passwordClasses, passwordScore } from "./validators";

/* -------------------------------------------------------------------------- */
/* Unsaved changes registry (the page asks before leaving a dirty tab)        */
/* -------------------------------------------------------------------------- */

type DirtyReporter = (key: string, dirty: boolean) => void;
const DirtyContext = createContext<DirtyReporter>(() => {});
export const DirtyProvider = DirtyContext.Provider;

export function useReportDirty(key: string, dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(key, dirty);
  }, [key, dirty, report]);
  useEffect(() => () => report(key, false), [key, report]);
}

/* -------------------------------------------------------------------------- */
/* Settings data                                                              */
/* -------------------------------------------------------------------------- */

export const SETTINGS_KEY = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api.get<AllSettings>("/settings"), staleTime: 60_000 });
}

/** Queries that display values coming from a settings section. */
const RELATED_QUERIES: Partial<Record<SectionName, string[]>> = {
  company: ["public-branding"],
  branding: ["public-branding"],
  rgpd: ["public-branding"],
  ai: ["ai-status"],
  mcp: ["ai-status", "mcp-info"],
};

export type FormErrors<T> = Partial<Record<keyof T, string>>;

/** What the save bar needs to know about a form. */
export interface SaveableForm {
  dirty: boolean;
  saving: boolean;
  changeCount: number;
  save: (opts?: { silent?: boolean }) => Promise<boolean>;
  reset: () => void;
}

export interface SectionForm<T> extends SaveableForm {
  section: SectionName;
  ready: boolean;
  canEdit: boolean;
  server: T | undefined;
  values: T;
  draft: Partial<T>;
  errors: FormErrors<T>;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  unset: (key: keyof T) => void;
}

/**
 * Draft state of one `/settings/{section}`: only the edited keys are kept in the draft
 * and sent on save, so masked secrets are never posted back.
 */
export function useSectionForm<S extends SectionName>(
  section: S,
  options: { validate?: (values: SectionValues<S>) => FormErrors<SectionValues<S>>; onSaved?: (values: SectionValues<S>) => void; role?: "admin" | "manager" } = {},
): SectionForm<SectionValues<S>> {
  type T = SectionValues<S>;
  const { validate, onSaved, role = "admin" } = options;
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { data } = useSettings();
  const server = data?.[section] as T | undefined;
  const stored = server as Partial<Record<keyof T, unknown>> | undefined;
  const [draft, setDraft] = useState<Partial<T>>({});
  const [saving, setSaving] = useState(false);

  const values = useMemo(() => ({ ...(server ?? {}), ...draft }) as T, [server, draft]);
  const changes = useMemo(() => {
    const out: Partial<T> = {};
    for (const key of Object.keys(draft) as (keyof T)[]) {
      if (JSON.stringify(draft[key]) !== JSON.stringify(stored?.[key])) out[key] = draft[key];
    }
    return out;
  }, [draft, stored]);
  const changeCount = Object.keys(changes).length;

  const errors = useMemo(() => {
    const out: FormErrors<T> = server && validate ? validate(values) : {};
    for (const key of Object.keys(changes) as (keyof T)[]) {
      const value = changes[key] as unknown;
      if (typeof stored?.[key] === "number" && (value === null || (typeof value === "number" && Number.isNaN(value)))) out[key] = "Valeur requise.";
    }
    return out;
  }, [server, stored, validate, values, changes]);

  useReportDirty(`settings:${section}`, changeCount > 0);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value })), []);
  const unset = useCallback(
    (key: keyof T) =>
      setDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      }),
    [],
  );
  const reset = useCallback(() => setDraft({}), []);

  const save = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!changeCount) return true;
    const blocking = (Object.keys(changes) as (keyof T)[]).filter((k) => errors[k]);
    if (blocking.length) {
      toast.error("Certains champs sont invalides", { description: errors[blocking[0]] });
      return false;
    }
    setSaving(true);
    try {
      const result = await api.patch<T>(`/settings/${section}`, changes);
      qc.setQueryData<AllSettings>(SETTINGS_KEY, (old) => (old ? { ...old, [section]: result } : old));
      for (const key of RELATED_QUERIES[section] ?? []) qc.invalidateQueries({ queryKey: [key] });
      setDraft({});
      onSaved?.(result);
      if (!silent) toast.success("Modifications enregistrées");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { section, ready: !!server, canEdit: can(user, role), server, values, draft, dirty: changeCount > 0, changeCount, saving, errors, set, unset, reset, save };
}

/* -------------------------------------------------------------------------- */
/* Save bar                                                                   */
/* -------------------------------------------------------------------------- */

/** Floating bar shown while a tab has unsaved changes (⌘S / Ctrl+S to save). */
export function SaveBar({ forms }: { forms: SaveableForm[] }) {
  const dirtyForms = forms.filter((f) => f.dirty);
  const count = dirtyForms.reduce((s, f) => s + f.changeCount, 0);
  const saving = forms.some((f) => f.saving);
  const saveRef = useRef<() => void>(() => {});

  const saveAll = async () => {
    for (const form of dirtyForms) {
      if (!(await form.save({ silent: true }))) return;
    }
    toast.success("Modifications enregistrées");
  };
  useEffect(() => {
    saveRef.current = saveAll;
  });

  const visible = dirtyForms.length > 0;
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 mt-5 lg:bottom-5"
        >
          <div className="glass glass-strong flex max-w-[520px] items-center gap-2 rounded-[20px] py-2 pl-4 pr-2 shadow-[var(--glass-shadow-lg)]">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-400" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {count} modification{count > 1 ? "s" : ""} non enregistrée{count > 1 ? "s" : ""}
            </span>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => dirtyForms.forEach((f) => f.reset())}>
              Annuler
            </Button>
            <Button variant="primary" size="sm" loading={saving} icon={<Check className="size-4" />} onClick={saveAll}>
              Enregistrer
              <Kbd className="ml-0.5 hidden border-white/30 bg-white/15 text-white/90 sm:inline-flex">{isMac() ? "⌘S" : "Ctrl S"}</Kbd>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout blocks                                                              */
/* -------------------------------------------------------------------------- */

/** Scrolls to the element whose id matches the URL hash (deep links such as ?tab=company#branding). */
export function useHashScroll(ready = true) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [ready, hash]);
}

export function TabHeader({ title, description, actions, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-[760px] text-[13.5px] leading-relaxed text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SettingsCard({
  title,
  description,
  icon,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <Glass id={id} className={cn("scroll-mt-28", className)}>
      {(title || actions) && (
        <div className="flex flex-col gap-3 border-b border-[var(--hairline)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex min-w-0 gap-3">
            {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">{icon}</span>}
            <div className="min-w-0">
              {title && <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>}
              {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-3">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--hairline)] px-5 py-3.5 sm:px-6">{footer}</div>}
    </Glass>
  );
}

/** Two-column responsive grid for form fields. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2", className)}>{children}</div>;
}

type Tone = "info" | "warn" | "danger" | "success" | "ai" | "neutral";

const CALLOUT: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "bg-sky-500/[0.08] ring-sky-500/20", icon: "text-sky-600 dark:text-sky-300", Icon: Info },
  warn: { box: "bg-amber-400/[0.12] ring-amber-500/25", icon: "text-amber-600 dark:text-amber-300", Icon: AlertTriangle },
  danger: { box: "bg-red-500/[0.08] ring-red-500/20", icon: "text-red-600 dark:text-red-300", Icon: ShieldAlert },
  success: { box: "bg-emerald-500/[0.08] ring-emerald-500/20", icon: "text-emerald-600 dark:text-emerald-300", Icon: CheckCircle2 },
  ai: { box: "bg-violet-500/[0.08] ring-violet-500/20", icon: "text-[#b26bff]", Icon: Sparkles },
  neutral: { box: "bg-black/[0.03] ring-[var(--hairline)] dark:bg-white/[0.04]", icon: "text-fg-3", Icon: Info },
};

export function Callout({ tone = "info", title, children, icon, action, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  const t = CALLOUT[tone];
  return (
    <div className={cn("flex gap-3 rounded-[16px] px-4 py-3 text-[13px] leading-relaxed ring-1 ring-inset", t.box, className)}>
      <span className={cn("mt-0.5 shrink-0", t.icon)}>{icon ?? <t.Icon className="size-4" />}</span>
      <div className="min-w-0 flex-1 text-fg-2">
        {title && <div className="mb-0.5 font-semibold text-fg">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function ReadOnlyNotice({ role = "admin", children }: { role?: "admin" | "manager"; children?: ReactNode }) {
  return (
    <Callout tone="neutral" icon={<Lock className="size-4" />} title="Lecture seule" className="mb-4">
      {children ?? (role === "admin" ? "Seuls les administrateurs peuvent modifier ces réglages." : "Seuls les managers et les administrateurs peuvent modifier ces réglages.")}
    </Callout>
  );
}

/** Placeholder for content the current role cannot read. */
export function Restricted({ title = "Accès réservé aux administrateurs", description = "Demandez à un administrateur de votre organisation si vous avez besoin de modifier ces réglages." }: { title?: string; description?: string }) {
  return (
    <Glass>
      <EmptyState icon={<Lock className="size-6" />} title={title} description={description} />
    </Glass>
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields bound to a section form                                        */
/* -------------------------------------------------------------------------- */

interface BaseFieldProps<T, K> {
  form: SectionForm<T>;
  name: K;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

export function TextField<T>({
  form,
  name,
  label,
  hint,
  required,
  className,
  placeholder,
  icon,
  suffix,
  type = "text",
  normalize,
  inputMode,
  maxLength,
  autoComplete,
}: BaseFieldProps<T, KeysOfType<T, string>> & {
  placeholder?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  type?: string;
  normalize?: (v: string) => string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  autoComplete?: string;
}) {
  const value = (form.values[name] as string | null | undefined) ?? "";
  return (
    <Field label={label} hint={hint} error={form.errors[name]} required={required} className={className}>
      <Input
        type={type}
        value={value}
        onChange={(e) => form.set(name, (normalize ? normalize(e.target.value) : e.target.value) as T[typeof name])}
        placeholder={placeholder}
        icon={icon}
        suffix={suffix}
        disabled={!form.canEdit}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={!!form.errors[name]}
      />
    </Field>
  );
}

export function TextareaField<T>({ form, name, label, hint, required, className, placeholder, rows = 3 }: BaseFieldProps<T, KeysOfType<T, string>> & { placeholder?: string; rows?: number }) {
  return (
    <Field label={label} hint={hint} error={form.errors[name]} required={required} className={className}>
      <Textarea value={(form.values[name] as string | null | undefined) ?? ""} onChange={(e) => form.set(name, e.target.value as T[typeof name])} placeholder={placeholder} rows={rows} disabled={!form.canEdit} />
    </Field>
  );
}

export function NumberField<T>({ form, name, label, hint, required, className, suffix, min, step = 1, placeholder }: BaseFieldProps<T, KeysOfType<T, number>> & { suffix?: ReactNode; min?: number; step?: number; placeholder?: string }) {
  const value = form.values[name] as number | null | undefined;
  return (
    <Field label={label} hint={hint} error={form.errors[name]} required={required} className={className}>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value === null || value === undefined ? "" : value}
        onChange={(e) => form.set(name, (e.target.value === "" ? null : Number(e.target.value)) as T[typeof name])}
        suffix={suffix}
        placeholder={placeholder}
        disabled={!form.canEdit}
        className="tabular"
        aria-invalid={!!form.errors[name]}
      />
    </Field>
  );
}

export function SelectField<T>({ form, name, label, hint, required, className, options, placeholder }: BaseFieldProps<T, KeysOfType<T, string>> & { options: (Option | string)[]; placeholder?: string }) {
  return (
    <Field label={label} hint={hint} error={form.errors[name]} required={required} className={className}>
      <Select options={options} value={(form.values[name] as string | undefined) ?? ""} onChange={(v) => form.set(name, v as T[typeof name])} placeholder={placeholder} disabled={!form.canEdit} />
    </Field>
  );
}

export function SwitchField<T>({ form, name, label, description, className }: { form: SectionForm<T>; name: KeysOfType<T, boolean>; label: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Switch checked={!!form.values[name]} onChange={(v) => form.set(name, v as T[typeof name])} label={label} description={description} disabled={!form.canEdit} />
    </div>
  );
}

/** Password-type input with a visibility toggle. */
export function PasswordInput({ value, onChange, placeholder, disabled, autoComplete = "new-password", className, invalid }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; autoComplete?: string; className?: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        spellCheck={false}
        className={cn(
          "h-10 w-full rounded-[12px] bg-[var(--field)] pl-3 pr-10 text-[14px] text-fg outline-none ring-1 ring-inset ring-[var(--hairline-strong)] transition-[box-shadow,background-color] placeholder:text-fg-3 hover:bg-[var(--field-hover)] focus:bg-[var(--field-hover)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_65%,transparent)] disabled:opacity-60",
          invalid && "ring-red-500/60",
        )}
      />
      <button type="button" onClick={() => setShow((s) => !s)} disabled={disabled} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[9px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label={show ? "Masquer" : "Afficher"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/**
 * Write-only secret (SMTP password, platform API key…): the stored value is never shown,
 * only whether it is set. Typing replaces it; « Supprimer » clears it on save.
 */
export function SecretField<T>({ form, name, label, hint, placeholder = "Non renseigné", className }: { form: SectionForm<T>; name: KeysOfType<T, string | null>; label: ReactNode; hint?: ReactNode; placeholder?: string; className?: string }) {
  const isSet = Boolean(form.server?.[`${String(name)}_set` as keyof T]);
  const masked = form.server?.[name] as string | null | undefined;
  const touched = name in form.draft;
  const draftValue = (form.draft[name] as string | null | undefined) ?? "";
  const willClear = touched && draftValue === "";
  return (
    <Field
      label={label}
      hint={willClear ? <span className="text-red-500">Le secret enregistré sera supprimé à l'enregistrement.</span> : hint}
      className={className}
      action={
        form.canEdit && isSet ? (
          willClear ? (
            <button type="button" onClick={() => form.unset(name)} className="text-[12px] font-medium text-accent">
              Conserver
            </button>
          ) : (
            <button type="button" onClick={() => form.set(name, "" as T[typeof name])} className="text-[12px] font-medium text-red-500">
              Supprimer
            </button>
          )
        ) : undefined
      }
    >
      <PasswordInput
        value={touched ? draftValue : ""}
        onChange={(v) => (v ? form.set(name, v as T[typeof name]) : form.unset(name))}
        placeholder={willClear ? "Sera supprimé" : isSet ? `Enregistré ${masked ?? "••••"} — saisissez pour remplacer` : placeholder}
        disabled={!form.canEdit}
      />
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/* Choice cards, colors, passwords                                            */
/* -------------------------------------------------------------------------- */

export interface Choice<V extends string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}

/** Radio group rendered as selectable glass cards. */
export function ChoiceCards<V extends string>({ options, value, onChange, disabled, className }: { options: Choice<V>[]; value: V; onChange: (v: V) => void; disabled?: boolean; className?: string }) {
  return (
    <div role="radiogroup" className={cn("grid gap-2.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-[16px] px-3.5 py-3 text-left ring-1 ring-inset transition-[background-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-accent-soft ring-2 ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]" : "ring-[var(--hairline-strong)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
            )}
          >
            <span className="flex w-full items-center gap-2">
              {o.icon && <span className={cn("shrink-0", active ? "text-accent" : "text-fg-3")}>{o.icon}</span>}
              <span className="flex-1 text-[13.5px] font-semibold">{o.label}</span>
              {o.badge}
              <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition", active ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] ring-transparent" : "ring-[var(--hairline-strong)]")}>
                {active && <Check className="size-3 text-white" strokeWidth={3} />}
              </span>
            </span>
            {o.description && <span className="text-[12.5px] leading-snug text-fg-2">{o.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const SWATCHES = ["#5b6cff", "#6366f1", "#8b5cf6", "#bf5af2", "#ec4899", "#ff375f", "#f97316", "#ff9f0a", "#eab308", "#10b981", "#30d5c8", "#06b6d4", "#0a84ff", "#64748b"];

const sameColor = (a?: string | null, b?: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

export function ColorPicker({ value, onChange, disabled, colors = SWATCHES, withHex }: { value?: string | null; onChange: (v: string) => void; disabled?: boolean; colors?: string[]; withHex?: boolean }) {
  const custom = !!value && !colors.some((c) => sameColor(c, value));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c)}
          aria-label={`Couleur ${c}`}
          className={cn("relative size-7 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.35)] transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-60", sameColor(c, value) && "ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-[var(--bg)]")}
          style={{ background: c }}
        >
          {sameColor(c, value) && <Check className="absolute inset-0 m-auto size-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
      <label
        title="Couleur personnalisée"
        className={cn("relative size-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-inset ring-[var(--hairline-strong)]", custom && "ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-[var(--bg)]", disabled && "pointer-events-none opacity-60")}
        style={{ background: custom ? value ?? undefined : "conic-gradient(#ff375f, #ff9f0a, #eab308, #30d158, #06b6d4, #5b6cff, #bf5af2, #ff375f)" }}
      >
        <input type="color" value={value || "#5b6cff"} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Couleur personnalisée" />
      </label>
      {withHex && (
        <Input
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v.startsWith("#") ? v : `#${v}`);
          }}
          maxLength={7}
          disabled={disabled}
          className="w-[104px] font-mono text-[13px] uppercase"
          aria-label="Code couleur hexadécimal"
        />
      )}
    </div>
  );
}

export const isHexColor = (v?: string | null) => !!v && /^#[0-9a-f]{6}$/i.test(v);

const STRENGTH = [
  { label: "", bar: "" },
  { label: "Faible", bar: "bg-red-400" },
  { label: "Moyen", bar: "bg-amber-400" },
  { label: "Bon", bar: "bg-emerald-500" },
  { label: "Excellent", bar: "bg-emerald-500" },
];

/** Strength gauge + CNIL checklist (12 characters, 3 character types). */
export function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  const checks = passwordChecks(password);
  const classes = passwordClasses(password);
  const rules = [
    { ok: checks.length, label: "12 caractères" },
    { ok: checks.lower, label: "minuscule" },
    { ok: checks.upper, label: "majuscule" },
    { ok: checks.digit, label: "chiffre" },
    { ok: checks.symbol, label: "symbole" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= score ? STRENGTH[score].bar : "bg-black/10 dark:bg-white/10")} />
          ))}
        </div>
        <span className="w-[72px] text-right text-[12px] font-semibold text-fg-2">{STRENGTH[score].label || "—"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {rules.map((r) => (
          <span key={r.label} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition-colors", r.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-black/[0.05] text-fg-3 dark:bg-white/[0.07]")}>
            {r.ok ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1 rounded-full bg-current" />}
            {r.label}
          </span>
        ))}
      </div>
      <p className="text-[11.5px] text-fg-3">Recommandation CNIL : au moins 12 caractères mêlant 3 types parmi minuscules, majuscules, chiffres et symboles{password ? ` (${Math.min(classes, 4)} type${classes > 1 ? "s" : ""} utilisé${classes > 1 ? "s" : ""})` : ""}.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Clipboard                                                                  */
/* -------------------------------------------------------------------------- */

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async (text: string) => {
    if (await copyText(text)) {
      setCopied(true);
      toast.success("Copié dans le presse-papiers");
    } else toast.error("Copie impossible : sélectionnez le texte manuellement.");
  };
  return { copied, copy };
}

export function CopyButton({ value, label = "Copier", size = "sm", variant = "glass", className }: { value: string; label?: string; size?: "xs" | "sm" | "md"; variant?: "glass" | "ghost" | "primary" | "subtle"; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <Button type="button" size={size} variant={variant} className={className} icon={copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />} onClick={() => copy(value)}>
      {copied ? "Copié" : label}
    </Button>
  );
}

/** Dark code panel with a copy button (configuration snippets, commands). */
export function CodeBlock({ code, label, className }: { code: string; label?: ReactNode; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className={cn("overflow-hidden rounded-[16px] bg-[#0b0e1a] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] dark:bg-black/45", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] py-1.5 pl-3.5 pr-1.5">
        <span className="truncate text-[11.5px] font-medium text-white/55">{label}</span>
        <button type="button" onClick={() => copy(code)} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-[#e5e7ff]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** One-time secret display (API token, webhook secret). */
export function SecretReveal({ value, title, children }: { value: string; title: ReactNode; children?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[18px] bg-emerald-500/[0.08] p-4 ring-1 ring-inset ring-emerald-500/25">
      <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-4" />
        {title}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="glass-inset min-w-0 flex-1 select-all break-all rounded-[12px] px-3 py-2.5 font-mono text-[12.5px]">{value}</code>
        <CopyButton value={value} variant="primary" className="shrink-0" />
      </div>
      {children && <div className="mt-2.5 text-[12.5px] text-fg-2">{children}</div>}
    </motion.div>
  );
}

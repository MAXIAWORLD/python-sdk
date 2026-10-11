import { ArrowRight, Check, ChevronDown, ExternalLink, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Checkbox as RCheckbox } from "radix-ui";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/display";
import { fieldBase } from "@/components/ui/fields";
import { ApiError } from "@/lib/api";
import type { FormField } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AUTOCOMPLETE, CONSENT_LABEL, layoutSpans, safeRedirect, validateField } from "./form-utils";
import { SuccessMark } from "./ui";

export interface RenderableForm {
  title: string;
  description?: string | null;
  fields: FormField[];
  submit_label: string;
  notice?: string | null;
  consent_label?: string | null;
}

export interface FormPrivacy {
  privacyUrl?: string | null;
  dpoEmail?: string | null;
}

export interface SubmitPayload {
  values: Record<string, string>;
  consent: boolean;
  _hp: string;
}

export interface SubmitResult {
  message: string;
  redirect_url?: string | null;
}

type Values = Record<string, string | boolean>;

/** Inputs sized for touch: 16 px text on mobile prevents the iOS zoom on focus. */
const input = cn(fieldBase, "h-12 rounded-[14px] px-4 text-[16px] @lg:text-[15px]");

function submitError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 429) return "Trop de tentatives en peu de temps. Merci de réessayer dans quelques minutes.";
    if (e.status === 404) return "Ce formulaire n'est plus disponible.";
    if (e.status === 422) return e.message;
  }
  if (e instanceof TypeError) return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
  return "Une erreur est survenue, votre demande n'a pas été envoyée. Merci de réessayer.";
}

function FieldInput({ field, id, value, invalid, describedBy, onChange, onBlur }: { field: FormField; id: string; value: string | boolean | undefined; invalid: boolean; describedBy?: string; onChange: (v: string | boolean) => void; onBlur: () => void }) {
  const common = { id, name: field.name, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, onBlur, required: field.required };
  const ring = invalid && "ring-2 ring-red-500/60 focus:ring-red-500/70";
  switch (field.type) {
    case "textarea":
      return <textarea {...common} rows={5} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={cn(fieldBase, "resize-y rounded-[14px] px-4 py-3 text-[16px] leading-relaxed @lg:text-[15px]", ring)} />;
    case "select":
      return (
        <div className="relative">
          <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={cn(input, "appearance-none pr-10", !value && "text-fg-3", ring)}>
            <option value="">{field.placeholder || "Sélectionnez…"}</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o} className="bg-[var(--glass-solid)] text-fg">
                {o}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        </div>
      );
    case "checkbox":
      return (
        <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-[14px] px-1 py-1", invalid && "text-red-600 dark:text-red-400")}>
          <RCheckbox.Root
            id={id}
            checked={!!value}
            onCheckedChange={(v) => onChange(v === true)}
            onBlur={onBlur}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn("mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[7px] ring-1 ring-inset transition-colors", value ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] ring-transparent" : "bg-[var(--field)] ring-[var(--hairline-strong)]", invalid && !value && "ring-2 ring-red-500/60")}
          >
            <RCheckbox.Indicator>
              <Check className="size-4 text-white" strokeWidth={3} />
            </RCheckbox.Indicator>
          </RCheckbox.Root>
          <span className="text-[15px] leading-snug">
            {field.label}
            {field.required && <span className="text-accent"> *</span>}
          </span>
        </label>
      );
    default:
      return (
        <input
          {...common}
          type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
          inputMode={field.type === "email" ? "email" : field.type === "tel" ? "tel" : undefined}
          autoComplete={AUTOCOMPLETE[field.map_to ?? ""] ?? (field.type === "email" ? "email" : field.type === "tel" ? "tel" : "off")}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cn(input, ring)}
        />
      );
  }
}

/** Data-protection notice (art. 13 RGPD): controller, purpose, rights, privacy policy, DPO. */
function PrivacyNotice({ notice, privacy }: { notice?: string | null; privacy?: FormPrivacy }) {
  if (!notice && !privacy?.privacyUrl && !privacy?.dpoEmail) return null;
  return (
    <div className="rounded-[16px] bg-black/[0.025] p-3.5 text-[12px] leading-relaxed text-fg-3 dark:bg-white/[0.035]">
      <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-2">
        <ShieldCheck className="size-3.5 text-accent" /> Protection de vos données
      </div>
      {notice && <p>{notice}</p>}
      {!/cnil/i.test(notice ?? "") && <p className="mt-1">Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).</p>}
      {(privacy?.privacyUrl || privacy?.dpoEmail) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {privacy?.privacyUrl && (
            <a href={privacy.privacyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              Politique de confidentialité <ExternalLink className="size-3" />
            </a>
          )}
          {privacy?.dpoEmail && (
            <a href={`mailto:${privacy.dpoEmail}`} className="font-medium text-fg-2 hover:text-fg hover:underline">
              Délégué à la protection des données : {privacy.dpoEmail}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A lead-capture form exactly as visitors see it — used by the public page and the builder preview
 * (where submitting only simulates the success screen). Layout follows its container width.
 */
export function LeadFormRenderer({ form, privacy, mode, onSubmit, previewMessage }: { form: RenderableForm; privacy?: FormPrivacy; mode: "public" | "preview"; onSubmit?: (p: SubmitPayload) => Promise<SubmitResult>; previewMessage?: string }) {
  const prefix = useId();
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [phase, setPhase] = useState<"form" | "submitting" | "done">("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const spans = useMemo(() => layoutSpans(form.fields), [form.fields]);
  const redirect = mode === "public" ? safeRedirect(result?.redirect_url) : null;
  const Title = mode === "public" ? "h1" : "h2";

  useEffect(() => {
    if (phase !== "done" || !redirect) return;
    const t = setTimeout(() => {
      try {
        if (window.top && window.top !== window.self) window.top.location.href = redirect;
        else window.location.assign(redirect);
      } catch {
        window.location.assign(redirect);
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [phase, redirect]);

  const setValue = (field: FormField, v: string | boolean) => {
    setValues((s) => ({ ...s, [field.name]: v }));
    if (errors[field.name] && !validateField(field, v)) setErrors(({ [field.name]: _gone, ...rest }) => rest);
  };

  const touch = (field: FormField) => {
    const err = validateField(field, values[field.name]);
    const filled = values[field.name] !== undefined && values[field.name] !== "";
    if (err && filled) setErrors((s) => ({ ...s, [field.name]: err }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    for (const f of form.fields) {
      const err = validateField(f, values[f.name]);
      if (err) found[f.name] = err;
    }
    setErrors(found);
    const first = form.fields.find((f) => found[f.name]);
    if (first) {
      document.getElementById(`${prefix}-${first.name}`)?.focus();
      return;
    }
    const payload: SubmitPayload = {
      values: Object.fromEntries(form.fields.map((f) => [f.name, f.type === "checkbox" ? (values[f.name] ? "Oui" : "") : String(values[f.name] ?? "").trim()])),
      consent,
      _hp: hp,
    };
    if (mode === "preview" || !onSubmit) {
      setResult({ message: previewMessage || "Merci !" });
      setPhase("done");
      return;
    }
    setPhase("submitting");
    setServerError(null);
    try {
      setResult(await onSubmit(payload));
      setPhase("done");
    } catch (err) {
      setServerError(submitError(err));
      setPhase("form");
    }
  };

  const reset = () => {
    setValues({});
    setErrors({});
    setConsent(false);
    setResult(null);
    setPhase("form");
  };

  return (
    <div className="@container">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "done" && result ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 240, damping: 24 }} className="flex flex-col items-center px-2 py-10 text-center" role="status" aria-live="polite">
            <SuccessMark size={92} />
            <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-6 max-w-[460px] text-balance text-[22px] font-semibold leading-snug tracking-[-0.02em] @lg:text-[24px]">
              {result.message}
            </motion.h2>
            {consent && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-2 max-w-[420px] text-[13.5px] text-fg-2">
                Votre accord pour recevoir nos informations est enregistré. Chaque email contiendra un lien pour vous désinscrire.
              </motion.p>
            )}
            {redirect && (
              <p className="mt-5 inline-flex items-center gap-2 text-[13px] text-fg-3">
                <Spinner className="size-4" /> Redirection en cours…
              </p>
            )}
            {mode === "preview" && (
              <Button variant="glass" size="sm" className="mt-6" icon={<RotateCcw className="size-3.5" />} onClick={reset}>
                Revenir au formulaire
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} onSubmit={submit} noValidate className="relative">
            <div className="mb-6">
              <Title className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.03em] @lg:text-[30px]">{form.title || "Formulaire"}</Title>
              {form.description && <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{form.description}</p>}
            </div>

            {form.fields.length === 0 ? (
              <p className="rounded-[14px] border border-dashed border-[var(--hairline-strong)] px-4 py-8 text-center text-[13.5px] text-fg-3">Ajoutez des champs pour construire votre formulaire.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-3 gap-y-4 @lg:grid-cols-2">
                {form.fields.map((f, i) => {
                  const id = `${prefix}-${f.name}`;
                  const errorId = `${id}-error`;
                  const error = errors[f.name];
                  return (
                    <div key={`${f.name}-${i}`} className={cn(spans[i] === "full" && "@lg:col-span-2")}>
                      {f.type !== "checkbox" && (
                        <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-medium text-fg-2">
                          {f.label || "Sans titre"}
                          {f.required ? <span className="text-accent"> *</span> : <span className="font-normal text-fg-3"> (facultatif)</span>}
                        </label>
                      )}
                      <FieldInput field={f} id={id} value={values[f.name]} invalid={!!error} describedBy={error ? errorId : undefined} onChange={(v) => setValue(f, v)} onBlur={() => touch(f)} />
                      <AnimatePresence initial={false}>
                        {error && (
                          <motion.p id={errorId} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="mt-1.5 text-[12.5px] font-medium text-red-600 dark:text-red-400">
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Honeypot: invisible to humans, filled by bots. */}
            <div aria-hidden="true" className="absolute -left-[10000px] top-0 size-px overflow-hidden">
              <label htmlFor={`${prefix}-hp`}>Ne pas remplir ce champ</label>
              <input id={`${prefix}-hp`} name="website" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[16px] bg-black/[0.03] p-3.5 ring-1 ring-inset ring-[var(--hairline)] transition hover:bg-black/[0.045] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]">
              <RCheckbox.Root
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className={cn("mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[7px] ring-1 ring-inset transition-colors", consent ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] ring-transparent" : "bg-[var(--field)] ring-[var(--hairline-strong)]")}
              >
                <RCheckbox.Indicator>
                  <Check className="size-4 text-white" strokeWidth={3} />
                </RCheckbox.Indicator>
              </RCheckbox.Root>
              <span className="text-[13.5px] leading-snug text-fg-2">
                {form.consent_label || CONSENT_LABEL} <span className="text-fg-3">(facultatif)</span>
              </span>
            </label>

            <AnimatePresence>
              {serverError && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-4 flex items-start gap-2.5 rounded-[14px] bg-red-500/[0.08] px-3.5 py-3 text-[13.5px] text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {serverError}
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" disabled={phase === "submitting"} className="btn-primary group mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-[15.5px] font-semibold transition active:scale-[0.99] disabled:opacity-70">
              {phase === "submitting" ? <Spinner className="size-5" /> : null}
              {phase === "submitting" ? "Envoi en cours…" : form.submit_label || "Envoyer"}
              {phase !== "submitting" && <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />}
            </button>
            {form.fields.some((f) => f.required) && <p className="mt-2 text-center text-[11.5px] text-fg-3">Les champs marqués d'un astérisque (*) sont obligatoires.</p>}

            <div className="mt-5">
              <PrivacyNotice notice={form.notice} privacy={privacy} />
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

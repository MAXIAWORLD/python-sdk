import { ArrowLeft, ArrowRight, Building2, Check, Database, Lock, Mail, Sparkles, User as UserIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { AuthLayout } from "./Login";

function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

export default function Setup() {
  const navigate = useNavigate();
  const { set, setupRequired, ready, user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "", company_name: "", load_demo: true });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (ready && !setupRequired) return <Navigate to={user ? "/" : "/login"} replace />;

  const score = passwordScore(form.password);
  const canNext = step === 0 ? form.company_name.trim().length > 1 : step === 1 ? form.name.trim() && form.email.includes("@") && score >= 3 && form.password.length >= 12 : true;

  const finish = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ user: User }>("/auth/setup", form);
      set({ user: res.user, setupRequired: false });
      navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Entreprise", "Compte admin", "Démarrage"];

  return (
    <AuthLayout>
      <div className="glass glass-strong rounded-[30px] p-7 shadow-[var(--glass-shadow-lg)]">
        <div className="mb-6 flex items-center gap-2">
          {steps.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition", i < step ? "bg-emerald-500 text-white" : i === step ? "btn-primary" : "bg-black/5 text-fg-3 dark:bg-white/10")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
              <span className={cn("hidden text-[12.5px] font-medium sm:block", i === step ? "text-fg" : "text-fg-3")}>{label}</span>
              {i < steps.length - 1 && <span className="h-px flex-1 bg-[var(--hairline-strong)]" />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Bienvenue dans Prisme ✨</h2>
                  <p className="mt-1 text-[14px] text-fg-2">Configurons votre espace en 1 minute.</p>
                </div>
                <Field label="Nom de votre entreprise" required>
                  <Input autoFocus value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} icon={<Building2 className="size-4" />} placeholder="Ex. Nova Studio" />
                </Field>
                <p className="text-[12.5px] text-fg-3">Les mentions légales (SIREN, TVA, adresse…) se complètent ensuite dans Paramètres › Entreprise avant d'émettre votre première facture.</p>
              </div>
            )}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Votre compte administrateur</h2>
                  <p className="mt-1 text-[14px] text-fg-2">Vous pourrez inviter votre équipe ensuite.</p>
                </div>
                <Field label="Nom complet" required>
                  <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} icon={<UserIcon className="size-4" />} placeholder="Prénom Nom" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} icon={<Mail className="size-4" />} placeholder="vous@entreprise.fr" />
                </Field>
                <Field label="Mot de passe" required hint="12 caractères minimum, avec majuscules, minuscules, chiffres ou symboles (recommandations CNIL).">
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} icon={<Lock className="size-4" />} />
                </Field>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < score ? (score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-amber-400" : "bg-red-400") : "bg-black/10 dark:bg-white/10")} />
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Comment voulez-vous démarrer ?</h2>
                  <p className="mt-1 text-[14px] text-fg-2">Vous pourrez tout modifier plus tard.</p>
                </div>
                <div className="glass-inset rounded-[18px] p-4">
                  <Switch
                    checked={form.load_demo}
                    onChange={(v) => setForm({ ...form, load_demo: v })}
                    label={
                      <span className="flex items-center gap-2">
                        <Database className="size-4 text-accent" /> Charger des données de démonstration
                      </span>
                    }
                    description="Clients, pipeline, devis, factures, abonnements, projets et tickets fictifs pour explorer toutes les fonctionnalités."
                  />
                </div>
                <div className="glass-inset flex items-start gap-3 rounded-[18px] p-4 text-[13px] text-fg-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#b26bff]" />
                  <span>Ensuite : connectez une IA (clé API Claude, OpenAI, Mistral… ou Ollama en local) et/ou votre abonnement Claude via MCP, depuis Paramètres › Intelligence artificielle.</span>
                </div>
                {error && <div className="rounded-[12px] bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-300">{error}</div>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} icon={<ArrowLeft className="size-4" />}>
            Retour
          </Button>
          {step < 2 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)} iconRight={<ArrowRight className="size-4" />}>
              Continuer
            </Button>
          ) : (
            <Button variant="primary" loading={loading} onClick={finish} iconRight={<Sparkles className="size-4" />}>
              Lancer Prisme
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}

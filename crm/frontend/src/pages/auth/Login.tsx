import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Backdrop } from "@/components/glass/Backdrop";
import { LogoMark } from "@/components/layout/Logo";
import { Scene3D } from "@/components/three/Scene3D";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { useAuth } from "@/stores/auth";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = useAuth((s) => s.branding);
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Backdrop variant="auth" />
      <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 items-center gap-8 px-5 py-10 lg:grid-cols-[1.15fr_1fr] lg:px-10">
        <div className="relative hidden lg:flex lg:flex-col">
          <div className="relative h-[440px]">
            <Scene3D className="absolute inset-0" />
          </div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative z-10 -mt-6 pl-4 pr-10">
            <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.035em]">
              Le CRM qui <span className="text-iridescent">pense avec vous</span>.
            </h1>
            <p className="mt-3 max-w-[460px] text-[15px] text-fg-2">Ventes, facturation conforme, abonnements, projets, support et marketing — pilotés par une IA qui agit pour vous.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
              {[
                { icon: Sparkles, label: "IA multi-modèles & Claude via MCP" },
                { icon: ShieldCheck, label: "Factur-X, RGPD, FEC" },
                { icon: Zap, label: "Automatisations temps réel" },
              ].map((f) => (
                <span key={f.label} className="glass-flat inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-fg-2">
                  <f.icon className="size-3.5 text-accent" />
                  {f.label}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 160, damping: 22 }} className="mx-auto w-full max-w-[440px]">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={44} />
            <div>
              <div className="text-[20px] font-semibold tracking-[-0.02em]">{branding.app_name || "Prisme"}</div>
              <div className="text-[12px] text-fg-3">{branding.company || "CRM tout-en-un avec IA"}</div>
            </div>
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { set, user, setupRequired, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (ready && setupRequired) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to={params.get("next") || "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ user: User }>("/auth/login", { email, password });
      set({ user: res.user });
      navigate(params.get("next") || "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="glass glass-strong rounded-[30px] p-7 shadow-[var(--glass-shadow-lg)]">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Bon retour 👋</h2>
        <p className="mt-1 text-[14px] text-fg-2">Connectez-vous à votre espace.</p>
        <div className="mt-6 space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} icon={<Mail className="size-4" />} placeholder="vous@entreprise.fr" />
          </Field>
          <Field label="Mot de passe">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} icon={<Lock className="size-4" />} placeholder="••••••••••••" />
          </Field>
          {error && <div className="rounded-[12px] bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-300">{error}</div>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} iconRight={<ArrowRight className="size-4" />}>
            Se connecter
          </Button>
        </div>
        <p className="mt-5 text-center text-[12px] text-fg-3">Mot de passe oublié ? Un administrateur peut le réinitialiser depuis Paramètres › Équipe.</p>
      </form>
    </AuthLayout>
  );
}

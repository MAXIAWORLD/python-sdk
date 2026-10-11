import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Link2Off, MailX, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { PublicLayout, usePublicBranding, type PublicBranding } from "@/components/layout/PublicLayout";
import { SuccessMark } from "@/components/marketing/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { api, ApiError } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/hooks";

interface UnsubscribeInfo {
  valid: boolean;
  email?: string | null;
  branding?: PublicBranding;
}

function Icon({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return <span className={`glass mx-auto flex size-16 items-center justify-center rounded-[20px] ${tone === "accent" ? "text-accent" : "text-fg-3"}`}>{children}</span>;
}

export default function Unsubscribe() {
  const { token = "" } = useParams();
  const { data: brand } = usePublicBranding();
  const isTest = token === "test";
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-unsubscribe", token],
    queryFn: () => api.get<UnsubscribeInfo>(`/public/unsubscribe/${encodeURIComponent(token)}`),
    enabled: !isTest,
    retry: false,
  });
  const branding = brand ?? data?.branding;
  const company = branding?.company || "notre entreprise";
  const contact = branding?.dpo_email || branding?.email;
  const [doneAt, setDoneAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Désinscription${branding?.company ? ` — ${branding.company}` : ""}`;
  }, [branding?.company]);

  const confirm = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await api.post(`/public/unsubscribe/${encodeURIComponent(token)}`);
      setDoneAt(new Date());
    } catch (e) {
      setFailure(e instanceof ApiError && e.status === 404 ? "Ce lien de désinscription n'est plus valide." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const state = isTest ? "test" : isLoading ? "loading" : doneAt ? "done" : error || !data?.valid ? "invalid" : "confirm";

  return (
    <PublicLayout width="sm">
      <Glass variant="strong" radius="xl" glow className="px-6 py-9 text-center sm:px-9">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={state} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
            {state === "loading" && (
              <div className="space-y-4">
                <Skeleton className="mx-auto size-16 rounded-[20px]" />
                <Skeleton className="mx-auto h-7 w-56" />
                <Skeleton className="mx-auto h-4 w-72" />
                <Skeleton className="mx-auto h-12 w-full rounded-[16px]" />
              </div>
            )}

            {state === "confirm" && (
              <>
                <Icon>
                  <MailX className="size-7" />
                </Icon>
                <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.025em]">Se désinscrire</h1>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
                  Vous ne recevrez plus les emails marketing de {company} à l'adresse
                  <br />
                  <span className="font-semibold text-fg">{data?.email}</span>.
                </p>
                {failure && <p className="mt-4 rounded-[14px] bg-red-500/[0.08] px-3.5 py-2.5 text-[13.5px] text-red-700 dark:text-red-300">{failure}</p>}
                <Button variant="primary" size="lg" className="mt-6 w-full" loading={busy} onClick={confirm}>
                  Confirmer la désinscription
                </Button>
                <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">Les messages liés à vos commandes, factures ou demandes en cours ne sont pas concernés.</p>
              </>
            )}

            {state === "done" && doneAt && (
              <>
                <SuccessMark size={84} tone="#10b981" />
                <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.025em]">C'est fait</h1>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-2">Vous ne recevrez plus nos emails marketing.</p>
                <p className="mt-1 text-[12.5px] text-fg-3">Désinscription enregistrée le {dateTime(doneAt)}. Vous pouvez fermer cette page.</p>
                <div className="mt-6 flex items-start gap-2.5 rounded-[16px] bg-black/[0.03] p-3.5 text-left text-[12.5px] leading-relaxed text-fg-3 dark:bg-white/[0.04]">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Votre opposition est inscrite dans notre registre des consentements. {contact ? `Pour toute question sur vos données : ${contact}.` : ""}</span>
                </div>
              </>
            )}

            {state === "invalid" && (
              <>
                <Icon tone="muted">
                  <Link2Off className="size-7" />
                </Icon>
                <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Lien invalide ou expiré</h1>
                <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">
                  Nous ne retrouvons pas ce lien de désinscription.
                  {contact ? (
                    <>
                      {" "}
                      Pour ne plus recevoir nos emails, écrivez-nous à{" "}
                      <a href={`mailto:${contact}?subject=${encodeURIComponent("Désinscription")}`} className="font-medium text-accent hover:underline">
                        {contact}
                      </a>{" "}
                      : votre demande sera traitée sans délai.
                    </>
                  ) : (
                    " Utilisez le lien présent dans le dernier email reçu, ou contactez-nous directement."
                  )}
                </p>
              </>
            )}

            {state === "test" && (
              <>
                <Icon>
                  <FlaskConical className="size-7" />
                </Icon>
                <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Lien de test</h1>
                <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">Ce lien provient d'un email de test : aucune désinscription n'est enregistrée. Dans les emails réels, chaque destinataire dispose de son propre lien, actif en un clic.</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </Glass>
    </PublicLayout>
  );
}

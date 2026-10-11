import { FlaskConical, ListChecks, Send, Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Panel } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { time } from "@/lib/format";
import { errorMessage } from "@/lib/hooks";
import { Callout, SuccessMark } from "../ui";
import { PreflightList, type Check, type StepKey } from "./Preflight";

export function SmtpWarning({ smtp }: { smtp: boolean | null }) {
  const navigate = useNavigate();
  if (smtp !== false) return null;
  return (
    <Callout
      tone="warning"
      title="L'envoi d'emails n'est pas configuré"
      action={
        <Button size="sm" icon={<Settings2 className="size-3.5" />} onClick={() => navigate("/settings?tab=email")}>
          Configurer
        </Button>
      }
    >
      Renseignez votre serveur SMTP dans Paramètres › Emails pour envoyer des tests et des campagnes.
    </Callout>
  );
}

export function TestStep({ campaignId, defaultTo, smtp, checks, tested, canTest, flush, onTested, onGo }: { campaignId: number; defaultTo: string; smtp: boolean | null; checks: Check[]; tested: string | null; canTest: boolean; flush: () => Promise<boolean>; onTested: (to: string) => void; onGo: (s: StepKey) => void }) {
  const [to, setTo] = useState(defaultTo);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const send = async () => {
    if (!valid) return;
    setSending(true);
    setError(null);
    try {
      if (!(await flush())) return;
      await api.post(`/campaigns/${campaignId}/test`, { to: to.trim() });
      setSentAt(new Date());
      onTested(to.trim());
      toast.success("Email de test envoyé", { description: `Vérifiez la boîte de réception de ${to.trim()}.` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel title="Envoyer un email de test" icon={<FlaskConical className="size-4" />} description="Recevez la campagne exactement comme vos contacts la recevront.">
        <div className="space-y-4">
          <SmtpWarning smtp={smtp} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Adresse de réception" error={to && !valid ? "Adresse email invalide" : null}>
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="vous@entreprise.fr" />
            </Field>
            <Button variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={!valid || !canTest} onClick={send} className="sm:mb-px">
              Envoyer le test
            </Button>
          </div>
          {!canTest && <p className="text-[12.5px] text-fg-3">Votre rôle (lecteur) ne permet pas d'envoyer de test.</p>}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div key="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Callout tone="danger" title="Le test n'a pas pu être envoyé">
                  {error}
                </Callout>
              </motion.div>
            ) : tested ? (
              <motion.div key={`ok-${sentAt?.getTime() ?? 0}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center rounded-[18px] bg-black/[0.025] px-4 py-6 text-center dark:bg-white/[0.035]">
                <SuccessMark size={64} tone="#10b981" />
                <div className="mt-3 text-[15px] font-semibold">Test envoyé à {tested}</div>
                <div className="mt-0.5 text-[12.5px] text-fg-3">{sentAt ? `à ${time(sentAt)} · ` : ""}objet préfixé par « [TEST] »</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="rounded-[16px] bg-black/[0.025] p-4 text-[13px] leading-relaxed text-fg-2 dark:bg-white/[0.035]">
            <div className="mb-1.5 font-semibold text-fg">Ce que montre le test</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>Le rendu réel dans votre messagerie (ordinateur et mobile).</li>
              <li>Les variables remplacées par vos propres informations (prénom, nom…).</li>
              <li>Le pied de page légal et le lien de désinscription — inactif dans un test.</li>
            </ul>
          </div>
        </div>
      </Panel>
      <Panel title="Vérifications avant envoi" icon={<ListChecks className="size-4" />} bodyClassName="px-3 pb-4 pt-3">
        <PreflightList checks={checks} onGo={onGo} />
      </Panel>
    </div>
  );
}

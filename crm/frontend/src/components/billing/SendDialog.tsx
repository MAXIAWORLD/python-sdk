import { Paperclip, Send, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { useAiStatus } from "@/components/ai/ChatView";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { toastError } from "@/lib/hooks";
import { useBillingSettings } from "./hooks";
import type { SendDefaults } from "./lib";

/**
 * Email a document with its PDF attached (POST …/send or …/remind with {to, subject, body}).
 * The message is pre-filled with the same wording the server would use, including the public link.
 */
export function SendDialog<T>({ open, onOpenChange, endpoint, title, description, defaults, attachment, sendLabel = "Envoyer", onSent, icon }: { open: boolean; onOpenChange: (open: boolean) => void; endpoint: string; title: string; description?: ReactNode; defaults: SendDefaults; attachment: string; sendLabel?: string; onSent: (doc: T) => void; icon?: ReactNode }) {
  const [to, setTo] = useState(defaults.to);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [sending, setSending] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const ai = useAiGenerate();
  const aiStatus = useAiStatus();
  const { smtpReady } = useBillingSettings();
  const navigate = useNavigate();
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTo(defaults.to);
      setSubject(defaults.subject);
      setBody(defaults.body);
    }
  }

  const recipients = to
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const send = async () => {
    if (!recipients.length) return toast.error("Indiquez au moins un destinataire.");
    setSending(true);
    try {
      const doc = await api.post<T>(endpoint, { to: recipients, subject: subject.trim() || undefined, body: body.trim() || undefined });
      onSent(doc);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /SMTP|emails/i.test(e.message)) {
        toast.error(e.message, { action: { label: "Configurer", onClick: () => navigate("/settings?tab=email") } });
      } else toastError(e);
    } finally {
      setSending(false);
    }
  };

  const rewrite = () =>
    ai.run("improve_text", { text: body, instruction: "Rends ce message plus chaleureux et concis, en français soigné et en vouvoyant. Conserve exactement les liens, numéros, montants et dates." }, (full) => setBody(full));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={title}
      description={description}
      icon={icon ?? <Send className="size-5" />}
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-[12px] text-fg-3">
            <Paperclip className="size-3.5" /> {attachment}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={ai.loading} onClick={send}>
            {sendLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {smtpReady === false && (
          <p className="rounded-[14px] bg-amber-400/[0.13] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
            L'envoi d'emails n'est pas encore configuré.{" "}
            <Link to="/settings?tab=email" className="font-semibold text-accent hover:underline">
              Renseigner le serveur SMTP
            </Link>{" "}
            ou utilisez « Marquer comme envoyé » après un envoi manuel.
          </p>
        )}
        <Field label="À" required hint="Plusieurs adresses possibles, séparées par une virgule.">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@entreprise.fr" autoFocus={!defaults.to} />
        </Field>
        <Field label="Objet">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field
          label="Message"
          hint="Markdown simple accepté. Votre signature email est ajoutée automatiquement."
          action={
            <Button
              size="xs"
              variant="ghost"
              className="text-[#b26bff]"
              icon={<Sparkles className="size-3.5" />}
              loading={ai.loading}
              disabled={!body.trim() || aiStatus.data?.configured === false}
              title={aiStatus.data?.configured === false ? "Configurez Iris dans Paramètres › IA" : undefined}
              onClick={rewrite}
            >
              Reformuler avec Iris
            </Button>
          }
        >
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} />
        </Field>
      </div>
    </Dialog>
  );
}

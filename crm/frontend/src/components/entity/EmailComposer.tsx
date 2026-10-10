import { Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { splitSubject, useAiGenerate } from "@/components/ai/AiGenerate";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { toastError, useInvalidate } from "@/lib/hooks";

export interface EmailContext {
  contact_id?: number | null;
  company_id?: number | null;
  deal_id?: number | null;
  ticket_id?: number | null;
}

export interface Recipient {
  email: string;
  contact_id?: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

function personalize(text: string, r: Recipient) {
  return text
    .replace(/\{\{\s*contact\.first_name\s*\}\}/g, r.first_name ?? "")
    .replace(/\{\{\s*contact\.last_name\s*\}\}/g, r.last_name ?? "")
    .replace(/\{\{\s*contact\.full_name\s*\}\}/g, r.full_name ?? "");
}

const TONES = [
  { value: "cordial et direct", label: "Cordial & direct" },
  { value: "chaleureux", label: "Chaleureux" },
  { value: "formel", label: "Formel" },
  { value: "concis, style startup", label: "Concis (startup)" },
  { value: "persuasif", label: "Persuasif" },
];

/**
 * Compose and send an email from the CRM (logged on the timeline), with templates and AI drafting.
 * With `recipients`, one individual email is sent per person (addresses are never disclosed to each other)
 * and {{contact.first_name}} / {{contact.last_name}} / {{contact.full_name}} are personalised.
 */
export function EmailComposer({
  open,
  onOpenChange,
  to: initialTo = "",
  recipients,
  context = {},
  subject: initialSubject = "",
  body: initialBody = "",
  purpose: initialPurpose = "",
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  to?: string;
  recipients?: Recipient[];
  context?: EmailContext;
  subject?: string;
  body?: string;
  purpose?: string;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [tone, setTone] = useState(TONES[0].value);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const ai = useAiGenerate();
  const invalidate = useInvalidate();

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTo(initialTo);
      setSubject(initialSubject);
      setBody(initialBody);
      setPurpose(initialPurpose);
      setTemplateId(null);
      setCc("");
    }
  }

  const applyTemplate = async (id: number | null) => {
    setTemplateId(id);
    if (!id) return;
    try {
      const r = await api.post<{ subject: string; body: string }>(`/email-templates/${id}/render`, context);
      setSubject(r.subject);
      setBody(r.body);
    } catch (e) {
      toastError(e);
    }
  };

  const draft = async () => {
    const out = await ai.run("draft_email", { contact_id: individual ? undefined : context.contact_id, deal_id: context.deal_id, purpose: purpose || "prise de contact", tone }, (full) => {
      const s = splitSubject(full);
      if (s.subject) setSubject(s.subject);
      setBody(s.body);
    });
    if (out) {
      const s = splitSubject(out);
      if (s.subject) setSubject(s.subject);
      setBody(s.body);
    }
  };

  const individual = !!recipients && recipients.length > 0;

  const send = async () => {
    if (!individual && !to.trim()) return toast.error("Indiquez au moins un destinataire.");
    setSending(true);
    try {
      if (individual) {
        let ok = 0;
        const failures: string[] = [];
        for (const r of recipients!) {
          try {
            await api.post("/emails/send", { to: [r.email], subject: personalize(subject, r), body: personalize(body, r), contact_id: r.contact_id });
            ok++;
          } catch (e) {
            failures.push(`${r.email} : ${(e as Error).message}`);
          }
        }
        if (failures.length) toast.warning(`${ok} email(s) envoyé(s), ${failures.length} échec(s)`, { description: failures.slice(0, 4).join("\n") });
        else toast.success(`${ok} email(s) envoyé(s) individuellement`);
      } else {
        await api.post("/emails/send", { to, cc: cc ? cc.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [], subject, body, ...context });
        toast.success("Email envoyé", { description: "Il apparaît dans la chronologie de la fiche." });
      }
      invalidate("emails", "activities");
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Nouvel email"
      icon={<Send className="size-5" />}
      footer={
        <>
          <span className="mr-auto text-[12px] text-fg-3">Envoyé via votre serveur SMTP (Paramètres › Email).</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" icon={<Send className="size-4" />} loading={sending} onClick={send}>
            Envoyer
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {individual ? (
          <div className="glass-inset rounded-[14px] px-3.5 py-2.5 text-[13px]">
            <span className="font-semibold">{recipients!.length} destinataire(s)</span>
            <span className="text-fg-2"> — un email individuel par personne. Variables : {"{{contact.first_name}}"}, {"{{contact.full_name}}"}.</span>
            <div className="mt-1 truncate text-[12px] text-fg-3">{recipients!.map((r) => r.email).join(", ")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="À" required>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="nom@entreprise.fr, …" />
            </Field>
            <Field label="Cc">
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optionnel" />
            </Field>
          </div>
        )}
        <div className="glass-inset rounded-[16px] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#b26bff]">
            <Sparkles className="size-3.5" /> Rédaction assistée
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px_auto]">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Objectif : relancer le devis, proposer une démo…" />
            <Select options={TONES} value={tone} onChange={setTone} />
            <Button variant="ai" loading={ai.loading} onClick={draft} icon={<Sparkles className="size-4" />}>
              Rédiger
            </Button>
          </div>
          <div className="mt-2">
            <EntitySelect resource="email-templates" value={templateId} onChange={(id) => applyTemplate(id)} placeholder="…ou partir d'un modèle d'email" />
          </div>
        </div>
        <Field label="Objet">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" hint="Markdown simple accepté. Votre signature est ajoutée automatiquement.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} />
        </Field>
      </div>
    </Dialog>
  );
}

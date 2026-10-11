import { CheckCircle2, Eye, Inbox, MailCheck, RefreshCw, Send, ServerCog, ShieldCheck, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { errorMessage, toastError, useInvalidate } from "@/lib/hooks";
import { useAuth } from "@/stores/auth";
import { Callout, ChoiceCards, FormGrid, NumberField, Restricted, SaveBar, SecretField, SettingsCard, SwitchField, TabHeader, TextField, useSectionForm, type FormErrors } from "./shared";
import type { EmailSettings } from "./types";
import { isEmail } from "./validators";

const SECURITY = [
  { value: "starttls", label: "STARTTLS", description: "Port 587 · recommandé", port: 587 },
  { value: "ssl", label: "SSL / TLS", description: "Port 465 · chiffré d'emblée", port: 465 },
  { value: "none", label: "Aucune", description: "Port 25 · déconseillé", port: 25 },
];

const PROVIDERS = [
  { label: "Google Workspace", smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_security: "starttls", imap_host: "imap.gmail.com", note: "Utilisez un mot de passe d'application (validation en deux étapes requise)." },
  { label: "Microsoft 365", smtp_host: "smtp.office365.com", smtp_port: 587, smtp_security: "starttls", imap_host: "outlook.office365.com", note: "L'envoi SMTP authentifié doit être autorisé pour la boîte aux lettres." },
  { label: "OVHcloud", smtp_host: "ssl0.ovh.net", smtp_port: 465, smtp_security: "ssl", imap_host: "ssl0.ovh.net", note: "Identifiant : l'adresse email complète." },
  { label: "Infomaniak", smtp_host: "mail.infomaniak.com", smtp_port: 587, smtp_security: "starttls", imap_host: "mail.infomaniak.com", note: "Identifiant : l'adresse email complète." },
  { label: "Brevo", smtp_host: "smtp-relay.brevo.com", smtp_port: 587, smtp_security: "starttls", imap_host: "", note: "Identifiants SMTP disponibles dans Brevo › SMTP & API." },
];

function validateEmail(v: EmailSettings): FormErrors<EmailSettings> {
  const e: FormErrors<EmailSettings> = {};
  if (v.from_email && !isEmail(v.from_email)) e.from_email = "Adresse email invalide.";
  if (v.reply_to && !isEmail(v.reply_to)) e.reply_to = "Adresse email invalide.";
  if (v.smtp_port !== null && (v.smtp_port < 1 || v.smtp_port > 65535)) e.smtp_port = "Port entre 1 et 65535.";
  if (v.imap_port !== null && (v.imap_port < 1 || v.imap_port > 65535)) e.imap_port = "Port entre 1 et 65535.";
  if (v.smtp_host && /\s/.test(v.smtp_host)) e.smtp_host = "Nom d'hôte invalide.";
  return e;
}

export default function EmailTab() {
  const me = useAuth((s) => s.user);
  const invalidate = useInvalidate();
  const form = useSectionForm("email", { validate: validateEmail });
  const [to, setTo] = useState(me?.email ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [providerNote, setProviderNote] = useState<string | null>(null);

  if (!form.canEdit) return <Restricted title="Réglages email réservés aux administrateurs" />;
  if (!form.ready)
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-[420px] rounded-[22px]" />
      </div>
    );

  const v = form.values;
  const configured = !!(form.server?.smtp_host && (form.server?.from_email || form.server?.smtp_user));

  const applyProvider = (p: (typeof PROVIDERS)[number]) => {
    form.set("smtp_host", p.smtp_host);
    form.set("smtp_port", p.smtp_port);
    form.set("smtp_security", p.smtp_security);
    if (p.imap_host) {
      form.set("imap_host", p.imap_host);
      form.set("imap_port", 993);
    }
    setProviderNote(`${p.label} : ${p.note}`);
  };

  const changeSecurity = (security: string) => {
    form.set("smtp_security", security);
    const previous = SECURITY.find((s) => s.value === v.smtp_security);
    if (!v.smtp_port || v.smtp_port === previous?.port) form.set("smtp_port", SECURITY.find((s) => s.value === security)?.port ?? 587);
  };

  const sendTest = async () => {
    if (!isEmail(to)) return toast.error("Adresse de destination invalide.");
    if (form.dirty && !(await form.save({ silent: true }))) return;
    setTesting(true);
    setResult(null);
    try {
      await api.post("/settings/email/test", { to });
      setResult({ ok: true, message: `Email de test envoyé à ${to}. Vérifiez votre boîte de réception (et les indésirables).` });
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const sync = async () => {
    if (form.dirty && !(await form.save({ silent: true }))) return;
    setSyncing(true);
    try {
      const res = await api.post<{ imported: number }>("/emails/sync");
      invalidate("emails");
      toast.success(res.imported ? `${res.imported} email${res.imported > 1 ? "s" : ""} importé${res.imported > 1 ? "s" : ""}` : "Boîte de réception à jour");
    } catch (e) {
      toastError(e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <TabHeader
        title="Email"
        description="Envoi des devis, factures, relances et campagnes depuis votre propre adresse, et synchronisation des réponses dans Prisme."
        badge={
          <Badge tone={configured ? "green" : "orange"} dot>
            {configured ? "Envoi configuré" : "Envoi non configuré"}
          </Badge>
        }
      />

      <SettingsCard title="Envoi (SMTP)" description="Serveur d'envoi de votre messagerie professionnelle." icon={<Send className="size-4" />}>
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[12.5px] font-medium text-fg-2">Préremplir pour…</div>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map((p) => (
                <button key={p.label} type="button" onClick={() => applyProvider(p)} className="glass-flat inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium text-fg-2 transition hover:text-fg">
                  {p.label}
                </button>
              ))}
            </div>
            <AnimatePresence>
              {providerNote && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <Callout tone="info" className="mt-3">
                    {providerNote}
                  </Callout>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <FormGrid className="sm:grid-cols-[minmax(0,1fr)_150px]">
            <TextField form={form} name="smtp_host" label="Serveur SMTP" placeholder="smtp.exemple.fr" icon={<ServerCog className="size-4" />} />
            <NumberField form={form} name="smtp_port" label="Port" min={1} placeholder="587" />
          </FormGrid>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Sécurité de la connexion</div>
            <ChoiceCards options={SECURITY.map(({ value, label, description }) => ({ value, label, description }))} value={v.smtp_security || "starttls"} onChange={changeSecurity} className="grid-cols-1 sm:grid-cols-3" />
          </div>
          <FormGrid>
            <TextField form={form} name="smtp_user" label="Identifiant" placeholder="contact@entreprise.fr" autoComplete="off" />
            <SecretField form={form} name="smtp_password" label="Mot de passe" hint="Chiffré sur le serveur, jamais réaffiché." />
            <TextField form={form} name="from_name" label="Nom d'expéditeur" placeholder="Nova Studio" hint="Par défaut : le nom de l'entreprise." />
            <TextField form={form} name="from_email" label="Adresse d'expédition" type="email" placeholder="contact@entreprise.fr" hint="Par défaut : l'identifiant SMTP." />
            <TextField form={form} name="reply_to" label="Adresse de réponse (facultative)" type="email" placeholder="equipe@entreprise.fr" />
          </FormGrid>
          <SwitchField form={form} name="bcc_self" label="Copie cachée à l'adresse d'expédition" description="Archive chaque email envoyé depuis Prisme dans votre propre boîte." />
        </div>
      </SettingsCard>

      <SettingsCard title="Tester l'envoi" description="Vérifiez la configuration en envoyant un email réel." icon={<MailCheck className="size-4" />}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Destinataire" className="flex-1">
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="vous@entreprise.fr" />
          </Field>
          <Button variant="primary" icon={<Send className="size-4" />} loading={testing} disabled={!v.smtp_host} onClick={sendTest}>
            {form.dirty ? "Enregistrer et tester" : "Envoyer un email de test"}
          </Button>
        </div>
        <AnimatePresence mode="wait">
          {result && (
            <motion.div key={result.message} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
              <Callout tone={result.ok ? "success" : "danger"} icon={result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} title={result.ok ? "Envoi réussi" : "Échec de l'envoi"}>
                {result.message}
              </Callout>
            </motion.div>
          )}
        </AnimatePresence>
      </SettingsCard>

      <SettingsCard
        title="Réception (IMAP)"
        description="Importe les emails reçus et les rattache automatiquement aux contacts connus."
        icon={<Inbox className="size-4" />}
        actions={
          form.server?.imap_enabled ? (
            <Button size="sm" variant="glass" icon={<RefreshCw className="size-3.5" />} loading={syncing} onClick={sync}>
              Synchroniser maintenant
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <SwitchField form={form} name="imap_enabled" label="Synchroniser la boîte de réception" description="Les 50 derniers messages sont relevés à chaque synchronisation, sans modifier votre boîte (lecture seule)." />
          <AnimatePresence initial={false}>
            {v.imap_enabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <FormGrid className="pt-1">
                  <TextField form={form} name="imap_host" label="Serveur IMAP" placeholder="imap.exemple.fr" icon={<ServerCog className="size-4" />} />
                  <NumberField form={form} name="imap_port" label="Port (SSL)" min={1} placeholder="993" />
                  <TextField form={form} name="imap_user" label="Identifiant" placeholder="contact@entreprise.fr" autoComplete="off" />
                  <SecretField form={form} name="imap_password" label="Mot de passe" />
                  <TextField form={form} name="imap_folder" label="Dossier" placeholder="INBOX" />
                </FormGrid>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SettingsCard>

      <SettingsCard title="Suivi d'ouverture" description="Mesure de l'ouverture des emails par un pixel invisible." icon={<Eye className="size-4" />}>
        <div className="space-y-4">
          <SwitchField form={form} name="track_opens" label="Activer le pixel de suivi" description="Désactivé par défaut. Indique si et quand un destinataire ouvre vos emails." />
          <Callout tone={v.track_opens ? "warn" : "neutral"} icon={<ShieldCheck className="size-4" />} title="Consentement requis (RGPD / CNIL)">
            Le pixel de suivi est un traceur : selon la CNIL (article 82 de la loi Informatique et Libertés), il ne peut être déposé qu'avec le consentement préalable du destinataire, sauf mesure strictement nécessaire au service. N'activez cette option que si vos destinataires y ont consenti, et mentionnez-le dans votre politique de confidentialité.
          </Callout>
        </div>
      </SettingsCard>

      <SaveBar forms={[form]} />
    </div>
  );
}

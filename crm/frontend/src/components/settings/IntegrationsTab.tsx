import { CalendarDays, ChevronDown, Code2, KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { Checkbox, Field, Input, Switch } from "@/components/ui/fields";
import { Dialog, Menu, Tooltip, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { toastError, useInvalidate, useList } from "@/lib/hooks";
import type { Webhook } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { CreateTokenDialog, TokenList, useApiTokens, useCreateToken } from "./ApiTokens";
import { Callout, CodeBlock, CopyButton, FieldGroup, SecretReveal, SettingsCard, TabHeader } from "./shared";
import { isHttpUrl } from "./validators";

const EVENT_GROUPS: { label: string; events: [string, string][] }[] = [
  { label: "Contacts & entreprises", events: [["contact.created", "Contact créé"], ["contact.updated", "Contact modifié"], ["contact.deleted", "Contact supprimé"], ["company.created", "Entreprise créée"], ["company.updated", "Entreprise modifiée"]] },
  { label: "Ventes", events: [["deal.created", "Opportunité créée"], ["deal.stage_changed", "Changement d'étape"], ["deal.won", "Affaire gagnée"], ["deal.lost", "Affaire perdue"]] },
  { label: "Devis & factures", events: [["quote.sent", "Devis envoyé"], ["quote.viewed", "Devis consulté"], ["quote.accepted", "Devis signé"], ["quote.declined", "Devis refusé"], ["invoice.issued", "Facture émise"], ["invoice.paid", "Facture payée"], ["invoice.overdue", "Facture en retard"]] },
  { label: "Abonnements", events: [["subscription.created", "Abonnement créé"], ["subscription.updated", "Abonnement modifié"]] },
  { label: "Support & projets", events: [["ticket.created", "Ticket créé"], ["ticket.updated", "Ticket modifié"], ["task.completed", "Tâche terminée"], ["project.created", "Projet créé"]] },
  { label: "Marketing", events: [["form.submitted", "Formulaire soumis"]] },
];
const EVENT_LABEL = new Map(EVENT_GROUPS.flatMap((g) => g.events));

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "whsec_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function StatusPill({ hook }: { hook: Webhook }) {
  if (!hook.last_called_at) return <Badge tone="gray" size="xs">Jamais appelé</Badge>;
  const ok = hook.last_status !== null && hook.last_status !== undefined && hook.last_status > 0 && hook.last_status < 400;
  return (
    <Tooltip content={`Dernier appel ${dateTime(hook.last_called_at)}`}>
      <span>
        <Badge tone={ok ? "green" : "red"} size="xs" dot>
          {hook.last_status ? `HTTP ${hook.last_status}` : "Injoignable"} · {relative(hook.last_called_at)}
        </Badge>
      </span>
    </Tooltip>
  );
}

/* -------------------------------------------------------------------------- */
/* Webhook dialog                                                             */
/* -------------------------------------------------------------------------- */

function WebhookDialog({ open, onOpenChange, hook }: { open: boolean; onOpenChange: (o: boolean) => void; hook: Webhook | null }) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["*"]);
  const [active, setActive] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Webhook | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  const secretId = useId();
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(hook?.name ?? "");
      setUrl(hook?.url ?? "https://");
      setEvents(hook?.events?.length ? hook.events : ["*"]);
      setActive(hook?.active ?? true);
      setSecret(null);
      setCreated(null);
    }
  }
  const all = events.includes("*");
  const urlError = url && url !== "https://" && !isHttpUrl(url) ? "Adresse invalide." : null;
  const valid = name.trim() && isHttpUrl(url) && events.length > 0;
  const toggle = (event: string, on: boolean) => setEvents((cur) => (on ? Array.from(new Set([...cur.filter((e) => e !== "*"), event])) : cur.filter((e) => e !== event)));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setBusy(true);
    const payload: Record<string, unknown> = { name: name.trim(), url: url.trim(), events, active };
    if (secret) payload.secret = secret;
    try {
      const saved = hook ? await api.patch<Webhook>(`/webhooks/${hook.id}`, { ...payload, ...(hook.failures && active ? { failures: 0 } : {}) }) : await api.post<Webhook>("/webhooks", payload);
      invalidate("webhooks");
      if (!hook) setCreated(saved);
      else {
        toast.success("Webhook mis à jour");
        onOpenChange(false);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<WebhookIcon className="size-5" />}
      title={created ? "Webhook créé" : hook ? `Modifier « ${hook.name} »` : "Nouveau webhook"}
      description={created ? undefined : "Prisme envoie une requête POST signée (JSON) à chaque événement sélectionné."}
      footer={
        created ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Terminé
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button variant="primary" loading={busy} disabled={!valid} onClick={() => submit()}>
              {hook ? "Enregistrer" : "Créer le webhook"}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <SecretReveal value={created.secret ?? ""} title="Secret de signature">
            Utilisez-le pour vérifier l'en-tête <code className="text-[12px]">X-Prisme-Signature</code> de chaque requête. Il reste consultable en modifiant le webhook.
          </SecretReveal>
          <SignatureDoc />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Field label="Nom" required>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Synchro Slack" />
            </Field>
            <Field label="URL de destination" required error={urlError}>
              <Input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://hooks.exemple.fr/prisme" className="font-mono text-[13px]" inputMode="url" />
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium text-fg-2">
                Événements
                {!all && <span className={cn("ml-1.5 font-normal", events.length ? "text-fg-3" : "text-amber-600 dark:text-amber-400")}>· {events.length ? `${events.length} sélectionné${events.length > 1 ? "s" : ""}` : "choisissez au moins un événement"}</span>}
              </span>
              <Switch size="sm" checked={all} onChange={(v) => setEvents(v ? ["*"] : [])} label={<span className="text-[13px]">Tous les événements</span>} />
            </div>
            {!all && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 gap-3 rounded-[16px] bg-black/[0.025] p-3.5 sm:grid-cols-2 dark:bg-white/[0.035]">
                {EVENT_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{g.label}</div>
                    <div className="space-y-1.5">
                      {g.events.map(([value, label]) => (
                        <Checkbox key={value} checked={events.includes(value)} onChange={(v) => toggle(value, v)} label={<span className="text-[13px]">{label} <span className="font-mono text-[11px] text-fg-3">{value}</span></span>} />
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
          {hook && (
            <FieldGroup
              label="Secret de signature"
              htmlFor={secretId}
              action={
                <button type="button" onClick={() => setSecret(randomSecret())} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                  <RefreshCw className="size-3" /> Régénérer
                </button>
              }
              hint={secret ? <span className="text-amber-600 dark:text-amber-400">Nouveau secret : mettez à jour votre application après l'enregistrement.</span> : "Utilisé pour signer chaque requête (HMAC-SHA256)."}
            >
              <div className="flex gap-2">
                <Input id={secretId} value={secret ?? hook.secret ?? ""} readOnly className="font-mono text-[12.5px]" />
                <CopyButton value={secret ?? hook.secret ?? ""} size="md" />
              </div>
            </FieldGroup>
          )}
          <Switch checked={active} onChange={setActive} label="Actif" description={hook?.failures ? `${hook.failures} échec${hook.failures > 1 ? "s" : ""} consécutif${hook.failures > 1 ? "s" : ""} : réactiver remet le compteur à zéro. Le webhook est désactivé automatiquement après 20 échecs.` : "Le webhook est désactivé automatiquement après 20 échecs consécutifs."} />
          <button type="submit" className="hidden" />
        </form>
      )}
    </Dialog>
  );
}

function SignatureDoc() {
  return (
    <CodeBlock
      label="Vérification de la signature (Node.js)"
      code={[
        'const crypto = require("crypto");',
        "",
        "// rawBody : corps brut reçu (Buffer) · secret : whsec_…",
        'const expected = Buffer.from("sha256=" +',
        '  crypto.createHmac("sha256", secret).update(rawBody).digest("hex"));',
        'const received = Buffer.from(req.headers["x-prisme-signature"] ?? "");',
        "const valid = received.length === expected.length",
        "  && crypto.timingSafeEqual(received, expected);",
      ].join("\n")}
    />
  );
}

function WebhooksCard() {
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const { data, isLoading } = useList<Webhook>("webhooks", { sort: "name", limit: 100 });
  const hooks = useMemo(() => data?.items ?? [], [data]);
  const [dialog, setDialog] = useState<{ hook: Webhook | null } | null>(null);
  const [docs, setDocs] = useState(false);

  const toggleActive = async (hook: Webhook, active: boolean) => {
    try {
      await api.patch(`/webhooks/${hook.id}`, active ? { active, failures: 0 } : { active });
      invalidate("webhooks");
      toast.success(active ? "Webhook activé" : "Webhook désactivé");
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async (hook: Webhook) => {
    if (!(await confirm({ title: `Supprimer le webhook « ${hook.name} » ?`, description: "Les événements ne seront plus transmis à cette adresse.", confirmLabel: "Supprimer", danger: true }))) return;
    try {
      await api.delete(`/webhooks/${hook.id}`);
      invalidate("webhooks");
      toast.success("Webhook supprimé");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <SettingsCard
      title="Webhooks"
      description="Notifiez vos outils (Slack, Make, n8n, Zapier, votre back-office…) en temps réel."
      icon={<WebhookIcon className="size-4" />}
      actions={
        <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ hook: null })}>
          Nouveau webhook
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-24 rounded-[16px]" />
      ) : hooks.length === 0 ? (
        <EmptyState icon={<WebhookIcon className="size-6" />} title="Aucun webhook" description="Recevez un appel HTTP signé quand une affaire est gagnée, une facture payée, un formulaire soumis…" className="py-8" />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-[14px] font-medium", !h.active && "text-fg-3")}>{h.name}</span>
                  <StatusPill hook={h} />
                  {h.failures > 0 && (
                    <Badge tone="orange" size="xs">
                      {h.failures} échec{h.failures > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[12px] text-fg-3" title={h.url}>
                  {h.url}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(h.events.includes("*") ? ["*"] : h.events.slice(0, 4)).map((e) => (
                    <span key={e} className="rounded-[7px] bg-black/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-fg-2 dark:bg-white/[0.08]">
                      {e === "*" ? "Tous les événements" : (EVENT_LABEL.get(e) ?? e)}
                    </span>
                  ))}
                  {!h.events.includes("*") && h.events.length > 4 && <span className="text-[11px] text-fg-3">+{h.events.length - 4}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch size="sm" checked={h.active} onChange={(v) => toggleActive(h, v)} />
                <Menu
                  trigger={
                    <IconButton label="Actions" size="sm">
                      <MoreHorizontal className="size-4" />
                    </IconButton>
                  }
                  items={[
                    { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => setDialog({ hook: h }) },
                    { separator: true, label: "" },
                    { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(h) },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 border-t border-[var(--hairline)] pt-4">
        <button type="button" onClick={() => setDocs((d) => !d)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent" aria-expanded={docs}>
          <Code2 className="size-4" />
          {docs ? "Masquer la documentation" : "Format des requêtes et vérification de la signature"}
          <ChevronDown className={cn("size-4 transition-transform", docs && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {docs && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-3 pt-3">
                <p className="text-[12.5px] text-fg-2">
                  Requête <code className="text-[12px]">POST</code> au format JSON, avec les en-têtes <code className="text-[12px]">X-Prisme-Event</code> (nom de l'événement) et <code className="text-[12px]">X-Prisme-Signature</code> (HMAC-SHA256 du corps avec votre secret). Répondez par un code 2xx en moins de 10 secondes.
                </p>
                <CodeBlock label="Exemple de requête reçue" code={JSON.stringify({ event: "deal.won", at: "2026-10-11T09:30:00Z", data: { id: 42, title: "Refonte du site", amount: 18000, company_id: 7 } }, null, 2)} />
                <SignatureDoc />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <WebhookDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} hook={dialog?.hook ?? null} />
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar subscription                                                      */
/* -------------------------------------------------------------------------- */

function CalendarCard() {
  const { create, busy } = useCreateToken();
  const [link, setLink] = useState<string | null>(null);
  const generate = async () => {
    const token = await create("Abonnement agenda (ICS)", ["api"]);
    if (token) setLink(`${window.location.origin}/api/calendar.ics?key=${token}`);
  };
  return (
    <SettingsCard title="Abonnement agenda" description="Affichez vos rendez-vous Prisme et vos tâches à échéance dans Google Agenda, Apple Calendrier ou Outlook." icon={<CalendarDays className="size-4" />}>
      {link ? (
        <div className="space-y-4">
          <SecretReveal value={link} title="Lien d'abonnement personnel">
            Ce lien ne sera plus affiché. Pour le désactiver, révoquez le jeton « Abonnement agenda (ICS) » ci-dessus.
          </SecretReveal>
          <div className="grid gap-3 text-[12.5px] text-fg-2 sm:grid-cols-3">
            <div className="rounded-[14px] bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <div className="mb-1 font-semibold text-fg">Google Agenda</div>
              Autres agendas › « + » › À partir de l'URL, puis collez le lien.
            </div>
            <div className="rounded-[14px] bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <div className="mb-1 font-semibold text-fg">Apple Calendrier</div>
              Fichier › Nouvel abonnement à un calendrier, puis collez le lien.
            </div>
            <div className="rounded-[14px] bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <div className="mb-1 font-semibold text-fg">Outlook</div>
              Ajouter un calendrier › S'abonner à partir du web.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-[13px] leading-relaxed text-fg-2">Un lien personnel à coller dans votre agenda : les rendez-vous des 90 derniers jours et à venir, ainsi que vos tâches ouvertes à échéance, s'y mettent à jour automatiquement.</p>
          <Button variant="glass" icon={<CalendarDays className="size-4" />} loading={busy} onClick={generate}>
            Générer mon lien
          </Button>
        </div>
      )}
      <Callout tone="neutral" className="mt-4">
        Le jeton du lien donne aussi accès à l'API avec vos droits : ne le partagez pas. L'actualisation dépend de votre agenda (souvent toutes les quelques heures).
      </Callout>
    </SettingsCard>
  );
}

export default function IntegrationsTab() {
  const isAdmin = useAuth((s) => can(s.user, "admin"));
  const tokens = useApiTokens();
  const [creating, setCreating] = useState(false);
  const origin = window.location.origin;
  return (
    <div className="space-y-5">
      <TabHeader title="Intégrations" description="Connectez Prisme à vos autres outils : API REST, webhooks temps réel et abonnement agenda." />

      <SettingsCard
        title="Jetons API"
        description="Vos jetons personnels : chacun agit en votre nom, avec vos droits."
        icon={<KeyRound className="size-4" />}
        actions={
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
            Nouveau jeton
          </Button>
        }
      >
        <TokenList tokens={tokens.data ?? []} loading={tokens.isLoading} empty={{ title: "Aucun jeton API", description: "Créez un jeton pour automatiser Prisme depuis vos scripts ou vos outils no-code." }} />
        <div className="mt-5">
          <CodeBlock label="Exemple d'appel" code={`curl -H "Authorization: Bearer <VOTRE_JETON>" \\\n  "${origin}/api/contacts?limit=5"`} />
        </div>
      </SettingsCard>

      {isAdmin ? (
        <WebhooksCard />
      ) : (
        <Callout tone="neutral" icon={<Code2 className="size-4" />} title="Webhooks">
          La configuration des webhooks est réservée aux administrateurs.
        </Callout>
      )}

      <CalendarCard />

      <CreateTokenDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

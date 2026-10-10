import { BadgeCheck, Ban, Briefcase, Download, FileText, LifeBuoy, Mail, MailX, MoreHorizontal, Pencil, Phone, Plus, ShieldCheck, Sparkles, Target, Trash2, UserX } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { Panel } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { AiSummaryPanel, DetailHeader, NotFoundRecord, RelatedRow, RelatedTasks, useAssistantRecord } from "@/components/entity/EntityBlocks";
import { EmailComposer } from "@/components/entity/EmailComposer";
import { PropertyList } from "@/components/entity/PropertyList";
import { RelatedDocuments } from "@/components/entity/RelatedDocuments";
import { Timeline } from "@/components/entity/Timeline";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, CompanyLogo, EmptyState, Ring, Skeleton, StatusBadge, Tag } from "@/components/ui/display";
import { Switch } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/markdown";
import { Menu, Sheet, useConfirm } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { DEAL_STATUS, INVOICE_STATUS, LIFECYCLE, QUOTE_STATUS, TICKET_STATUS } from "@/lib/constants";
import { date, dateTime, money, relative } from "@/lib/format";
import { toastError, useInvalidate, useItem, useList, useRemove, useUpdate } from "@/lib/hooks";
import type { Contact, Deal, EmailMessage, Invoice, Quote, Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

interface ConsentLogRow {
  id: number;
  created_at: string;
  channel: string;
  action: string;
  source?: string | null;
  wording?: string | null;
}

type Tab = "activity" | "deals" | "emails" | "billing" | "tickets";

function RgpdPanel({ contact }: { contact: Contact }) {
  const user = useAuth((s) => s.user);
  const update = useUpdate("contacts", { message: "Préférences RGPD mises à jour" });
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const { data: logs } = useList<ConsentLogRow>("consent-logs", { contact_id: contact.id, sort: "-created_at", limit: 10 });
  const manager = can(user, "manager");

  const anonymize = async () => {
    const ok = await confirm({
      title: "Anonymiser ce contact ?",
      description: "Droit à l'effacement (RGPD art. 17) : les données personnelles sont définitivement remplacées. Les factures restent conservées (obligation légale de 10 ans).",
      danger: true,
      confirmLabel: "Anonymiser définitivement",
    });
    if (!ok) return;
    try {
      await api.post(`/rgpd/contacts/${contact.id}/anonymize`, { reason: "Demande de la personne concernée" });
      toast.success("Contact anonymisé");
      invalidate("contacts");
      navigate("/contacts");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Panel title="Données personnelles (RGPD)" icon={<ShieldCheck className="size-4" />}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {contact.anonymized_at ? (
            <Badge tone="gray">Anonymisé le {date(contact.anonymized_at)}</Badge>
          ) : contact.unsubscribed_at ? (
            <Badge tone="orange" dot>
              Désinscrit le {date(contact.unsubscribed_at)}
            </Badge>
          ) : contact.consent_marketing ? (
            <Badge tone="green" dot>
              Opt-in marketing{contact.consent_at ? ` · ${date(contact.consent_at)}` : ""}
            </Badge>
          ) : (
            <Badge tone="gray" dot>
              Pas de consentement marketing
            </Badge>
          )}
          {contact.consent_source && <Badge tone="blue">Source : {contact.consent_source}</Badge>}
        </div>
        <Switch size="sm" checked={contact.consent_marketing} onChange={(v) => update.mutate({ id: contact.id, data: { consent_marketing: v } })} label={<span className="text-[13px]">Consentement prospection email</span>} />
        <Switch size="sm" checked={contact.do_not_contact} onChange={(v) => update.mutate({ id: contact.id, data: { do_not_contact: v } })} label={<span className="text-[13px]">Opposition à toute sollicitation</span>} />
        <Switch size="sm" checked={contact.do_not_call} onChange={(v) => update.mutate({ id: contact.id, data: { do_not_call: v } })} label={<span className="text-[13px]">Inscrit Bloctel / ne pas appeler</span>} />
        {!!logs?.items.length && (
          <div className="rounded-[14px] bg-black/[0.03] p-2.5 dark:bg-white/[0.04]">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">Preuves de consentement</div>
            {logs.items.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2 py-1 text-[12px]">
                <span className={cn(l.action === "granted" ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400")}>
                  {l.action === "granted" ? "Accordé" : "Retiré"} · {l.channel}
                  {l.source ? <span className="text-fg-3"> ({l.source})</span> : null}
                </span>
                <span className="shrink-0 text-fg-3">{dateTime(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}
        {manager && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="glass" icon={<Download className="size-3.5" />} onClick={() => download(`/rgpd/contacts/${contact.id}/export`, `donnees-contact-${contact.id}.json`).catch(toastError)}>
              Export (portabilité)
            </Button>
            <Button size="sm" variant="ghost" className="text-red-500" icon={<UserX className="size-3.5" />} onClick={anonymize} disabled={!!contact.anonymized_at}>
              Anonymiser
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function DealsTab({ contact, onNew }: { contact: Contact; onNew: () => void }) {
  const { data, isLoading } = useList<Deal>("deals", { contact_id: contact.id, sort: "-created_at", limit: 50 });
  if (isLoading) return <Skeleton className="h-24" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<Target className="size-6" />}
        title="Aucune opportunité"
        action={
          <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={onNew}>
            Nouvelle opportunité
          </Button>
        }
      />
    );
  return (
    <div className="space-y-1">
      {data.items.map((d) => (
        <RelatedRow
          key={d.id}
          to={`/deals/${d.id}`}
          icon={<span className="size-2.5 shrink-0 rounded-full" style={{ background: d.stage?.color ?? "var(--accent)" }} />}
          title={d.title}
          meta={`${d.stage?.name ?? ""}${d.expected_close_date ? ` · closing ${date(d.expected_close_date, "d MMM yyyy")}` : ""}`}
          right={
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tabular">{money(d.value, "EUR", { decimals: 0 })}</span>
              <StatusBadge options={DEAL_STATUS} value={d.status} size="xs" />
            </div>
          }
        />
      ))}
    </div>
  );
}

function EmailsTab({ contact, onCompose }: { contact: Contact; onCompose: () => void }) {
  const { data, isLoading } = useList<EmailMessage>("emails", { contact_id: contact.id, sort: "-created_at", limit: 50 });
  const [open, setOpen] = useState<number | null>(null);
  if (isLoading) return <Skeleton className="h-24" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<Mail className="size-6" />}
        title="Aucun email"
        description="Les emails envoyés depuis Prisme ou synchronisés (IMAP) apparaissent ici."
        action={
          <Button variant="primary" size="sm" icon={<Mail className="size-4" />} onClick={onCompose}>
            Écrire un email
          </Button>
        }
      />
    );
  return (
    <div className="space-y-1.5">
      {data.items.map((m) => (
        <div key={m.id} className="rounded-[14px] bg-black/[0.025] px-3.5 py-2.5 dark:bg-white/[0.035]">
          <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
            <span className={cn("mt-0.5 rounded-[8px] px-1.5 py-0.5 text-[10.5px] font-semibold", m.direction === "in" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-violet-500/15 text-violet-700 dark:text-violet-300")}>{m.direction === "in" ? "Reçu" : "Envoyé"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">{m.subject || "(sans objet)"}</div>
              <div className="truncate text-[12px] text-fg-3">{(m.body_text ?? "").slice(0, 140)}</div>
            </div>
            <span className="shrink-0 text-[11.5px] text-fg-3">{relative(m.sent_at ?? m.created_at)}</span>
          </button>
          {open === m.id && (
            <div className="mt-2 border-t border-[var(--hairline)] pt-2 text-[13.5px]">
              <div className="mb-2 text-[12px] text-fg-3">
                De {m.from_name ?? m.from_email} · À {m.to.join(", ")} · {dateTime(m.sent_at ?? m.created_at)}
              </div>
              <Markdown>{m.body_text ?? ""}</Markdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BillingTab({ contact }: { contact: Contact }) {
  const quotes = useList<Quote>("quotes", { contact_id: contact.id, sort: "-issue_date", limit: 20 });
  const invoices = useList<Invoice>("invoices", { contact_id: contact.id, sort: "-issue_date", limit: 20 });
  const none = !quotes.isLoading && !invoices.isLoading && !quotes.data?.items.length && !invoices.data?.items.length;
  if (none) return <EmptyState icon={<FileText className="size-6" />} title="Aucun devis ni facture" description="Les documents commerciaux liés à ce contact apparaîtront ici." />;
  return (
    <div className="space-y-4">
      {!!quotes.data?.items.length && (
        <div>
          <div className="mb-1 px-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">Devis</div>
          {quotes.data.items.map((q) => (
            <RelatedRow key={q.id} to={`/quotes/${q.id}`} title={`${q.number}${q.title ? ` — ${q.title}` : ""}`} meta={date(q.issue_date)} right={<div className="flex items-center gap-2"><span className="text-[13px] font-semibold tabular">{money(q.total)}</span><StatusBadge options={QUOTE_STATUS} value={q.status} size="xs" /></div>} />
          ))}
        </div>
      )}
      {!!invoices.data?.items.length && (
        <div>
          <div className="mb-1 px-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">Factures</div>
          {invoices.data.items.map((i) => (
            <RelatedRow key={i.id} to={`/invoices/${i.id}`} title={`${i.number || "Brouillon"}${i.title ? ` — ${i.title}` : ""}`} meta={date(i.issue_date)} right={<div className="flex items-center gap-2"><span className="text-[13px] font-semibold tabular">{money(i.total)}</span><StatusBadge options={INVOICE_STATUS} value={i.status} size="xs" /></div>} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketsTab({ contact }: { contact: Contact }) {
  const { data, isLoading } = useList<Ticket>("tickets", { contact_id: contact.id, sort: "-created_at", limit: 30 });
  if (isLoading) return <Skeleton className="h-24" />;
  if (!data?.items.length) return <EmptyState icon={<LifeBuoy className="size-6" />} title="Aucun ticket" />;
  return (
    <div className="space-y-1">
      {data.items.map((t) => (
        <RelatedRow key={t.id} to={`/tickets/${t.id}`} title={`${t.number} · ${t.subject}`} meta={relative(t.created_at)} right={<StatusBadge options={TICKET_STATUS} value={t.status} size="xs" />} />
      ))}
    </div>
  );
}

export default function ContactDetail() {
  const { id } = useParams();
  const contactId = Number(id);
  const navigate = useNavigate();
  const { data: contact, isLoading, error } = useItem<Contact>("contacts", contactId);
  const [tab, setTab] = useState<Tab>("activity");
  const [editing, setEditing] = useState(false);
  const [newDeal, setNewDeal] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [qualifyOpen, setQualifyOpen] = useState(false);
  const qualify = useAiGenerate();
  const remove = useRemove("contacts");
  const update = useUpdate("contacts", { silent: true });
  const confirm = useConfirm();
  useAssistantRecord("contact", contactId, contact?.full_name);

  const counts = {
    deals: useList<Deal>("deals", { contact_id: contactId, limit: 1 }).data?.total,
    emails: useList<EmailMessage>("emails", { contact_id: contactId, limit: 1 }).data?.total,
    tickets: useList<Ticket>("tickets", { contact_id: contactId, limit: 1 }).data?.total,
  };

  if (error) return <NotFoundRecord label="Contact" back="/contacts" />;

  const runQualify = () => {
    setQualifyOpen(true);
    qualify.run("lead_qualify", { contact_id: contactId });
  };

  const applyScore = () => {
    const m = qualify.text.match(/(\d{1,3})\s*\/\s*100/);
    if (!m || !contact) return toast.error("Score introuvable dans l'analyse.");
    const score = Math.min(100, Number(m[1]));
    const stage = qualify.text.match(/Stade conseillé\**\s*:?\s*\**\s*(lead|mql|sql|opportunity)/i)?.[1]?.toLowerCase();
    update.mutate({ id: contact.id, data: { lead_score: score, ...(stage ? { lifecycle: stage } : {}) } });
    toast.success(`Score mis à jour : ${score}/100${stage ? ` · ${LIFECYCLE.find((l) => l.value === stage)?.label}` : ""}`);
    setQualifyOpen(false);
  };

  return (
    <div>
      <DetailHeader
        back="/contacts"
        backLabel="Contacts"
        loading={isLoading}
        visual={contact ? <Avatar name={contact.full_name} src={contact.avatar_url} size={64} className="shadow-[0_10px_30px_-10px_rgba(0,0,0,.5)]" /> : <Skeleton className="size-16 rounded-full" />}
        title={contact?.full_name}
        subtitle={
          contact && (
            <>
              {contact.job_title && <span>{contact.job_title}</span>}
              {contact.company && (
                <Link to={`/companies/${contact.company.id}`} className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent">
                  <CompanyLogo name={contact.company.name} size={18} />
                  {contact.company.name}
                </Link>
              )}
              {contact.email && <span className="text-fg-3">· {contact.email}</span>}
            </>
          )
        }
        badges={
          contact && (
            <>
              <StatusBadge options={LIFECYCLE} value={contact.lifecycle} />
              {contact.do_not_contact && (
                <Badge tone="red">
                  <Ban className="size-3" /> Ne pas contacter
                </Badge>
              )}
              {contact.unsubscribed_at && (
                <Badge tone="orange">
                  <MailX className="size-3" /> Désinscrit
                </Badge>
              )}
              {contact.consent_marketing && !contact.unsubscribed_at && (
                <Badge tone="green">
                  <BadgeCheck className="size-3" /> Opt-in
                </Badge>
              )}
              {contact.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </>
          )
        }
        actions={
          contact && (
            <>
              <div className="mr-1 flex items-center gap-2 rounded-[14px] px-2">
                <Ring value={contact.lead_score} size={42} stroke={4.5} />
                <div className="text-[11.5px] leading-tight text-fg-3">
                  Score
                  <br />
                  lead
                </div>
              </div>
              <Button variant="glass" icon={<Mail className="size-4" />} onClick={() => setEmailOpen(true)} disabled={!contact.email || contact.do_not_contact}>
                Email
              </Button>
              {contact.phone && !contact.do_not_call && (
                <Button variant="glass" asChild>
                  <a href={`tel:${contact.phone}`}>
                    <Phone className="size-4" /> Appeler
                  </a>
                </Button>
              )}
              <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={runQualify}>
                Qualifier
              </Button>
              <Menu
                trigger={
                  <Button variant="glass" aria-label="Plus d'actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
                items={[
                  { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => setEditing(true) },
                  { label: "Nouvelle opportunité", icon: <Briefcase className="size-4" />, onSelect: () => setNewDeal(true) },
                  { separator: true, label: "" },
                  {
                    label: "Supprimer",
                    danger: true,
                    icon: <Trash2 className="size-4" />,
                    onSelect: async () => {
                      if (await confirm({ title: `Supprimer ${contact.full_name} ?`, description: "Pour une demande RGPD, préférez l'anonymisation (traçabilité).", danger: true, confirmLabel: "Supprimer" })) {
                        await remove.mutateAsync(contact.id);
                        navigate("/contacts");
                      }
                    },
                  },
                ]}
              />
            </>
          )
        }
      />

      {isLoading || !contact ? (
        <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
          <Skeleton className="h-[480px] rounded-[22px]" />
          <Skeleton className="h-[480px] rounded-[22px]" />
          <Skeleton className="hidden h-[480px] rounded-[22px] xl:block" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Panel title="Informations">
              <PropertyList resource="contacts" record={contact} fields={["email", "phone", "mobile", "job_title", "company_id", "lifecycle", "source", "owner_id", "lead_score", "linkedin", "city", "country", "wallet_address", "tags", "notes"]} />
              <div className="mt-3 text-[11.5px] text-fg-3">
                Créé {relative(contact.created_at)} · modifié {relative(contact.updated_at)}
              </div>
            </Panel>
            <RgpdPanel contact={contact} />
          </div>

          <div className="min-w-0 space-y-4">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "activity", label: "Activité" },
                { value: "deals", label: "Opportunités", count: counts.deals },
                { value: "emails", label: "Emails", count: counts.emails },
                { value: "billing", label: "Devis & factures" },
                { value: "tickets", label: "Support", count: counts.tickets },
              ]}
            />
            <Panel bodyClassName="p-4 sm:p-5">
              {tab === "activity" && <Timeline scope={{ contact_id: contact.id }} />}
              {tab === "deals" && <DealsTab contact={contact} onNew={() => setNewDeal(true)} />}
              {tab === "emails" && <EmailsTab contact={contact} onCompose={() => setEmailOpen(true)} />}
              {tab === "billing" && <BillingTab contact={contact} />}
              {tab === "tickets" && <TicketsTab contact={contact} />}
            </Panel>
            <div className="space-y-4 2xl:hidden">
              <AiSummaryPanel resource="contacts" id={contact.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <RelatedTasks scope={{ contact_id: contact.id }} />
                <RelatedDocuments scope={{ contact_id: contact.id }} />
              </div>
            </div>
          </div>

          <div className="hidden space-y-4 2xl:block">
            <AiSummaryPanel resource="contacts" id={contact.id} />
            <RelatedTasks scope={{ contact_id: contact.id }} />
            <RelatedDocuments scope={{ contact_id: contact.id }} />
          </div>
        </div>
      )}

      {contact && (
        <>
          <RecordDialog resource="contacts" open={editing} onOpenChange={setEditing} recordId={contact.id} initial={contact as unknown as Record<string, unknown>} labels={{ company_id: contact.company?.name, owner_id: contact.owner?.name }} />
          <RecordDialog
            resource="deals"
            open={newDeal}
            onOpenChange={setNewDeal}
            navigateOnCreate
            initial={{ contact_id: contact.id, company_id: contact.company_id, title: contact.company ? `${contact.company.name} — ` : `${contact.full_name} — ` }}
            labels={{ contact_id: contact.full_name, company_id: contact.company?.name }}
          />
          <EmailComposer open={emailOpen} onOpenChange={setEmailOpen} to={contact.email ?? ""} context={{ contact_id: contact.id, company_id: contact.company_id }} />
          <Sheet
            open={qualifyOpen}
            onOpenChange={setQualifyOpen}
            title="Qualification BANT par Iris"
            width={560}
            footer={
              <>
                <Button variant="ghost" onClick={() => setQualifyOpen(false)}>
                  Fermer
                </Button>
                <Button variant="primary" disabled={qualify.loading || !qualify.text} onClick={applyScore}>
                  Appliquer le score et le stade
                </Button>
              </>
            }
          >
            {qualify.text ? <Markdown streaming={qualify.loading}>{qualify.text}</Markdown> : <Skeleton className="h-40" />}
          </Sheet>
        </>
      )}
    </div>
  );
}

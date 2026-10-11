import { FileText, Globe, HeartPulse, Landmark, LifeBuoy, Mail, MapPin, MoreHorizontal, Pencil, Receipt, Target, Trash2, UserPlus } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { LegalPanel, Web3Panel } from "@/components/crm/CompanyPanels";
import {
  CompanyBillingTab,
  CompanyContactsTab,
  CompanyDealsTab,
  CompanyKpis,
  CompanyProjectsTab,
  companyQueries,
  CompanySubscriptionsTab,
  CompanySupportTab,
  type CompanyTab,
} from "@/components/crm/CompanyTabs";
import { newDocPath, schemaValues } from "@/components/crm/records";
import { CompanyAvatar, HealthMeter, healthLevel } from "@/components/crm/visuals";
import { Panel } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { AiSummaryPanel, DetailHeader, NotFoundRecord, RelatedTasks, useAssistantRecord } from "@/components/entity/EntityBlocks";
import { EmailComposer } from "@/components/entity/EmailComposer";
import { PropertyList } from "@/components/entity/PropertyList";
import { RelatedDocuments } from "@/components/entity/RelatedDocuments";
import { Timeline } from "@/components/entity/Timeline";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton, StatusBadge, Tag } from "@/components/ui/display";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { COMPANY_STATUS, COMPANY_TYPES } from "@/lib/constants";
import { relative } from "@/lib/format";
import { useItem, useList, useRemove } from "@/lib/hooks";
import type { FieldDef } from "@/lib/schemas";
import type { Company, Contact, Deal, Invoice, Project, Quote, Subscription, Ticket } from "@/lib/types";
import { useAuth } from "@/stores/auth";

const INFO_FIELDS: (string | FieldDef)[] = [
  "type",
  "status",
  "industry",
  "size",
  "employees",
  { name: "annual_revenue", label: "CA annuel", type: "money" },
  "website",
  "email",
  "phone",
  "owner_id",
  "source",
  "linkedin",
  "tags",
  "description",
];

function siteOf(company: Company) {
  const raw = company.website || (company.domain ? `https://${company.domain}` : "");
  if (!raw) return null;
  const href = raw.startsWith("http") ? raw : `https://${raw}`;
  return { href, label: company.domain || raw.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") };
}

function Subtitle({ company }: { company: Company }) {
  const site = siteOf(company);
  const parts: ReactNode[] = [];
  if (company.industry) parts.push(<span>{company.industry}</span>);
  if (company.city || company.country)
    parts.push(
      <span className="inline-flex items-center gap-1">
        <MapPin className="size-3.5 text-fg-3" />
        {[company.city, company.country && company.country !== "France" ? company.country : null].filter(Boolean).join(", ") || company.country}
      </span>,
    );
  if (site)
    parts.push(
      <a href={site.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
        <Globe className="size-3.5" />
        {site.label}
      </a>,
    );
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="hidden text-fg-3 sm:inline">·</span>}
          {p}
        </Fragment>
      ))}
    </>
  );
}

function HealthBadge({ score }: { score: number }) {
  const { color, label } = healthLevel(score);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.045] py-0.5 pl-2 pr-1.5 text-[11.5px] font-medium text-fg-2 dark:bg-white/[0.07]" title={label}>
      <HeartPulse className="size-3" style={{ color }} />
      Santé
      <HealthMeter score={score} width={38} />
    </span>
  );
}

export default function CompanyDetail() {
  const { id } = useParams();
  const companyId = Number(id);
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const { data: company, isLoading, error } = useItem<Company>("companies", companyId);
  const [tab, setTab] = useState<CompanyTab>("activity");
  const [editing, setEditing] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [newDeal, setNewDeal] = useState(false);
  const [newTicket, setNewTicket] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const remove = useRemove("companies", { message: "Entreprise supprimée" });
  const confirm = useConfirm();
  useAssistantRecord("company", companyId, company?.name);

  const contacts = useList<Contact>("contacts", companyQueries.contacts(companyId)).data?.total;
  const deals = useList<Deal>("deals", companyQueries.deals(companyId)).data?.total;
  const quotes = useList<Quote>("quotes", companyQueries.quotes(companyId)).data?.total;
  const invoices = useList<Invoice>("invoices", companyQueries.invoices(companyId)).data?.total;
  const subscriptions = useList<Subscription>("subscriptions", companyQueries.subscriptions(companyId)).data?.total;
  const projects = useList<Project>("projects", companyQueries.projects(companyId)).data?.total;
  const tickets = useList<Ticket>("tickets", companyQueries.tickets(companyId)).data?.total;

  if (error) return <NotFoundRecord label="Entreprise" back="/companies" />;

  const deleteCompany = async () => {
    if (!company) return;
    const ok = await confirm({
      title: `Supprimer ${company.name} ?`,
      description:
        "Les contacts, opportunités et documents liés sont conservés mais détachés. Une entreprise ayant des factures émises ne peut pas être supprimée (conservation légale de 10 ans) : passez-la plutôt en statut « Inactif ».",
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(company.id);
      navigate("/companies");
    } catch {
      /* erreur déjà signalée par la mutation */
    }
  };

  const billingCount = quotes === undefined || invoices === undefined ? undefined : quotes + invoices;

  return (
    <div>
      <DetailHeader
        back="/companies"
        backLabel="Entreprises"
        loading={isLoading}
        visual={company ? <CompanyAvatar name={company.name} logoUrl={company.logo_url} domain={company.domain} size={64} className="shadow-[0_10px_30px_-10px_rgba(0,0,0,.5)]" /> : <Skeleton className="size-16 rounded-[20px]" />}
        title={company?.name}
        subtitle={company && <Subtitle company={company} />}
        badges={
          company && (
            <>
              <StatusBadge options={COMPANY_TYPES} value={company.type} />
              <StatusBadge options={COMPANY_STATUS} value={company.status} />
              <HealthBadge score={company.health_score} />
              {company.is_public_entity && (
                <Badge tone="indigo">
                  <Landmark className="size-3" /> Entité publique
                </Badge>
              )}
              {company.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </>
          )
        }
        actions={
          company && (
            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
              <Button variant="glass" icon={<Mail className="size-4" />} onClick={() => setEmailOpen(true)}>
                Email
              </Button>
              <Button variant="glass" icon={<UserPlus className="size-4" />} onClick={() => setNewContact(true)}>
                Nouveau contact
              </Button>
              <Button variant="primary" icon={<Target className="size-4" />} onClick={() => setNewDeal(true)}>
                Nouvelle opportunité
              </Button>
              <Menu
                trigger={
                  <Button variant="glass" aria-label="Plus d'actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
                items={[
                  { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: () => setEditing(true) },
                  { label: "Nouveau devis", icon: <FileText className="size-4" />, onSelect: () => navigate(newDocPath("/quotes/new", { company_id: company.id })) },
                  { label: "Nouvelle facture", icon: <Receipt className="size-4" />, onSelect: () => navigate(newDocPath("/invoices/new", { company_id: company.id })) },
                  { label: "Nouveau ticket", icon: <LifeBuoy className="size-4" />, onSelect: () => setNewTicket(true) },
                  { separator: true, label: "" },
                  { label: "Supprimer", danger: true, icon: <Trash2 className="size-4" />, onSelect: deleteCompany },
                ]}
              />
            </div>
          )
        }
      />

      {isLoading || !company ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr] min-[112.5rem]:grid-cols-[320px_1fr_340px]">
          <Skeleton className="h-[520px] rounded-[22px]" />
          <Skeleton className="h-[520px] rounded-[22px]" />
          <Skeleton className="hidden h-[520px] rounded-[22px] min-[112.5rem]:block" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] min-[112.5rem]:grid-cols-[320px_minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Panel title="Informations">
              <PropertyList resource="companies" record={company} fields={INFO_FIELDS} />
              <div className="mt-3 text-[11.5px] text-fg-3">
                Créée {relative(company.created_at)} · modifiée {relative(company.updated_at)}
              </div>
            </Panel>
            <LegalPanel company={company} />
            <Web3Panel company={company} />
          </div>

          <div className="min-w-0 space-y-4">
            <Panel title="Chiffres clés" className="min-[112.5rem]:hidden" bodyClassName="pt-2">
              <CompanyKpis company={company} onSelectTab={setTab} className="md:grid-cols-4" />
            </Panel>
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "activity", label: "Activité" },
                { value: "contacts", label: "Contacts", count: contacts },
                { value: "deals", label: "Opportunités", count: deals },
                { value: "billing", label: "Facturation", count: billingCount },
                { value: "subscriptions", label: "Abonnements", count: subscriptions },
                { value: "projects", label: "Projets", count: projects },
                { value: "support", label: "Support", count: tickets },
              ]}
            />
            <Panel bodyClassName="p-4 sm:p-5">
              {tab === "activity" && <Timeline scope={{ company_id: company.id }} />}
              {tab === "contacts" && <CompanyContactsTab company={company} onAdd={() => setNewContact(true)} />}
              {tab === "deals" && <CompanyDealsTab company={company} onNew={() => setNewDeal(true)} />}
              {tab === "billing" && <CompanyBillingTab company={company} />}
              {tab === "subscriptions" && <CompanySubscriptionsTab company={company} />}
              {tab === "projects" && <CompanyProjectsTab company={company} />}
              {tab === "support" && <CompanySupportTab company={company} onNew={() => setNewTicket(true)} />}
            </Panel>
            <div className="space-y-4 min-[112.5rem]:hidden">
              <AiSummaryPanel resource="companies" id={company.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <RelatedTasks scope={{ company_id: company.id }} />
                <RelatedDocuments scope={{ company_id: company.id }} />
              </div>
            </div>
          </div>

          <div className="hidden space-y-4 min-[112.5rem]:block">
            <AiSummaryPanel resource="companies" id={company.id} />
            <Panel title="Chiffres clés" bodyClassName="pt-2">
              <CompanyKpis company={company} onSelectTab={setTab} />
            </Panel>
            <RelatedTasks scope={{ company_id: company.id }} />
            <RelatedDocuments scope={{ company_id: company.id }} />
          </div>
        </div>
      )}

      {company && (
        <>
          <RecordDialog resource="companies" open={editing} onOpenChange={setEditing} recordId={company.id} initial={schemaValues("companies", company)} labels={{ owner_id: company.owner?.name }} />
          <RecordDialog
            resource="contacts"
            open={newContact}
            onOpenChange={setNewContact}
            initial={{ company_id: company.id, owner_id: me?.id }}
            labels={{ company_id: company.name, owner_id: me?.name }}
            onSaved={() => setTab("contacts")}
          />
          <RecordDialog
            resource="deals"
            open={newDeal}
            onOpenChange={setNewDeal}
            navigateOnCreate
            initial={{ company_id: company.id, owner_id: me?.id, title: `${company.name} — ` }}
            labels={{ company_id: company.name, owner_id: me?.name }}
          />
          <RecordDialog resource="tickets" open={newTicket} onOpenChange={setNewTicket} initial={{ company_id: company.id }} labels={{ company_id: company.name }} onSaved={() => setTab("support")} />
          <EmailComposer open={emailOpen} onOpenChange={setEmailOpen} to={company.email ?? ""} context={{ company_id: company.id }} />
        </>
      )}
    </div>
  );
}

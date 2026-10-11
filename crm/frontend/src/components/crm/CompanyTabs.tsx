import { FileText, FolderKanban, LifeBuoy, Plus, Receipt, Repeat, Target, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { RecordDialog } from "@/components/entity/EntityForm";
import { RelatedRow } from "@/components/entity/EntityBlocks";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, Progress, Skeleton, StatusBadge } from "@/components/ui/display";
import { DEAL_STATUS, findOption, INTERVALS, INVOICE_KIND, INVOICE_STATUS, labelOf, LIFECYCLE, PROJECT_HEALTH, PROJECT_STATUS, QUOTE_STATUS, SUBSCRIPTION_STATUS, TICKET_PRIORITY, TICKET_STATUS } from "@/lib/constants";
import { date, daysFromNow, money, moneyShort, number, percent, relative } from "@/lib/format";
import { useList } from "@/lib/hooks";
import type { Company, Contact, Deal, Invoice, Project, Quote, Subscription, Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { billingSummary, daysSince, isOverdue, newDocPath, schemaValues, totalMrr } from "./records";
import { MiniStat, SectionLabel } from "./visuals";

/** Shared list params: the header counts, the key figures and the tabs read the same cached queries. */
export const companyQueries = {
  contacts: (id: number) => ({ company_id: id, sort: "last_name", limit: 200 }),
  deals: (id: number) => ({ company_id: id, sort: "-created_at", limit: 100 }),
  quotes: (id: number) => ({ company_id: id, sort: "-issue_date", limit: 100 }),
  invoices: (id: number) => ({ company_id: id, sort: "-issue_date", limit: 500 }),
  subscriptions: (id: number) => ({ company_id: id, sort: "-created_at", limit: 100 }),
  projects: (id: number) => ({ company_id: id, sort: "-created_at", limit: 100 }),
  tickets: (id: number) => ({ company_id: id, sort: "-created_at", limit: 100 }),
};

export type CompanyTab = "activity" | "contacts" | "deals" | "billing" | "subscriptions" | "projects" | "support";

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

function TabToolbar({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-2">{children}</div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Key figures                                                                */
/* -------------------------------------------------------------------------- */

function contactHint(count: number, lastTouch: string | null) {
  if (!count) return "Aucun interlocuteur";
  const days = daysSince(lastTouch);
  if (days === null) return "Jamais contacté";
  if (days === 0) return "Contacté aujourd'hui";
  return days === 1 ? "Contacté hier" : `Contacté il y a ${days} j`;
}

const PER: Record<string, string> = { month: "mois", quarter: "trimestre", year: "an" };

export function CompanyKpis({ company, onSelectTab, className }: { company: Company; onSelectTab: (tab: CompanyTab) => void; className?: string }) {
  const invoices = useList<Invoice>("invoices", companyQueries.invoices(company.id));
  const subscriptions = useList<Subscription>("subscriptions", companyQueries.subscriptions(company.id));
  const contacts = useList<Contact>("contacts", companyQueries.contacts(company.id));
  const summary = useMemo(() => billingSummary(invoices.data?.items ?? []), [invoices.data]);
  const mrr = useMemo(() => totalMrr(subscriptions.data?.items ?? []), [subscriptions.data]);

  if (invoices.isLoading || subscriptions.isLoading || contacts.isLoading)
    return (
      <div className={cn("grid grid-cols-2 gap-2.5", className)}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[86px] rounded-[16px]" />
        ))}
      </div>
    );

  const contactCount = contacts.data?.total ?? 0;
  const lastTouch = (contacts.data?.items ?? []).reduce<string | null>((last, c) => (c.last_contacted_at && (!last || c.last_contacted_at > last) ? c.last_contacted_at : last), null);
  return (
    <div className={cn("grid grid-cols-2 gap-2.5", className)}>
      <MiniStat label="CA 12 mois" value={summary.revenue12m} format={(v) => moneyShort(v)} hint="HT, factures émises" icon={<TrendingUp className="size-3.5" />} accent="linear-gradient(135deg,#34d399,#5b6cff)" onClick={() => onSelectTab("billing")} />
      <MiniStat
        label="Encours"
        value={summary.outstanding}
        format={(v) => moneyShort(v)}
        hint={summary.overdue > 0 ? `${moneyShort(summary.overdue)} en retard` : summary.outstandingCount ? `${summary.outstandingCount} facture${summary.outstandingCount > 1 ? "s" : ""} à encaisser` : "Rien à encaisser"}
        alert={summary.overdue > 0}
        icon={<Wallet className="size-3.5" />}
        accent="linear-gradient(135deg,#ff9f0a,#ff375f)"
        onClick={() => onSelectTab("billing")}
      />
      <MiniStat label="MRR" value={mrr} format={(v) => moneyShort(v)} hint={mrr ? `ARR ${moneyShort(mrr * 12)}` : "Aucun abonnement actif"} icon={<Repeat className="size-3.5" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" onClick={() => onSelectTab("subscriptions")} />
      <MiniStat label="Contacts" value={contactCount} format={(v) => number(v)} hint={contactHint(contactCount, lastTouch)} icon={<Users className="size-3.5" />} accent="linear-gradient(135deg,#22d3ee,#5b6cff)" onClick={() => onSelectTab("contacts")} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                   */
/* -------------------------------------------------------------------------- */

export function CompanyContactsTab({ company, onAdd }: { company: Company; onAdd: () => void }) {
  const { data, isLoading } = useList<Contact>("contacts", companyQueries.contacts(company.id));
  if (isLoading) return <ListSkeleton />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title="Aucun contact"
        description="Ajoutez les interlocuteurs de cette entreprise : décideurs, utilisateurs, comptabilité…"
        action={
          <Button variant="primary" size="sm" icon={<UserPlus className="size-4" />} onClick={onAdd}>
            Ajouter un contact
          </Button>
        }
      />
    );
  return (
    <div>
      <TabToolbar
        action={
          <Button size="sm" variant="subtle" icon={<UserPlus className="size-4" />} onClick={onAdd}>
            Ajouter un contact
          </Button>
        }
      >
        <span>
          <b className="font-semibold text-fg tabular">{data.total}</b> contact{data.total > 1 ? "s" : ""}
        </span>
      </TabToolbar>
      <div className="space-y-0.5">
        {data.items.map((c) => (
          <RelatedRow
            key={c.id}
            to={`/contacts/${c.id}`}
            icon={<Avatar name={c.full_name} src={c.avatar_url} size={34} />}
            title={c.full_name}
            meta={[c.job_title, c.email ?? c.phone].filter(Boolean).join(" · ") || "—"}
            right={
              <div className="flex items-center gap-1.5">
                {c.do_not_contact && (
                  <Badge tone="red" size="xs">
                    Ne pas contacter
                  </Badge>
                )}
                <StatusBadge options={LIFECYCLE} value={c.lifecycle} size="xs" />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Deals                                                                      */
/* -------------------------------------------------------------------------- */

export function CompanyDealsTab({ company, onNew }: { company: Company; onNew: () => void }) {
  const { data, isLoading } = useList<Deal>("deals", companyQueries.deals(company.id));
  const totals = useMemo(() => {
    const items = data?.items ?? [];
    const open = items.filter((d) => d.status === "open");
    return {
      openCount: open.length,
      open: open.reduce((s, d) => s + d.value, 0),
      weighted: open.reduce((s, d) => s + (d.value * (d.probability ?? d.stage?.probability ?? 0)) / 100, 0),
      won: items.filter((d) => d.status === "won").reduce((s, d) => s + d.value, 0),
    };
  }, [data]);
  if (isLoading) return <ListSkeleton />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<Target className="size-6" />}
        title="Aucune opportunité"
        description="Suivez ici les affaires en cours avec cette entreprise."
        action={
          <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={onNew}>
            Nouvelle opportunité
          </Button>
        }
      />
    );
  return (
    <div>
      <TabToolbar
        action={
          <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={onNew}>
            Nouvelle opportunité
          </Button>
        }
      >
        <span>
          <b className="font-semibold text-fg tabular">{totals.openCount}</b> en cours · <b className="font-semibold text-fg tabular">{moneyShort(totals.open)}</b>
        </span>
        <span>
          pondéré <b className="font-semibold text-fg tabular">{moneyShort(totals.weighted)}</b>
        </span>
        <span>
          gagné <b className="font-semibold text-emerald-600 tabular dark:text-emerald-400">{moneyShort(totals.won)}</b>
        </span>
      </TabToolbar>
      <div className="space-y-0.5">
        {data.items.map((d) => {
          const late = d.status === "open" && (daysFromNow(d.expected_close_date) ?? 0) < 0;
          return (
            <RelatedRow
              key={d.id}
              to={`/deals/${d.id}`}
              icon={<span className="size-2.5 shrink-0 rounded-full" style={{ background: d.stage?.color ?? "var(--accent)", boxShadow: `0 0 8px ${d.stage?.color ?? "var(--accent)"}` }} />}
              title={d.title}
              meta={
                <>
                  {d.stage?.name ?? "—"}
                  {d.expected_close_date && <span className={cn(late && "font-medium text-red-500")}> · closing {date(d.expected_close_date, "d MMM yyyy")}</span>}
                </>
              }
              right={
                <div className="flex items-center gap-2">
                  <span className="text-right">
                    <span className="block text-[13px] font-semibold tabular">{money(d.value, "EUR", { decimals: 0 })}</span>
                    {d.mrr > 0 && <span className="block text-[11px] text-violet-600 tabular dark:text-violet-300">dont {moneyShort(d.mrr)}/mois</span>}
                  </span>
                  <StatusBadge options={DEAL_STATUS} value={d.status} size="xs" />
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Billing                                                                    */
/* -------------------------------------------------------------------------- */

const PREVIEW = 8;

function InvoiceRow({ inv }: { inv: Invoice }) {
  const overdue = isOverdue(inv);
  const late = overdue ? -(daysFromNow(inv.due_date) ?? 0) : 0;
  const kind = inv.kind !== "invoice" ? `${labelOf(INVOICE_KIND, inv.kind)} · ` : "";
  return (
    <RelatedRow
      to={`/invoices/${inv.id}`}
      icon={
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[10px]", overdue ? "bg-red-500/12 text-red-500" : "bg-accent-soft text-accent")}>
          <Receipt className="size-4" />
        </span>
      }
      title={`${inv.number || "Brouillon"}${inv.title ? ` — ${inv.title}` : ""}`}
      meta={
        <>
          {kind}
          {inv.locked ? `émise le ${date(inv.issue_date)}` : "non émise"}
          {inv.due_date && inv.kind !== "credit_note" && (overdue ? <span className="font-medium text-red-500"> · échue depuis {late} j</span> : ` · échéance ${date(inv.due_date, "d MMM")}`)}
        </>
      }
      right={
        <div className="flex items-center gap-2">
          <span className="text-right">
            <span className="block text-[13px] font-semibold tabular">{money(inv.total)}</span>
            {inv.locked && inv.balance_due > 0.005 && inv.balance_due < inv.total && <span className="block text-[11px] text-fg-3 tabular">reste {money(inv.balance_due)}</span>}
          </span>
          <StatusBadge options={INVOICE_STATUS} value={inv.status} size="xs" />
        </div>
      }
    />
  );
}

export function QuoteRow({ q }: { q: Quote }) {
  const expired = ["sent", "viewed"].includes(q.status) && (daysFromNow(q.valid_until) ?? 0) < 0;
  return (
    <RelatedRow
      to={`/quotes/${q.id}`}
      icon={
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-cyan-500/12 text-cyan-600 dark:text-cyan-300">
          <FileText className="size-4" />
        </span>
      }
      title={`${q.number || "Brouillon"}${q.title ? ` — ${q.title}` : ""}`}
      meta={
        <>
          {date(q.issue_date)}
          {q.valid_until && <span className={cn(expired && "font-medium text-orange-600 dark:text-orange-400")}> · {expired ? "expiré le" : "valable jusqu'au"} {date(q.valid_until, "d MMM")}</span>}
        </>
      }
      right={
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tabular">{money(q.total)}</span>
          <StatusBadge options={QUOTE_STATUS} value={q.status} size="xs" />
        </div>
      }
    />
  );
}

export function CompanyBillingTab({ company }: { company: Company }) {
  const navigate = useNavigate();
  const quotes = useList<Quote>("quotes", companyQueries.quotes(company.id));
  const invoices = useList<Invoice>("invoices", companyQueries.invoices(company.id));
  const [allQuotes, setAllQuotes] = useState(false);
  const [allInvoices, setAllInvoices] = useState(false);
  const summary = useMemo(() => billingSummary(invoices.data?.items ?? []), [invoices.data]);
  const newQuote = () => navigate(newDocPath("/quotes/new", { company_id: company.id }));
  const newInvoice = () => navigate(newDocPath("/invoices/new", { company_id: company.id }));

  if (quotes.isLoading || invoices.isLoading) return <ListSkeleton />;
  const quoteRows = quotes.data?.items ?? [];
  const invoiceRows = invoices.data?.items ?? [];
  if (!quoteRows.length && !invoiceRows.length)
    return (
      <EmptyState
        icon={<Receipt className="size-6" />}
        title="Aucun devis ni facture"
        description="Les devis et factures de cette entreprise apparaîtront ici, avec le suivi des encaissements."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="primary" icon={<FileText className="size-4" />} onClick={newQuote}>
              Nouveau devis
            </Button>
            <Button size="sm" icon={<Receipt className="size-4" />} onClick={newInvoice}>
              Nouvelle facture
            </Button>
          </div>
        }
      />
    );

  const collected = summary.invoicedTtc > 0 ? Math.min(100, (summary.paid / summary.invoicedTtc) * 100) : 0;
  const shownInvoices = allInvoices ? invoiceRows : invoiceRows.slice(0, PREVIEW);
  const shownQuotes = allQuotes ? quoteRows : quoteRows.slice(0, PREVIEW);

  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <MiniStat label="Facturé TTC" value={summary.invoicedTtc} format={(v) => money(v, "EUR", { decimals: 0 })} hint={`${summary.issuedCount} document${summary.issuedCount > 1 ? "s" : ""} émis`} icon={<Receipt className="size-3.5" />} accent="linear-gradient(135deg,#5b6cff,#22d3ee)" />
          <MiniStat label="Encaissé" value={summary.paid} format={(v) => money(v, "EUR", { decimals: 0 })} hint={`${percent(collected, 0)} du facturé`} icon={<Wallet className="size-3.5" />} accent="linear-gradient(135deg,#1baf7a,#22d3ee)" />
          <MiniStat label="Reste dû" value={summary.outstanding} format={(v) => money(v, "EUR", { decimals: 0 })} hint={summary.outstandingCount ? `${summary.outstandingCount} facture${summary.outstandingCount > 1 ? "s" : ""} ouverte${summary.outstandingCount > 1 ? "s" : ""}` : "Tout est réglé"} icon={<Receipt className="size-3.5" />} accent="linear-gradient(135deg,#8b5cf6,#5b6cff)" />
          <MiniStat label="En retard" value={summary.overdue} format={(v) => money(v, "EUR", { decimals: 0 })} hint={summary.overdueCount ? `${summary.overdueCount} facture${summary.overdueCount > 1 ? "s" : ""} échue${summary.overdueCount > 1 ? "s" : ""}` : "Aucun retard"} alert={summary.overdue > 0} icon={<Receipt className="size-3.5" />} accent="linear-gradient(135deg,#ff9f0a,#ff375f)" />
        </div>
        {summary.invoicedTtc > 0 && (
          <div className="mt-3 flex items-center gap-3 px-1">
            <Progress value={collected} height={6} tone="linear-gradient(90deg,#1baf7a,#22d3ee)" />
            <span className="shrink-0 text-[12px] text-fg-3 tabular">{percent(collected, 0)} encaissé</span>
          </div>
        )}
      </div>

      <div>
        <SectionLabel
          right={
            <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={newQuote}>
              Nouveau devis
            </Button>
          }
        >
          Devis · {quotes.data?.total ?? 0}
        </SectionLabel>
        {quoteRows.length ? (
          shownQuotes.map((q) => <QuoteRow key={q.id} q={q} />)
        ) : (
          <p className="px-2.5 py-2 text-[12.5px] text-fg-3">Aucun devis pour l'instant.</p>
        )}
        {quoteRows.length > PREVIEW && (
          <button onClick={() => setAllQuotes((v) => !v)} className="mt-1 px-2.5 text-[12.5px] font-medium text-accent">
            {allQuotes ? "Réduire" : `Afficher les ${quoteRows.length} devis`}
          </button>
        )}
      </div>

      <div>
        <SectionLabel
          right={
            <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={newInvoice}>
              Nouvelle facture
            </Button>
          }
        >
          Factures · {invoices.data?.total ?? 0}
        </SectionLabel>
        {invoiceRows.length ? (
          shownInvoices.map((inv) => <InvoiceRow key={inv.id} inv={inv} />)
        ) : (
          <p className="px-2.5 py-2 text-[12.5px] text-fg-3">Aucune facture pour l'instant.</p>
        )}
        {invoiceRows.length > PREVIEW && (
          <button onClick={() => setAllInvoices((v) => !v)} className="mt-1 px-2.5 text-[12.5px] font-medium text-accent">
            {allInvoices ? "Réduire" : `Afficher les ${invoiceRows.length} factures`}
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

export function CompanySubscriptionsTab({ company }: { company: Company }) {
  const { data, isLoading } = useList<Subscription>("subscriptions", companyQueries.subscriptions(company.id));
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [creating, setCreating] = useState(false);
  const items = data?.items ?? [];
  const mrr = totalMrr(items);
  const active = items.filter((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due").length;

  const dialogs = (
    <>
      <RecordDialog resource="subscriptions" open={creating} onOpenChange={setCreating} initial={{ company_id: company.id }} labels={{ company_id: company.name }} />
      <RecordDialog
        resource="subscriptions"
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        recordId={editing?.id}
        initial={editing ? schemaValues("subscriptions", editing) : undefined}
        labels={{ company_id: company.name, product_id: editing?.product?.name }}
      />
    </>
  );

  if (isLoading) return <ListSkeleton />;
  if (!items.length)
    return (
      <>
        <EmptyState
          icon={<Repeat className="size-6" />}
          title="Aucun abonnement"
          description="Abonnements SaaS, licences, contrats de maintenance ou retainers : leur MRR alimente vos indicateurs."
          action={
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvel abonnement
            </Button>
          }
        />
        {dialogs}
      </>
    );

  return (
    <div>
      <TabToolbar
        action={
          <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouvel abonnement
          </Button>
        }
      >
        <span>
          MRR total <b className="font-semibold text-fg tabular">{money(mrr, "EUR", { decimals: 0 })}</b>
        </span>
        <span>
          ARR <b className="font-semibold text-fg tabular">{moneyShort(mrr * 12)}</b>
        </span>
        <span>
          {active} actif{active > 1 ? "s" : ""} sur {items.length}
        </span>
      </TabToolbar>
      <div className="space-y-0.5">
        {items.map((s) => (
          <button key={s.id} type="button" onClick={() => setEditing(s)} className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-violet-500/12 text-violet-600 dark:text-violet-300">
              <Repeat className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">{s.plan}</div>
              <div className="truncate text-[11.5px] text-fg-3">
                {money(s.amount)} / {PER[s.interval] ?? labelOf(INTERVALS, s.interval).toLowerCase()}
                {s.quantity > 1 ? ` × ${s.quantity}` : ""}
                {s.discount ? ` · remise ${percent(s.discount, 0)}` : ""}
                {s.current_period_end && s.status !== "canceled" ? ` · renouvellement ${date(s.current_period_end, "d MMM yyyy")}` : ""}
                {s.canceled_at ? ` · résilié le ${date(s.canceled_at)}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-right">
                <span className="block text-[13px] font-semibold tabular">{money(s.mrr, "EUR", { decimals: 0 })}</span>
                <span className="block text-[10.5px] text-fg-3">MRR</span>
              </span>
              <StatusBadge options={SUBSCRIPTION_STATUS} value={s.status} size="xs" />
            </div>
          </button>
        ))}
      </div>
      {dialogs}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export function CompanyProjectsTab({ company }: { company: Company }) {
  const me = useAuth((s) => s.user);
  const { data, isLoading } = useList<Project>("projects", companyQueries.projects(company.id));
  const [creating, setCreating] = useState(false);
  const dialog = <RecordDialog resource="projects" open={creating} onOpenChange={setCreating} initial={{ company_id: company.id, owner_id: me?.id }} labels={{ company_id: company.name, owner_id: me?.name }} />;
  if (isLoading) return <ListSkeleton />;
  const items = data?.items ?? [];
  if (!items.length)
    return (
      <>
        <EmptyState
          icon={<FolderKanban className="size-6" />}
          title="Aucun projet"
          description="Missions, développements, accompagnements : suivez l'avancement, le temps passé et la rentabilité."
          action={
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouveau projet
            </Button>
          }
        />
        {dialog}
      </>
    );
  const running = items.filter((p) => p.status === "active").length;
  return (
    <div>
      <TabToolbar
        action={
          <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nouveau projet
          </Button>
        }
      >
        <span>
          <b className="font-semibold text-fg tabular">{items.length}</b> projet{items.length > 1 ? "s" : ""} · {running} en cours
        </span>
      </TabToolbar>
      <div className="space-y-0.5">
        {items.map((p) => {
          const late = p.due_date && !["completed", "cancelled"].includes(p.status) && (daysFromNow(p.due_date) ?? 0) < 0;
          return (
            <RelatedRow
              key={p.id}
              to={`/projects/${p.id}`}
              icon={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]" style={{ background: `linear-gradient(140deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #000))` }}>
                  <FolderKanban className="size-4" />
                </span>
              }
              title={p.name}
              meta={
                <>
                  {labelOf(PROJECT_STATUS, p.status)}
                  {p.due_date && <span className={cn(late && "font-medium text-red-500")}> · échéance {date(p.due_date, "d MMM yyyy")}</span>}
                </>
              }
              right={
                <div className="flex items-center gap-2.5">
                  <div className="hidden w-24 items-center gap-2 sm:flex">
                    <Progress value={p.progress} height={5} />
                    <span className="w-8 text-right text-[11.5px] text-fg-3 tabular">{Math.round(p.progress)} %</span>
                  </div>
                  <StatusBadge options={PROJECT_HEALTH} value={p.health} size="xs" />
                </div>
              }
            />
          );
        })}
      </div>
      {dialog}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

export function CompanySupportTab({ company, onNew }: { company: Company; onNew: () => void }) {
  const { data, isLoading } = useList<Ticket>("tickets", companyQueries.tickets(company.id));
  if (isLoading) return <ListSkeleton />;
  const items = data?.items ?? [];
  if (!items.length)
    return (
      <EmptyState
        icon={<LifeBuoy className="size-6" />}
        title="Aucun ticket"
        description="Les demandes de support de cette entreprise, tous canaux confondus, apparaîtront ici."
        action={
          <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={onNew}>
            Nouveau ticket
          </Button>
        }
      />
    );
  const open = items.filter((t) => !["resolved", "closed"].includes(t.status)).length;
  return (
    <div>
      <TabToolbar
        action={
          <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={onNew}>
            Nouveau ticket
          </Button>
        }
      >
        <span>
          <b className="font-semibold text-fg tabular">{open}</b> ouvert{open > 1 ? "s" : ""} sur {items.length}
        </span>
      </TabToolbar>
      <div className="space-y-0.5">
        {items.map((t) => {
          const priority = findOption(TICKET_PRIORITY, t.priority);
          return (
            <RelatedRow
              key={t.id}
              to={`/tickets/${t.id}`}
              icon={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-pink-500/12 text-pink-600 dark:text-pink-300">
                  <LifeBuoy className="size-4" />
                </span>
              }
              title={`${t.number} · ${t.subject}`}
              meta={
                <>
                  {relative(t.created_at)}
                  {t.contact ? ` · ${t.contact.name}` : ""}
                  {priority && (t.priority === "high" || t.priority === "urgent") && <span className="font-medium text-orange-600 dark:text-orange-400"> · priorité {priority.label.toLowerCase()}</span>}
                </>
              }
              right={<StatusBadge options={TICKET_STATUS} value={t.status} size="xs" />}
            />
          );
        })}
      </div>
    </div>
  );
}

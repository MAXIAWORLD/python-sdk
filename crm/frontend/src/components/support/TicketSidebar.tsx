import { Building2, Gauge, Mail, Phone, Star, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { KeyValue, Panel } from "@/components/data/blocks";
import { RelatedRow } from "@/components/entity/EntityBlocks";
import { PropertyList } from "@/components/entity/PropertyList";
import { Avatar, CompanyLogo, Skeleton, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { COMPANY_TYPES, TICKET_STATUS } from "@/lib/constants";
import { dateTime, relative } from "@/lib/format";
import { useItem, useList, useUpdate } from "@/lib/hooks";
import type { FieldDef } from "@/lib/schemas";
import type { Contact, Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SlaMeter } from "./sla";
import { ms, span } from "./time";

const TAGS_FIELD: FieldDef = { name: "tags", label: "Tags", type: "tags" };

export function TicketPropertiesPanel({ ticket }: { ticket: Ticket }) {
  return (
    <Panel title="Propriétés">
      <PropertyList resource="tickets" record={ticket} fields={["status", "priority", "assignee_id", "category", "channel", TAGS_FIELD]} />
      <div className="mt-3 text-[11.5px] text-fg-3">
        Créé {relative(ticket.created_at)} · modifié {relative(ticket.updated_at)}
      </div>
    </Panel>
  );
}

/** 1–5 stars; clickable to record the customer's rating. */
export function SatisfactionStars({ value, onChange }: { value?: number | null; onChange?: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onMouseEnter={() => onChange && setHover(n)}
          onClick={() => onChange?.(value === n ? null : n)}
          className="rounded-[6px] p-0.5 transition-transform enabled:hover:scale-110 disabled:cursor-default"
          aria-label={`${n} étoile${n > 1 ? "s" : ""} sur 5`}
        >
          <Star className={cn("size-4", n <= shown ? "fill-amber-400 text-amber-400" : "text-fg-3")} />
        </button>
      ))}
    </span>
  );
}

export function TicketSlaPanel({ ticket, now }: { ticket: Ticket; now: number }) {
  const update = useUpdate("tickets", { message: "Satisfaction enregistrée" });
  const created = ms(ticket.created_at);
  const first = ms(ticket.first_response_at);
  const resolved = ms(ticket.resolved_at);
  const waiting = ["new", "open"].includes(ticket.status);
  return (
    <Panel title="Délais & qualité" icon={<Gauge className="size-4" />}>
      <SlaMeter ticket={ticket} now={now} />
      <div className="mt-3 divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
        <KeyValue label="Première réponse">
          {Number.isNaN(first) ? (
            <span className={waiting ? "font-medium text-orange-600 dark:text-orange-400" : "text-fg-3"}>{waiting ? "En attente" : "—"}</span>
          ) : (
            <span title={dateTime(ticket.first_response_at)}>
              en <b className="font-semibold tabular">{span(first - created)}</b>
            </span>
          )}
        </KeyValue>
        <KeyValue label="Résolution">
          {Number.isNaN(resolved) ? (
            <span className="text-fg-3">—</span>
          ) : (
            <span title={dateTime(ticket.resolved_at)}>
              en <b className="font-semibold tabular">{span(resolved - created)}</b>
            </span>
          )}
        </KeyValue>
        <KeyValue label="Satisfaction">
          <span className="inline-flex flex-col items-end gap-0.5">
            <SatisfactionStars value={ticket.satisfaction} onChange={(v) => update.mutate({ id: ticket.id, data: { satisfaction: v } })} />
            {!ticket.satisfaction && <span className="text-[11px] text-fg-3">Note client à saisir</span>}
          </span>
        </KeyValue>
      </div>
    </Panel>
  );
}

export function CustomerPanel({ ticket }: { ticket: Ticket }) {
  const update = useUpdate("tickets", { message: "Client associé au ticket" });
  const { data: contact, isLoading } = useItem<Contact>("contacts", ticket.contact_id);
  const scopeKey = ticket.contact_id ? "contact_id" : "company_id";
  const scopeId = ticket.contact_id ?? ticket.company_id;
  const others = useList<Ticket>("tickets", { [scopeKey]: scopeId ?? undefined, id__ne: ticket.id, sort: "-created_at", limit: 5 }, { enabled: !!scopeId });

  if (!ticket.contact_id && !ticket.company_id)
    return (
      <Panel title="Client" icon={<UserRound className="size-4" />}>
        <p className="mb-2.5 text-[12.5px] text-fg-3">Aucun demandeur associé. Liez un contact pour retrouver son historique.</p>
        <EntitySelect
          resource="contacts"
          value={null}
          onChange={(id, row) => id && update.mutate({ id: ticket.id, data: { contact_id: id, company_id: (row?.company_id as number | null | undefined) ?? null } })}
          placeholder="Rechercher un contact…"
        />
      </Panel>
    );

  return (
    <Panel title="Client" icon={<UserRound className="size-4" />} bodyClassName="px-3 pb-3 pt-2">
      {ticket.contact && (
        <div className="px-2">
          <div className="flex items-center gap-3">
            <Avatar name={ticket.contact.name} src={(ticket.contact.avatar_url as string) ?? undefined} size={44} />
            <div className="min-w-0">
              <Link to={`/contacts/${ticket.contact.id}`} className="block truncate text-[14.5px] font-semibold hover:text-accent">
                {ticket.contact.name}
              </Link>
              <div className="truncate text-[12.5px] text-fg-3">{(ticket.contact.job_title as string) || "Contact"}</div>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="mt-3 h-8" />
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {contact?.email && (
                <a href={`mailto:${contact.email}`} className="glass-flat inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-fg-2 hover:text-accent">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </a>
              )}
              {(contact?.phone || contact?.mobile) && !contact?.do_not_call && (
                <a href={`tel:${contact.phone ?? contact.mobile}`} className="glass-flat inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-fg-2 hover:text-accent">
                  <Phone className="size-3.5" />
                  {contact.phone ?? contact.mobile}
                </a>
              )}
            </div>
          )}
        </div>
      )}
      {ticket.company && (
        <Link to={`/companies/${ticket.company.id}`} className={cn("flex items-center gap-3 rounded-[14px] px-2 py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]", ticket.contact && "mt-3 border-t border-[var(--hairline)] pt-3")}>
          <CompanyLogo name={ticket.company.name} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{ticket.company.name}</div>
            <div className="truncate text-[11.5px] text-fg-3">{(ticket.company.domain as string) || "Entreprise"}</div>
          </div>
          {ticket.company.type ? <StatusBadge options={COMPANY_TYPES} value={ticket.company.type as string} size="xs" /> : <Building2 className="size-4 text-fg-3" />}
        </Link>
      )}
      <div className="mt-3 border-t border-[var(--hairline)] pt-2.5">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">Autres tickets</span>
          {!!others.data?.total && (
            <Link to={`/tickets?${scopeKey}=${scopeId}`} className="text-[12px] font-medium text-accent">
              Tout voir ({others.data.total})
            </Link>
          )}
        </div>
        {others.isLoading ? (
          <Skeleton className="mx-2 h-10" />
        ) : others.data?.items.length ? (
          others.data.items.map((t) => <RelatedRow key={t.id} to={`/tickets/${t.id}`} title={t.subject} meta={`${t.number} · ${relative(t.created_at)}`} right={<StatusBadge options={TICKET_STATUS} value={t.status} size="xs" />} />)
        ) : (
          <p className="px-2 py-2 text-[12.5px] text-fg-3">Premier ticket de ce client.</p>
        )}
      </div>
    </Panel>
  );
}

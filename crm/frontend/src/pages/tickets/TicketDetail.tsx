import { CircleCheck, Lock, Mail, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AiSummaryPanel, DetailHeader, NotFoundRecord, useAssistantRecord } from "@/components/entity/EntityBlocks";
import { EmailComposer } from "@/components/entity/EmailComposer";
import { RecordDialog } from "@/components/entity/EntityForm";
import { RelatedDocuments } from "@/components/entity/RelatedDocuments";
import { Glass } from "@/components/glass/Glass";
import { channelIcon, ChannelLabel, PRIORITY_GRADIENT } from "@/components/support/channels";
import { replySubject, useMailSettings } from "@/components/support/mail";
import { SlaBadge } from "@/components/support/sla";
import { useNow } from "@/components/support/time";
import { TicketComposer } from "@/components/support/TicketComposer";
import { CustomerPanel, TicketPropertiesPanel, TicketSlaPanel } from "@/components/support/TicketSidebar";
import { TicketThread, type ThreadMessage } from "@/components/support/TicketThread";
import { Button } from "@/components/ui/button";
import { Skeleton, StatusBadge, Tag } from "@/components/ui/display";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { TICKET_PRIORITY, TICKET_STATUS } from "@/lib/constants";
import { relative } from "@/lib/format";
import { useItem, useList, useRemove, useUpdate } from "@/lib/hooks";
import type { Ticket } from "@/lib/types";

export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const navigate = useNavigate();
  const now = useNow(30_000);
  const { data: ticket, isLoading, error } = useItem<Ticket>("tickets", ticketId);
  const messages = useList<ThreadMessage>("ticket-messages", { ticket_id: ticketId, sort: "created_at", limit: 500 });
  const { smtpReady } = useMailSettings();
  const update = useUpdate("tickets", { silent: true });
  const remove = useRemove("tickets", { message: "Ticket supprimé" });
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  useAssistantRecord("ticket", ticketId, ticket ? `${ticket.number} · ${ticket.subject}` : undefined);

  if (error) return <NotFoundRecord label="Ticket" back="/tickets" />;

  const items = messages.data?.items ?? [];
  const notes = items.filter((m) => m.is_internal).length;
  const done = ticket && ["resolved", "closed"].includes(ticket.status);
  const setStatus = (status: string, message: string) => ticket && update.mutate({ id: ticket.id, data: { status } }, { onSuccess: () => toast.success(message) });
  const Icon = channelIcon(ticket?.channel);

  return (
    <div>
      <DetailHeader
        back="/tickets"
        backLabel="Tickets"
        loading={isLoading}
        visual={
          ticket ? (
            <span
              className="flex size-14 shrink-0 items-center justify-center rounded-[18px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_12px_30px_-12px_rgba(0,0,0,.5)]"
              style={{ background: PRIORITY_GRADIENT[ticket.priority] ?? PRIORITY_GRADIENT.normal }}
            >
              <Icon className="size-6" />
            </span>
          ) : (
            <Skeleton className="size-14 rounded-[18px]" />
          )
        }
        title={ticket?.subject}
        subtitle={
          ticket && (
            <>
              <span className="font-medium text-fg tabular">{ticket.number}</span>
              <span className="text-fg-3">·</span>
              <ChannelLabel channel={ticket.channel} />
              <span className="text-fg-3">· ouvert {relative(ticket.created_at)}</span>
              {ticket.contact && (
                <Link to={`/contacts/${ticket.contact.id}`} className="font-medium text-fg hover:text-accent">
                  · {ticket.contact.name}
                </Link>
              )}
              {ticket.company && (
                <Link to={`/companies/${ticket.company.id}`} className="text-fg-2 hover:text-accent">
                  ({ticket.company.name})
                </Link>
              )}
            </>
          )
        }
        badges={
          ticket && (
            <>
              <StatusBadge options={TICKET_STATUS} value={ticket.status} />
              <StatusBadge options={TICKET_PRIORITY} value={ticket.priority} />
              <SlaBadge ticket={ticket} now={now} />
              {ticket.category && <Tag>{ticket.category}</Tag>}
              {ticket.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </>
          )
        }
        actions={
          ticket && (
            <>
              {done ? (
                <Button variant="glass" icon={<RotateCcw className="size-4" />} loading={update.isPending} onClick={() => setStatus("open", "Ticket rouvert")}>
                  Rouvrir
                </Button>
              ) : (
                <Button variant="primary" icon={<CircleCheck className="size-4" />} loading={update.isPending} onClick={() => setStatus("resolved", "Ticket résolu")}>
                  Résoudre
                </Button>
              )}
              {ticket.status !== "closed" && (
                <Button variant="glass" icon={<Lock className="size-4" />} onClick={() => setStatus("closed", "Ticket fermé")}>
                  Fermer
                </Button>
              )}
              <Menu
                trigger={
                  <Button variant="glass" aria-label="Plus d'actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
                items={[
                  { label: "Modifier le ticket", icon: <Pencil className="size-4" />, onSelect: () => setEditing(true) },
                  { label: "Écrire un email au client", icon: <Mail className="size-4" />, onSelect: () => setEmailOpen(true), disabled: !ticket.contact?.email },
                  { separator: true, label: "" },
                  {
                    label: "Supprimer",
                    danger: true,
                    icon: <Trash2 className="size-4" />,
                    onSelect: async () => {
                      if (await confirm({ title: `Supprimer le ticket ${ticket.number} ?`, description: "La conversation et les notes internes seront définitivement supprimées.", danger: true, confirmLabel: "Supprimer" })) {
                        await remove.mutateAsync(ticket.id);
                        navigate("/tickets");
                      }
                    },
                  },
                ]}
              />
            </>
          )
        }
      />

      {isLoading || !ticket ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-[560px] rounded-[22px]" />
          <Skeleton className="hidden h-[560px] rounded-[22px] lg:block" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-262px)] lg:min-h-[540px] lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <Glass radius="lg" className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3">
              <div className="text-[13px] font-semibold">
                Conversation{" "}
                <span className="font-normal text-fg-3">
                  · {items.length} message{items.length > 1 ? "s" : ""}
                  {notes ? ` dont ${notes} note${notes > 1 ? "s" : ""} interne${notes > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              {ticket.assignee && <span className="truncate text-[12px] text-fg-3">Assigné à {ticket.assignee.name}</span>}
            </div>
            <TicketThread ticket={ticket} messages={items} loading={messages.isLoading} className="max-h-[70vh] lg:max-h-none" />
            <TicketComposer key={ticket.id} ticket={ticket} smtpReady={smtpReady} />
          </Glass>

          <div className="min-h-0 space-y-4 lg:-mx-2 lg:overflow-y-auto lg:px-2 lg:pb-2">
            <TicketPropertiesPanel ticket={ticket} />
            <TicketSlaPanel ticket={ticket} now={now} />
            <CustomerPanel ticket={ticket} />
            <AiSummaryPanel resource="tickets" id={ticket.id} title="Synthèse d'Iris" />
            <RelatedDocuments scope={{ ticket_id: ticket.id }} />
          </div>
        </div>
      )}

      {ticket && (
        <>
          <RecordDialog
            resource="tickets"
            open={editing}
            onOpenChange={setEditing}
            recordId={ticket.id}
            initial={ticket as unknown as Record<string, unknown>}
            labels={{ contact_id: ticket.contact?.name, company_id: ticket.company?.name, assignee_id: ticket.assignee?.name }}
          />
          <EmailComposer
            open={emailOpen}
            onOpenChange={setEmailOpen}
            to={(ticket.contact?.email as string) ?? ""}
            subject={replySubject(`[${ticket.number}] ${ticket.subject}`)}
            context={{ contact_id: ticket.contact_id, company_id: ticket.company_id, ticket_id: ticket.id }}
          />
        </>
      )}
    </div>
  );
}

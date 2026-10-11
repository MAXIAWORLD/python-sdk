import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Avatar, Skeleton } from "@/components/ui/display";
import { TICKET_STATUS, TONE_STYLES, type Option } from "@/lib/constants";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChannelLabel, PRIORITY_DOT } from "./channels";
import { SlaBadge } from "./sla";

export function TicketCard({ ticket, now, overlay }: { ticket: Ticket; now: number; overlay?: boolean }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => !overlay && navigate(`/tickets/${ticket.id}`)}
      className={cn("glass group cursor-grab rounded-[16px] p-3 active:cursor-grabbing", overlay && "rotate-[2deg] scale-[1.03] shadow-[0_30px_60px_-20px_rgba(20,30,90,.55)] ring-1 ring-[var(--accent)]/40")}
      style={{ ["--glass-blur" as string]: "18px" }}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", PRIORITY_DOT[ticket.priority] ?? PRIORITY_DOT.normal)} title={`Priorité ${ticket.priority}`} />
        <div className="line-clamp-2 text-[13.5px] font-medium leading-snug">{ticket.subject}</div>
      </div>
      <div className="mt-1 truncate pl-4 text-[11.5px] text-fg-3">
        <span className="tabular">{ticket.number}</span>
        {ticket.category ? ` · ${ticket.category}` : ""}
      </div>
      {(ticket.contact || ticket.company) && (
        <div className="mt-2 flex min-w-0 items-center gap-1.5 pl-4 text-[12px] text-fg-2">
          <Avatar name={ticket.contact?.name ?? ticket.company?.name} size={18} />
          <span className="truncate">{[ticket.contact?.name, ticket.company?.name].filter(Boolean).join(" · ")}</span>
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 pl-2.5">
        <SlaBadge ticket={ticket} now={now} withTooltip={false} />
        <div className="flex items-center gap-2">
          <ChannelLabel channel={ticket.channel} iconOnly />
          {ticket.assignee ? (
            <Avatar name={ticket.assignee.name} color={(ticket.assignee.color as string) ?? undefined} size={22} />
          ) : (
            <span className="size-[22px] rounded-full border border-dashed border-[var(--hairline-strong)]" title="Non assigné" />
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableTicket({ ticket, now }: { ticket: Ticket; now: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `ticket-${ticket.id}`, data: { ticket } });
  return (
    <div ref={setNodeRef} className={cn("transition-opacity", isDragging && "opacity-30")} {...attributes} {...listeners}>
      <TicketCard ticket={ticket} now={now} />
    </div>
  );
}

function StatusColumn({ option, tickets, now }: { option: Option; tickets: Ticket[]; now: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${option.value}`, data: { status: option.value } });
  const tone = TONE_STYLES[option.tone ?? "gray"];
  return (
    <div className="flex w-[284px] shrink-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className={cn("size-2.5 rounded-full", tone.dot)} />
        <span className="truncate text-[13.5px] font-semibold">{option.label}</span>
        <span className="rounded-full bg-black/[0.06] px-1.5 text-[11px] font-semibold tabular text-fg-2 dark:bg-white/10">{tickets.length}</span>
      </div>
      <div ref={setNodeRef} className={cn("flex min-h-[180px] flex-1 flex-col gap-2 rounded-[20px] p-2 transition-colors", isOver ? "bg-accent-soft ring-1 ring-[var(--accent)]/30" : "bg-black/[0.025] dark:bg-white/[0.03]")}>
        {tickets.map((t) => (
          <DraggableTicket key={t.id} ticket={t} now={now} />
        ))}
        {tickets.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 py-10 text-[12px] text-fg-3">
            <Inbox className="size-4" />
            Aucun ticket
          </div>
        )}
      </div>
    </div>
  );
}

/** Kanban of tickets by status; dropping a card on a column changes its status. */
export function TicketBoard({ tickets, loading, now, onMove }: { tickets: Ticket[]; loading: boolean; now: number; onMove: (ticket: Ticket, status: string) => Promise<boolean> }) {
  const [moved, setMoved] = useState<Record<number, string>>({});
  const [active, setActive] = useState<Ticket | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const columns = useMemo(() => {
    const by = new Map<string, Ticket[]>(TICKET_STATUS.map((s) => [s.value, []]));
    for (const t of tickets) {
      const status = moved[t.id] ?? t.status;
      by.get(status)?.push(moved[t.id] ? { ...t, status } : t);
    }
    return by;
  }, [tickets, moved]);

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { ticket: Ticket }).ticket);

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const ticket = (e.active.data.current as { ticket: Ticket }).ticket;
    const status = (e.over?.data.current as { status?: string } | undefined)?.status;
    const current = moved[ticket.id] ?? ticket.status;
    if (!status || status === current) return;
    setMoved((m) => ({ ...m, [ticket.id]: status }));
    const ok = await onMove(ticket, status);
    if (!ok)
      setMoved((m) => {
        const next = { ...m };
        delete next[ticket.id];
        return next;
      });
  };

  if (loading)
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[460px] w-[284px] shrink-0 rounded-[22px]" />
        ))}
      </div>
    );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-3 flex gap-4 overflow-x-auto px-3 pb-6 sm:-mx-4 sm:px-4">
        {TICKET_STATUS.map((s) => (
          <StatusColumn key={s.value} option={s} tickets={columns.get(s.value) ?? []} now={now} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>{active ? <TicketCard ticket={active} now={now} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

import { Lock, MessagesSquare, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Avatar, Divider, EmptyState, Skeleton } from "@/components/ui/display";
import { Markdown } from "@/components/ui/markdown";
import { date, dateTime, time } from "@/lib/format";
import type { Ref, Ticket, TicketMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { textToMarkdown } from "./mail";

export type ThreadMessage = TicketMessage & { user?: Ref | null };

function dayTitle(value: string) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  const label = date(d, d.getFullYear() === today.getFullYear() ? "EEEE d MMMM" : "EEEE d MMMM yyyy");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Meta({ name, at, children, align }: { name: string; at: string; children?: ReactNode; align: "left" | "right" }) {
  return (
    <div className={cn("mb-1 flex items-center gap-1.5 px-1 text-[11.5px] text-fg-3", align === "right" && "flex-row-reverse")}>
      <span className="font-semibold text-fg-2">{name}</span>
      {children}
      <span title={dateTime(at)} className="tabular">
        {time(at)}
      </span>
    </div>
  );
}

function Bubble({ m, ticket }: { m: ThreadMessage; ticket: Ticket }) {
  if (m.author_type === "system")
    return (
      <div className="flex justify-center">
        <span className="glass-flat rounded-full px-3 py-1 text-[11.5px] text-fg-3">
          {m.body} · {time(m.created_at)}
        </span>
      </div>
    );

  const customer = m.author_type === "customer";
  const ai = m.author_type === "ai";
  const internal = m.is_internal;
  const name = customer ? m.author_name || ticket.contact?.name || "Client" : ai ? "Iris" : m.user?.name || m.author_name || "Équipe support";
  const avatar = ai ? (
    <span className="ai-gradient flex size-8 shrink-0 items-center justify-center rounded-full text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]">
      <Sparkles className="size-4" />
    </span>
  ) : (
    <Avatar name={name} color={customer ? undefined : ((m.user?.color as string) ?? undefined)} src={customer ? ((ticket.contact?.avatar_url as string) ?? undefined) : undefined} size={32} />
  );

  return (
    <div className={cn("flex items-end gap-2.5", customer ? "pr-6 sm:pr-16" : "flex-row-reverse pl-6 sm:pl-16")}>
      {avatar}
      <div className={cn("flex min-w-0 max-w-[680px] flex-col", customer ? "items-start" : "items-end")}>
        <Meta name={name} at={m.created_at} align={customer ? "left" : "right"}>
          {internal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/25 px-1.5 py-px text-[10.5px] font-semibold text-amber-800 dark:bg-amber-300/15 dark:text-amber-200">
              <Lock className="size-2.5" /> Note interne
            </span>
          )}
        </Meta>
        <div
          className={cn(
            "min-w-0 max-w-full px-4 py-2.5 text-[13.5px] leading-relaxed [overflow-wrap:anywhere]",
            customer && "glass-flat rounded-[18px] rounded-bl-[6px]",
            !customer && !internal && "rounded-[18px] rounded-br-[6px] bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_24%,transparent)]",
            internal && "rounded-[18px] rounded-br-[6px] border border-dashed border-amber-500/45 bg-amber-300/[0.16] dark:border-amber-300/30 dark:bg-amber-300/[0.07]",
          )}
        >
          <Markdown className="text-[13.5px] [&>*+*]:mt-2">{textToMarkdown(m.body || "—")}</Markdown>
        </div>
      </div>
    </div>
  );
}

/** Conversation of a ticket: customer on the left, team on the right, internal notes in amber. */
export function TicketThread({ ticket, messages, loading, className }: { ticket: Ticket; messages: ThreadMessage[]; loading: boolean; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const groups = useMemo(() => {
    const out: { day: string; items: ThreadMessage[] }[] = [];
    for (const m of messages) {
      const day = date(m.created_at, "yyyy-MM-dd");
      if (out.length && out[out.length - 1].day === day) out[out.length - 1].items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  // Jump to the latest message on open, glide when a new one arrives.
  useEffect(() => {
    const el = scroller.current;
    if (el && messages.length) el.scrollTo({ top: el.scrollHeight, behavior: seen.current ? "smooth" : "auto" });
    seen.current = messages.length;
  }, [messages.length]);

  return (
    <div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6", className)}>
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-16 w-[62%] rounded-[18px]" />
          <Skeleton className="ml-auto h-20 w-[55%] rounded-[18px]" />
          <Skeleton className="h-12 w-[40%] rounded-[18px]" />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-6" />} title="Aucun message" description="Écrivez la première réponse au client ci-dessous." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.day} className="space-y-4">
              <Divider label={dayTitle(g.items[0].created_at)} className="normal-case tracking-normal" />
              <AnimatePresence initial={false}>
                {g.items.map((m) => (
                  <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
                    <Bubble m={m} ticket={ticket} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

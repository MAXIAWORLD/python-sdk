import { BookOpen, ChevronDown, Lock, Reply, Send, Sparkles, Square } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/fields";
import { Menu } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { errorMessage, toastError, useInvalidate, useLocalStorage } from "@/lib/hooks";
import type { KbArticle, Ticket } from "@/lib/types";
import { cn, isMac } from "@/lib/utils";
import { helpUrl, KbInsertPopover } from "./KbInsert";
import { replySubject, SETTINGS_EMAIL } from "./mail";

type Mode = "reply" | "note";

/**
 * Reply box of a ticket (Front / Intercom style): public reply or internal note, ⌘+Entrée to send,
 * AI suggestion streamed into the editor, knowledge-base links, optional copy by email to the customer.
 */
export function TicketComposer({ ticket, smtpReady }: { ticket: Ticket; smtpReady: boolean | null }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const ai = useAiGenerate();
  const [mode, setMode] = useState<Mode>("reply");
  const [body, setBody] = useLocalStorage(`prisme-ticket-draft-${ticket.id}`, "");
  const [notifyPref, setNotifyPref] = useLocalStorage("prisme-ticket-notify", true);
  const [smtpFailed, setSmtpFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const contactEmail = (ticket.contact?.email as string | null | undefined) ?? null;
  const canEmail = !!contactEmail && smtpReady !== false && !smtpFailed;
  const note = mode === "note";

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [body]);

  const insertArticle = (a: KbArticle) => {
    const snippet = `[${a.title}](${helpUrl(a.slug)})`;
    const el = area.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const glue = before && !/\s$/.test(before) ? " " : "";
    setBody(`${before}${glue}${snippet}${body.slice(end)}`);
    requestAnimationFrame(() => {
      const caret = start + glue.length + snippet.length;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const suggest = async () => {
    setMode("reply");
    const out = await ai.run("ticket_reply", { ticket_id: ticket.id }, (full) => setBody(full));
    if (out) setBody(out.trim());
    area.current?.focus();
  };

  const send = async (after?: "resolved" | "pending") => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.post("/ticket-messages", { ticket_id: ticket.id, body: text, is_internal: note, author_type: "agent" });
    } catch (e) {
      toastError(e);
      setSending(false);
      return;
    }
    let emailed = false;
    let emailFailed = false;
    if (!note && notifyPref && canEmail && contactEmail) {
      try {
        await api.post("/emails/send", { to: [contactEmail], subject: replySubject(`[${ticket.number}] ${ticket.subject}`), body: text, ticket_id: ticket.id, contact_id: ticket.contact_id, company_id: ticket.company_id });
        emailed = true;
      } catch (e) {
        emailFailed = true;
        setSmtpFailed(true);
        toast.warning("Réponse publiée, mais l'email n'est pas parti", { description: errorMessage(e), action: { label: "Paramètres", onClick: () => navigate(SETTINGS_EMAIL) } });
      }
    }
    if (after) {
      try {
        await api.patch(`/tickets/${ticket.id}`, { status: after });
      } catch (e) {
        toastError(e);
      }
    }
    setBody("");
    setSending(false);
    invalidate("ticket-messages", "tickets", "emails");
    if (note) toast.success("Note interne ajoutée");
    else if (emailed) toast.success(after === "resolved" ? "Réponse envoyée, ticket résolu" : "Réponse envoyée", { description: `Copie envoyée par email à ${contactEmail}.` });
    else if (!emailFailed) toast.success(after === "resolved" ? "Réponse publiée, ticket résolu" : "Réponse publiée dans le fil");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={cn("border-t border-[var(--hairline)] p-3 transition-colors sm:p-4", note && "bg-amber-300/[0.06]")}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          size="sm"
          value={mode}
          onChange={setMode}
          items={[
            { value: "reply", label: "Répondre", icon: <Reply className="size-3.5" /> },
            { value: "note", label: "Note interne", icon: <Lock className="size-3.5" /> },
          ]}
        />
        <div className="flex items-center gap-1.5">
          {ai.loading && (
            <Button size="xs" variant="ghost" icon={<Square className="size-3" />} onClick={ai.stop}>
              Arrêter
            </Button>
          )}
          <Button size="xs" variant="ai" icon={<Sparkles className="size-3.5" />} loading={ai.loading} onClick={suggest}>
            <span className="hidden sm:inline">Suggérer une réponse</span>
            <span className="sm:hidden">Suggérer</span>
          </Button>
          <KbInsertPopover
            onPick={insertArticle}
            trigger={
              <Button size="xs" variant="glass" icon={<BookOpen className="size-3.5" />}>
                Article
              </Button>
            }
          />
        </div>
      </div>

      <div
        className={cn(
          "rounded-[16px] ring-1 ring-inset transition-[box-shadow,background-color]",
          note
            ? "bg-amber-300/[0.14] ring-amber-500/40 focus-within:ring-2 focus-within:ring-amber-500/60 dark:bg-amber-300/[0.07]"
            : "bg-[var(--field)] ring-[var(--hairline-strong)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]",
        )}
      >
        <textarea
          ref={area}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          aria-label={note ? "Note interne" : "Réponse au client"}
          placeholder={note ? "Note visible uniquement par l'équipe : contexte, piste technique, passage de relais…" : `Répondre à ${ticket.contact?.name ?? "au client"}… (markdown accepté)`}
          className="block max-h-[320px] min-h-[88px] w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-3"
        />
        {ai.loading && (
          <div className="flex items-center gap-1.5 px-3.5 pb-2.5 text-[12px] font-medium text-[#b26bff]">
            <Sparkles className="size-3.5 animate-pulse" /> Iris rédige une réponse à partir du fil et de la base de connaissances…
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 text-[12px] text-fg-3">
          {note ? (
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <Lock className="size-3.5" /> Visible uniquement par l'équipe, jamais envoyée au client.
            </span>
          ) : canEmail ? (
            <Checkbox checked={notifyPref} onChange={setNotifyPref} className="text-[12.5px] text-fg-2" label={<span className="truncate">Envoyer aussi par email à {contactEmail}</span>} />
          ) : contactEmail ? (
            <button type="button" onClick={() => navigate(SETTINGS_EMAIL)} className="text-left hover:text-fg-2">
              Envoi d'emails non configuré : la réponse reste dans le fil. <span className="font-medium text-accent">Configurer le SMTP</span>
            </button>
          ) : (
            <span>Aucun email client : la réponse reste dans le fil du ticket.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[11.5px] text-fg-3 sm:flex">
            <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <div className="flex">
            <Button variant="primary" size="sm" icon={note ? <Lock className="size-3.5" /> : <Send className="size-3.5" />} loading={sending} disabled={!body.trim()} onClick={() => send()} className="rounded-r-none">
              {note ? "Ajouter la note" : "Envoyer"}
            </Button>
            <Menu
              trigger={
                <Button variant="primary" size="sm" disabled={!body.trim() || sending} className="rounded-l-none border-l border-white/25 px-2" aria-label="Autres options d'envoi">
                  <ChevronDown className="size-4" />
                </Button>
              }
              items={[
                { label: note ? "Ajouter et résoudre le ticket" : "Envoyer et résoudre", onSelect: () => send("resolved") },
                { label: note ? "Ajouter et mettre en attente client" : "Envoyer et attendre le client", onSelect: () => send("pending") },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

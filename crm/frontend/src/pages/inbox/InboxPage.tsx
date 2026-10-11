import { useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCheck, Inbox, Keyboard, Mail as MailIcon, Mails, PenSquare, RefreshCw, Search, Send, Settings2, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/data/blocks";
import { EmailComposer, type EmailContext } from "@/components/entity/EmailComposer";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { forwardBody, forwardSubject, quoteFor, replySubject, SETTINGS_EMAIL, useMailSettings, type Mail } from "@/components/support/mail";
import { MailListItem } from "@/components/support/MailList";
import { MailReader, type MailActions } from "@/components/support/MailReader";
import { useNow } from "@/components/support/time";
import { Button } from "@/components/ui/button";
import { EmptyState, Kbd, Skeleton } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/overlay";
import { Tabs } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { plural } from "@/lib/format";
import { toastError, useDebounced, useItem, useList, type Params } from "@/lib/hooks";
import type { Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";

type FolderId = "inbox" | "starred" | "sent" | "archive" | "all";

const FOLDERS: { id: FolderId; label: string; short: string; icon: typeof Inbox; params: Params; empty: { title: string; description: string } }[] = [
  {
    id: "inbox",
    label: "Boîte de réception",
    short: "Réception",
    icon: Inbox,
    params: { folder: "inbox" },
    empty: { title: "Boîte de réception vide", description: "Synchronisez votre boîte IMAP : les emails de vos clients arrivent ici, rattachés automatiquement à leur fiche." },
  },
  { id: "starred", label: "Suivis", short: "Suivis", icon: Star, params: { starred: true }, empty: { title: "Aucun email suivi", description: "Marquez un email d'une étoile (touche S) pour le retrouver ici." } },
  { id: "sent", label: "Envoyés", short: "Envoyés", icon: Send, params: { folder: "sent" }, empty: { title: "Aucun email envoyé", description: "Les emails envoyés depuis Prisme (fiches, devis, factures, tickets) apparaissent ici." } },
  { id: "archive", label: "Archivés", short: "Archives", icon: Archive, params: { folder: "archive" }, empty: { title: "Aucun email archivé", description: "Archivez un email traité (touche E) pour garder une boîte de réception nette." } },
  { id: "all", label: "Tous les emails", short: "Tous", icon: Mails, params: {}, empty: { title: "Aucun email", description: "Envoyez un premier message ou synchronisez votre boîte." } },
];

const SHORTCUTS: [string, string][] = [
  ["J / K", "Suivant / précédent"],
  ["R", "Répondre"],
  ["F", "Transférer"],
  ["S", "Suivre"],
  ["E", "Archiver"],
  ["U", "Non lu"],
  ["C", "Nouveau message"],
  ["/", "Rechercher"],
];

interface ComposerState {
  open: boolean;
  to: string;
  subject: string;
  body: string;
  context: EmailContext;
}

const CLOSED: ComposerState = { open: false, to: "", subject: "", body: "", context: {} };

function splitName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") };
}

export default function InboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();
  const folderId = (FOLDERS.some((f) => f.id === params.get("folder")) ? params.get("folder") : "inbox") as FolderId;
  const folder = FOLDERS.find((f) => f.id === folderId)!;
  const selectedId = Number(params.get("id")) || null;
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [limit, setLimit] = useState(50);
  const [syncing, setSyncing] = useState(false);
  const [composer, setComposer] = useState<ComposerState>(CLOSED);
  const [ticketFrom, setTicketFrom] = useState<Mail | null>(null);
  const [contactFrom, setContactFrom] = useState<Mail | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const { imapReady } = useMailSettings();

  const list = useList<Mail>("emails", { ...folder.params, q: dq || undefined, sort: "-sent_at,-created_at", limit });
  const unread = useList<Mail>("emails", { folder: "inbox", read: false, limit: 1, expand: 0 });
  const starred = useList<Mail>("emails", { starred: true, limit: 1, expand: 0 });
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const fromList = rows.find((r) => r.id === selectedId);
  const item = useItem<Mail>("emails", fromList ? null : selectedId);
  const selected = fromList ?? item.data ?? null;

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  /** Optimistic update of a message in every cached list, then sync with the API. */
  const patchMail = useCallback(
    async (m: Mail, data: Partial<Mail>, message?: string) => {
      const apply = (x: Mail) => (x.id === m.id ? { ...x, ...data } : x);
      qc.setQueriesData<Paginated<Mail>>({ queryKey: ["emails", "list"] }, (old) => (old ? { ...old, items: old.items.map(apply) } : old));
      qc.setQueryData<Mail>(["emails", "item", m.id], (old) => (old ? apply(old) : old));
      try {
        await api.patch(`/emails/${m.id}`, data);
        if (message) toast.success(message);
      } catch (e) {
        toastError(e);
      } finally {
        qc.invalidateQueries({ queryKey: ["emails"] });
      }
    },
    [qc],
  );

  // Opening a message marks it as read (also for deep links /inbox?id=12).
  const marked = useRef(new Set<number>());
  const select = useCallback(
    (m: Mail | null) => {
      if (m) marked.current.delete(m.id);
      setParam({ id: m ? String(m.id) : null });
    },
    [setParam],
  );
  useEffect(() => {
    if (selected && !selected.read && !marked.current.has(selected.id)) {
      marked.current.add(selected.id);
      patchMail(selected, { read: true });
    }
  }, [selected, patchMail]);

  const changeFolder = (id: FolderId) => {
    setParam({ folder: id === "inbox" ? null : id, id: null });
    setLimit(50);
  };

  const move = (step: 1 | -1) => {
    if (!rows.length) return;
    const index = rows.findIndex((r) => r.id === selectedId);
    const next = rows[Math.min(rows.length - 1, Math.max(0, index < 0 ? 0 : index + step))];
    if (next) {
      select(next);
      document.querySelector(`[data-mail="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };

  // Expanded references only: an id can outlive its record (e.g. a deleted ticket).
  const contextOf = (m: Mail): EmailContext => ({ contact_id: m.contact?.id ?? null, company_id: m.company?.id ?? null, deal_id: m.deal?.id ?? null, ticket_id: m.ticket?.id ?? null });

  const reply = (m: Mail) => setComposer({ open: true, to: m.direction === "in" ? (m.from_email ?? "") : m.to.join(", "), subject: replySubject(m.subject), body: quoteFor(m), context: contextOf(m) });
  const forward = (m: Mail) => setComposer({ open: true, to: "", subject: forwardSubject(m.subject), body: forwardBody(m), context: contextOf(m) });
  const compose = () => setComposer({ ...CLOSED, open: true });

  const archive = (m: Mail) => {
    const restore = m.folder === "archive";
    if (folderId !== "all" && folderId !== "starred") move(1);
    patchMail(m, { folder: restore ? (m.direction === "in" ? "inbox" : "sent") : "archive" }, restore ? "Email remis dans la boîte de réception" : "Email archivé");
  };

  const remove = async (m: Mail) => {
    if (!(await confirm({ title: "Supprimer cet email ?", description: "Il sera retiré de Prisme (la copie sur votre serveur de messagerie n'est pas modifiée).", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/emails/${m.id}`);
      toast.success("Email supprimé");
      select(null);
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e) {
      toastError(e);
    }
  };

  const markAllRead = async () => {
    const ids = rows.filter((r) => !r.read).map((r) => r.id);
    if (!ids.length) return;
    try {
      await api.post("/emails/bulk", { action: "update", ids, data: { read: true } });
      toast.success(`${plural(ids.length, "email marqué", "emails marqués")} comme lu${ids.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e) {
      toastError(e);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ imported: number }>("/emails/sync");
      toast.success(r.imported ? `${plural(r.imported, "nouvel email importé", "nouveaux emails importés")}` : "Boîte de réception à jour", {
        description: r.imported ? "Les messages sont rattachés aux fiches contacts reconnues." : "Aucun nouveau message sur le serveur IMAP.",
      });
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409)
        toast.error("Synchronisation IMAP non configurée", { description: "Renseignez votre serveur IMAP dans Paramètres › Email pour importer vos messages.", action: { label: "Configurer", onClick: () => navigate(SETTINGS_EMAIL) } });
      else toastError(e);
    } finally {
      setSyncing(false);
    }
  };

  const actions: MailActions | null = selected
    ? {
        onBack: () => select(null),
        onReply: () => reply(selected),
        onForward: () => forward(selected),
        onToggleStar: () => patchMail(selected, { starred: !selected.starred }),
        onArchive: () => archive(selected),
        onMarkUnread: () => {
          patchMail(selected, { read: false }, "Marqué comme non lu");
          select(null);
        },
        onDelete: () => remove(selected),
        onLinkContact: (contactId, companyId) => patchMail(selected, { contact_id: contactId, company_id: contactId ? (companyId ?? selected.company_id) : null }, contactId ? "Email rattaché au contact" : "Email délié du contact"),
        onCreateTicket: () => setTicketFrom(selected),
        onCreateContact: () => setContactFrom(selected),
      }
    : null;

  // Keyboard shortcuts (ignored while typing or when a dialog is open).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || composer.open) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog],[role=menu]")) return;
      const k = e.key.toLowerCase();
      const run = (fn?: () => void) => {
        if (!fn) return;
        e.preventDefault();
        fn();
      };
      if (k === "j") run(() => move(1));
      else if (k === "k") run(() => move(-1));
      else if (k === "c") run(compose);
      else if (k === "/") run(() => searchRef.current?.querySelector("input")?.focus());
      else if (k === "escape") run(() => select(null));
      else if (actions && k === "r") run(actions.onReply);
      else if (actions && k === "f") run(actions.onForward);
      else if (actions && k === "s") run(actions.onToggleStar);
      else if (actions && k === "e") run(actions.onArchive);
      else if (actions && k === "u") run(actions.onMarkUnread);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts: Partial<Record<FolderId, number>> = { inbox: unread.data?.total, starred: starred.data?.total };
  const unreadInList = rows.filter((r) => !r.read).length;

  return (
    <div>
      <PageHeader
        title="Boîte mail"
        icon={<MailIcon className="size-5" />}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{unread.data ? (unread.data.total ? `${plural(unread.data.total, "message non lu", "messages non lus")}` : "Tout est lu") : "Chargement…"}</span>
            {imapReady === false && (
              <button type="button" onClick={() => navigate(SETTINGS_EMAIL)} className="inline-flex items-center gap-1 text-fg-3 hover:text-accent">
                · <Settings2 className="size-3.5" /> IMAP non configuré
              </button>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="glass" icon={<RefreshCw className={cn("size-4", syncing && "animate-spin")} />} disabled={syncing} onClick={sync}>
              Synchroniser
            </Button>
            <Button variant="primary" icon={<PenSquare className="size-4" />} onClick={compose}>
              Nouveau message
            </Button>
          </>
        }
      />

      <Tabs className="mb-3 lg:hidden" value={folderId} onChange={changeFolder} items={FOLDERS.map((f) => ({ value: f.id, label: f.short, icon: <f.icon className="size-3.5" />, count: counts[f.id] || undefined }))} />

      <Glass radius="xl" className="grid grid-cols-1 overflow-hidden lg:h-[calc(100dvh-226px)] lg:min-h-[560px] lg:grid-cols-[224px_340px_minmax(0,1fr)] 2xl:grid-cols-[240px_400px_minmax(0,1fr)]">
        {/* Folders */}
        <nav className="hidden min-h-0 flex-col border-r border-[var(--hairline)] p-2.5 lg:flex" aria-label="Dossiers">
          <div className="space-y-0.5">
            {FOLDERS.map((f) => {
              const active = f.id === folderId;
              const count = counts[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => changeFolder(f.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[13.5px] font-medium transition",
                    active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.06]",
                  )}
                >
                  <f.icon className={cn("size-4 shrink-0", f.id === "starred" && active && "fill-current")} />
                  <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  {!!count && <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular", active ? "bg-[var(--accent)] text-white" : "bg-black/[0.06] text-fg-2 dark:bg-white/10")}>{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-auto rounded-[14px] bg-black/[0.025] p-3 dark:bg-white/[0.035]">
            <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">
              <Keyboard className="size-3.5" /> Raccourcis
            </div>
            <div className="space-y-1">
              {SHORTCUTS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2 text-[11.5px] text-fg-3">
                  <span>{label}</span>
                  <Kbd>{key}</Kbd>
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Message list */}
        <section className={cn("min-h-0 flex-col border-[var(--hairline)] lg:flex lg:border-r", selected ? "hidden" : "flex")} aria-label="Messages">
          <div className="space-y-2 border-b border-[var(--hairline)] p-3">
            <div ref={searchRef}>
              <SearchInput value={q} onChange={setQ} placeholder={`Rechercher dans « ${folder.short} »…`} />
            </div>
            <div className="flex items-center justify-between gap-2 px-1 text-[12px] text-fg-3">
              <span className="tabular">{list.data ? plural(list.data.total, "message") : "…"}</span>
              {unreadInList > 0 && (
                <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  <CheckCheck className="size-3.5" /> Tout marquer comme lu
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 max-lg:max-h-[70vh]">
            {list.isLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="flex gap-3 p-2">
                    <Skeleton className="size-9 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              dq ? (
                <EmptyState icon={<Search className="size-6" />} title="Aucun résultat" description={`Aucun email ne correspond à « ${dq} » dans ce dossier.`} />
              ) : (
                <EmptyState
                  icon={<folder.icon className="size-6" />}
                  title={folder.empty.title}
                  description={folder.empty.description}
                  action={
                    folder.id === "inbox" ? (
                      <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={sync} loading={syncing}>
                        Synchroniser
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <>
                <AnimatePresence initial={false}>
                  {rows.map((m) => (
                    <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                      <MailListItem mail={m} now={now} active={m.id === selectedId} onSelect={() => select(m)} onToggleStar={() => patchMail(m, { starred: !m.starred })} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {list.data && list.data.total > rows.length && (
                  <div className="p-2">
                    <Button variant="ghost" size="sm" className="w-full" loading={list.isFetching} onClick={() => setLimit((l) => l + 50)}>
                      Charger plus ({list.data.total - rows.length})
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Reading pane */}
        <section className={cn("min-h-0 lg:block", selected ? "block" : "hidden")} aria-label="Lecture">
          {selected && actions ? (
            <MailReader key={selected.id} mail={selected} actions={actions} />
          ) : selectedId && item.isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-6 h-64" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <EmptyState icon={<MailIcon className="size-6" />} title="Sélectionnez un email" description="Ouvrez un message pour le lire, y répondre ou le rattacher à une fiche du CRM." />
              <div className="-mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px] text-fg-3">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd> naviguer
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>C</Kbd> écrire
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>/</Kbd> rechercher
                </span>
              </div>
            </div>
          )}
        </section>
      </Glass>

      <EmailComposer open={composer.open} onOpenChange={(o) => setComposer((c) => ({ ...c, open: o }))} to={composer.to} subject={composer.subject} body={composer.body} context={composer.context} />

      <RecordDialog
        resource="tickets"
        open={!!ticketFrom}
        onOpenChange={(o) => !o && setTicketFrom(null)}
        title="Créer un ticket depuis cet email"
        navigateOnCreate
        initial={
          ticketFrom ? { subject: ticketFrom.subject || "(sans objet)", description: ticketFrom.body_text ?? "", contact_id: ticketFrom.contact_id, company_id: ticketFrom.company_id, channel: "email", status: "open", priority: "normal" } : undefined
        }
        labels={{ contact_id: ticketFrom?.contact?.name, company_id: ticketFrom?.company?.name }}
        onSaved={(row) => ticketFrom && api.patch(`/emails/${ticketFrom.id}`, { ticket_id: row.id }).catch(toastError)}
      />
      <RecordDialog
        resource="contacts"
        open={!!contactFrom}
        onOpenChange={(o) => !o && setContactFrom(null)}
        title="Créer un contact pour l'expéditeur"
        initial={contactFrom ? { ...splitName(contactFrom.from_name), email: contactFrom.from_email ?? "" } : undefined}
        onSaved={(row) => contactFrom && patchMail(contactFrom, { contact_id: row.id }, "Contact créé et rattaché à l'email")}
      />
    </div>
  );
}

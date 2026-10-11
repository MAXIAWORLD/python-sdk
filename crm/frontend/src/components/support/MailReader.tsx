import { Archive, ArchiveRestore, ArrowLeft, Forward, ImageOff, LifeBuoy, Link2, MailOpen, MoreHorizontal, Paperclip, Reply, ShieldCheck, Star, Target, Trash2, TriangleAlert, UserPlus, Unlink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, CompanyLogo, Kbd } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Markdown } from "@/components/ui/markdown";
import { Menu, Popover, Tooltip } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { dateTime, fileSize, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { emailSrcDoc, hasRemoteImages, senderLabel, textToMarkdown, type Mail } from "./mail";

export interface MailActions {
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onLinkContact: (contactId: number | null, companyId: number | null) => void;
  onCreateTicket: () => void;
  onCreateContact: () => void;
}

function Action({ label, shortcut, onClick, children, active }: { label: string; shortcut?: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <Tooltip
      content={
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut && <Kbd className="border-white/30 bg-white/15 text-white dark:border-black/20 dark:bg-black/10 dark:text-black">{shortcut}</Kbd>}
        </span>
      }
    >
      <IconButton label={label} size="sm" onClick={onClick} active={active}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

function LinkChip({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link to={to} className="glass-flat inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-[12px] font-medium text-fg-2 transition hover:text-accent">
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

/** Reading pane: header, CRM links, and the body (HTML in a sandboxed iframe, or text/markdown). */
export function MailReader({ mail, actions }: { mail: Mail; actions: MailActions }) {
  const [mode, setMode] = useState<"html" | "text">(mail.body_html ? "html" : "text");
  const [images, setImages] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const html = mail.body_html ?? "";
  const remote = mode === "html" && hasRemoteImages(html);
  const inbound = mail.direction === "in";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-0.5 border-b border-[var(--hairline)] px-2 py-1.5 sm:px-3">
        <IconButton label="Retour à la liste" size="sm" className="lg:hidden" onClick={actions.onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <Action label="Répondre" shortcut="R" onClick={actions.onReply}>
          <Reply className="size-4" />
        </Action>
        <Action label="Transférer" shortcut="F" onClick={actions.onForward}>
          <Forward className="size-4" />
        </Action>
        <span className="mx-1 h-5 w-px bg-[var(--hairline-strong)]" />
        <Action label={mail.starred ? "Ne plus suivre" : "Suivre"} shortcut="S" onClick={actions.onToggleStar} active={mail.starred}>
          <Star className={cn("size-4", mail.starred && "fill-amber-400 text-amber-400")} />
        </Action>
        <Action label={mail.folder === "archive" ? "Remettre dans la boîte de réception" : "Archiver"} shortcut="E" onClick={actions.onArchive}>
          {mail.folder === "archive" ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </Action>
        <Action label="Marquer comme non lu" shortcut="U" onClick={actions.onMarkUnread}>
          <MailOpen className="size-4" />
        </Action>
        <Action label="Supprimer" onClick={actions.onDelete}>
          <Trash2 className="size-4" />
        </Action>
        <div className="ml-auto flex items-center gap-1">
          <Button size="xs" variant="glass" icon={<LifeBuoy className="size-3.5" />} onClick={actions.onCreateTicket} className="hidden sm:inline-flex" disabled={!!mail.ticket}>
            {mail.ticket ? "Ticket lié" : "Créer un ticket"}
          </Button>
          <Menu
            trigger={
              <IconButton label="Plus d'actions" size="sm">
                <MoreHorizontal className="size-4" />
              </IconButton>
            }
            items={[
              { label: "Créer un ticket de support", icon: <LifeBuoy className="size-4" />, onSelect: actions.onCreateTicket, disabled: !!mail.ticket },
              { label: "Créer un contact pour l'expéditeur", icon: <UserPlus className="size-4" />, onSelect: actions.onCreateContact, disabled: !!mail.contact_id || !inbound || !mail.from_email },
              ...(mail.contact_id ? [{ label: "Délier du contact", icon: <Unlink className="size-4" />, onSelect: () => actions.onLinkContact(null, null) }] : []),
            ]}
          />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-3 pt-4 sm:px-6">
        <h2 className="text-balance text-[19px] font-semibold leading-snug tracking-[-0.015em] sm:text-[21px]">{mail.subject || "(sans objet)"}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {mail.contact && (
            <LinkChip to={`/contacts/${mail.contact.id}`} icon={<Avatar name={mail.contact.name} size={18} />}>
              {mail.contact.name}
            </LinkChip>
          )}
          {mail.company && (
            <LinkChip to={`/companies/${mail.company.id}`} icon={<CompanyLogo name={mail.company.name} size={18} />}>
              {mail.company.name}
            </LinkChip>
          )}
          {mail.ticket && (
            <LinkChip to={`/tickets/${mail.ticket.id}`} icon={<LifeBuoy className="size-3.5 text-pink-500" />}>
              {mail.ticket.name}
            </LinkChip>
          )}
          {mail.deal && (
            <LinkChip to={`/deals/${mail.deal.id}`} icon={<Target className="size-3.5 text-violet-500" />}>
              {mail.deal.name}
            </LinkChip>
          )}
          {!mail.contact && (
            <Popover
              open={linkOpen}
              onOpenChange={setLinkOpen}
              width={300}
              align="start"
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hairline-strong)] px-2.5 py-1 text-[12px] font-medium text-fg-3 transition hover:border-[var(--accent)] hover:text-accent"
                >
                  <Link2 className="size-3.5" /> Lier à un contact
                </button>
              }
            >
              <div className="p-3">
                <div className="mb-2 text-[12.5px] font-medium text-fg-2">Rattacher cet email à une fiche contact</div>
                <EntitySelect
                  resource="contacts"
                  value={null}
                  onChange={(id, row) => {
                    if (!id) return;
                    actions.onLinkContact(id, (row?.company_id as number | null | undefined) ?? null);
                    setLinkOpen(false);
                  }}
                  placeholder="Rechercher un contact…"
                />
              </div>
            </Popover>
          )}
        </div>

        <div className="mt-4 flex items-start gap-3">
          <Avatar name={inbound ? senderLabel(mail) : (mail.user?.name ?? senderLabel(mail))} color={inbound ? undefined : ((mail.user?.color as string) ?? undefined)} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px] font-semibold">{senderLabel(mail)}</span>
              {mail.from_email && mail.from_name && <span className="truncate text-[12.5px] text-fg-3">&lt;{mail.from_email}&gt;</span>}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-fg-3" title={[...mail.to, ...mail.cc].join(", ")}>
              À : {mail.to.join(", ") || "—"}
              {mail.cc.length > 0 && ` · Cc : ${mail.cc.join(", ")}`}
            </div>
          </div>
          <div className="shrink-0 text-right text-[12px] text-fg-3">
            <div className="tabular">{dateTime(mail.sent_at ?? mail.created_at)}</div>
            <div>{relative(mail.sent_at ?? mail.created_at)}</div>
          </div>
        </div>

        {mail.status === "failed" && (
          <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>Échec d'envoi{mail.error ? ` : ${mail.error}` : ""}</span>
          </div>
        )}

        {mail.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mail.attachments.map((a, i) => (
              <span key={`${a.name}-${i}`} className="glass-flat inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[12px] text-fg-2">
                <Paperclip className="size-3.5 text-fg-3" />
                {a.name}
                <span className="text-fg-3">· {fileSize(a.size)}</span>
              </span>
            ))}
          </div>
        )}

        {(mail.body_html && mail.body_text) || remote ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mail.body_html && mail.body_text && (
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "html", label: "Mise en forme" },
                  { value: "text", label: "Texte" },
                ]}
              />
            )}
            {remote && (
              <span className="inline-flex items-center gap-2 text-[12px] text-fg-3">
                {images ? <ShieldCheck className="size-3.5" /> : <ImageOff className="size-3.5" />}
                {images ? "Images distantes affichées" : "Images distantes bloquées (suivi d'ouverture)"}
                <button type="button" onClick={() => setImages((v) => !v)} className="font-medium text-accent hover:underline">
                  {images ? "Masquer" : "Afficher"}
                </button>
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 px-2 pb-2 sm:px-3 sm:pb-3">
        {mode === "html" && html ? (
          <iframe title="Contenu de l'email" sandbox="" srcDoc={emailSrcDoc(html, images)} className="h-[70vh] w-full rounded-[16px] bg-white shadow-[inset_0_0_0_1px_var(--hairline)] lg:h-full" />
        ) : (
          <div className="glass-inset h-full overflow-y-auto rounded-[16px] px-5 py-4">
            {mail.body_text?.trim() ? <Markdown className="text-[14px]">{textToMarkdown(mail.body_text)}</Markdown> : <p className="text-[13px] text-fg-3">Cet email n'a pas de contenu texte.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

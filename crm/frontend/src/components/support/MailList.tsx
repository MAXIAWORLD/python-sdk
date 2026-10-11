import { Paperclip, Star, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { counterpart, type Mail } from "./mail";
import { shortStamp } from "./time";

function snippet(m: Mail) {
  return (m.body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** One row of the message list (Superhuman-like density, unread in bold with an accent dot). */
export function MailListItem({ mail, active, now, onSelect, onToggleStar }: { mail: Mail; active: boolean; now: number; onSelect: () => void; onToggleStar: () => void }) {
  const unread = !mail.read;
  const name = counterpart(mail);
  return (
    <div
      role="button"
      tabIndex={0}
      data-mail={mail.id}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn(
        "group relative flex cursor-pointer gap-3 rounded-[16px] px-3 py-3 outline-none transition-colors",
        active ? "bg-accent-soft" : "hover:bg-black/[0.03] focus-visible:bg-black/[0.03] dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]",
      )}
    >
      {active && <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-[var(--accent)]" />}
      <div className="relative">
        <Avatar name={mail.direction === "out" ? (mail.user?.name ?? name) : name} color={mail.direction === "out" ? ((mail.user?.color as string) ?? undefined) : undefined} size={36} />
        {unread && <span className="absolute -left-1 -top-0.5 size-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_2px_var(--bg),0_0_10px_var(--accent)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", unread ? "font-semibold text-fg" : "font-medium text-fg-2")}>
            {mail.direction === "out" && <span className="font-normal text-fg-3">À : </span>}
            {name}
          </span>
          <span className={cn("shrink-0 text-[11.5px] tabular", unread ? "font-semibold text-accent" : "text-fg-3")}>{shortStamp(mail.sent_at ?? mail.created_at, now)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-semibold text-fg" : "text-fg")}>{mail.subject || "(sans objet)"}</span>
          {mail.status === "failed" && <TriangleAlert className="size-3.5 shrink-0 text-red-500" aria-label="Échec d'envoi" />}
          {mail.attachments.length > 0 && <Paperclip className="size-3.5 shrink-0 text-fg-3" aria-label="Pièce jointe" />}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar();
            }}
            className={cn("-m-1 shrink-0 rounded-[8px] p-1 transition", mail.starred ? "text-amber-400" : "text-fg-3 opacity-0 hover:text-amber-400 group-hover:opacity-100")}
            aria-label={mail.starred ? "Ne plus suivre" : "Suivre"}
          >
            <Star className={cn("size-3.5", mail.starred && "fill-amber-400")} />
          </button>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-3">{snippet(mail) || "Aucun contenu"}</p>
        {(mail.contact || mail.ticket) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {mail.contact && <span className="rounded-full bg-black/[0.04] px-2 py-px text-[10.5px] font-medium text-fg-2 dark:bg-white/[0.07]">{mail.contact.name}</span>}
            {mail.ticket && <span className="rounded-full bg-pink-500/12 px-2 py-px text-[10.5px] font-medium text-pink-700 dark:text-pink-300">{mail.ticket.name.split(" · ")[0]}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

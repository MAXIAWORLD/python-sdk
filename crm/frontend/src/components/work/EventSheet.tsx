import { Bell, CalendarClock, Copy, FolderKanban, MapPin, Pencil, Sparkles, Target, Trash2, User as UserIcon, Users, Video } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RecordDialog } from "@/components/entity/EntityForm";
import { RelatedRow } from "@/components/entity/EntityBlocks";
import { Button } from "@/components/ui/button";
import { Avatar, CompanyLogo, StatusBadge } from "@/components/ui/display";
import { Markdown } from "@/components/ui/markdown";
import { Sheet, useConfirm } from "@/components/ui/overlay";
import { EVENT_TYPES } from "@/lib/constants";
import { date, duration, time } from "@/lib/format";
import { useItem, useRemove } from "@/lib/hooks";
import type { CalendarEvent, Ref } from "@/lib/types";
import { useUI } from "@/stores/ui";
import { eventColor, tint } from "./work-utils";

type EventRow = CalendarEvent & { deal?: Ref | null; project?: Ref | null };

function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[13.5px]">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-fg-3">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function whenLabel(ev: CalendarEvent) {
  const start = new Date(ev.start_at);
  const end = new Date(ev.end_at);
  if (ev.all_day) return { day: date(start, "EEEE d MMMM yyyy"), hours: "Toute la journée" };
  const sameDay = start.toDateString() === end.toDateString();
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return sameDay ? { day: date(start, "EEEE d MMMM yyyy"), hours: `${time(start)} – ${time(end)} · ${duration(minutes)}` } : { day: `Du ${date(start, "EEEE d MMMM 'à' HH:mm")}`, hours: `au ${date(end, "EEEE d MMMM 'à' HH:mm")}` };
}

/** Read-only detail of a calendar event, with edit / delete and AI preparation. */
export function EventSheet({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const [shown, setShown] = useState(event);
  if (event && event !== shown) setShown(event);
  const { data } = useItem<EventRow>("events", shown?.id, { placeholderData: shown ?? undefined });
  const ev: EventRow | null = data ?? shown;
  const [editing, setEditing] = useState(false);
  const remove = useRemove("events", { message: "Événement supprimé" });
  const confirm = useConfirm();
  const openAssistant = useUI((s) => s.openAssistant);

  if (!ev) return null;
  const color = eventColor(ev);
  const when = whenLabel(ev);
  const people = [ev.contact?.name, ev.company?.name].filter(Boolean).join(" chez ");

  const destroy = async () => {
    if (!(await confirm({ title: `Supprimer « ${ev.title} » ?`, description: "L'événement disparaîtra aussi des agendas abonnés (ICS) à la prochaine synchronisation.", danger: true, confirmLabel: "Supprimer" }))) return;
    remove.mutate(ev.id, { onSuccess: onClose });
  };

  const prepare = () => {
    onClose();
    openAssistant(`Prépare mon rendez-vous « ${ev.title} » du ${date(ev.start_at, "EEEE d MMMM 'à' HH:mm")}${people ? ` avec ${people}` : ""} : contexte du compte, historique des échanges, opportunités en cours, points à aborder et objectifs de la réunion.`);
  };

  return (
    <>
      <Sheet
        open={!!event}
        onOpenChange={(o) => !o && onClose()}
        width={520}
        title={
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
            Événement
          </span>
        }
        footer={
          <>
            <Button variant="ghost" className="mr-auto text-red-500" icon={<Trash2 className="size-4" />} onClick={destroy}>
              Supprimer
            </Button>
            <Button variant="ai" size="md" icon={<Sparkles className="size-4" />} onClick={prepare}>
              Préparer
            </Button>
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Modifier
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[20px] p-4" style={{ background: `linear-gradient(135deg, ${tint(color, 22)}, ${tint(color, 6)})`, boxShadow: `inset 0 0 0 1px ${tint(color, 28)}` }}>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge options={EVENT_TYPES} value={ev.type} />
              {ev.status === "cancelled" && <StatusBadge options={[{ value: "cancelled", label: "Annulé", tone: "red" }]} value="cancelled" />}
            </div>
            <h2 className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.02em]">{ev.title}</h2>
            <div className="mt-1.5 text-[13.5px] font-medium first-letter:uppercase">{when.day}</div>
            <div className="text-[13px] tabular text-fg-2">{when.hours}</div>
            {ev.meeting_url && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild variant="primary" size="sm">
                  <a href={ev.meeting_url} target="_blank" rel="noreferrer">
                    <Video className="size-4" /> Rejoindre la visio
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="glass"
                  icon={<Copy className="size-3.5" />}
                  onClick={() => navigator.clipboard.writeText(ev.meeting_url ?? "").then(() => toast.success("Lien copié"), () => toast.error("Copie impossible"))}
                >
                  Copier le lien
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {ev.location && (
              <InfoLine icon={<MapPin className="size-4" />}>
                <span>{ev.location}</span>
              </InfoLine>
            )}
            {ev.user && (
              <InfoLine icon={<UserIcon className="size-4" />}>
                <span className="inline-flex items-center gap-2">
                  <Avatar name={ev.user.name} color={(ev.user.color as string) ?? undefined} size={22} />
                  {ev.user.name} <span className="text-fg-3">· organisateur</span>
                </span>
              </InfoLine>
            )}
            {ev.attendees.length > 0 && (
              <InfoLine icon={<Users className="size-4" />}>
                <div className="space-y-1">
                  {ev.attendees.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Avatar name={a.name ?? a.email} size={20} />
                      <span className="truncate">{a.name ?? a.email}</span>
                      {a.name && a.email && <span className="truncate text-[12px] text-fg-3">{a.email}</span>}
                    </div>
                  ))}
                </div>
              </InfoLine>
            )}
            {ev.reminder_minutes != null && ev.reminder_minutes > 0 && (
              <InfoLine icon={<Bell className="size-4" />}>
                <span className="text-fg-2">Rappel {duration(ev.reminder_minutes)} avant</span>
              </InfoLine>
            )}
            <InfoLine icon={<CalendarClock className="size-4" />}>
              <span className="text-fg-3">Créé le {date(ev.created_at, "d MMM yyyy 'à' HH:mm")}</span>
            </InfoLine>
          </div>

          {(ev.contact || ev.company || ev.deal || ev.project) && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3">Lié à</div>
              <div className="rounded-[16px] bg-black/[0.025] p-1 dark:bg-white/[0.035]">
                {ev.contact && <RelatedRow to={`/contacts/${ev.contact.id}`} icon={<Avatar name={ev.contact.name} size={28} />} title={ev.contact.name} meta={typeof ev.contact.job_title === "string" ? ev.contact.job_title : "Contact"} />}
                {ev.company && <RelatedRow to={`/companies/${ev.company.id}`} icon={<CompanyLogo name={ev.company.name} size={28} />} title={ev.company.name} meta="Entreprise" />}
                {ev.deal && (
                  <RelatedRow
                    to={`/deals/${ev.deal.id}`}
                    icon={
                      <span className="flex size-7 items-center justify-center rounded-[9px] bg-accent-soft text-accent">
                        <Target className="size-4" />
                      </span>
                    }
                    title={ev.deal.name}
                    meta="Opportunité"
                  />
                )}
                {ev.project && (
                  <RelatedRow
                    to={`/projects/${ev.project.id}`}
                    icon={
                      <span className="flex size-7 items-center justify-center rounded-[9px] bg-accent-soft text-accent">
                        <FolderKanban className="size-4" />
                      </span>
                    }
                    title={ev.project.name}
                    meta="Projet"
                  />
                )}
              </div>
            </div>
          )}

          {ev.description && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3">Notes</div>
              <div className="rounded-[16px] bg-black/[0.025] px-3.5 py-2.5 text-[13.5px] dark:bg-white/[0.035]">
                <Markdown>{ev.description}</Markdown>
              </div>
            </div>
          )}
        </div>
      </Sheet>
      <RecordDialog
        resource="events"
        open={editing}
        onOpenChange={setEditing}
        recordId={ev.id}
        initial={ev as unknown as Record<string, unknown>}
        labels={{ contact_id: ev.contact?.name, company_id: ev.company?.name, deal_id: ev.deal?.name }}
      />
    </>
  );
}

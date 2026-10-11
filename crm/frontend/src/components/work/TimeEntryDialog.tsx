import { Clock3, Lock, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Field, Input, NumberInput, Switch, Textarea } from "@/components/ui/fields";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { dateShort, duration, isoDate } from "@/lib/format";
import { useCreate, useRemove, useUpdate } from "@/lib/hooks";
import type { TimeEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { clock, isRunning, parseDuration } from "./work-utils";

export interface TimeEntryDefaults {
  project_id?: number | null;
  project_name?: string | null;
  task_id?: number | null;
  date?: string;
  user_id?: number | null;
}

interface Draft {
  project_id: number | null;
  task_id: number | null;
  user_id: number | null;
  date: string;
  duration: string;
  billable: boolean;
  hourly_rate: number | null;
  description: string;
}

const PRESETS = [15, 30, 60, 120, 240, 420];

function initialDraft(entry: TimeEntry | null | undefined, defaults: TimeEntryDefaults | undefined, userId: number | null): Draft {
  if (entry)
    return {
      project_id: entry.project_id ?? null,
      task_id: entry.task_id ?? null,
      user_id: entry.user_id,
      date: entry.date,
      duration: clock(entry.minutes),
      billable: entry.billable,
      hourly_rate: entry.hourly_rate ?? null,
      description: entry.description ?? "",
    };
  return { project_id: defaults?.project_id ?? null, task_id: defaults?.task_id ?? null, user_id: defaults?.user_id ?? userId, date: defaults?.date ?? isoDate(), duration: "", billable: true, hourly_rate: null, description: "" };
}

/** Create or edit a time entry with a human duration field ("1h30", "1,5", "45 min"). */
export function TimeEntryDialog({ open, onOpenChange, entry, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; entry?: TimeEntry | null; defaults?: TimeEntryDefaults }) {
  const me = useAuth((s) => s.user);
  const manager = can(me, "manager");
  const [draft, setDraft] = useState<Draft>(() => initialDraft(entry, defaults, me?.id ?? null));
  const [lastKey, setLastKey] = useState("");
  const key = `${open}-${entry?.id ?? "new"}-${entry?.updated_at ?? ""}-${JSON.stringify(defaults ?? {})}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setDraft(initialDraft(entry, defaults, me?.id ?? null));
  } else if (!open && lastKey) setLastKey(""); // reopening the same entry starts from fresh values
  const create = useCreate<TimeEntry>("time-entries", { message: "Temps enregistré" });
  const update = useUpdate<TimeEntry>("time-entries", { message: "Saisie mise à jour" });
  const remove = useRemove("time-entries", { message: "Saisie supprimée" });
  const confirm = useConfirm();
  const locked = !!entry?.invoice_id;
  const running = !!entry && isRunning(entry);
  const minutes = parseDuration(draft.duration);
  const invalid = !locked && (!draft.date || (!running && (!minutes || minutes <= 0)));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid) return;
    const data: Record<string, unknown> = locked
      ? { description: draft.description || null }
      : { project_id: draft.project_id, task_id: draft.task_id, date: draft.date, ...(running ? {} : { minutes }), billable: draft.billable, hourly_rate: draft.hourly_rate, description: draft.description || null, ...(manager && draft.user_id ? { user_id: draft.user_id } : {}) };
    try {
      if (entry) await update.mutateAsync({ id: entry.id, data });
      else await create.mutateAsync(data);
    } catch {
      return; // reported by the mutation's onError toast
    }
    onOpenChange(false);
  };

  const destroy = async () => {
    if (!entry) return;
    if (!(await confirm({ title: "Supprimer cette saisie ?", description: `${duration(entry.minutes)} le ${dateShort(entry.date)}.`, danger: true, confirmLabel: "Supprimer" }))) return;
    remove.mutate(entry.id, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Clock3 className="size-5" />}
      title={entry ? "Modifier la saisie" : "Saisir du temps"}
      description={entry ? undefined : "Durée au format 1h30, 1:30, 1,5 ou 45 min."}
      footer={
        <>
          {entry && (
            <Button variant="ghost" className="mr-auto text-red-500" icon={<Trash2 className="size-4" />} onClick={destroy} disabled={locked}>
              Supprimer
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={create.isPending || update.isPending} disabled={invalid} onClick={() => submit()}>
            {entry ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {locked && (
          <div className="flex items-start gap-2.5 rounded-[14px] bg-amber-400/15 px-3.5 py-2.5 text-[13px] text-amber-800 dark:text-amber-200">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>
              Ce temps a déjà été facturé
              {entry?.invoice_id && (
                <>
                  {" "}
                  (
                  <Link to={`/invoices/${entry.invoice_id}`} className="font-semibold underline underline-offset-2">
                    voir la facture
                  </Link>
                  )
                </>
              )}{" "}
              : seule la description reste modifiable.
            </span>
          </div>
        )}
        {running && (
          <div className="flex items-start gap-2.5 rounded-[14px] bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-300">
            <Clock3 className="mt-0.5 size-4 shrink-0" />
            <span>Chronomètre en cours : la durée sera calculée à son arrêt.</span>
          </div>
        )}
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field label="Projet" className="sm:col-span-2">
            <EntitySelect resource="projects" value={draft.project_id} initialLabel={entry?.project?.name ?? defaults?.project_name} disabled={locked} onChange={(id) => setDraft((d) => ({ ...d, project_id: id, task_id: null }))} placeholder="Choisir un projet…" />
          </Field>
          <Field label="Tâche" hint="Facultative">
            <EntitySelect resource="tasks" value={draft.task_id} initialLabel={entry?.task?.name} disabled={locked} params={draft.project_id ? { project_id: draft.project_id } : undefined} onChange={(id) => set("task_id", id)} placeholder="Aucune" />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={draft.date} disabled={locked} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field
            label="Durée"
            required
            className="sm:col-span-2"
            hint={minutes ? `= ${duration(minutes)}` : undefined}
            error={running || !draft.duration ? null : minutes === null ? "Format non reconnu (ex. 1h30, 1:30, 1,5, 45 min)" : minutes <= 0 ? "La durée doit être supérieure à zéro" : null}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={draft.duration} disabled={locked || running} onChange={(e) => set("duration", e.target.value)} placeholder="1h30" className="tabular sm:w-[140px]" autoFocus={!entry} />
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={locked || running}
                    onClick={() => set("duration", clock(m))}
                    className={cn("h-8 rounded-full px-2.5 text-[12.5px] font-medium transition disabled:opacity-40", minutes === m ? "btn-primary" : "glass-flat text-fg-2 hover:text-fg")}
                  >
                    {duration(m)}
                  </button>
                ))}
              </div>
            </div>
          </Field>
          {manager && (
            <Field label="Membre">
              <EntitySelect resource="users" value={draft.user_id} initialLabel={entry?.user?.name ?? (draft.user_id === me?.id ? me?.name : undefined)} allowClear={false} disabled={locked} onChange={(id) => set("user_id", id)} />
            </Field>
          )}
          <Field label="Taux horaire HT" hint="Par défaut : taux du projet" className={cn(locked && "pointer-events-none opacity-60")}>
            <NumberInput value={draft.hourly_rate} onChange={(v) => set("hourly_rate", v)} suffix="€/h" min={0} />
          </Field>
          <div className={cn("flex items-end", !manager && "sm:col-span-2")}>
            <div className="w-full rounded-[14px] bg-black/[0.025] px-3.5 py-2.5 dark:bg-white/[0.035]">
              <Switch size="sm" checked={draft.billable} disabled={locked} onChange={(v) => set("billable", v)} label={<span className="text-[13.5px]">Facturable</span>} />
            </div>
          </div>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Ce qui a été fait…" />
          </Field>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

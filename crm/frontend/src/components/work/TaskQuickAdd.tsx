import { addDays } from "date-fns";
import { CornerDownLeft, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Input, Select } from "@/components/ui/fields";
import { PRIORITY } from "@/lib/constants";
import { isoDate } from "@/lib/format";
import { useCreate } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface QuickAddDefaults {
  assignee_id?: number | null;
  assignee_name?: string | null;
  project_id?: number | null;
}

/** One-line task creation: title + due date + priority + assignee. Stays focused for rapid entry. */
export function TaskQuickAdd({ defaults }: { defaults: QuickAddDefaults }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState<{ id: number | null; name?: string | null }>({ id: defaults.assignee_id ?? null, name: defaults.assignee_name });
  const [lastDefault, setLastDefault] = useState(defaults.assignee_id);
  if (defaults.assignee_id !== lastDefault) {
    setLastDefault(defaults.assignee_id);
    setAssignee({ id: defaults.assignee_id ?? null, name: defaults.assignee_name });
  }
  const create = useCreate<Task>("tasks", { silent: true });
  const input = useRef<HTMLInputElement>(null);
  const today = isoDate();
  const tomorrow = isoDate(addDays(new Date(), 1));

  const submit = async () => {
    const value = title.trim();
    if (!value) return;
    try {
      await create.mutateAsync({ title: value, due_date: due || null, priority, assignee_id: assignee.id, project_id: defaults.project_id ?? null, status: "todo" });
    } catch {
      return; // reported by the mutation's onError toast
    }
    toast.success("Tâche ajoutée", { description: value });
    setTitle("");
    input.current?.focus();
  };

  const dayChip = (value: string, label: string) => (
    <button type="button" onClick={() => setDue(due === value ? "" : value)} className={cn("h-8 rounded-full px-2.5 text-[12.5px] font-medium transition", due === value ? "btn-primary" : "glass-flat text-fg-2 hover:text-fg")}>
      {label}
    </button>
  );

  return (
    <Glass radius="lg" className="flex flex-col gap-2 p-2 lg:flex-row lg:items-center">
      <label className="flex min-w-0 flex-1 cursor-text items-center gap-2.5 pl-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Plus className="size-4" />
        </span>
        <input
          ref={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ajouter une tâche…"
          aria-label="Titre de la nouvelle tâche"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-fg-3"
        />
        {title && (
          <span className="hidden items-center gap-1 text-[11.5px] text-fg-3 sm:inline-flex">
            <CornerDownLeft className="size-3.5" /> Entrée
          </span>
        )}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1 lg:p-0">
        {dayChip(today, "Aujourd'hui")}
        {dayChip(tomorrow, "Demain")}
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Échéance" className="h-8 w-[138px] text-[12.5px]" />
        <Select options={PRIORITY} value={priority} onChange={setPriority} aria-label="Priorité" className="w-[118px] [&_select]:h-8 [&_select]:text-[12.5px]" />
        <EntitySelect resource="users" value={assignee.id} initialLabel={assignee.name} onChange={(id, row) => setAssignee({ id, name: row ? String(row.name ?? "") : null })} placeholder="Non assignée" className="h-8 w-[160px] text-[12.5px]" />
        <Button size="sm" variant="primary" loading={create.isPending} disabled={!title.trim()} onClick={submit}>
          Ajouter
        </Button>
      </div>
    </Glass>
  );
}

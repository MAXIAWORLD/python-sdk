import { ListChecks, Plus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/fields";
import { useUpdate } from "@/lib/hooks";
import type { ChecklistItem, Task } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

const AI_INSTRUCTION = "Transforme cette tâche en une checklist de 3 à 7 étapes concrètes et actionnables, en français. Une étape par ligne, sans numérotation, sans puce et sans commentaire.";

/** Lines of an AI answer → checklist texts (bullets, numbers and boxes stripped). */
function parseSteps(text: string) {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]?\])\s*/i, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 1 && l.length < 200)
    .slice(0, 10);
}

/** Checklist of a task (JSON field `checklist: {id, text, done}[]`), saved on every change. */
export function Checklist({ task }: { task: Task }) {
  const update = useUpdate("tasks", { silent: true });
  const ai = useAiGenerate();
  const [items, setItems] = useState<ChecklistItem[]>(task.checklist ?? []);
  const [synced, setSynced] = useState(task.checklist);
  if (synced !== task.checklist && !update.isPending) {
    setSynced(task.checklist);
    setItems(task.checklist ?? []);
  }
  const [draft, setDraft] = useState("");
  const done = items.filter((i) => i.done).length;
  const complete = items.length > 0 && done === items.length;

  const save = (next: ChecklistItem[]) => {
    setItems(next);
    update.mutate({ id: task.id, data: { checklist: next } });
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    save([...items, { id: uid(), text, done: false }]);
    setDraft("");
  };
  const rename = (id: string, text: string) => {
    const value = text.trim();
    const current = items.find((i) => i.id === id);
    if (!current || current.text === value) return;
    save(value ? items.map((i) => (i.id === id ? { ...i, text: value } : i)) : items.filter((i) => i.id !== id));
  };
  const suggest = async () => {
    const out = await ai.run("improve_text", { text: [task.title, task.description].filter(Boolean).join("\n\n"), instruction: AI_INSTRUCTION });
    const steps = parseSteps(out);
    if (steps.length) save([...items, ...steps.map((text) => ({ id: uid(), text, done: false }))]);
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="flex items-center gap-2 text-[13px] font-semibold">
          <ListChecks className="size-4 text-fg-3" /> Checklist
        </h4>
        {items.length > 0 && <span className={cn("text-[12px] font-medium tabular", complete ? "text-emerald-600 dark:text-emerald-400" : "text-fg-3")}>{done}/{items.length}</span>}
        <Button size="xs" variant="ghost" className="ml-auto" icon={<Sparkles className="size-3.5 text-[#b26bff]" />} loading={ai.loading} onClick={suggest}>
          Suggérer des étapes
        </Button>
      </div>
      {items.length > 0 && <Progress value={(done / items.length) * 100} height={4} tone={complete ? "linear-gradient(90deg,#30d158,#22c55e)" : undefined} className="mb-2" />}
      <div>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div key={item.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
              <div className="group flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <Checkbox checked={item.done} onChange={() => save(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))} />
                <input
                  defaultValue={item.text}
                  onBlur={(e) => rename(item.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  aria-label="Élément de checklist"
                  className={cn("min-w-0 flex-1 bg-transparent py-0.5 text-[13.5px] outline-none", item.done && "text-fg-3 line-through")}
                />
                <button type="button" onClick={() => save(items.filter((i) => i.id !== item.id))} className="rounded-[7px] p-1 text-fg-3 opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus:opacity-100" aria-label="Supprimer l'élément">
                  <X className="size-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-1 flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 focus-within:bg-black/[0.03] dark:focus-within:bg-white/[0.04]">
        <Plus className="size-[18px] shrink-0 text-fg-3" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add} placeholder="Ajouter un élément…" className="min-w-0 flex-1 bg-transparent py-0.5 text-[13.5px] outline-none placeholder:text-fg-3" />
      </div>
    </section>
  );
}

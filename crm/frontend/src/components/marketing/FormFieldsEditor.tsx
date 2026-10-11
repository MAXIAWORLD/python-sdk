import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, CopyPlus, GripVertical, Plus, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/fields";
import { Menu } from "@/components/ui/overlay";
import type { FormField } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { FIELD_PRESETS, FIELD_TYPES, fieldIcon, MAP_TO_OPTIONS, mapLabel, uniqueName, type DraftField } from "./form-utils";

function fieldWarnings(f: DraftField) {
  const out: string[] = [];
  if (!f.label.trim()) out.push("Donnez un libellé à ce champ.");
  if (f.type === "select" && !(f.options ?? []).some((o) => o.trim())) out.push("Ajoutez au moins une option.");
  if (f.map_to === "email" && f.type !== "email") out.push("Choisissez le type « Email » pour vérifier l'adresse saisie.");
  return out;
}

function SortableFieldCard({ field, open, taken, onToggle, onChange, onDuplicate, onRemove }: { field: DraftField; open: boolean; taken: string[]; onToggle: () => void; onChange: (p: Partial<DraftField>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.uid });
  const Icon = fieldIcon(field.type);
  const warnings = fieldWarnings(field);
  const typeLabel = FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type;

  const setLabel = (label: string) => onChange(field.autoName ? { label, name: uniqueName(label, taken.filter((n) => n !== field.name)) } : { label });
  const setType = (type: string) => onChange({ type, options: type === "select" ? (field.options?.length ? field.options : ["Option 1", "Option 2"]) : field.options });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-[18px] bg-[var(--field)] ring-1 ring-inset ring-[var(--hairline)] transition-shadow", isDragging && "relative z-20 shadow-[0_24px_50px_-20px_rgba(20,30,90,.45)] ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]", open && "ring-[var(--hairline-strong)]")}>
      <div className="flex items-center gap-1.5 py-2 pl-1.5 pr-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none rounded-[8px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg active:cursor-grabbing dark:hover:bg-white/10" aria-label={`Déplacer le champ ${field.label}`}>
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          <Icon className="size-4" />
        </span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 px-1.5 text-left" aria-expanded={open}>
          <span className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
            <span className="truncate">{field.label || "Sans titre"}</span>
            {field.required && <span className="text-accent">*</span>}
            {warnings.length > 0 && <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />}
          </span>
          <span className="block truncate text-[11.5px] text-fg-3">
            {typeLabel} · {field.map_to ? `→ ${mapLabel(field.map_to)}` : "→ notes du contact"}
          </span>
        </button>
        <IconButton label="Dupliquer" size="sm" onClick={onDuplicate} className="hidden sm:inline-flex">
          <CopyPlus className="size-4" />
        </IconButton>
        <IconButton label="Supprimer le champ" size="sm" onClick={onRemove} className="hover:text-red-500">
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton label={open ? "Replier" : "Modifier"} size="sm" onClick={onToggle}>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </IconButton>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
            <div className="grid grid-cols-1 gap-3 border-t border-[var(--hairline)] px-3.5 pb-3.5 pt-3 sm:grid-cols-2">
              <Field label="Libellé" className="sm:col-span-2">
                <Input value={field.label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : Votre fonction" autoFocus />
              </Field>
              <Field label="Type de champ">
                <Select options={FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={field.type} onChange={setType} />
              </Field>
              <Field label="Enregistrer dans" hint="Champ de la fiche contact à remplir.">
                <Select options={MAP_TO_OPTIONS} value={field.map_to ?? ""} onChange={(map_to) => onChange({ map_to })} />
              </Field>
              {field.type !== "checkbox" && (
                <Field label="Texte d'exemple" className={cn(field.type !== "select" && "sm:col-span-2")}>
                  <Input value={field.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder={field.type === "select" ? "Sélectionnez…" : "Affiché en gris dans le champ"} />
                </Field>
              )}
              {field.type === "select" && (
                <Field label="Options" hint="Une option par ligne." className="sm:col-span-2">
                  <Textarea rows={4} value={(field.options ?? []).join("\n")} onChange={(e) => onChange({ options: e.target.value.split("\n") })} placeholder={"1-10\n11-50\n51-200"} />
                </Field>
              )}
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-black/[0.03] px-3 py-2.5 sm:col-span-2 dark:bg-white/[0.04]">
                <Switch size="sm" checked={!!field.required} onChange={(required) => onChange({ required })} label={<span className="text-[13px]">Réponse obligatoire</span>} />
                <code className="truncate text-[11px] text-fg-3" title="Identifiant technique de la réponse">{field.name}</code>
              </div>
              {warnings.length > 0 && (
                <ul className="space-y-1 text-[12px] text-amber-700 sm:col-span-2 dark:text-amber-300">
                  {warnings.map((w) => (
                    <li key={w} className="flex items-center gap-1.5">
                      <TriangleAlert className="size-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sortable list of form fields with inline editing, presets and custom fields. */
export function FormFieldsEditor({ fields, onChange }: { fields: DraftField[]; onChange: (f: DraftField[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const taken = fields.map((f) => f.name);
  const mapped = new Set(fields.map((f) => f.map_to).filter(Boolean));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onChange(arrayMove(fields, fields.findIndex((f) => f.uid === active.id), fields.findIndex((f) => f.uid === over.id)));
  };

  const add = (field: FormField, autoName = false) => {
    const next: DraftField = { ...field, name: uniqueName(field.name, taken), uid: uid(), autoName };
    onChange([...fields, next]);
    setOpenId(autoName ? next.uid : null);
  };

  const presets = FIELD_PRESETS.filter((p) => !(p.field.map_to && mapped.has(p.field.map_to)) && !taken.includes(p.field.name));

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={fields.map((f) => f.uid)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {fields.map((f) => (
              <SortableFieldCard
                key={f.uid}
                field={f}
                open={openId === f.uid}
                taken={taken}
                onToggle={() => setOpenId(openId === f.uid ? null : f.uid)}
                onChange={(p) => onChange(fields.map((x) => (x.uid === f.uid ? { ...x, ...p } : x)))}
                onDuplicate={() => {
                  const i = fields.findIndex((x) => x.uid === f.uid);
                  const copy: DraftField = { ...f, uid: uid(), name: uniqueName(f.name, taken), label: `${f.label} (copie)`, map_to: "", autoName: false };
                  onChange([...fields.slice(0, i + 1), copy, ...fields.slice(i + 1)]);
                }}
                onRemove={() => onChange(fields.filter((x) => x.uid !== f.uid))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {fields.length === 0 && <p className="rounded-[16px] border border-dashed border-[var(--hairline-strong)] px-4 py-6 text-center text-[13px] text-fg-3">Aucun champ : ajoutez-en ci-dessous.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => add(p.field)} className="glass-flat inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium text-fg-2 transition hover:text-fg">
            <Plus className="size-3.5 text-accent" />
            {p.label}
          </button>
        ))}
        <Menu
          align="start"
          trigger={
            <Button variant="subtle" size="sm" icon={<Plus className="size-4" />}>
              Champ personnalisé
            </Button>
          }
          items={FIELD_TYPES.map((t) => ({ label: t.label, icon: <t.icon className="size-4" />, onSelect: () => add({ name: t.label, label: t.value === "checkbox" ? "J'accepte d'être recontacté(e) par téléphone" : "Nouveau champ", type: t.value, required: false, options: t.value === "select" ? ["Option 1", "Option 2"] : undefined }, true) }))}
        />
      </div>
    </div>
  );
}

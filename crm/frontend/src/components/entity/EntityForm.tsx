import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Field, Input, NumberInput, Select, Switch, TagInput, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { useCreate, useUpdate } from "@/lib/hooks";
import { defaultsFor, SCHEMAS, type FieldDef } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Values = Record<string, unknown>;

function toLocalInput(value: unknown) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FieldControl({ field, value, onChange, initialLabel }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; initialLabel?: string | null }) {
  switch (field.type) {
    case "textarea":
      return <Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={field.name === "body" ? 10 : 4} />;
    case "number":
      return <NumberInput value={value as number} onChange={onChange} placeholder={field.placeholder} />;
    case "money":
      return <NumberInput value={value as number} onChange={onChange} suffix="€" placeholder="0,00" />;
    case "percent":
      return <NumberInput value={value as number} onChange={onChange} suffix="%" />;
    case "date":
      return <Input type="date" value={((value as string) ?? "").slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} />;
    case "time":
      return <Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "datetime":
      return <Input type="datetime-local" value={toLocalInput(value)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case "select":
      return <Select options={field.options ?? []} value={value === null || value === undefined ? "" : String(value)} onChange={(v) => onChange(v || null)} placeholder="—" />;
    case "entity":
      return <EntitySelect resource={field.resource!} value={(value as number) ?? null} onChange={(id) => onChange(id)} initialLabel={initialLabel} params={field.entityParams} />;
    case "tags":
      return <TagInput value={(value as string[]) ?? []} onChange={onChange} />;
    case "switch":
      return (
        <div className="flex h-10 items-center">
          <Switch checked={!!value} onChange={onChange} />
        </div>
      );
    case "color":
      return (
        <div className="flex h-10 items-center gap-2">
          {["#5b6cff", "#8b5cf6", "#ec4899", "#f97316", "#eab308", "#10b981", "#06b6d4", "#64748b"].map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} className={cn("size-7 rounded-full ring-offset-2 ring-offset-transparent transition", value === c && "ring-2 ring-[var(--fg)]")} style={{ background: c }} aria-label={c} />
          ))}
        </div>
      );
    default:
      return <Input type={field.type} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />;
  }
}

export function EntityForm({ resource, values, onChange, fields, labels }: { resource: string; values: Values; onChange: (v: Values) => void; fields?: FieldDef[]; labels?: Record<string, string | null | undefined> }) {
  const schema = SCHEMAS[resource];
  const list = fields ?? schema?.fields ?? [];
  const sections = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of list) {
      const key = f.section ?? "";
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.entries()];
  }, [list]);
  const [openSections, setOpenSections] = useState<string[]>([]);

  const grid = (fs: FieldDef[]) => (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
      {fs.map((f) => (
        <Field key={f.name} label={f.type === "switch" && f.span === 2 ? undefined : f.label} required={f.required} hint={f.hint} className={cn(f.span === 2 && "sm:col-span-2")}>
          {f.type === "switch" && f.span === 2 ? (
            <Switch checked={!!values[f.name]} onChange={(v) => onChange({ ...values, [f.name]: v })} label={f.label} description={f.hint} />
          ) : (
            <FieldControl field={f} value={values[f.name]} onChange={(v) => onChange({ ...values, [f.name]: v })} initialLabel={labels?.[f.name]} />
          )}
        </Field>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {sections.map(([name, fs]) =>
        !name ? (
          <div key="main">{grid(fs)}</div>
        ) : (
          <div key={name} className="glass-inset rounded-[16px]">
            <button type="button" onClick={() => setOpenSections((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))} className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold text-fg-2">
              {name}
              <ChevronDown className={cn("size-4 transition-transform", openSections.includes(name) && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {openSections.includes(name) && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-4 pb-4">{grid(fs)}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ),
      )}
    </div>
  );
}

/** Create or edit any resource in a dialog, driven by its schema. */
export function RecordDialog({
  resource,
  open,
  onOpenChange,
  initial,
  recordId,
  labels,
  onSaved,
  navigateOnCreate = false,
  title,
  extra,
}: {
  resource: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Values;
  recordId?: number | null;
  labels?: Record<string, string | null | undefined>;
  onSaved?: (row: { id: number } & Values) => void;
  navigateOnCreate?: boolean;
  title?: ReactNode;
  extra?: ReactNode;
}) {
  const schema = SCHEMAS[resource];
  const [values, setValues] = useState<Values>(() => ({ ...defaultsFor(resource), ...(initial ?? {}) }));
  const [lastKey, setLastKey] = useState<string>("");
  const key = `${open}-${recordId}-${JSON.stringify(initial ?? {})}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setValues({ ...defaultsFor(resource), ...(initial ?? {}) });
  }
  const create = useCreate<{ id: number } & Values>(resource);
  const update = useUpdate<{ id: number } & Values>(resource);
  const navigate = useNavigate();
  const busy = create.isPending || update.isPending;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const data: Values = {};
    for (const f of schema.fields) if (f.name in values) data[f.name] = values[f.name];
    for (const [k, v] of Object.entries(values)) if (!(k in data)) data[k] = v;
    let row: { id: number } & Values;
    try {
      row = recordId ? await update.mutateAsync({ id: recordId, data }) : await create.mutateAsync(data);
    } catch {
      return; // already reported by the mutation's onError toast
    }
    onOpenChange(false);
    onSaved?.(row);
    if (!recordId && navigateOnCreate && schema.detailPath) navigate(schema.detailPath(row.id));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={title ?? (recordId ? `Modifier ${schema.singular}` : schema.newLabel)}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            {recordId ? "Enregistrer" : "Créer"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <EntityForm resource={resource} values={values} onChange={setValues} labels={labels} />
        {extra}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

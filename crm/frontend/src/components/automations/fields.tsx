import { Braces } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Field, fieldBase, NumberInput, Select, SearchInput } from "@/components/ui/fields";
import { Popover } from "@/components/ui/overlay";
import type { Option } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { BOOL_OPTIONS, writableFields, type FieldSpec, type VariableGroup } from "./catalog";

export interface FieldContext {
  users: { id: number; name: string }[];
  pipelines: { id: number; name: string }[];
  stages: { id: number; name: string; pipeline_id: number }[];
  forms: { id: number; name: string }[];
  entity: string | null;
  variables: VariableGroup[];
  disabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Variable picker                                                            */
/* -------------------------------------------------------------------------- */

export function VariablePicker({ groups, onPick }: { groups: VariableGroup[]; onPick: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = groups.map((g) => ({ ...g, items: g.items.filter((i) => !needle || `${i.label} ${i.path}`.toLowerCase().includes(needle)) })).filter((g) => g.items.length > 0);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
      width={320}
      trigger={
        <button type="button" className="flex h-7 items-center gap-1 rounded-[8px] px-1.5 text-fg-3 transition hover:bg-accent-soft hover:text-accent" aria-label="Insérer une variable" title="Insérer une variable">
          <Braces className="size-3.5" />
        </button>
      }
    >
      <div className="p-2.5">
        <div className="mb-2 px-1 text-[12px] text-fg-2">Insérer une variable, remplacée à l'exécution par la valeur réelle.</div>
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher une variable…" autoFocus />
        <div className="mt-2 max-h-[300px] overflow-y-auto pr-0.5">
          {filtered.length === 0 && <div className="px-2 py-6 text-center text-[12.5px] text-fg-3">Aucune variable ne correspond.</div>}
          {filtered.map((g) => (
            <div key={g.label} className="mb-1.5">
              <div className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-3">{g.label}</div>
              {g.items.map((it) => (
                <button
                  key={it.path}
                  type="button"
                  onClick={() => {
                    onPick(it.path);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-[10px] px-2 py-1.5 text-left text-[13px] transition hover:bg-black/[0.045] dark:hover:bg-white/[0.07]"
                >
                  <span className="truncate">{it.label}</span>
                  <code className="shrink-0 truncate font-mono text-[11px] text-fg-3">{`{{${it.path}}}`}</code>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Text field with {{variables}} insertion at the caret                       */
/* -------------------------------------------------------------------------- */

export function TemplateInput({ value, onChange, multiline, placeholder, variables, disabled, invalid }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string; variables: VariableGroup[]; disabled?: boolean; invalid?: boolean }) {
  const el = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const selection = useRef<[number, number] | null>(null);
  const remember = () => {
    const node = el.current;
    if (node) selection.current = [node.selectionStart ?? value.length, node.selectionEnd ?? value.length];
  };
  const insert = (path: string) => {
    const token = `{{${path}}}`;
    const [start, end] = selection.current ?? [value.length, value.length];
    onChange(value.slice(0, start) + token + value.slice(end));
    const caret = start + token.length;
    selection.current = [caret, caret];
    setTimeout(() => {
      el.current?.focus();
      el.current?.setSelectionRange(caret, caret);
    }, 20);
  };
  const shared = {
    value,
    placeholder,
    disabled,
    onSelect: remember,
    onKeyUp: remember,
    onClick: remember,
    onBlur: remember,
  };
  const ring = invalid && "ring-2 ring-red-500/50";
  return (
    <div className="relative">
      {multiline ? (
        <textarea
          {...shared}
          ref={(node) => {
            el.current = node;
          }}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldBase, "resize-y py-2.5 pr-11 text-[13.5px] leading-relaxed", ring)}
        />
      ) : (
        <input
          {...shared}
          ref={(node) => {
            el.current = node;
          }}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldBase, "h-10 pr-11 text-[13.5px]", ring)}
        />
      )}
      {!disabled && (
        <div className="absolute right-1.5 top-1.5">
          <VariablePicker groups={variables} onPick={insert} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Native select with option groups                                           */
/* -------------------------------------------------------------------------- */

export function GroupedSelect({ groups, value, onChange, placeholder, disabled, invalid, className }: { groups: { label: string; options: Option[] }[]; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; invalid?: boolean; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(fieldBase, "h-10 appearance-none pr-8 text-[13.5px]", !value && "text-fg-3", invalid && "ring-2 ring-red-500/50")}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label} className="bg-[var(--glass-solid)] text-fg">
            {g.options.map((o) => (
              <option key={o.value} value={o.value} className="bg-[var(--glass-solid)] text-fg">
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Schema-driven configuration field                                          */
/* -------------------------------------------------------------------------- */

const asText = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function isWideField(spec: FieldSpec) {
  return spec.kind === "text" || spec.kind === "textarea" || spec.kind === "record-value" || spec.kind === "stage" || spec.kind === "form";
}

function choiceOptions(spec: FieldSpec, ctx: FieldContext): { options: Option[]; placeholder?: string } {
  const people = ctx.users.map((u) => ({ value: String(u.id), label: u.name }));
  switch (spec.kind) {
    case "assignee":
      return { options: [{ value: "owner", label: "Responsable du dossier" }, { value: "actor", label: "Auteur de l'événement" }, ...people] };
    case "target":
      return { options: [{ value: "owner", label: "Responsable du dossier" }, { value: "actor", label: "Auteur de l'événement" }, { value: "all", label: "Toute l'équipe" }, ...people] };
    case "pipeline":
      return { options: ctx.pipelines.map((p) => ({ value: String(p.id), label: p.name })), placeholder: "Pipeline par défaut" };
    case "form":
      return { options: ctx.forms.map((f) => ({ value: String(f.id), label: f.name })), placeholder: "Tous les formulaires" };
    case "stage": {
      const names = new Map<string, string[]>();
      for (const s of ctx.stages) {
        const pipe = ctx.pipelines.find((p) => p.id === s.pipeline_id)?.name ?? "";
        names.set(s.name, [...(names.get(s.name) ?? []), pipe]);
      }
      return { options: Array.from(names, ([name, pipes]) => ({ value: name, label: ctx.pipelines.length > 1 ? `${name} · ${pipes.filter(Boolean).join(", ")}` : name })), placeholder: "N'importe quelle étape" };
    }
    case "record-field":
      return { options: writableFields(ctx.entity).map((f) => ({ value: f.path, label: f.label })), placeholder: "Choisir un champ…" };
    default:
      return { options: spec.options ?? [] };
  }
}

export function ConfigField({ spec, value, config, onChange, ctx, error }: { spec: FieldSpec; value: unknown; config: Record<string, unknown>; onChange: (v: unknown) => void; ctx: FieldContext; error?: string }) {
  let control: ReactNode;
  const invalid = !!error;
  if (spec.kind === "text" || spec.kind === "textarea") {
    control = spec.template ? (
      <TemplateInput value={asText(value)} onChange={onChange} multiline={spec.kind === "textarea"} placeholder={spec.placeholder} variables={ctx.variables} disabled={ctx.disabled} invalid={invalid} />
    ) : spec.kind === "textarea" ? (
      <textarea value={asText(value)} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder} disabled={ctx.disabled} rows={4} className={cn(fieldBase, "resize-y py-2.5 text-[13.5px]", invalid && "ring-2 ring-red-500/50")} />
    ) : (
      <input value={asText(value)} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder} disabled={ctx.disabled} className={cn(fieldBase, "h-10 text-[13.5px]", invalid && "ring-2 ring-red-500/50")} />
    );
  } else if (spec.kind === "number") {
    // Stored as text: the engine reads « 0 » as a real value only when it is a string.
    control = <NumberInput value={asText(value)} onChange={(n) => onChange(n === null ? "" : String(n))} suffix={spec.suffix} step={1} min={0} />;
  } else if (spec.kind === "record-value") {
    const target = writableFields(ctx.entity).find((f) => f.path === config.field);
    if (target?.type === "enum" || target?.type === "bool")
      control = <Select options={target.type === "bool" ? BOOL_OPTIONS : (target.options ?? [])} value={asText(value)} onChange={onChange} placeholder="Choisir une valeur…" disabled={ctx.disabled} />;
    else if (target?.type === "number") control = <NumberInput value={asText(value)} onChange={(n) => onChange(n === null ? "" : String(n))} />;
    else control = <TemplateInput value={asText(value)} onChange={onChange} placeholder="Nouvelle valeur" variables={ctx.variables} disabled={ctx.disabled} invalid={invalid} />;
  } else {
    const { options, placeholder } = choiceOptions(spec, ctx);
    control = <Select options={options} value={asText(value)} onChange={onChange} placeholder={placeholder} disabled={ctx.disabled} className={cn(invalid && "rounded-[12px] ring-2 ring-red-500/50")} />;
  }
  return (
    <Field label={spec.label} hint={spec.hint} error={error} required={spec.required} className={cn(isWideField(spec) && "sm:col-span-2")}>
      {control}
    </Field>
  );
}

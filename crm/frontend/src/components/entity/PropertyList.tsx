import { Check, ExternalLink, Pencil, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { FieldControl } from "@/components/entity/EntityForm";
import { StatusBadge, Tag } from "@/components/ui/display";
import { findOption, type Option } from "@/lib/constants";
import { date, dateTime, money, number } from "@/lib/format";
import { useUpdate } from "@/lib/hooks";
import { SCHEMAS, type FieldDef } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown> & { id: number };

const DETAIL_ROUTES: Record<string, string> = { companies: "/companies", contacts: "/contacts", deals: "/deals", projects: "/projects", tickets: "/tickets" };

/** Human display of a field value (used by PropertyList and anywhere a schema field is shown read-only). */
export function displayValue(field: FieldDef, record: Row): ReactNode {
  const value = record[field.name];
  const empty = <span className="text-fg-3">—</span>;
  if (field.type === "switch") return value ? "Oui" : "Non";
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return empty;
  switch (field.type) {
    case "money":
      return <span className="tabular">{money(Number(value))}</span>;
    case "percent":
      return <span className="tabular">{number(Number(value), 1)} %</span>;
    case "number":
      return <span className="tabular">{number(Number(value), Number.isInteger(Number(value)) ? 0 : 2)}</span>;
    case "date":
      return date(String(value));
    case "datetime":
      return dateTime(String(value));
    case "select": {
      const options = (field.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o)) as Option[];
      const opt = findOption(options, String(value));
      return opt?.tone ? <StatusBadge options={options} value={String(value)} /> : (opt?.label ?? String(value));
    }
    case "entity": {
      const ref = record[field.name.replace(/_id$/, "")] as { id: number; name: string } | null | undefined;
      const label = ref?.name ?? `#${value}`;
      const base = field.resource ? DETAIL_ROUTES[field.resource] : undefined;
      return base ? (
        <Link to={`${base}/${value}`} className="font-medium text-accent hover:underline">
          {label}
        </Link>
      ) : (
        label
      );
    }
    case "tags":
      return (
        <span className="flex flex-wrap justify-end gap-1">
          {(value as string[]).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </span>
      );
    case "url":
      return (
        <a href={String(value).startsWith("http") ? String(value) : `https://${value}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-accent hover:underline">
          <span className="truncate">{String(value).replace(/^https?:\/\//, "")}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${value}`} className="text-accent hover:underline">
          {String(value)}
        </a>
      );
    case "tel":
      return (
        <a href={`tel:${value}`} className="hover:underline">
          {String(value)}
        </a>
      );
    case "color":
      return <span className="inline-block size-4 rounded-full align-middle" style={{ background: String(value) }} />;
    default:
      return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
  }
}

function PropertyRow({ resource, record, field, readOnly }: { resource: string; record: Row; field: FieldDef; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(record[field.name]);
  const update = useUpdate(resource, { silent: true });
  const immediate = ["select", "entity", "switch", "date", "color"].includes(field.type);

  const save = (value: unknown) => {
    setEditing(false);
    if (JSON.stringify(value ?? null) === JSON.stringify(record[field.name] ?? null)) return;
    update.mutate({ id: record.id, data: { [field.name]: value } });
  };

  if (field.type === "switch") {
    return (
      <div className="flex items-center justify-between gap-4 py-2 text-[13.5px]">
        <span className="text-fg-3">{field.label}</span>
        <FieldControl field={{ ...field, type: "switch" }} value={record[field.name]} onChange={(v) => !readOnly && save(v)} />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="py-1.5">
        <div className="mb-1 text-[12px] text-fg-3">{field.label}</div>
        <div
          className="flex items-start gap-1.5"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && field.type !== "textarea" && !immediate) save(draft);
          }}
        >
          <div className="min-w-0 flex-1">
            <FieldControl
              field={field}
              value={draft}
              initialLabel={(record[field.name.replace(/_id$/, "")] as { name?: string } | null)?.name}
              onChange={(v) => {
                setDraft(v);
                if (immediate) save(v);
              }}
            />
          </div>
          {!immediate && (
            <>
              <button type="button" onClick={() => save(draft)} className="mt-1.5 rounded-[9px] p-1.5 text-accent hover:bg-accent-soft" aria-label="Valider">
                <Check className="size-4" />
              </button>
              <button type="button" onClick={() => setEditing(false)} className="mt-1.5 rounded-[9px] p-1.5 text-fg-3 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Annuler">
                <X className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-start justify-between gap-4 rounded-[10px] py-2 text-[13.5px]", field.type === "textarea" && "flex-col gap-1")}>
      <span className="shrink-0 text-fg-3">{field.label}</span>
      <span className={cn("flex min-w-0 items-start gap-1.5", field.type === "textarea" ? "w-full" : "justify-end text-right")}>
        <span className="min-w-0 break-words">{displayValue(field, record)}</span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setDraft(record[field.name]);
              setEditing(true);
            }}
            className="mt-0.5 shrink-0 rounded-[7px] p-0.5 text-fg-3 opacity-0 transition hover:text-accent group-hover:opacity-100"
            aria-label={`Modifier ${field.label}`}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

/** Editable property sheet: click any value to edit it in place (saved immediately). */
export function PropertyList({ resource, record: rec, fields, readOnly, className }: { resource: string; record: { id: number }; fields?: (string | FieldDef)[]; readOnly?: boolean; className?: string }) {
  const record = rec as unknown as Row;
  const schema = SCHEMAS[resource];
  const list: FieldDef[] = (fields ?? schema?.fields ?? []).map((f) => (typeof f === "string" ? schema?.fields.find((x) => x.name === f) : f)).filter((f): f is FieldDef => !!f);
  return (
    <div className={cn("divide-y divide-[var(--hairline)]", className)}>
      {list.map((f) => (
        <PropertyRow key={`${record.id}-${f.name}`} resource={resource} record={record} field={f} readOnly={readOnly} />
      ))}
    </div>
  );
}

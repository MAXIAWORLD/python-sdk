import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Popover as RPopover } from "radix-ui";
import { useState } from "react";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, CompanyLogo, Spinner } from "./display";
import { fieldBase } from "./fields";

type Row = { id: number; [k: string]: unknown };

const LABELS: Record<string, (r: Row) => string> = {
  contacts: (r) => String(r.full_name ?? ""),
  companies: (r) => String(r.name ?? ""),
  deals: (r) => String(r.title ?? ""),
  projects: (r) => String(r.name ?? ""),
  products: (r) => String(r.name ?? ""),
  users: (r) => String(r.name ?? ""),
  tickets: (r) => `${r.number} · ${r.subject}`,
  quotes: (r) => `${r.number}${r.title ? " — " + r.title : ""}`,
  invoices: (r) => `${r.number || "Brouillon"}${r.title ? " — " + r.title : ""}`,
  segments: (r) => String(r.name ?? ""),
  pipelines: (r) => String(r.name ?? ""),
  stages: (r) => String(r.name ?? ""),
  tasks: (r) => String(r.title ?? ""),
  "email-templates": (r) => String(r.name ?? ""),
};

const SUBTITLE: Record<string, (r: Row) => string | undefined> = {
  contacts: (r) => (r.company as { name?: string } | null)?.name ?? (r.email as string | undefined),
  companies: (r) => (r.city as string | undefined) ?? (r.industry as string | undefined),
  deals: (r) => (r.company as { name?: string } | null)?.name,
  products: (r) => `${r.unit_price} € / ${r.unit}`,
  users: (r) => r.email as string,
};

export function labelFor(resource: string, row?: Row | null) {
  if (!row) return "";
  return (LABELS[resource] ?? ((r: Row) => String(r.name ?? r.title ?? `#${r.id}`)))(row);
}

export interface EntitySelectProps {
  resource: string;
  value?: number | null;
  onChange: (id: number | null, row?: Row | null) => void;
  placeholder?: string;
  initialLabel?: string | null;
  params?: Record<string, string | number | boolean | undefined>;
  allowClear?: boolean;
  onCreate?: (query: string) => void;
  className?: string;
  disabled?: boolean;
}

/** Searchable select backed by the API (any resource). */
export function EntitySelect({ resource, value, onChange, placeholder = "Sélectionner…", initialLabel, params, allowClear = true, onCreate, className, disabled }: EntitySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 200);
  const [picked, setPicked] = useState<Row | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: [resource, "select", q, params ?? {}],
    queryFn: () => api.get<Paginated<Row>>(`/${resource}`, { q, limit: 20, ...(params ?? {}) }),
    enabled: open,
  });
  const { data: current } = useQuery({
    queryKey: [resource, "item", value],
    queryFn: () => api.get<Row>(`/${resource}/${value}`),
    enabled: !!value && !initialLabel && picked?.id !== value,
    staleTime: 60_000,
  });

  const label = picked?.id === value && picked ? labelFor(resource, picked) : initialLabel || (current ? labelFor(resource, current) : value ? `#${value}` : "");

  return (
    <RPopover.Root open={open} onOpenChange={setOpen}>
      <RPopover.Trigger asChild disabled={disabled}>
        <button type="button" className={cn(fieldBase, "flex h-10 items-center gap-2 text-left", className)}>
          {value && resource === "contacts" && <Avatar name={label} size={22} />}
          {value && resource === "companies" && <CompanyLogo name={label} size={22} />}
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-fg-3")}>{value ? label : placeholder}</span>
          {value && allowClear ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                setPicked(null);
                onChange(null, null);
              }}
              className="rounded-full p-0.5 text-fg-3 hover:text-fg"
              aria-label="Effacer"
            >
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="size-4 text-fg-3" />
          )}
        </button>
      </RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align="start" sideOffset={6} className="glass glass-strong z-[80] w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden rounded-[16px] p-0 shadow-[var(--glass-shadow-lg)]">
          <Command shouldFilter={false} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-3">
              <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Rechercher…" className="h-10 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3" />
              {isFetching && <Spinner className="size-3.5 text-fg-3" />}
            </div>
            <Command.List className="max-h-[280px] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-fg-3">Aucun résultat</Command.Empty>
              {(data?.items ?? []).map((row) => {
                const l = labelFor(resource, row);
                const sub = SUBTITLE[resource]?.(row);
                return (
                  <Command.Item
                    key={row.id}
                    value={String(row.id)}
                    onSelect={() => {
                      setPicked(row);
                      onChange(row.id, row);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-black/[0.05] dark:data-[selected=true]:bg-white/[0.08]"
                  >
                    {resource === "contacts" || resource === "users" ? <Avatar name={l} size={24} color={(row.color as string) || undefined} /> : resource === "companies" ? <CompanyLogo name={l} size={24} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{l}</span>
                      {sub && <span className="block truncate text-[11.5px] text-fg-3">{sub}</span>}
                    </span>
                    {row.id === value && <Check className="size-4 text-accent" />}
                  </Command.Item>
                );
              })}
              {onCreate && query.trim() && (
                <Command.Item
                  value="__create__"
                  onSelect={() => {
                    onCreate(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] text-accent data-[selected=true]:bg-accent-soft"
                >
                  <Plus className="size-4" /> Créer « {query.trim()} »
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

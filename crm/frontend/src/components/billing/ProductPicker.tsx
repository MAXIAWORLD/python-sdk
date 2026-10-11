import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Check, Package, Unlink } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/display";
import { Popover } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { PRODUCT_KINDS, labelOf } from "@/lib/constants";
import { money } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Paginated, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { vatLabel } from "./lib";

/** Small catalogue picker attached to a line: fills description, unit, unit price and VAT. */
export function ProductPicker({ productId, onPick, onUnlink }: { productId?: number | null; onPick: (product: Product) => void; onUnlink: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 200);
  const { data, isFetching } = useQuery({
    queryKey: ["products", "picker", q],
    queryFn: () => api.get<Paginated<Product>>("/products", { q, active: true, limit: 30, sort: "name" }),
    enabled: open,
  });
  const linked = !!productId;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      width={340}
      trigger={
        <button
          type="button"
          aria-label={linked ? "Produit du catalogue lié — changer" : "Choisir un produit du catalogue"}
          title={linked ? "Lié au catalogue — changer de produit" : "Choisir dans le catalogue"}
          className={cn(
            "mt-1 flex size-7 shrink-0 items-center justify-center rounded-[9px] transition",
            linked ? "bg-accent-soft text-accent" : "text-fg-3 hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]",
          )}
        >
          <Package className="size-[15px]" />
        </button>
      }
    >
      <Command shouldFilter={false} className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-3">
          <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Rechercher dans le catalogue…" className="h-11 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3" />
          {isFetching && <Spinner className="size-3.5 text-fg-3" />}
        </div>
        <Command.List className="max-h-[300px] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-fg-3">Aucun produit actif ne correspond.</Command.Empty>
          {(data?.items ?? []).map((p) => (
            <Command.Item
              key={p.id}
              value={String(p.id)}
              onSelect={() => {
                onPick(p);
                setOpen(false);
                setQuery("");
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-black/[0.05] dark:data-[selected=true]:bg-white/[0.08]"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-accent">
                <Package className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-[11.5px] text-fg-3">
                  {labelOf(PRODUCT_KINDS, p.kind)} · TVA {vatLabel(p.vat_rate)}
                </span>
              </span>
              <span className="shrink-0 text-right text-[12.5px] font-semibold tabular">
                {money(p.unit_price)}
                <span className="block text-[10.5px] font-normal text-fg-3">/ {p.unit}</span>
              </span>
              {p.id === productId && <Check className="size-4 shrink-0 text-accent" />}
            </Command.Item>
          ))}
        </Command.List>
        {linked && (
          <button
            type="button"
            onClick={() => {
              onUnlink();
              setOpen(false);
            }}
            className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-2.5 text-left text-[12.5px] font-medium text-fg-2 hover:text-fg"
          >
            <Unlink className="size-3.5" /> Dissocier du catalogue
          </button>
        )}
      </Command>
    </Popover>
  );
}

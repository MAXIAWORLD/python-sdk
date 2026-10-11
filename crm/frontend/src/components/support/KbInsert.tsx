import { BookOpen, Eye, FileSearch } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/fields";
import { Popover } from "@/components/ui/overlay";
import { number } from "@/lib/format";
import { useDebounced, useList } from "@/lib/hooks";
import type { KbArticle } from "@/lib/types";

export function helpUrl(slug: string) {
  return `${window.location.origin}/aide/${slug}`;
}

/** Search the published knowledge base and pick an article (to insert its link in a reply). */
export function KbInsertPopover({ trigger, onPick }: { trigger: ReactNode; onPick: (article: KbArticle) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const { data, isFetching } = useList<KbArticle>("kb-articles", { status: "published", q: dq || undefined, sort: "-views", limit: 8, expand: 0 }, { enabled: open });
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen} trigger={trigger} width={380} align="end">
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-2">
            <BookOpen className="size-3.5" /> Insérer un article d'aide
          </span>
          {isFetching && <Spinner className="size-3.5 text-fg-3" />}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher dans la base…" autoFocus />
        <div className="mt-2 max-h-[300px] space-y-0.5 overflow-y-auto">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onPick(a);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-accent">
                <BookOpen className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{a.title}</span>
                <span className="block truncate text-[11.5px] text-fg-3">
                  {a.category ?? "Sans catégorie"} · /aide/{a.slug}
                </span>
              </span>
              <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[11px] text-fg-3 tabular">
                <Eye className="size-3" />
                {number(a.views)}
              </span>
            </button>
          ))}
          {!isFetching && items.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center text-[12.5px] text-fg-3">
              <FileSearch className="size-5" />
              Aucun article publié ne correspond.
            </div>
          )}
        </div>
      </div>
    </Popover>
  );
}

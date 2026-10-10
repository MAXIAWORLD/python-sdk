import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  width?: string;
  hideOnMobile?: boolean;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T extends { id: number }> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  sort?: string;
  onSortChange?: (sort: string) => void;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selected?: number[];
  onSelectedChange?: (ids: number[]) => void;
  empty?: ReactNode;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  rowClassName?: (row: T) => string | undefined;
  dense?: boolean;
}

export function DataTable<T extends { id: number }>({ columns, rows, loading, sort, onSortChange, onRowClick, selectable, selected = [], onSelectedChange, empty, page = 0, pageSize = 50, total, onPageChange, rowClassName, dense }: DataTableProps<T>) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const sortField = sort?.replace(/^-/, "");
  const desc = sort?.startsWith("-");
  const pages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  const toggleSort = (key?: string) => {
    if (!key || !onSortChange) return;
    if (sortField === key) onSortChange(desc ? key : `-${key}`);
    else onSortChange(`-${key}`);
  };

  const skeletonRows = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-[13.5px]">
          <thead>
            <tr>
              {selectable && (
                <th className="sticky top-0 w-10 border-b border-[var(--hairline)] py-2.5 pl-4">
                  <Checkbox checked={allSelected} onChange={(v) => onSelectedChange?.(v ? rows.map((r) => r.id) : [])} />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    "sticky top-0 whitespace-nowrap border-b border-[var(--hairline)] px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3 first:pl-5 last:pr-5",
                    col.sortKey && "cursor-pointer select-none hover:text-fg-2",
                    col.hideOnMobile && "hidden md:table-cell",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.headerClassName,
                  )}
                  onClick={() => toggleSort(col.sortKey)}
                >
                  <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                    {col.header}
                    {col.sortKey && sortField === col.sortKey && (desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0
              ? skeletonRows.map((i) => (
                  <tr key={i}>
                    {selectable && <td className="border-b border-[var(--hairline)] py-3 pl-4" />}
                    {columns.map((col) => (
                      <td key={col.key} className={cn("border-b border-[var(--hairline)] px-3 py-3.5 first:pl-5", col.hideOnMobile && "hidden md:table-cell")}>
                        <Skeleton className="h-3.5 w-[70%]" />
                      </td>
                    ))}
                  </tr>
                ))
              : (
                <AnimatePresence initial={false}>
                  {rows.map((row, idx) => {
                    const isSel = selected.includes(row.id);
                    return (
                      <motion.tr
                        key={row.id}
                        layout="position"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, delay: Math.min(idx * 0.012, 0.25) }}
                        onClick={() => onRowClick?.(row)}
                        className={cn("group transition-colors", onRowClick && "cursor-pointer", isSel ? "bg-accent-soft" : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]", rowClassName?.(row))}
                      >
                        {selectable && (
                          <td className="border-b border-[var(--hairline)] py-2 pl-4" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={isSel} onChange={(v) => onSelectedChange?.(v ? [...selected, row.id] : selected.filter((x) => x !== row.id))} />
                          </td>
                        )}
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={cn(
                              "border-b border-[var(--hairline)] px-3 first:pl-5 last:pr-5",
                              dense ? "py-2" : "py-3",
                              col.hideOnMobile && "hidden md:table-cell",
                              col.align === "right" && "text-right",
                              col.align === "center" && "text-center",
                              col.className,
                            )}
                          >
                            {col.cell(row)}
                          </td>
                        ))}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && empty}
      {total !== undefined && total > pageSize && onPageChange && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 text-[12.5px] text-fg-2">
          <span className="tabular">
            {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} sur {total.toLocaleString("fr-FR")}
          </span>
          <div className="flex items-center gap-1">
            <button className="rounded-[9px] p-1.5 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10" disabled={page === 0} onClick={() => onPageChange(page - 1)} aria-label="Page précédente">
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-1 tabular">
              {page + 1} / {pages}
            </span>
            <button className="rounded-[9px] p-1.5 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10" disabled={page + 1 >= pages} onClick={() => onPageChange(page + 1)} aria-label="Page suivante">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

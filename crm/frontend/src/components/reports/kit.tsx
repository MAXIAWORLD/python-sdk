import { ChartColumn, Download, Table2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/data/blocks";
import { IconButton } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { cn, downloadBlob } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* CSV (generated client side, Excel-friendly: « ; », decimal comma, BOM)    */
/* -------------------------------------------------------------------------- */

export type CsvValue = string | number | null | undefined;

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
  csv: (row: T) => CsvValue;
  hideOnMobile?: boolean;
  /** Exported to CSV only, not displayed. */
  csvOnly?: boolean;
}

function csvCell(v: CsvValue) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv<T>(filename: string, all: TableColumn<T>[], rows: T[]) {
  const columns = all.filter((c) => c.header);
  const lines = [columns.map((c) => csvCell(c.header)).join(";"), ...rows.map((r) => columns.map((c) => csvCell(c.csv(r))).join(";"))];
  downloadBlob(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }), filename.endsWith(".csv") ? filename : `${filename}.csv`);
  toast.success("Export CSV téléchargé", { description: filename });
}

/* -------------------------------------------------------------------------- */
/* Table                                                                      */
/* -------------------------------------------------------------------------- */

export function ReportTable<T>({ columns: all, rows, footer, maxHeight = 360, className }: { columns: TableColumn<T>[]; rows: T[]; footer?: T; maxHeight?: number; className?: string }) {
  const columns = all.filter((c) => !c.csvOnly);
  return (
    <div className={cn("overflow-auto rounded-[16px] ring-1 ring-inset ring-[var(--hairline)]", className)} style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 whitespace-nowrap border-b border-[var(--hairline)] bg-[var(--glass-solid)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3",
                  c.align === "right" ? "text-right" : "text-left",
                  c.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.035]">
              {columns.map((c) => (
                <td key={c.key} className={cn("border-b border-[var(--hairline)] px-3 py-2", c.align === "right" ? "text-right tabular" : "text-left", c.hideOnMobile && "hidden sm:table-cell")}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <td key={c.key} className={cn("sticky bottom-0 bg-[var(--glass-solid)] px-3 py-2 font-semibold", c.align === "right" ? "text-right tabular" : "text-left", c.hideOnMobile && "hidden sm:table-cell")}>
                  {c.cell(footer)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Report panel: chart ⇄ table, CSV export                                    */
/* -------------------------------------------------------------------------- */

export function ReportPanel<T>({
  title,
  description,
  icon,
  className,
  chart,
  table,
  csvName,
  loading,
  empty,
  emptyText = "Aucune donnée sur la période.",
  defaultView = "chart",
  extra,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  chart?: ReactNode;
  table?: { columns: TableColumn<T>[]; rows: T[]; footer?: T };
  csvName?: string;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  defaultView?: "chart" | "table";
  extra?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">(chart ? defaultView : "table");
  const canToggle = !!chart && !!table;
  return (
    <Panel
      title={title}
      description={description}
      icon={icon}
      className={className}
      actions={
        !loading &&
        !empty && (
          <>
            {extra}
            {canToggle && (
              <div className="flex items-center rounded-[11px] bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                <IconButton size="xs" label="Graphique" active={view === "chart"} onClick={() => setView("chart")}>
                  <ChartColumn className="size-3.5" />
                </IconButton>
                <IconButton size="xs" label="Tableau" active={view === "table"} onClick={() => setView("table")}>
                  <Table2 className="size-3.5" />
                </IconButton>
              </div>
            )}
            {table && csvName && (
              <IconButton size="sm" label="Exporter en CSV" onClick={() => downloadCsv(csvName, table.columns, table.footer ? [...table.rows, table.footer] : table.rows)}>
                <Download className="size-4" />
              </IconButton>
            )}
          </>
        )
      }
    >
      {loading ? (
        <Skeleton className="h-[240px] rounded-[16px]" />
      ) : empty ? (
        <EmptyState title={emptyText} className="py-10" />
      ) : (
        // A fresh presence context so nested `initial` / `whileInView` animations (bars) are never skipped.
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            {view === "chart" || !table ? chart : <ReportTable columns={table.columns} rows={table.rows} footer={table.footer} />}
          </motion.div>
        </AnimatePresence>
      )}
    </Panel>
  );
}

export function TruncatedNote({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="mt-3 text-[11.5px] text-fg-3">Calcul effectué sur les 1 000 éléments les plus récents de la période.</p>;
}

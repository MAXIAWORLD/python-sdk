import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Skeleton } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Popover } from "@/components/ui/overlay";
import { date, duration, isoDate, percent } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { refColor } from "./TaskCard";
import { clock, tint, weekDays, type TimeEntryRow } from "./work-utils";

export interface TimesheetAdd {
  project_id: number | null;
  project_name?: string | null;
  date: string;
}

interface SheetRow {
  key: string;
  project_id: number | null;
  name: string;
  client?: string;
  color: string;
  cells: Record<string, TimeEntry[]>;
  total: number;
}

const sum = (list: TimeEntry[] = []) => list.reduce((s, e) => s + e.minutes, 0);

function Cell({ row, day, today, weekend, onAdd, onEdit, showUser }: { row: SheetRow; day: Date; today: boolean; weekend: boolean; onAdd: (a: TimesheetAdd) => void; onEdit: (e: TimeEntry) => void; showUser: boolean }) {
  const key = isoDate(day);
  const list = row.cells[key] ?? [];
  const minutes = sum(list);
  const ratio = Math.min(1, minutes / 480);
  const add = () => onAdd({ project_id: row.project_id, project_name: row.project_id ? row.name : null, date: key });
  const button = (
    <button
      type="button"
      onClick={list.length > 1 ? undefined : list.length === 1 ? () => onEdit(list[0]) : add}
      className={cn("group/cell flex h-11 w-full items-center justify-center rounded-[12px] text-[13.5px] font-semibold tabular transition", minutes ? "text-fg hover:brightness-105" : "text-transparent hover:bg-black/[0.035] hover:text-fg-3 dark:hover:bg-white/[0.05]")}
      style={minutes ? { background: tint(row.color, 10 + ratio * 26), boxShadow: `inset 0 0 0 1px ${tint(row.color, 22 + ratio * 20)}` } : undefined}
      aria-label={minutes ? `${duration(minutes)} — ${row.name}, ${date(day, "EEEE d MMMM")}` : `Saisir du temps — ${row.name}, ${date(day, "EEEE d MMMM")}`}
    >
      {minutes ? clock(minutes) : <Plus className="size-4" />}
    </button>
  );
  return (
    <td className={cn("px-1 py-1", today && "bg-accent-soft/60", weekend && !today && "bg-black/[0.015] dark:bg-white/[0.015]")}>
      {list.length > 1 ? (
        <Popover trigger={button} width={300} align="center">
          <div className="border-b border-[var(--hairline)] px-4 py-3">
            <div className="text-[13.5px] font-semibold first-letter:uppercase">{date(day, "EEEE d MMMM")}</div>
            <div className="text-[12px] text-fg-3">
              {row.name} · {duration(minutes)}
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {list.map((e) => (
              <button key={e.id} type="button" onClick={() => onEdit(e)} className="flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                {showUser && e.user && <Avatar name={e.user.name} color={(e.user.color as string) ?? undefined} size={22} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{e.task?.name ?? e.description ?? "Sans description"}</span>
                  {!e.billable && <span className="text-[11.5px] text-fg-3">Non facturable</span>}
                </span>
                <span className="text-[12.5px] font-semibold tabular">{clock(e.minutes)}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--hairline)] p-1.5">
            <button type="button" onClick={add} className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-[13px] font-medium text-accent transition hover:bg-accent-soft">
              <Plus className="size-4" /> Ajouter une saisie
            </button>
          </div>
        </Popover>
      ) : (
        button
      )}
    </td>
  );
}

/** Weekly timesheet: projects × days (Monday → Sunday) with row, column and week totals. */
export function Timesheet({ start, entries, loading, onAdd, onEdit, showUser = false }: { start: Date; entries: TimeEntryRow[]; loading?: boolean; onAdd: (a: TimesheetAdd) => void; onEdit: (e: TimeEntry) => void; showUser?: boolean }) {
  const days = weekDays(start);
  const todayKey = isoDate(new Date());
  const [extra, setExtra] = useState<{ id: number; name: string; color: string }[]>([]);

  const rows = useMemo(() => {
    const map = new Map<string, SheetRow>();
    for (const e of entries) {
      const key = e.project_id ? String(e.project_id) : "none";
      let row = map.get(key);
      if (!row) {
        row = { key, project_id: e.project_id ?? null, name: e.project?.name ?? "Sans projet", client: e.company?.name, color: refColor(e.project, "#8e8e93"), cells: {}, total: 0 };
        map.set(key, row);
      }
      (row.cells[e.date] ??= []).push(e);
      row.total += e.minutes;
    }
    const sorted = [...map.values()].sort((a, b) => (a.project_id ? 0 : 1) - (b.project_id ? 0 : 1) || a.name.localeCompare(b.name, "fr"));
    for (const p of extra) if (!map.has(String(p.id))) sorted.push({ key: String(p.id), project_id: p.id, name: p.name, color: p.color, cells: {}, total: 0 });
    return sorted;
  }, [entries, extra]);

  const dayTotals = days.map((d) => entries.filter((e) => e.date === isoDate(d)).reduce((s, e) => s + e.minutes, 0));
  const total = dayTotals.reduce((a, b) => a + b, 0);
  const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);

  if (loading && !entries.length) return <Skeleton className="h-[260px] rounded-[18px]" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-[13.5px]">
        <colgroup>
          <col className="w-[30%]" />
          {days.map((d) => (
            <col key={d.toISOString()} />
          ))}
          <col className="w-[96px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="border-b border-[var(--hairline)] px-3 pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">Projet</th>
            {days.map((d) => {
              const today = isoDate(d) === todayKey;
              return (
                <th key={d.toISOString()} className={cn("border-b border-[var(--hairline)] px-1 pb-2.5 text-center", today && "bg-accent-soft/60 rounded-t-[12px]")}>
                  <div className={cn("text-[11px] font-semibold uppercase tracking-[0.06em]", today ? "text-accent" : "text-fg-3")}>{date(d, "EEE").replace(".", "")}</div>
                  <div className={cn("mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-[14px] font-semibold tabular", today ? "btn-primary" : "text-fg-2")}>{date(d, "d")}</div>
                </th>
              );
            })}
            <th className="border-b border-[var(--hairline)] px-3 pb-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="border-b border-[var(--hairline)] px-3 py-1">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: row.color, boxShadow: `0 0 8px ${row.color}` }} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.name}</div>
                    {row.client && <div className="truncate text-[11.5px] text-fg-3">{row.client}</div>}
                  </div>
                </div>
              </td>
              {days.map((d) => (
                <Cell key={d.toISOString()} row={row} day={d} today={isoDate(d) === todayKey} weekend={d.getDay() === 0 || d.getDay() === 6} onAdd={onAdd} onEdit={onEdit} showUser={showUser} />
              ))}
              <td className="border-b border-[var(--hairline)] px-3 text-right font-semibold tabular">{row.total ? clock(row.total) : <span className="text-fg-3">—</span>}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={9} className="px-2 py-2.5">
              <EntitySelect
                resource="projects"
                value={null}
                params={{ status__in: "planned,active,on_hold" }}
                onChange={(id, r) => id && r && setExtra((x) => [...x, { id, name: String(r.name ?? ""), color: typeof r.color === "string" ? r.color : "#8e8e93" }])}
                placeholder={rows.length ? "Ajouter un projet à la feuille…" : "Choisissez un projet pour commencer votre feuille de temps…"}
                className="w-full max-w-[340px] bg-transparent"
                allowClear={false}
              />
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="rounded-bl-[14px] border-t border-[var(--hairline-strong)] px-3 pt-3">
              <div className="text-[12.5px] font-semibold">Total</div>
              <div className="text-[11.5px] text-fg-3">
                Facturable : {duration(billable)}
                {total ? ` (${percent((billable / total) * 100)})` : ""}
              </div>
            </td>
            {dayTotals.map((m, i) => (
              <td key={i} className={cn("border-t border-[var(--hairline-strong)] px-1 pt-3 text-center text-[13px] font-semibold tabular", m ? "text-fg" : "text-fg-3", m > 600 && "text-orange-600 dark:text-orange-400")}>
                {m ? clock(m) : "—"}
              </td>
            ))}
            <td className="border-t border-[var(--hairline-strong)] px-3 pt-3 text-right text-[15px] font-semibold tabular">{clock(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

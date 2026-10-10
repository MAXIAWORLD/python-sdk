import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, moneyShort, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { axisTick, useChartTheme } from "./theme";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

interface TooltipRow {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

export function GlassTooltip({ active, payload, label, format = (v: number) => money(v), labels = {} }: { active?: boolean; payload?: TooltipRow[]; label?: ReactNode; format?: (v: number) => string; labels?: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong min-w-[170px] rounded-[14px] px-3 py-2.5 text-[12px] shadow-[var(--glass-shadow-lg)]">
      {label !== undefined && <div className="mb-1.5 font-semibold text-fg">{label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {labels[String(p.dataKey)] ?? p.name}
            </span>
            <span className="font-semibold tabular text-fg">{typeof p.value === "number" ? format(p.value) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[12px] text-fg-2">
          <span className="h-2 w-3 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
          {it.value && <span className="font-semibold tabular text-fg">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Revenue vs cash (area, one axis)                                           */
/* -------------------------------------------------------------------------- */

export function RevenueChart({ data, height = 260 }: { data: { label: string; revenue: number; cash: number }[]; height?: number }) {
  const t = useChartTheme();
  const [c1, c2] = t.series;
  return (
    <div>
      <div className="mb-3">
        <Legend items={[{ label: "CA facturé HT", color: c1 }, { label: "Encaissements", color: c2 }]} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c1} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c1} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="cash-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c2} stopOpacity={0.12} />
              <stop offset="100%" stopColor={c2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...axisTick, fill: t.axis }} dy={6} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ ...axisTick, fill: t.axis }} tickFormatter={(v) => moneyShort(v)} />
          <Tooltip cursor={{ stroke: t.cursor, strokeWidth: 1 }} content={<GlassTooltip labels={{ revenue: "CA facturé HT", cash: "Encaissements" }} />} />
          <Area type="monotone" dataKey="cash" stroke={c2} strokeWidth={2} fill="url(#cash-fill)" dot={false} activeDot={{ r: 4.5, stroke: t.surface, strokeWidth: 2 }} />
          <Area type="monotone" dataKey="revenue" stroke={c1} strokeWidth={2.2} fill="url(#rev-fill)" dot={false} activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MRR line + movements (two charts, never a dual axis)                       */
/* -------------------------------------------------------------------------- */

export function MrrLine({ data, height = 180 }: { data: { month: string; mrr: number }[]; height?: number }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mrr-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={t.accent} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ ...axisTick, fill: t.axis }} tickFormatter={monthLabel} dy={6} />
        <YAxis tickLine={false} axisLine={false} width={52} tick={{ ...axisTick, fill: t.axis }} tickFormatter={(v) => moneyShort(v)} />
        <Tooltip cursor={{ stroke: t.cursor }} content={<GlassTooltip labels={{ mrr: "MRR" }} />} labelFormatter={(l) => monthLabel(String(l))} />
        <Area type="monotone" dataKey="mrr" stroke={t.accent} strokeWidth={2.2} fill="url(#mrr-fill)" dot={false} activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  if (!m) return key;
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

export function MrrMovements({ data, height = 220 }: { data: { month: string; new: number; expansion: number; reactivation?: number; contraction: number; churn: number }[]; height?: number }) {
  const t = useChartTheme();
  // Fixed slot order: new, churn, expansion, contraction
  const colors = { new: t.series[0], churn: t.series[1], expansion: t.series[2], contraction: t.series[3] };
  const rows = data.map((d) => ({ ...d, expansion: d.expansion + (d.reactivation ?? 0) }));
  const total = (k: "new" | "expansion" | "contraction" | "churn") => rows.reduce((acc, r) => acc + (r[k] ?? 0), 0);
  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: "Nouveau", color: colors.new, value: moneyShort(total("new")) },
            { label: "Expansion", color: colors.expansion, value: moneyShort(total("expansion")) },
            { label: "Contraction", color: colors.contraction, value: moneyShort(total("contraction")) },
            { label: "Churn", color: colors.churn, value: moneyShort(total("churn")) },
          ]}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ ...axisTick, fill: t.axis }} tickFormatter={monthLabel} dy={6} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ ...axisTick, fill: t.axis }} tickFormatter={(v) => moneyShort(v)} />
          <ReferenceLine y={0} stroke={t.axis} strokeOpacity={0.4} />
          <Tooltip cursor={{ fill: t.cursor, opacity: 0.35 }} content={<GlassTooltip labels={{ new: "Nouveau", churn: "Churn", expansion: "Expansion", contraction: "Contraction" }} />} labelFormatter={(l) => monthLabel(String(l))} />
          <Bar dataKey="new" stackId="m" fill={colors.new} maxBarSize={24} stroke={t.surface} strokeWidth={1} />
          <Bar dataKey="expansion" stackId="m" fill={colors.expansion} maxBarSize={24} radius={[4, 4, 0, 0]} stroke={t.surface} strokeWidth={1} />
          <Bar dataKey="churn" stackId="m" fill={colors.churn} maxBarSize={24} stroke={t.surface} strokeWidth={1} />
          <Bar dataKey="contraction" stackId="m" fill={colors.contraction} maxBarSize={24} radius={[0, 0, 4, 4]} stroke={t.surface} strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Single-series vertical bars                                                */
/* -------------------------------------------------------------------------- */

export function ColumnChart({ data, xKey, yKey, height = 220, format = (v: number) => money(v), highlight, colorKey }: { data: Record<string, unknown>[]; xKey: string; yKey: string; height?: number; format?: (v: number) => string; highlight?: (row: Record<string, unknown>) => boolean; colorKey?: string }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ ...axisTick, fill: t.axis }} interval={0} dy={6} />
        <YAxis tickLine={false} axisLine={false} width={52} tick={{ ...axisTick, fill: t.axis }} tickFormatter={(v) => (format === money ? moneyShort(v) : number(v))} />
        <Tooltip cursor={{ fill: t.cursor, opacity: 0.35 }} content={<GlassTooltip format={format} labels={{ [yKey]: "Valeur" }} />} />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]} maxBarSize={24}>
          {data.map((row, i) => (
            <Cell key={i} fill={colorKey && row[colorKey] ? String(row[colorKey]) : highlight && !highlight(row) ? t.muted : t.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Ranked horizontal bars (HTML) — part of whole without a pie                */
/* -------------------------------------------------------------------------- */

export function BarList({ items, format = (v: number) => number(v), max, className, onClick }: { items: { label: string; value: number; sub?: string; id?: number | string }[]; format?: (v: number) => string; max?: number; className?: string; onClick?: (item: { id?: number | string }) => void }) {
  const t = useChartTheme();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={cn("space-y-2.5", className)}>
      {items.map((it, i) => (
        <button type="button" key={`${it.label}-${i}`} disabled={!onClick} onClick={() => onClick?.(it)} className="group block w-full text-left disabled:cursor-default">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-fg group-hover:text-accent">{it.label}</span>
            <span className="shrink-0 font-semibold tabular">{format(it.value)}</span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.07]">
            <motion.div initial={{ width: 0 }} whileInView={{ width: `${(it.value / top) * 100}%` }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 90, damping: 18, delay: i * 0.04 }} className="h-full rounded-full" style={{ background: t.accent }} />
          </div>
          {it.sub && <div className="mt-0.5 text-[11.5px] text-fg-3">{it.sub}</div>}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline + stat tile                                                      */
/* -------------------------------------------------------------------------- */

export function Sparkline({ values, height = 36, width = 120 }: { values: number[]; height?: number; width?: number | `${number}%` }) {
  const t = useChartTheme();
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line type="monotone" dataKey="v" stroke={t.muted} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="v"
          stroke="transparent"
          dot={(props: { cx?: number; cy?: number; index?: number }) =>
            props.index === data.length - 1 ? <circle key="end" cx={props.cx} cy={props.cy} r={3.5} fill={t.accent} stroke={t.surface} strokeWidth={2} /> : <g key={props.index} />
          }
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

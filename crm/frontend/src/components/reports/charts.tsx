import { motion } from "motion/react";
import { Tooltip as RTooltip } from "radix-ui";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassTooltip, Legend } from "@/components/charts/Charts";
import { axisTick, useChartTheme } from "@/components/charts/theme";
import { number, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Hover card with the same glass look as the charts' tooltips (for HTML charts). */
function GlassHover({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={80}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side="top" sideOffset={8} className="glass glass-strong z-[70] min-w-[170px] rounded-[14px] px-3 py-2.5 text-[12px] shadow-[var(--glass-shadow-lg)]">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

function HoverRows({ title, rows }: { title: string; rows: { label: string; color: string; value: string }[] }) {
  return (
    <div>
      <div className="mb-1.5 font-semibold text-fg">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="font-semibold tabular text-fg">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Single series columns (period highlighted)                                 */
/* -------------------------------------------------------------------------- */

export function SeriesColumns({ data, valueLabel, format, axisFormat, height = 240 }: { data: { label: string; value: number; active?: boolean }[]; valueLabel: string; format: (v: number) => string; axisFormat?: (v: number) => string; height?: number }) {
  const t = useChartTheme();
  const partial = data.some((d) => d.active === false);
  return (
    <div>
      {partial && (
        <div className="mb-3">
          <Legend
            items={[
              { label: "Période sélectionnée", color: t.accent },
              { label: "Hors période", color: t.muted },
            ]}
          />
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...axisTick, fill: t.axis }} dy={6} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tickLine={false} axisLine={false} width={54} tick={{ ...axisTick, fill: t.axis }} tickFormatter={axisFormat ?? format} allowDecimals={false} />
          <Tooltip cursor={{ fill: t.cursor, opacity: 0.35 }} content={<GlassTooltip format={format} labels={{ value: valueLabel }} />} />
          <Bar dataKey="value" name={valueLabel} fill={t.accent} radius={[4, 4, 0, 0]} maxBarSize={24}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.active === false ? t.muted : t.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Grouped or stacked columns (2+ series, one axis, legend)                   */
/* -------------------------------------------------------------------------- */

export function MultiColumns({ data, series, format = (v: number) => number(v), axisFormat, stacked, height = 240 }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; format?: (v: number) => string; axisFormat?: (v: number) => string; stacked?: boolean; height?: number }) {
  const t = useChartTheme();
  const labels = Object.fromEntries(series.map((s) => [s.key, s.label]));
  return (
    <div>
      <div className="mb-3">
        <Legend items={series.map((s, i) => ({ label: s.label, color: t.series[i] }))} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={stacked ? "26%" : "22%"} barGap={3}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...axisTick, fill: t.axis }} dy={6} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ ...axisTick, fill: t.axis }} tickFormatter={axisFormat ?? format} allowDecimals={false} />
          <Tooltip cursor={{ fill: t.cursor, opacity: 0.35 }} content={<GlassTooltip format={format} labels={labels} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "stack" : undefined}
              fill={t.series[i]}
              maxBarSize={stacked ? 24 : 14}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : undefined}
              stroke={stacked ? t.surface : undefined}
              strokeWidth={stacked ? 1 : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Horizontal stacked bars (HTML) — composition per row                       */
/* -------------------------------------------------------------------------- */

export function StackedBars({ rows, series, format = (v: number) => number(v) }: { rows: { label: string; sub?: string; values: Record<string, number> }[]; series: { key: string; label: string; color?: string }[]; format?: (v: number) => string }) {
  const t = useChartTheme();
  const colors = series.map((s, i) => s.color ?? t.series[i]);
  const totals = rows.map((r) => series.reduce((acc, s) => acc + (r.values[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className="mb-3.5">
        <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i] }))} />
      </div>
      <div className="space-y-3">
        {rows.map((r, ri) => (
          <div key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-fg">{r.label}</span>
              <span className="shrink-0 font-semibold tabular">{format(totals[ri])}</span>
            </div>
            <GlassHover content={<HoverRows title={r.label} rows={series.map((s, i) => ({ label: s.label, color: colors[i], value: format(r.values[s.key] ?? 0) }))} />}>
              <div className="h-[9px] cursor-default overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
                <motion.div className="flex h-full overflow-hidden rounded-full" initial={{ width: 0 }} whileInView={{ width: `${(totals[ri] / max) * 100}%` }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 90, damping: 18, delay: ri * 0.04 }}>
                  {series.map((s, i) => {
                    const v = r.values[s.key] ?? 0;
                    if (!v || !totals[ri]) return null;
                    return <span key={s.key} className="h-full" style={{ width: `${(v / totals[ri]) * 100}%`, background: colors[i], boxShadow: i ? `inset 1.5px 0 0 ${t.surface}` : undefined }} />;
                  })}
                </motion.div>
              </div>
            </GlassHover>
            {r.sub && <div className="mt-0.5 text-[11.5px] text-fg-3">{r.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conversion funnel                                                          */
/* -------------------------------------------------------------------------- */

export function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const t = useChartTheme();
  const top = Math.max(1, steps[0]?.count ?? 1);
  const last = steps[steps.length - 1];
  return (
    <div>
      <div className="space-y-2.5">
        {steps.map((s, i) => {
          const prev = steps[i - 1]?.count;
          const conv = i > 0 && prev ? (s.count / prev) * 100 : null;
          return (
            <div key={s.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{s.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {conv !== null && <span className="text-[11.5px] text-fg-3 tabular">{percent(conv, 0)} de l'étape préc.</span>}
                  <span className="font-semibold tabular">{number(s.count)}</span>
                </span>
              </div>
              <div className="flex h-[20px] justify-center rounded-[7px] bg-black/[0.035] dark:bg-white/[0.05]">
                <motion.div className="h-full rounded-[7px]" style={{ background: t.accent }} initial={{ width: 0 }} whileInView={{ width: `${Math.max(1.5, (s.count / top) * 100)}%` }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 80, damping: 18, delay: i * 0.05 }} />
              </div>
            </div>
          );
        })}
      </div>
      {steps.length > 1 && (
        <p className="mt-4 rounded-[12px] bg-black/[0.03] px-3 py-2 text-[12.5px] text-fg-2 dark:bg-white/[0.04]">
          Conversion globale {steps[0].label.toLowerCase()} → {last.label.toLowerCase()} : <span className="font-semibold text-fg tabular">{percent((last.count / top) * 100, 1)}</span>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status meter (states only: ok / warning / critical)                         */
/* -------------------------------------------------------------------------- */

const TONES = { ok: "#10b981", warn: "#f59e0b", bad: "#ef4444", neutral: "#a1a1aa" } as const;

export function StatusMeter({ segments }: { segments: { label: string; value: number; tone: keyof typeof TONES }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
        {segments.map((s, i) =>
          s.value ? (
            <motion.span key={s.label} className="h-full" style={{ background: TONES[s.tone], boxShadow: i ? "inset 1.5px 0 0 var(--glass-solid)" : undefined }} initial={{ width: 0 }} animate={{ width: `${(s.value / Math.max(1, total)) * 100}%` }} transition={{ type: "spring", stiffness: 90, damping: 20, delay: i * 0.06 }} />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {segments.map((s) => (
          <div key={s.label} className="rounded-[12px] bg-black/[0.03] px-2.5 py-2 dark:bg-white/[0.04]">
            <div className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
              <span className={cn("size-2 rounded-full")} style={{ background: TONES[s.tone] }} />
              {s.label}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold tabular">
              {number(s.value)} <span className="text-[11.5px] font-normal text-fg-3">{total ? percent((s.value / total) * 100, 0) : "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

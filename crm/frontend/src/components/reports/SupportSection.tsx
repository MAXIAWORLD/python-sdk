import { Clock3, Headset, LifeBuoy, MessagesSquare, ShieldCheck, Smile, Timer } from "lucide-react";
import { useMemo } from "react";
import { BarList } from "@/components/charts/Charts";
import { Panel, StatTile } from "@/components/data/blocks";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { labelOf, TICKET_CHANNELS, TICKET_PRIORITY } from "@/lib/constants";
import { number, percent } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { SeriesColumns, StatusMeter } from "./charts";
import { bucketize, hours, usePeriodRows, type Period, type ReportsData } from "./data";
import { ReportPanel, ReportTable, TruncatedNote, type TableColumn } from "./kit";

/** First-response SLA by priority (see backend SLA_HOURS). */
const SLA_HOURS: Record<string, number> = { urgent: 4, high: 8, normal: 24, low: 72 };

type SlaState = "met" | "breached" | "running";

function slaState(t: Ticket, now: number): SlaState | null {
  if (!t.sla_due_at) return null;
  const due = new Date(t.sla_due_at).getTime();
  if (t.first_response_at) return new Date(t.first_response_at).getTime() <= due ? "met" : "breached";
  return now > due ? "breached" : "running";
}

const GRANULARITY = { day: "par jour", week: "par semaine", month: "par mois" };

export function SupportSection({ period, report }: { period: Period; report?: ReportsData }) {
  const tickets = usePeriodRows<Ticket>("tickets", period, { clientField: "created_at", params: { expand: 0 } });

  const stats = useMemo(() => {
    const now = Date.now();
    const sla = { met: 0, breached: 0, running: 0 };
    const byPriority = new Map<string, { count: number; met: number; breached: number }>();
    const byChannel = new Map<string, number>();
    for (const t of tickets.items) {
      const s = slaState(t, now);
      if (s) sla[s] += 1;
      const p = byPriority.get(t.priority) ?? { count: 0, met: 0, breached: 0 };
      byPriority.set(t.priority, { count: p.count + 1, met: p.met + (s === "met" ? 1 : 0), breached: p.breached + (s === "breached" ? 1 : 0) });
      byChannel.set(t.channel, (byChannel.get(t.channel) ?? 0) + 1);
    }
    const decided = sla.met + sla.breached;
    return {
      sla,
      compliance: decided ? (sla.met / decided) * 100 : null,
      priorities: TICKET_PRIORITY.map((o) => ({ value: o.value, label: o.label, target: SLA_HOURS[o.value], ...(byPriority.get(o.value) ?? { count: 0, met: 0, breached: 0 }) })).filter((p) => p.count > 0),
      channels: Array.from(byChannel, ([channel, count]) => ({ label: labelOf(TICKET_CHANNELS, channel), count })).sort((a, b) => b.count - a.count),
      volume: bucketize(period, tickets.items, (t) => t.created_at),
      open: tickets.items.filter((t) => !["resolved", "closed"].includes(t.status)).length,
    };
  }, [tickets.items, period]);

  const s = report?.support;
  const priorityCols: TableColumn<(typeof stats.priorities)[number]>[] = [
    { key: "p", header: "Priorité", cell: (r) => r.label, csv: (r) => r.label },
    { key: "t", header: "SLA 1re réponse", align: "right", cell: (r) => `${r.target} h`, csv: (r) => r.target },
    { key: "c", header: "Tickets", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "m", header: "Respectés", align: "right", cell: (r) => (r.met + r.breached ? percent((r.met / (r.met + r.breached)) * 100, 0) : "—"), csv: (r) => (r.met + r.breached ? (r.met / (r.met + r.breached)) * 100 : null) },
  ];
  const slaCols: TableColumn<(typeof stats.priorities)[number]>[] = [
    { key: "p", header: "Priorité", cell: (r) => r.label, csv: (r) => r.label },
    { key: "t", header: "Objectif", align: "right", cell: (r) => `${r.target} h`, csv: (r) => r.target },
    { key: "m", header: "Respect", align: "right", cell: (r) => (r.met + r.breached ? `${percent((r.met / (r.met + r.breached)) * 100, 0)} · ${r.met}/${r.met + r.breached}` : "—"), csv: (r) => (r.met + r.breached ? (r.met / (r.met + r.breached)) * 100 : null) },
  ];
  const volumeCols: TableColumn<(typeof stats.volume)[number]>[] = [
    { key: "p", header: "Période", cell: (r) => <span className="capitalize">{r.label}</span>, csv: (r) => r.key },
    { key: "v", header: "Tickets créés", align: "right", cell: (r) => number(r.value), csv: (r) => r.value },
  ];
  const channelCols: TableColumn<(typeof stats.channels)[number]>[] = [
    { key: "c", header: "Canal", cell: (r) => r.label, csv: (r) => r.label },
    { key: "n", header: "Tickets", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Tickets créés" value={tickets.items.length} format={(v) => number(v)} hint={`${number(stats.open)} encore ouvert${stats.open > 1 ? "s" : ""}`} icon={<LifeBuoy className="size-4" />} />
        <StatTile label="Respect du SLA" value={stats.compliance ?? 0} format={(v) => (stats.compliance === null ? "—" : percent(v, 0))} hint={`${number(stats.sla.breached)} hors délai`} icon={<ShieldCheck className="size-4" />} accent="linear-gradient(135deg,#10b981,#22d3ee)" />
        <StatTile label="1re réponse moyenne" value={s?.avg_first_response_h ?? 0} format={(v) => ((s?.avg_first_response_h ?? null) === null ? "—" : hours(v))} hint="délai moyen" icon={<Clock3 className="size-4" />} accent="linear-gradient(135deg,#0ea5e9,#5b6cff)" />
        <StatTile label="Résolution moyenne" value={s?.avg_resolution_h ?? 0} format={(v) => ((s?.avg_resolution_h ?? null) === null ? "—" : hours(v))} hint="de l'ouverture à la résolution" icon={<Timer className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
        <StatTile label="Satisfaction" value={s?.csat ?? 0} format={(v) => ((s?.csat ?? null) === null ? "—" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5`)} hint="note moyenne des clients" icon={<Smile className="size-4" />} accent="linear-gradient(135deg,#f59e0b,#f97316)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ReportPanel
          className="xl:col-span-2"
          title="Volume de tickets"
          description={`Tickets créés ${GRANULARITY[period.granularity]}`}
          icon={<Headset className="size-4" />}
          loading={tickets.loading}
          empty={!tickets.items.length}
          emptyText="Aucun ticket sur la période."
          chart={
            <>
              <SeriesColumns data={stats.volume.map((b) => ({ label: b.label, value: b.value }))} valueLabel="Tickets" format={(v) => number(v)} />
              <TruncatedNote show={tickets.truncated} />
            </>
          }
          table={{ columns: volumeCols, rows: stats.volume }}
          csvName="volume-tickets"
        />
        <Panel title="Respect des SLA" description="Délai de 1re réponse selon la priorité" icon={<ShieldCheck className="size-4" />}>
          {tickets.loading ? (
            <Skeleton className="h-48" />
          ) : !tickets.items.length ? (
            <EmptyState title="Aucun ticket sur la période." className="py-10" />
          ) : (
            <div className="space-y-4">
              <StatusMeter
                segments={[
                  { label: "Respectés", value: stats.sla.met, tone: "ok" },
                  { label: "En cours", value: stats.sla.running, tone: "warn" },
                  { label: "Dépassés", value: stats.sla.breached, tone: "bad" },
                ]}
              />
              <ReportTable columns={slaCols} rows={stats.priorities} maxHeight={220} />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportPanel
          title="Par priorité"
          icon={<ShieldCheck className="size-4" />}
          loading={tickets.loading}
          empty={!stats.priorities.length}
          chart={<BarList items={stats.priorities.map((p) => ({ label: p.label, value: p.count, sub: `SLA ${p.target} h · ${p.breached} hors délai` }))} />}
          table={{ columns: priorityCols, rows: stats.priorities }}
          csvName="tickets-par-priorite"
        />
        <ReportPanel title="Par canal" icon={<MessagesSquare className="size-4" />} loading={tickets.loading} empty={!stats.channels.length} chart={<BarList items={stats.channels.map((c) => ({ label: c.label, value: c.count, sub: percent((c.count / Math.max(1, tickets.items.length)) * 100, 0) }))} />} table={{ columns: channelCols, rows: stats.channels }} csvName="tickets-par-canal" />
      </div>
    </div>
  );
}

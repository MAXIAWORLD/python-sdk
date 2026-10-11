import { BadgeEuro, Clock, FolderKanban, Gauge, Timer, Users } from "lucide-react";
import { useMemo } from "react";
import { BarList } from "@/components/charts/Charts";
import { useChartTheme } from "@/components/charts/theme";
import { StatTile } from "@/components/data/blocks";
import { money, moneyShort, number, percent } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { StackedBars } from "./charts";
import { pct, usePeriodRows, type Period, type ReportsData } from "./data";
import { ReportPanel, TruncatedNote, type TableColumn } from "./kit";

const h = (v: number) => `${number(v, v < 10 && v % 1 ? 1 : 0)} h`;

type MemberRow = { label: string; billable: number; other: number; total: number; value: number };
type ProjectRow = { label: string; hours: number; billable: number; value: number };

export function TimeSection({ period, report, prev }: { period: Period; report?: ReportsData; prev?: ReportsData }) {
  const t = useChartTheme();
  const entries = usePeriodRows<TimeEntry>("time-entries", period, { serverField: "date" });
  const time = report?.time;

  const data = useMemo(() => {
    const members = new Map<string, MemberRow>();
    const projects = new Map<string, ProjectRow>();
    for (const e of entries.items) {
      const hrs = e.minutes / 60;
      const value = e.billable ? hrs * (e.hourly_rate ?? 0) : 0;
      const name = e.user?.name ?? "Membre inconnu";
      const m = members.get(name) ?? { label: name, billable: 0, other: 0, total: 0, value: 0 };
      members.set(name, { ...m, billable: m.billable + (e.billable ? hrs : 0), other: m.other + (e.billable ? 0 : hrs), total: m.total + hrs, value: m.value + value });
      const pname = e.project?.name ?? "Sans projet";
      const p = projects.get(pname) ?? { label: pname, hours: 0, billable: 0, value: 0 };
      projects.set(pname, { ...p, hours: p.hours + hrs, billable: p.billable + (e.billable ? hrs : 0), value: p.value + value });
    }
    return { members: Array.from(members.values()).sort((a, b) => b.total - a.total), projects: Array.from(projects.values()).sort((a, b) => b.hours - a.hours) };
  }, [entries.items]);

  const ratio = time?.billable_ratio ?? null;
  const prevRatio = prev?.time.billable_ratio ?? null;
  const ratioDelta = ratio !== null && prevRatio !== null ? Math.round((ratio - prevRatio) * 10) / 10 : null;

  const memberCols: TableColumn<MemberRow>[] = [
    { key: "m", header: "Membre", cell: (r) => <span className="font-medium">{r.label}</span>, csv: (r) => r.label },
    { key: "b", header: "Facturables", align: "right", cell: (r) => h(r.billable), csv: (r) => r.billable },
    { key: "o", header: "Non facturables", align: "right", hideOnMobile: true, cell: (r) => h(r.other), csv: (r) => r.other },
    { key: "r", header: "Taux", align: "right", cell: (r) => percent(r.total ? (r.billable / r.total) * 100 : 0, 0), csv: (r) => (r.total ? (r.billable / r.total) * 100 : 0) },
    { key: "v", header: "Valeur", align: "right", hideOnMobile: true, cell: (r) => money(r.value, "EUR", { decimals: 0 }), csv: (r) => r.value },
  ];
  const projectCols: TableColumn<ProjectRow>[] = [
    { key: "p", header: "Projet", cell: (r) => r.label, csv: (r) => r.label },
    { key: "h", header: "Heures", align: "right", cell: (r) => h(r.hours), csv: (r) => r.hours },
    { key: "b", header: "Facturables", align: "right", hideOnMobile: true, cell: (r) => h(r.billable), csv: (r) => r.billable },
    { key: "v", header: "Valeur facturable", align: "right", cell: (r) => money(r.value, "EUR", { decimals: 0 }), csv: (r) => r.value },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Heures saisies" value={time?.total_hours ?? 0} format={(v) => h(v)} delta={time && prev ? (pct(time.total_hours, prev.time.total_hours) ?? undefined) : undefined} period="vs période préc." icon={<Clock className="size-4" />} />
        <StatTile label="Heures facturables" value={time?.billable_hours ?? 0} format={(v) => h(v)} hint={`${h((time?.total_hours ?? 0) - (time?.billable_hours ?? 0))} non facturables`} icon={<Timer className="size-4" />} accent="linear-gradient(135deg,#10b981,#22d3ee)" />
        <StatTile
          label="Taux facturable"
          value={ratio ?? 0}
          format={(v) => (ratio === null ? "—" : percent(v, 1))}
          hint={ratioDelta === null ? "objectif courant : 75 % et plus" : `${ratioDelta >= 0 ? "+" : ""}${number(ratioDelta, 1)} pt vs période préc.`}
          icon={<Gauge className="size-4" />}
          accent="linear-gradient(135deg,#5b6cff,#22d3ee)"
        />
        <StatTile label="Valeur facturable" value={time?.billable_value ?? 0} format={(v) => moneyShort(v)} delta={time && prev ? (pct(time.billable_value, prev.time.billable_value) ?? undefined) : undefined} period="vs période préc." icon={<BadgeEuro className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportPanel
          title="Heures par projet"
          description="Temps saisi sur la période"
          icon={<FolderKanban className="size-4" />}
          loading={entries.loading}
          empty={!data.projects.length}
          emptyText="Aucun temps saisi sur la période."
          chart={
            <>
              <BarList items={data.projects.slice(0, 10).map((p) => ({ label: p.label, value: p.hours, sub: `${percent(p.hours ? (p.billable / p.hours) * 100 : 0, 0)} facturable · ${moneyShort(p.value)}` }))} format={(v) => h(v)} />
              <TruncatedNote show={entries.truncated} />
            </>
          }
          table={{ columns: projectCols, rows: data.projects }}
          csvName="heures-par-projet"
        />
        <ReportPanel
          title="Heures par membre"
          description="Facturables et non facturables"
          icon={<Users className="size-4" />}
          loading={entries.loading}
          empty={!data.members.length}
          emptyText="Aucun temps saisi sur la période."
          chart={
            <StackedBars
              rows={data.members.map((m) => ({ label: m.label, values: { billable: m.billable, other: m.other }, sub: `${percent(m.total ? (m.billable / m.total) * 100 : 0, 0)} facturable · ${moneyShort(m.value)}` }))}
              series={[
                { key: "billable", label: "Facturables", color: t.accent },
                { key: "other", label: "Non facturables", color: t.muted },
              ]}
              format={(v) => h(v)}
            />
          }
          table={{ columns: memberCols, rows: data.members }}
          csvName="heures-par-membre"
        />
      </div>
    </div>
  );
}

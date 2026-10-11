import { CalendarDays, Mail, NotebookPen, Phone, Users, Video } from "lucide-react";
import { useMemo } from "react";
import { BarList } from "@/components/charts/Charts";
import { StatTile } from "@/components/data/blocks";
import { duration, number, percent } from "@/lib/format";
import { useList } from "@/lib/hooks";
import type { Activity, User } from "@/lib/types";
import { MultiColumns, StackedBars } from "./charts";
import { bucketize, usePeriodRows, type Period } from "./data";
import { ReportPanel, TruncatedNote, type TableColumn } from "./kit";

const TYPES = [
  { key: "call", label: "Appels" },
  { key: "email", label: "Emails" },
  { key: "meeting", label: "Réunions" },
  { key: "note", label: "Notes" },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];
type MemberRow = { id: number | null; label: string; values: Record<TypeKey, number>; total: number; minutes: number };

const GRANULARITY = { day: "par jour", week: "par semaine", month: "par mois" };

export function ActivitySection({ period }: { period: Period }) {
  const acts = usePeriodRows<Activity>("activities", period, { clientField: "occurred_at", params: { expand: 0, type__in: TYPES.map((t) => t.key).join(",") } });
  const users = useList<User>("users", { limit: 200, expand: 0 });

  const data = useMemo(() => {
    const byType = Object.fromEntries(TYPES.map((t) => [t.key, 0])) as Record<TypeKey, number>;
    const members = new Map<number | null, MemberRow>();
    let callMinutes = 0;
    let meetingMinutes = 0;
    let emailsOut = 0;
    for (const a of acts.items) {
      const type = a.type as TypeKey;
      if (!(type in byType)) continue;
      byType[type] += 1;
      if (type === "call") callMinutes += a.duration_minutes ?? 0;
      if (type === "meeting") meetingMinutes += a.duration_minutes ?? 0;
      if (type === "email" && a.direction === "out") emailsOut += 1;
      const uid = a.user_id ?? null;
      const row = members.get(uid) ?? { id: uid, label: users.data?.items.find((u) => u.id === uid)?.name ?? (uid ? `Membre #${uid}` : "Système / non attribué"), values: { call: 0, email: 0, meeting: 0, note: 0 }, total: 0, minutes: 0 };
      row.values[type] += 1;
      row.total += 1;
      row.minutes += a.duration_minutes ?? 0;
      members.set(uid, row);
    }
    const timeline = TYPES.map((t) => bucketize(period, acts.items.filter((a) => a.type === t.key), (a) => a.occurred_at));
    const series = (timeline[0] ?? []).map((b, i) => ({ label: b.label, ...Object.fromEntries(TYPES.map((t, ti) => [t.key, timeline[ti][i]?.value ?? 0])) }));
    return { byType, members: Array.from(members.values()).sort((a, b) => b.total - a.total), total: acts.items.length, callMinutes, meetingMinutes, emailsOut, series };
  }, [acts.items, users.data, period]);

  const memberCols: TableColumn<MemberRow>[] = [
    { key: "m", header: "Membre", cell: (r) => <span className="font-medium">{r.label}</span>, csv: (r) => r.label },
    ...TYPES.map((t) => ({ key: t.key, header: t.label, align: "right" as const, cell: (r: MemberRow) => number(r.values[t.key]), csv: (r: MemberRow) => r.values[t.key] })),
    { key: "t", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{number(r.total)}</span>, csv: (r) => r.total },
    { key: "d", header: "Temps d'échange", align: "right", hideOnMobile: true, cell: (r) => (r.minutes ? duration(r.minutes) : "—"), csv: (r) => r.minutes },
  ];
  const typeRows = TYPES.map((t) => ({ label: t.label, value: data.byType[t.key] }));
  const typeCols: TableColumn<(typeof typeRows)[number]>[] = [
    { key: "l", header: "Type", cell: (r) => r.label, csv: (r) => r.label },
    { key: "v", header: "Nombre", align: "right", cell: (r) => number(r.value), csv: (r) => r.value },
    { key: "p", header: "Part", align: "right", cell: (r) => percent(data.total ? (r.value / data.total) * 100 : 0, 1), csv: (r) => (data.total ? (r.value / data.total) * 100 : 0) },
  ];
  const seriesCols: TableColumn<(typeof data.series)[number]>[] = [
    { key: "p", header: "Période", cell: (r) => <span className="capitalize">{r.label}</span>, csv: (r) => r.label },
    ...TYPES.map((t) => ({ key: t.key, header: t.label, align: "right" as const, cell: (r: (typeof data.series)[number]) => number(Number(r[t.key as keyof typeof r] ?? 0)), csv: (r: (typeof data.series)[number]) => Number(r[t.key as keyof typeof r] ?? 0) })),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Appels" value={data.byType.call} format={(v) => number(v)} hint={data.callMinutes ? `${duration(data.callMinutes)} au téléphone` : "sur la période"} icon={<Phone className="size-4" />} accent="linear-gradient(135deg,#10b981,#22d3ee)" />
        <StatTile label="Emails" value={data.byType.email} format={(v) => number(v)} hint={`${number(data.emailsOut)} envoyé${data.emailsOut > 1 ? "s" : ""} · ${number(data.byType.email - data.emailsOut)} reçu${data.byType.email - data.emailsOut > 1 ? "s" : ""}`} icon={<Mail className="size-4" />} accent="linear-gradient(135deg,#0ea5e9,#5b6cff)" />
        <StatTile label="Réunions" value={data.byType.meeting} format={(v) => number(v)} hint={data.meetingMinutes ? `${duration(data.meetingMinutes)} en rendez-vous` : "sur la période"} icon={<Video className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
        <StatTile label="Notes" value={data.byType.note} format={(v) => number(v)} hint={`${number(data.total)} activités au total`} icon={<NotebookPen className="size-4" />} accent="linear-gradient(135deg,#f59e0b,#f97316)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ReportPanel
          className="xl:col-span-2"
          title="Activité par membre"
          description="Appels, emails, réunions et notes journalisés"
          icon={<Users className="size-4" />}
          loading={acts.loading}
          empty={!data.members.length}
          chart={
            <>
              <StackedBars rows={data.members.map((m) => ({ label: m.label, values: m.values, sub: m.minutes ? `${duration(m.minutes)} d'échanges` : undefined }))} series={TYPES.map((t) => ({ key: t.key, label: t.label }))} />
              <TruncatedNote show={acts.truncated} />
            </>
          }
          table={{ columns: memberCols, rows: data.members }}
          csvName="activite-par-membre"
        />
        <ReportPanel title="Répartition par type" description={`${number(data.total)} activités`} icon={<CalendarDays className="size-4" />} loading={acts.loading} empty={!data.total} chart={<BarList items={typeRows.map((r) => ({ label: r.label, value: r.value, sub: percent(data.total ? (r.value / data.total) * 100 : 0, 0) }))} />} table={{ columns: typeCols, rows: typeRows }} csvName="activite-par-type" />
      </div>

      <ReportPanel
        title="Évolution de l'activité"
        description={`Volume ${GRANULARITY[period.granularity]}`}
        icon={<CalendarDays className="size-4" />}
        loading={acts.loading}
        empty={!data.total}
        chart={<MultiColumns data={data.series} series={TYPES.map((t) => ({ key: t.key, label: t.label }))} stacked height={250} />}
        table={{ columns: seriesCols, rows: data.series }}
        csvName="evolution-activite"
      />
    </div>
  );
}

import { AlarmClock, Hourglass, LifeBuoy, MessageSquareReply, Smile } from "lucide-react";
import { useMemo, useState } from "react";
import { StatTile } from "@/components/data/blocks";
import { number, percent, plural } from "@/lib/format";
import { useList } from "@/lib/hooks";
import type { Ticket } from "@/lib/types";
import { isBreached } from "./sla";
import { hoursLabel, ms } from "./time";

export const UNRESOLVED = "new,open,pending,on_hold";
const WEEK = 7 * 86_400_000;
const WINDOW_DAYS = 90;

export interface TicketStats {
  loading: boolean;
  unresolved: number;
  toHandle: number;
  breached: number;
  /** Ids of the tickets past their SLA (the API cannot filter on dates, see report). */
  breachedIds: number[];
  pending: number;
  firstResponseHours: number | null;
  firstResponseCount: number;
  csat: number | null;
  csatCount: number;
  csatHappy: number | null;
  createdPerWeek: number[];
  firstResponsePerWeek: number[];
}

const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

/** Support KPIs computed from the ticket API (counts are exact, averages cover the last 90 days). */
export function useTicketStats(now: number): TicketStats {
  const [since] = useState(() => Date.now() - WINDOW_DAYS * 86_400_000);
  const unresolved = useList<Ticket>("tickets", { status__in: UNRESOLVED, limit: 1, expand: 0 });
  const waiting = useList<Ticket>("tickets", { status__in: "new,open", limit: 1000, expand: 0, sort: "sla_due_at" });
  const pending = useList<Ticket>("tickets", { status: "pending", limit: 1, expand: 0 });
  // Date filters (created_at__gte) currently fail server-side: take the latest tickets and keep the window here.
  const recent = useList<Ticket>("tickets", { limit: 1000, expand: 0, sort: "-created_at" });

  const sample = useMemo(() => {
    const rows = recent.data?.items ?? [];
    const weeks = Math.ceil(WINDOW_DAYS / 7);
    const created = Array.from({ length: weeks }, () => 0);
    const responseBuckets: number[][] = Array.from({ length: weeks }, () => []);
    const firstResponse: number[] = [];
    const csat: number[] = [];
    for (const t of rows) {
      const start = ms(t.created_at);
      if (start < since) continue;
      const week = Math.min(weeks - 1, Math.max(0, Math.floor((start - since) / WEEK)));
      created[week] += 1;
      const fr = ms(t.first_response_at);
      if (!Number.isNaN(fr) && fr >= start) {
        const h = (fr - start) / 3_600_000;
        firstResponse.push(h);
        responseBuckets[week].push(h);
      }
      if (t.satisfaction) csat.push(t.satisfaction);
    }
    const perWeek = responseBuckets.map((b) => avg(b)).filter((v): v is number => v !== null);
    return {
      created,
      perWeek,
      firstResponse: avg(firstResponse),
      firstResponseCount: firstResponse.length,
      csat: avg(csat),
      csatCount: csat.length,
      csatHappy: csat.length ? (csat.filter((v) => v >= 4).length / csat.length) * 100 : null,
    };
  }, [recent.data, since]);

  const breachedIds = useMemo(() => (waiting.data?.items ?? []).filter((t) => isBreached(t, now)).map((t) => t.id), [waiting.data, now]);

  return {
    loading: unresolved.isLoading || waiting.isLoading || pending.isLoading || recent.isLoading,
    unresolved: unresolved.data?.total ?? 0,
    toHandle: waiting.data?.total ?? 0,
    breached: breachedIds.length,
    breachedIds,
    pending: pending.data?.total ?? 0,
    firstResponseHours: sample.firstResponse,
    firstResponseCount: sample.firstResponseCount,
    csat: sample.csat,
    csatCount: sample.csatCount,
    csatHappy: sample.csatHappy,
    createdPerWeek: sample.created,
    firstResponsePerWeek: sample.perWeek,
  };
}

/** The five KPI tiles at the top of the ticket queue. */
export function TicketStatTiles({ stats, onFilter }: { stats: TicketStats; onFilter: (filter: { status?: string; sla?: string }) => void }) {
  const fr = stats.firstResponseHours;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="Tickets ouverts"
        value={stats.unresolved}
        format={(v) => number(v)}
        icon={<LifeBuoy className="size-4" />}
        hint={`${number(stats.toHandle)} à traiter`}
        trend={stats.createdPerWeek.some((v) => v > 0) ? stats.createdPerWeek : undefined}
        accent="linear-gradient(135deg,#5b6cff,#22d3ee)"
        onClick={() => onFilter({ status: "unresolved" })}
      />
      <StatTile
        label="Hors SLA"
        value={stats.breached}
        format={(v) => number(v)}
        icon={<AlarmClock className="size-4" />}
        hint={stats.breached ? "Délai de réponse dépassé" : "Tous les délais sont tenus"}
        accent={stats.breached ? "linear-gradient(135deg,#ff9f0a,#ff375f)" : "linear-gradient(135deg,#1baf7a,#22d3ee)"}
        onClick={() => onFilter({ sla: "breached" })}
      />
      <StatTile
        label="En attente client"
        value={stats.pending}
        format={(v) => number(v)}
        icon={<Hourglass className="size-4" />}
        hint="Délai SLA suspendu"
        accent="linear-gradient(135deg,#fbbf24,#f472b6)"
        onClick={() => onFilter({ status: "pending" })}
      />
      <StatTile
        label="1re réponse (moyenne)"
        value={fr ?? 0}
        format={(v) => (fr === null ? "—" : hoursLabel(v))}
        icon={<MessageSquareReply className="size-4" />}
        hint={fr === null ? "Aucune réponse mesurée" : `sur ${plural(stats.firstResponseCount, "ticket")}`}
        trend={stats.firstResponsePerWeek.length > 2 ? stats.firstResponsePerWeek : undefined}
        accent="linear-gradient(135deg,#8b5cf6,#ec4899)"
      />
      <StatTile
        label="Satisfaction"
        value={stats.csat ?? 0}
        format={(v) => (stats.csat === null ? "—" : `${number(v, 1)} / 5`)}
        icon={<Smile className="size-4" />}
        hint={stats.csat === null ? "Aucune note recueillie" : `${plural(stats.csatCount, "avis", "avis")} · ${percent(stats.csatHappy, 0)} satisfaits`}
        accent="linear-gradient(135deg,#1baf7a,#34d399)"
      />
    </div>
  );
}

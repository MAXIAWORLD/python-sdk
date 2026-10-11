import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Users } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatedNumber } from "@/components/data/blocks";
import { Avatar, CompanyLogo, EmptyState, Progress, Skeleton, Spinner, StatusBadge } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { COMPANY_TYPES, LIFECYCLE } from "@/lib/constants";
import { number, percent } from "@/lib/format";
import { errorMessage, useDebounced, useList } from "@/lib/hooks";
import type { Company, Contact, SegmentRule } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SegmentEntity } from "./segment-fields";
import { Callout } from "./ui";

export interface SegmentPreview {
  count: number;
  sample: (Contact | Company)[];
}

export interface SegmentMembersResponse {
  count: number;
  items: (Contact | Company)[];
}

/** id → name of the team members (to display "Responsable = Hugo Bernard" in rule summaries). */
export function useUserNames() {
  const { data } = useList<{ id: number; name: string }>("users", { limit: 200, expand: 0 }, { staleTime: 5 * 60_000 });
  return useMemo(() => Object.fromEntries((data?.items ?? []).map((u) => [u.id, u.name])) as Record<number, string>, [data]);
}

/** POST /segments/preview — shared by the builder and the segment cards. */
export function previewSegment(entity: SegmentEntity, rules: { match: string; conditions: SegmentRule[] }) {
  return api.post<SegmentPreview>("/segments/preview", { entity, rules });
}

/* -------------------------------------------------------------------------- */
/* Member row                                                                 */
/* -------------------------------------------------------------------------- */

export function MemberRow({ entity, row, newTab }: { entity: SegmentEntity; row: Contact | Company; newTab?: boolean }) {
  const isContact = entity === "contacts";
  const contact = row as Contact;
  const company = row as Company;
  const to = isContact ? `/contacts/${row.id}` : `/companies/${row.id}`;
  const title = isContact ? contact.full_name : company.name;
  const meta = isContact ? [contact.job_title, contact.company?.name].filter(Boolean).join(" · ") || contact.email || "—" : [company.industry, company.city].filter(Boolean).join(" · ") || "—";
  return (
    <Link to={to} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined} className="group flex items-center gap-3 rounded-[12px] px-2 py-1.5 transition hover:bg-black/[0.035] dark:hover:bg-white/[0.05]">
      {isContact ? <Avatar name={title} src={contact.avatar_url} size={30} /> : <CompanyLogo name={title} size={30} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium group-hover:text-accent">{title}</div>
        <div className="truncate text-[11.5px] text-fg-3">{meta}</div>
      </div>
      {isContact ? <StatusBadge options={LIFECYCLE} value={contact.lifecycle} size="xs" /> : <StatusBadge options={COMPANY_TYPES} value={company.type} size="xs" />}
      {newTab && <ArrowUpRight className="size-3.5 shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100" />}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Live preview                                                               */
/* -------------------------------------------------------------------------- */

/** Animated count + sample of members for the rules being edited (debounced). */
export function SegmentLivePreview({ entity, rules, ignored, color }: { entity: SegmentEntity; rules: { match: string; conditions: SegmentRule[] }; ignored: number; color: string }) {
  const payload = useDebounced(JSON.stringify({ entity, rules }), 450);
  const { data, isFetching, error, isLoading } = useQuery({
    queryKey: ["segments", "preview", payload],
    queryFn: () => {
      const p = JSON.parse(payload) as { entity: SegmentEntity; rules: { match: string; conditions: SegmentRule[] } };
      return previewSegment(p.entity, p.rules);
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
  const base = useList(entity, { limit: 1, expand: 0 }).data?.total;
  const count = data?.count ?? 0;
  const share = base ? (count / base) * 100 : 0;
  const noun = entity === "contacts" ? (count > 1 ? "contacts correspondent" : "contact correspond") : count > 1 ? "entreprises correspondent" : "entreprise correspond";

  return (
    <div className="glass relative overflow-hidden rounded-[22px] p-5">
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-40 blur-3xl" style={{ background: color }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">Aperçu en direct</span>
        {isFetching ? <Spinner className="size-4 text-accent" /> : <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" title="À jour" />}
      </div>
      {error ? (
        <Callout tone="danger" className="mt-4" title="Aperçu indisponible">
          {errorMessage(error)}
        </Callout>
      ) : (
        <>
          <div className={cn("mt-3 text-[46px] font-semibold leading-none tracking-[-0.045em] tabular transition-opacity", isFetching && "opacity-60")}>{isLoading ? <Skeleton className="h-11 w-24" /> : <AnimatedNumber value={count} format={(v) => number(Math.round(v))} />}</div>
          <div className="mt-1.5 text-[13px] text-fg-2">{noun}</div>
          <div className="mt-4">
            <Progress value={share} tone={`linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 55%, var(--accent-2)))`} />
            <div className="mt-1.5 flex justify-between text-[11.5px] text-fg-3 tabular">
              <span>{percent(share, share < 10 && share > 0 ? 1 : 0)} de la base</span>
              <span>{base !== undefined ? `${number(base)} au total` : ""}</span>
            </div>
          </div>
          {ignored > 0 && (
            <div className="mt-3 rounded-[12px] bg-amber-400/12 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
              {ignored} condition{ignored > 1 ? "s" : ""} incomplète{ignored > 1 ? "s" : ""} ignorée{ignored > 1 ? "s" : ""}.
            </div>
          )}
        </>
      )}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.07em] text-fg-3">
          <span>Échantillon</span>
          {data && data.count > data.sample.length && <span className="normal-case tracking-normal">{data.sample.length} premiers</span>}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : data && data.sample.length === 0 ? (
          <p className="rounded-[12px] bg-black/[0.03] px-3 py-4 text-center text-[12.5px] text-fg-3 dark:bg-white/[0.04]">Aucun membre ne correspond à ces conditions.</p>
        ) : (
          <motion.div layout className="-mx-2 max-h-[340px] space-y-0.5 overflow-y-auto pb-3 [mask-image:linear-gradient(to_bottom,#000_85%,transparent)]">
            {data?.sample.slice(0, 12).map((row) => (
              <MemberRow key={row.id} entity={entity} row={row} newTab />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Saved segment members                                                      */
/* -------------------------------------------------------------------------- */

export function SegmentMembers({ segmentId, entity }: { segmentId: number; entity: SegmentEntity }) {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["segments", "members", segmentId], queryFn: () => api.get<SegmentMembersResponse>(`/segments/${segmentId}/members`) });
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !data) return data?.items ?? [];
    return data.items.filter((r) => {
      const c = r as Contact & Company;
      return [c.full_name, c.name, c.email, c.company?.name, c.job_title, c.city, c.industry].some((v) => v && String(v).toLowerCase().includes(term));
    });
  }, [data, q]);

  if (error) return <Callout tone="danger">{errorMessage(error)}</Callout>;
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[13px] text-fg-2">
          {data ? (
            <>
              <b className="font-semibold text-fg tabular">{number(data.count)}</b> {entity === "contacts" ? "contact" : "entreprise"}
              {data.count > 1 ? "s" : ""} dans ce segment
              {data.count > data.items.length && <span className="text-fg-3"> · {data.items.length} premiers affichés</span>}
            </>
          ) : (
            "Chargement…"
          )}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Filtrer les membres…" className="sm:w-[240px]" />
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={q ? "Aucun membre ne correspond" : "Segment vide"} description={q ? "Essayez un autre terme." : "Aucun enregistrement ne remplit ces conditions pour le moment."} />
      ) : (
        <div className="-mx-2 space-y-0.5">
          {rows.map((row) => (
            <MemberRow key={row.id} entity={entity} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

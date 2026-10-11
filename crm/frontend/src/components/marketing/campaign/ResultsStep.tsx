import { useQuery } from "@tanstack/react-query";
import { BarChart3, MailX, Send, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, KeyValue, Panel, StatTile } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Avatar, EmptyState, StatusBadge } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/fields";
import { Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { dateTime, number, percent } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { aggregateRecipients, campaignMetrics, humanizeVariables, isSent, RECIPIENT_STATUS, TRACKING_NOTE, type CampaignRecipient } from "../campaign-utils";

const HATCH = "bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_6px,transparent_6px_12px)]";

/** Sent → opened → clicked, each bar relative to the first step (single series: accent). */
function Funnel({ steps }: { steps: { label: string; value: number | null }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="space-y-4">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = s.value !== null && prev ? (s.value / prev) * 100 : null;
        const width = s.value === null ? 100 : Math.max(2, (s.value / top) * 100);
        const bar = (
          <div className="h-[22px] overflow-hidden rounded-[7px] bg-black/[0.05] dark:bg-white/[0.06]">
            {s.value === null ? (
              <div className={`h-full w-full opacity-60 ${HATCH}`} />
            ) : (
              <motion.div className="h-full rounded-[7px]" style={{ background: "linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 70%, var(--accent-2)))" }} initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ type: "spring", stiffness: 80, damping: 18, delay: i * 0.08 }} />
            )}
          </div>
        );
        return (
          <div key={s.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-medium">{s.label}</span>
              <span className="tabular">
                {s.value === null ? (
                  <span className="text-fg-3">Non mesuré</span>
                ) : (
                  <>
                    <b className="font-semibold">{number(s.value)}</b>
                    {conv !== null && <span className="ml-1.5 text-[12px] text-fg-3">{percent(conv, 1)} de l'étape précédente</span>}
                  </>
                )}
              </span>
            </div>
            {s.value === null ? <Tooltip content={TRACKING_NOTE}>{bar}</Tooltip> : bar}
          </div>
        );
      })}
    </div>
  );
}

export function ResultsStep({ campaign }: { campaign: Campaign }) {
  const sent = isSent(campaign);
  const { data, isLoading } = useQuery({ queryKey: ["campaigns", "recipients", campaign.id], queryFn: () => api.get<{ items: CampaignRecipient[] }>(`/campaigns/${campaign.id}/recipients`), enabled: sent });
  const rows = useMemo(() => data?.items ?? [], [data]);
  const agg = useMemo(() => aggregateRecipients(rows)[campaign.id], [rows, campaign.id]);
  const m = campaignMetrics(campaign, agg);
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (!status || r.status === status) && (!term || r.email.toLowerCase().includes(term) || (r.contact?.name ?? "").toLowerCase().includes(term)));
  }, [rows, status, q]);

  if (!sent)
    return (
      <Glass>
        <EmptyState icon={<BarChart3 className="size-6" />} title="Les résultats apparaîtront après l'envoi" description="Destinataires, échecs, désinscriptions et, si la mesure est activée, ouvertures et clics." />
      </Glass>
    );

  const columns: Column<CampaignRecipient>[] = [
    {
      key: "recipient",
      header: "Destinataire",
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.contact?.name ?? r.email} size={30} />
          <div className="min-w-0">
            {r.contact ? (
              <Link to={`/contacts/${r.contact.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:text-accent">
                {r.contact.name}
              </Link>
            ) : (
              <span className="block truncate font-medium">{r.email}</span>
            )}
            <span className="block truncate text-[12px] text-fg-3">{r.email}</span>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Statut", cell: (r) => <StatusBadge options={RECIPIENT_STATUS} value={r.status} size="xs" /> },
    { key: "sent", header: "Envoyé", hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-fg-2">{r.sent_at ? dateTime(r.sent_at) : "—"}</span> },
    { key: "opened", header: "Ouvert", hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-fg-2">{r.opened_at ? dateTime(r.opened_at) : "—"}</span> },
    { key: "error", header: "Détail", hideOnMobile: true, cell: (r) => (r.error ? <span className="line-clamp-1 max-w-[260px] text-[12px] text-red-500" title={r.error}>{r.error}</span> : <span className="text-fg-3">—</span>) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Envoyés" value={m.sent} format={(v) => number(Math.round(v))} hint={m.recipients ? `${percent(m.deliveryRate, 0)} des ${number(m.recipients)} destinataires` : undefined} icon={<Send className="size-4" />} />
        <StatTile label="Échecs d'envoi" value={m.failed} format={(v) => number(Math.round(v))} hint={m.failed ? "Adresses refusées par le serveur" : "Aucun échec"} icon={<TriangleAlert className="size-4" />} accent="linear-gradient(135deg,#ff9f0a,#ff375f)" />
        <StatTile label="Désinscriptions" value={m.unsubscribed} format={(v) => number(Math.round(v))} hint={m.unsubRate !== null ? `${percent(m.unsubRate, 1)} des envoyés` : "—"} icon={<MailX className="size-4" />} accent="linear-gradient(135deg,#f472b6,#8b5cf6)" />
        <StatTile label="Exclus (RGPD)" value={m.excluded} format={(v) => number(Math.round(v))} hint="Sans consentement ou opposés" icon={<ShieldCheck className="size-4" />} accent="linear-gradient(135deg,#22d3ee,#5b6cff)" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Entonnoir d'engagement" description={m.openRate === null ? "Ouvertures et clics non mesurés" : "Taux calculés sur les emails envoyés"}>
          <Funnel
            steps={[
              { label: "Destinataires", value: m.recipients },
              { label: "Envoyés", value: m.sent },
              { label: "Ouverts", value: m.opened },
              { label: "Cliqués", value: m.clicked },
            ]}
          />
          {m.openRate === null && <p className="mt-4 text-[12px] leading-relaxed text-fg-3">{TRACKING_NOTE}</p>}
        </Panel>
        <Panel title="Résumé de l'envoi" icon={<Users className="size-4" />} bodyClassName="px-5 pb-4 pt-1">
          <div className="divide-y divide-[var(--hairline)]">
            <KeyValue label="Envoyée le">{campaign.sent_at ? dateTime(campaign.sent_at) : "En cours"}</KeyValue>
            <KeyValue label="Segment">{campaign.segment?.name ?? "—"}</KeyValue>
            <KeyValue label="Objet">
              <span className="line-clamp-2">{humanizeVariables(campaign.subject) || "—"}</span>
            </KeyValue>
          </div>
          {rows.length > 0 && (
            <div className="mt-3 space-y-2.5 border-t border-[var(--hairline)] pt-4">
              {RECIPIENT_STATUS.filter((s) => counts[s.value]).map((s) => (
                <div key={s.value} className="flex items-center gap-3">
                  <span className="w-[92px] shrink-0">
                    <StatusBadge options={RECIPIENT_STATUS} value={s.value} size="xs" />
                  </span>
                  <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.07]">
                    <motion.div className="h-full rounded-full bg-[var(--accent)]" initial={{ width: 0 }} animate={{ width: `${(counts[s.value] / Math.max(1, rows.length)) * 100}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
                  </div>
                  <span className="w-10 text-right text-[13px] font-semibold tabular">{number(counts[s.value])}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {!isLoading && rows.length === 0 ? (
        <Glass>
          <EmptyState icon={<Users className="size-6" />} title="Aucun détail par destinataire" description="Seules les statistiques globales sont enregistrées pour cette campagne. Les prochains envois conservent le statut de chaque destinataire (envoyé, échec, désinscrit)." />
        </Glass>
      ) : (
        <Panel title="Destinataires" description={rows.length ? `${number(rows.length)} email${rows.length > 1 ? "s" : ""} individuel${rows.length > 1 ? "s" : ""}` : undefined} bodyClassName="p-0">
          <div className="flex flex-col gap-2 px-5 pb-3 lg:flex-row lg:items-center">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Nom ou email…" className="lg:w-[280px]" />
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={!status} onClick={() => { setStatus(null); setPage(0); }} count={rows.length}>
                Tous
              </FilterChip>
              {RECIPIENT_STATUS.filter((s) => counts[s.value]).map((s) => (
                <FilterChip key={s.value} active={status === s.value} onClick={() => { setStatus(status === s.value ? null : s.value); setPage(0); }} count={counts[s.value]}>
                  {s.label}
                </FilterChip>
              ))}
            </div>
          </div>
          <DataTable
            columns={columns}
            rows={filtered.slice(page * pageSize, (page + 1) * pageSize)}
            loading={isLoading}
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            empty={<EmptyState icon={<Users className="size-6" />} title="Aucun destinataire ne correspond" description="Modifiez la recherche ou le filtre." />}
          />
        </Panel>
      )}
    </div>
  );
}

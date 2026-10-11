import { ArrowUpRight, Ban, ChevronDown, CircleCheck, Filter, MailCheck, Plus, ShieldCheck, UserX, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatedNumber, Panel } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { number, percent } from "@/lib/format";
import { errorMessage, useItem } from "@/lib/hooks";
import type { Campaign, Segment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EXCLUSION_REASONS, exclusionLabel, type Audience } from "../campaign-utils";
import { describeRule, fieldsFor, findField } from "../segment-fields";
import { useUserNames } from "../SegmentPanels";
import { useSegmentFields } from "../SegmentSheet";
import { Callout } from "../ui";

function RgpdAudienceNote({ explicitConsent }: { explicitConsent?: boolean }) {
  const rows = [
    { ok: true, text: "Contacts ayant donné leur consentement (opt-in), particuliers comme professionnels." },
    { ok: !explicitConsent, text: "Professionnels rattachés à une entreprise, au titre de l'intérêt légitime, si le message concerne leur activité." },
    { ok: false, text: "Particuliers sans consentement préalable (art. L34-5 du CPCE)." },
    { ok: false, text: "Contacts désinscrits, opposés à la prospection ou anonymisés." },
  ];
  return (
    <Panel title="Qui reçoit la campagne ?" icon={<ShieldCheck className="size-4" />} description="Règles RGPD appliquées automatiquement à l'envoi">
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-fg-2">
            {r.ok ? <CircleCheck className="mt-px size-4 shrink-0 text-emerald-500" /> : <Ban className="mt-px size-4 shrink-0 text-red-500/80" />}
            {r.text}
          </li>
        ))}
      </ul>
      {explicitConsent && (
        <Callout tone="warning" className="mt-3">
          Vos paramètres RGPD exigent un consentement explicite : seuls les contacts opt-in sont éligibles.
        </Callout>
      )}
      <Callout tone="privacy" className="mt-3" icon={<MailCheck className="size-[18px]" />}>
        Chaque email comporte un lien de désinscription en un clic, ajouté automatiquement ; la désinscription est inscrite au registre des consentements.
      </Callout>
    </Panel>
  );
}

function SegmentSummary({ segmentId }: { segmentId: number }) {
  const { data: segment } = useItem<Segment>("segments", segmentId);
  const { data: fieldsApi } = useSegmentFields();
  const names = useUserNames();
  const fields = useMemo(() => fieldsFor("contacts", fieldsApi), [fieldsApi]);
  if (!segment) return <Skeleton className="mt-3 h-14" />;
  const conditions = segment.rules?.conditions ?? [];
  return (
    <div className="mt-3 rounded-[16px] bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: segment.color, boxShadow: `0 0 10px ${segment.color}` }} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{segment.name}</span>
        <Link to={`/segments?open=${segment.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
          Modifier <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {segment.description && <p className="mt-1 text-[12.5px] text-fg-3">{segment.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {conditions.length === 0 && <span className="text-[12px] text-fg-3">Sans condition : tous les contacts.</span>}
        {conditions.map((c, i) => (
          <span key={i} className="rounded-[8px] bg-white/60 px-2 py-0.5 text-[11.5px] font-medium text-fg-2 ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.06]">
            {i > 0 && <span className="mr-1 text-fg-3">{segment.rules.match === "any" ? "ou" : "et"}</span>}
            {describeRule(findField(fields, c.field), c, names)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AudienceStep({
  campaign,
  segmentId,
  editable,
  audience,
  explicitConsent,
  onSegment,
  onNewSegment,
}: {
  campaign: Campaign;
  segmentId: number | null;
  editable: boolean;
  audience: { data?: Audience; isLoading: boolean; error: unknown; pending: boolean };
  explicitConsent?: boolean;
  onSegment: (id: number | null) => void;
  onNewSegment: () => void;
}) {
  const [showExcluded, setShowExcluded] = useState(false);
  const data = audience.data;
  const total = data ? data.count + data.excluded_count : 0;
  const reasons = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of data?.excluded ?? []) out[e.reason] = (out[e.reason] ?? 0) + 1;
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <Panel title="Segment de destinataires" icon={<Filter className="size-4" />} description="La campagne est envoyée aux contacts éligibles de ce segment, recalculé au moment de l'envoi.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <EntitySelect
              resource="segments"
              params={{ entity: "contacts" }}
              value={segmentId}
              initialLabel={segmentId && segmentId === campaign.segment_id ? campaign.segment?.name : undefined}
              onChange={(id) => onSegment(id)}
              placeholder="Choisir un segment de contacts…"
              className="flex-1"
              disabled={!editable}
            />
            {editable && (
              <Button variant="glass" icon={<Plus className="size-4" />} onClick={onNewSegment}>
                Nouveau segment
              </Button>
            )}
          </div>
          {segmentId && <SegmentSummary segmentId={segmentId} />}
        </Panel>

        <Panel title="Audience éligible" icon={<Users className="size-4" />} description="Calculée en appliquant vos règles de consentement à chaque contact du segment.">
          {!segmentId ? (
            <EmptyState icon={<Users className="size-6" />} title="Aucun segment choisi" description="Sélectionnez un segment pour voir combien de contacts recevront la campagne." />
          ) : audience.isLoading || audience.pending ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-64" />
              <Skeleton className="h-3" />
              <Skeleton className="h-24" />
            </div>
          ) : audience.error ? (
            <Callout tone="danger" title="Audience indisponible">
              {errorMessage(audience.error)}
            </Callout>
          ) : data ? (
            <div>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
                <div>
                  <div className="text-[48px] font-semibold leading-none tracking-[-0.045em] tabular text-accent">
                    <AnimatedNumber value={data.count} format={(v) => number(Math.round(v))} />
                  </div>
                  <div className="mt-1.5 text-[13px] text-fg-2">destinataire{data.count > 1 ? "s" : ""} éligible{data.count > 1 ? "s" : ""}</div>
                </div>
                <div>
                  <div className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular text-fg-2">
                    <AnimatedNumber value={data.excluded_count} format={(v) => number(Math.round(v))} />
                  </div>
                  <div className="mt-1.5 text-[13px] text-fg-3">exclu{data.excluded_count > 1 ? "s" : ""} (RGPD)</div>
                </div>
                <div className="ml-auto text-right text-[12.5px] text-fg-3">
                  {number(total)} contact{total > 1 ? "s" : ""} dans le segment
                  <br />
                  {total > 0 && <span className="font-medium text-fg-2">{percent((data.count / total) * 100, 0)} joignables</span>}
                </div>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <motion.div className="h-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} initial={{ width: 0 }} animate={{ width: `${total ? (data.count / total) * 100 : 0}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
              </div>
              {data.count === 0 && (
                <Callout tone="warning" className="mt-4" title="Personne ne peut recevoir cette campagne">
                  Aucun contact de ce segment n'est joignable dans le respect du RGPD. Élargissez le segment ou recueillez des consentements (formulaires avec case opt-in).
                </Callout>
              )}
              {reasons.length > 0 && (
                <div className="mt-5 space-y-2.5">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-fg-3">Motifs d'exclusion</div>
                  {reasons.map(([reason, count]) => (
                    <div key={reason} className="flex items-start gap-3 rounded-[14px] bg-black/[0.025] px-3 py-2.5 dark:bg-white/[0.035]">
                      <UserX className="mt-0.5 size-4 shrink-0 text-fg-3" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{exclusionLabel(reason)}</div>
                        {EXCLUSION_REASONS[reason] && <div className="text-[12px] text-fg-3">{EXCLUSION_REASONS[reason].help}</div>}
                      </div>
                      <span className="text-[14px] font-semibold tabular">{number(count)}</span>
                    </div>
                  ))}
                  {data.excluded_count > data.excluded.length && <p className="text-[11.5px] text-fg-3">Répartition calculée sur les {data.excluded.length} premiers exclus.</p>}
                  <button type="button" onClick={() => setShowExcluded((v) => !v)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">
                    {showExcluded ? "Masquer" : "Voir"} les contacts exclus <ChevronDown className={cn("size-3.5 transition-transform", showExcluded && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {showExcluded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="-mx-1 max-h-[300px] space-y-0.5 overflow-y-auto">
                          {data.excluded.map((e) => (
                            <Link key={e.id} to={`/contacts/${e.id}`} className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 hover:bg-black/[0.035] dark:hover:bg-white/[0.05]">
                              <Avatar name={e.name} size={24} />
                              <span className="min-w-0 flex-1 truncate text-[13px]">{e.name}</span>
                              <span className="shrink-0 text-[11.5px] text-fg-3">{exclusionLabel(e.reason)}</span>
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="space-y-4">
        <RgpdAudienceNote explicitConsent={explicitConsent} />
        {data && data.sample.length > 0 && (
          <Panel title="Aperçu des destinataires" description={data.count > data.sample.length ? `${data.sample.length} sur ${number(data.count)}` : undefined} bodyClassName="px-3 pb-3">
            <div className="space-y-0.5">
              {data.sample.map((c) => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 hover:bg-black/[0.035] dark:hover:bg-white/[0.05]">
                  <Avatar name={c.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{c.name}</div>
                    <div className="truncate text-[11.5px] text-fg-3">{c.email}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

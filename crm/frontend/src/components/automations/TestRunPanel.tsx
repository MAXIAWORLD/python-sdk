import { Check, ChevronDown, CircleAlert, ExternalLink, FlaskConical, History, Play, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { Switch } from "@/components/ui/fields";
import { EntitySelect } from "@/components/ui/entity-select";
import { api } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { toastError, useInvalidate, useList } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { actionFields, actionVisual, ENTITY_LABEL, ENTITY_RESOURCE, entityLink, parseTestLog, RUN_STATUS, triggerVisual, type AutomationCatalog, type AutomationRun, type TestResult } from "./catalog";
import type { FieldContext } from "./fields";
import { displayValue } from "./nodes";
import { IconTile, RunStatusIcon } from "./parts";

function LogLines({ log, catalog, ctx }: { log: string[]; catalog?: AutomationCatalog; ctx: FieldContext }) {
  return (
    <ol className="space-y-2">
      {log.map((line, i) => {
        const parsed = parseTestLog(line);
        if (parsed) {
          const v = actionVisual(catalog, parsed.type);
          const specs = actionFields(
            catalog?.actions.find((a) => a.type === parsed.type),
            parsed.type,
          );
          const entries = Object.entries(parsed.config).filter(([, val]) => val !== "");
          return (
            <li key={i} className="rounded-[14px] bg-white/55 p-2.5 ring-1 ring-[var(--hairline)] dark:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                <IconTile icon={v.icon} accent={v.accent} size={22} />
                {v.label}
              </div>
              {entries.length > 0 && (
                <dl className="mt-2 space-y-1.5">
                  {entries.map(([key, val]) => {
                    const spec = specs.find((s) => s.key === key);
                    return (
                      <div key={key} className="text-[12px] leading-snug">
                        <dt className="text-fg-3">{spec?.label ?? key}</dt>
                        <dd className="whitespace-pre-wrap break-words text-fg">{spec ? displayValue(spec, val, ctx) : val}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </li>
          );
        }
        const failed = line.startsWith("Erreur");
        const ignored = /ignor|non envoy|non remplies/i.test(line);
        return (
          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
            {failed ? <CircleAlert className="mt-px size-3.5 shrink-0 text-red-500" /> : ignored ? <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-500" /> : <Check className="mt-px size-3.5 shrink-0 text-emerald-500" />}
            <span className={cn(failed ? "text-red-600 dark:text-red-300" : "text-fg-2")}>{line}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Test                                                                       */
/* -------------------------------------------------------------------------- */

export function TestPanel({ catalog, triggerType, ctx, canRun, needsSave, prepare }: { catalog?: AutomationCatalog; triggerType: string; ctx: FieldContext; canRun: boolean; needsSave: boolean; prepare: () => Promise<number | null> }) {
  const invalidate = useInvalidate();
  const [sample, setSample] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<(TestResult & { live: boolean; at: number }) | null>(null);
  const t = triggerVisual(catalog, triggerType);
  const resource = t.entity ? ENTITY_RESOURCE[t.entity] : undefined;

  const run = async () => {
    const id = await prepare();
    if (!id) return;
    setRunning(true);
    try {
      const payload = sample ? { id: sample, ...(t.entity === "contact" ? { contact_id: sample } : {}) } : undefined;
      const res = await api.post<TestResult>(`/automations/${id}/test`, { live, payload });
      setResult({ ...res, live, at: Date.now() });
      if (live) invalidate("automations", "automation-runs");
    } catch (e) {
      toastError(e);
    } finally {
      setRunning(false);
    }
  };

  const verdict = result && {
    success: { title: result.live ? "Exécution réussie" : "Simulation réussie", cls: "bg-emerald-500/10 ring-emerald-500/25" },
    skipped: { title: "Ignorée : conditions non remplies", cls: "bg-black/[0.035] ring-[var(--hairline-strong)] dark:bg-white/[0.05]" },
    error: { title: "Échec de l'exécution", cls: "bg-red-500/10 ring-red-500/25" },
  }[result.status as "success" | "skipped" | "error"];

  return (
    <div className="space-y-3.5">
      <p className="text-[12.5px] leading-relaxed text-fg-2">
        {t.entity ? `Rejouez le scénario sur un élément réel (${ENTITY_LABEL[t.entity]}) : les variables sont résolues et chaque action est simulée, ` : "Simulez une exécution planifiée : chaque action est déroulée à blanc, "}
        <span className="font-medium text-fg">sans rien modifier</span>.
      </p>
      {resource && (
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Élément de test</div>
          <EntitySelect resource={resource} value={sample} onChange={(id) => setSample(id)} placeholder={`Élément le plus récent (${ENTITY_LABEL[t.entity ?? ""]})`} />
        </div>
      )}
      <div className={cn("rounded-[14px] p-3 transition-colors", live ? "bg-amber-500/12 ring-1 ring-amber-500/30" : "bg-black/[0.025] dark:bg-white/[0.035]")}>
        <Switch size="sm" checked={live} onChange={setLive} disabled={!canRun} label={<span className="text-[13px]">Exécution réelle</span>} description={<span className="text-[12px]">Crée vraiment les tâches, envoie les emails et notifications.</span>} />
      </div>
      <Button variant={live ? "danger" : "primary"} className="w-full" loading={running} disabled={!canRun || !triggerType} icon={live ? <Play className="size-4" /> : <FlaskConical className="size-4" />} onClick={run}>
        {needsSave ? "Enregistrer et tester" : live ? "Exécuter maintenant" : "Lancer la simulation"}
      </Button>
      {!canRun && <p className="text-center text-[12px] text-fg-3">Le test est réservé aux managers et administrateurs.</p>}

      <AnimatePresence mode="popLayout">
        {result && verdict && (
          <motion.div key={result.at} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className={cn("rounded-[18px] p-3.5 ring-1", verdict.cls)}>
            <div className="mb-2.5 flex items-center gap-2">
              <RunStatusIcon status={result.status} className="size-4" />
              <span className="text-[13.5px] font-semibold">{verdict.title}</span>
              <Badge tone={result.live ? "orange" : "violet"} size="xs" className="ml-auto">
                {result.live ? "Réel" : "Simulation"}
              </Badge>
            </div>
            <LogLines log={result.log} catalog={catalog} ctx={ctx} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

function RunItem({ run, entity, catalog, ctx }: { run: AutomationRun; entity: string | null; catalog?: AutomationCatalog; ctx: FieldContext }) {
  const [open, setOpen] = useState(false);
  const link = entityLink(entity, run.payload?.id);
  return (
    <div className="rounded-[14px] bg-black/[0.025] dark:bg-white/[0.035]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <RunStatusIcon status={run.status} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <StatusBadge options={RUN_STATUS} value={run.status} size="xs" />
            <span className="truncate text-[12px] text-fg-3" title={dateTime(run.created_at)}>
              {relative(run.created_at)}
            </span>
          </span>
          {run.error || run.log[0] ? <span className="mt-0.5 block truncate text-[12px] text-fg-2">{run.error ?? run.log[0]}</span> : null}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="space-y-2.5 border-t border-[var(--hairline)] px-3 pb-3 pt-2.5">
              <div className="text-[11.5px] text-fg-3">{dateTime(run.created_at)}</div>
              {run.log.length > 0 ? <LogLines log={run.log} catalog={catalog} ctx={ctx} /> : <p className="text-[12px] text-fg-3">Aucun détail enregistré.</p>}
              {run.error && <p className="rounded-[10px] bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-600 dark:text-red-300">{run.error}</p>}
              {link && (
                <Link to={link} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                  Ouvrir l'élément déclencheur <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RunHistory({ automationId, triggerType, catalog, ctx }: { automationId?: number; triggerType: string; catalog?: AutomationCatalog; ctx: FieldContext }) {
  const { data, isLoading } = useList<AutomationRun>("automation-runs", { automation_id: automationId, sort: "-created_at", limit: 30 }, { enabled: !!automationId });
  const entity = triggerVisual(catalog, triggerType).entity;
  if (!automationId) return <EmptyState icon={<History className="size-6" />} title="Pas encore d'historique" description="Enregistrez l'automatisation : chaque exécution réelle apparaîtra ici avec son détail." className="py-10" />;
  if (isLoading) return <Skeleton className="h-40 rounded-[16px]" />;
  if (!data?.items.length) return <EmptyState icon={<History className="size-6" />} title="Aucune exécution" description="Dès qu'un événement correspondant survient, le détail de l'exécution s'affiche ici." className="py-10" />;
  const errors = data.items.filter((r) => r.status === "error").length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5 text-[12px] text-fg-3">
        <span>
          {data.total} exécution{data.total > 1 ? "s" : ""}
        </span>
        {errors > 0 && (
          <span className="text-red-500">
            {errors} en erreur
          </span>
        )}
      </div>
      {data.items.map((r) => (
        <RunItem key={r.id} run={r} entity={entity} catalog={catalog} ctx={ctx} />
      ))}
    </div>
  );
}

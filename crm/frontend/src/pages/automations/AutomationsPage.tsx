import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CircleCheckBig, LibraryBig, Play, Plus, Power, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AutomationCard } from "@/components/automations/AutomationCard";
import { AutomationBuilder, type BuilderSource } from "@/components/automations/Builder";
import { useAutomationCatalog, type AutomationRun } from "@/components/automations/catalog";
import { toDraft, toPayload } from "@/components/automations/draft";
import { HowItWorks, RecentRuns } from "@/components/automations/RecentRuns";
import { TemplateGallery } from "@/components/automations/TemplateGallery";
import type { AutomationTemplate } from "@/components/automations/templates";
import { FilterChip, PageHeader, StatTile } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { number, percent } from "@/lib/format";
import { keys, toastError, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import type { Automation, LeadForm, Paginated } from "@/lib/types";
import { can, useAuth } from "@/stores/auth";

type StatusFilter = "all" | "active" | "inactive" | "error";

const SORTS = [
  { value: "recent", label: "Récemment modifiées" },
  { value: "runs", label: "Plus exécutées" },
  { value: "last", label: "Dernière exécution" },
  { value: "name", label: "Nom (A → Z)" },
];

const LIST_PARAMS = { limit: 200, sort: "-updated_at" };

export default function AutomationsPage() {
  const me = useAuth((s) => s.user);
  const canEdit = can(me, "manager");
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { data: catalog } = useAutomationCatalog();
  const { data, isLoading } = useList<Automation>("automations", LIST_PARAMS);
  const runsQuery = useList<AutomationRun>("automation-runs", { sort: "-created_at", limit: 100 });
  const forms = useList<LeadForm>("forms", { limit: 200, expand: 0 });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useLocalStorage("prisme-automations-sort", "recent");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [source, setSource] = useState<BuilderSource>({ key: 0 });

  const automations = useMemo(() => data?.items ?? [], [data]);
  const runs = useMemo(() => runsQuery.data?.items ?? [], [runsQuery.data]);

  const counts = {
    all: automations.length,
    active: automations.filter((a) => a.active).length,
    inactive: automations.filter((a) => !a.active).length,
    error: automations.filter((a) => a.last_status === "error").length,
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = automations.filter((a) => {
      if (status === "active" && !a.active) return false;
      if (status === "inactive" && a.active) return false;
      if (status === "error" && a.last_status !== "error") return false;
      if (group && catalog?.triggers.find((t) => t.type === a.trigger?.type)?.group !== group) return false;
      return !needle || `${a.name} ${a.description ?? ""}`.toLowerCase().includes(needle);
    });
    const by: Record<string, (x: Automation, y: Automation) => number> = {
      recent: (x, y) => y.updated_at.localeCompare(x.updated_at),
      runs: (x, y) => (y.run_count ?? 0) - (x.run_count ?? 0),
      last: (x, y) => (y.last_run_at ?? "").localeCompare(x.last_run_at ?? ""),
      name: (x, y) => x.name.localeCompare(y.name, "fr"),
    };
    return [...list].sort(by[sort] ?? by.recent);
  }, [automations, q, status, group, sort, catalog]);

  const stats = useMemo(() => {
    const decided = runs.filter((r) => r.status === "success" || r.status === "error");
    const week = Date.now() - 7 * 86_400_000;
    return {
      totalRuns: automations.reduce((s, a) => s + (a.run_count ?? 0), 0),
      weekRuns: runs.filter((r) => r.status !== "skipped" && new Date(r.created_at).getTime() >= week).length,
      successRate: decided.length ? (decided.filter((r) => r.status === "success").length / decided.length) * 100 : null,
      sample: decided.length,
    };
  }, [automations, runs]);

  const groups = useMemo(() => {
    const used = new Set(automations.map((a) => catalog?.triggers.find((t) => t.type === a.trigger?.type)?.group));
    return Array.from(new Set((catalog?.triggers ?? []).map((t) => t.group))).filter((g) => used.has(g));
  }, [catalog, automations]);

  /* --------------------------------------------------------------- actions */
  const openBuilder = (s: Omit<BuilderSource, "key">) => {
    setSource((prev) => ({ ...s, key: prev.key + 1 }));
    setBuilderOpen(true);
  };

  const toggle = async (a: Automation, active: boolean) => {
    qc.setQueryData<Paginated<Automation>>(keys.list("automations", LIST_PARAMS), (old) => old && { ...old, items: old.items.map((x) => (x.id === a.id ? { ...x, active } : x)) });
    try {
      await api.patch(`/automations/${a.id}`, { active });
      toast.success(active ? "Automatisation activée" : "Automatisation désactivée", { description: a.name });
    } catch (e) {
      toastError(e);
    } finally {
      invalidate("automations");
    }
  };

  const duplicate = async (a: Automation) => {
    try {
      await api.post("/automations", { ...toPayload(toDraft(a)), name: `${a.name} (copie)`, active: false });
      toast.success("Automatisation dupliquée", { description: "La copie est inactive : vérifiez-la puis activez-la." });
      invalidate("automations");
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (a: Automation) => {
    const ok = await confirm({ title: `Supprimer « ${a.name} » ?`, description: "Le scénario cessera immédiatement de s'exécuter. Cette action est définitive.", danger: true, confirmLabel: "Supprimer" });
    if (!ok) return;
    try {
      await api.delete(`/automations/${a.id}`);
      toast.success("Automatisation supprimée");
      invalidate("automations");
    } catch (e) {
      toastError(e);
    }
  };

  const applyTemplate = (t: AutomationTemplate) => openBuilder({ template: t });
  const scrollToTemplates = () => document.getElementById("modeles")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const filtered = status !== "all" || !!q.trim() || !!group;

  return (
    <div>
      <PageHeader
        title="Automatisations"
        icon={<Workflow className="size-5" />}
        description={data ? `${number(counts.all)} scénario${counts.all > 1 ? "s" : ""} · ${number(counts.active)} actif${counts.active > 1 ? "s" : ""}` : "Chargement…"}
        actions={
          <>
            <Button variant="glass" icon={<LibraryBig className="size-4" />} onClick={scrollToTemplates}>
              Modèles
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openBuilder({})}>
                Nouvelle automatisation
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Scénarios actifs" value={counts.active} format={(v) => number(v)} hint={`sur ${scenarioCount(counts.all)}`} icon={<Power className="size-4" />} onClick={() => setStatus("active")} />
        <StatTile label="Exécutions au total" value={stats.totalRuns} format={(v) => number(v)} hint={stats.weekRuns ? `dont ${number(stats.weekRuns)} sur 7 jours` : "aucune sur 7 jours"} icon={<Play className="size-4" />} accent="linear-gradient(135deg,#22d3ee,#5b6cff)" />
        <StatTile
          label="Taux de succès"
          value={stats.successRate ?? 0}
          format={(v) => (stats.successRate === null ? "—" : percent(v, 0))}
          hint={stats.sample ? `sur les ${number(stats.sample)} dernières exécutions` : "aucune exécution récente"}
          icon={<CircleCheckBig className="size-4" />}
          accent="linear-gradient(135deg,#10b981,#22d3ee)"
        />
        <StatTile label="En erreur" value={counts.error} format={(v) => number(v)} hint={counts.error ? "à vérifier dans l'historique" : "tout fonctionne"} icon={<AlertTriangle className="size-4" />} accent="linear-gradient(135deg,#fb923c,#f43f5e)" onClick={() => setStatus("error")} />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un scénario…" className="lg:w-[300px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={status === "all"} onClick={() => setStatus("all")} count={counts.all}>
            Toutes
          </FilterChip>
          <FilterChip active={status === "active"} onClick={() => setStatus(status === "active" ? "all" : "active")} count={counts.active}>
            Actives
          </FilterChip>
          <FilterChip active={status === "inactive"} onClick={() => setStatus(status === "inactive" ? "all" : "inactive")} count={counts.inactive}>
            Inactives
          </FilterChip>
          {counts.error > 0 && (
            <FilterChip active={status === "error"} onClick={() => setStatus(status === "error" ? "all" : "error")} count={counts.error}>
              En erreur
            </FilterChip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select options={[{ value: "", label: "Tous les modules" }, ...groups.map((g) => ({ value: g, label: g }))]} value={group} onChange={setGroup} className="w-[170px]" />
          <Select options={SORTS} value={sort} onChange={setSort} className="w-[205px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[236px] rounded-[22px]" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Glass>
              <EmptyState
                icon={<Workflow className="size-6" />}
                title={filtered ? "Aucun scénario ne correspond" : "Aucune automatisation pour l'instant"}
                description={filtered ? "Modifiez la recherche ou les filtres." : "Partez d'un modèle prêt à l'emploi ou composez votre propre scénario en quelques clics."}
                action={
                  filtered ? (
                    <Button
                      onClick={() => {
                        setQ("");
                        setStatus("all");
                        setGroup("");
                      }}
                    >
                      Réinitialiser les filtres
                    </Button>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="glass" icon={<LibraryBig className="size-4" />} onClick={scrollToTemplates}>
                        Voir les modèles
                      </Button>
                      {canEdit && (
                        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openBuilder({})}>
                          Nouvelle automatisation
                        </Button>
                      )}
                    </div>
                  )
                }
              />
            </Glass>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {visible.map((a, i) => (
                <AutomationCard
                  key={a.id}
                  index={i}
                  automation={a}
                  catalog={catalog}
                  forms={forms.data?.items}
                  canEdit={canEdit}
                  onOpen={() => openBuilder({ automation: a })}
                  onToggle={(v) => toggle(a, v)}
                  onTest={() => openBuilder({ automation: a, tab: "test" })}
                  onHistory={() => openBuilder({ automation: a, tab: "history" })}
                  onDuplicate={() => duplicate(a)}
                  onDelete={() => remove(a)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <RecentRuns runs={runs} automations={automations} catalog={catalog} loading={runsQuery.isLoading} onOpen={(a) => openBuilder({ automation: a, tab: "history" })} />
          <HowItWorks />
        </div>
      </div>

      <div className="mt-10">
        <TemplateGallery catalog={catalog} canEdit={canEdit} onUse={applyTemplate} />
      </div>

      <AutomationBuilder key={source.key} open={builderOpen} onClose={() => setBuilderOpen(false)} source={source} catalog={catalog} />
    </div>
  );
}

function scenarioCount(n: number) {
  return `${number(n)} scénario${n > 1 ? "s" : ""}`;
}

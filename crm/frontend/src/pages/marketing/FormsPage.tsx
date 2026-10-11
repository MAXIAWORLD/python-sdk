import { Briefcase, ClipboardList, Copy, ExternalLink, Inbox, Link2, MoreHorizontal, PencilLine, Plus, Share2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { FormBuilderSheet } from "@/components/marketing/FormBuilderSheet";
import { publicFormUrl, type FormRecord } from "@/components/marketing/form-utils";
import { MarketingTabs } from "@/components/marketing/MarketingTabs";
import { NewFormDialog } from "@/components/marketing/NewFormDialog";
import { copyText } from "@/components/marketing/ui";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton, StatusBadge, Tag } from "@/components/ui/display";
import { SearchInput, Select, Switch } from "@/components/ui/fields";
import { Menu, Tooltip, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { LIFECYCLE } from "@/lib/constants";
import { number, relative } from "@/lib/format";
import { toastError, useInvalidate, useList } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

const SORTS = [
  { value: "-updated_at", label: "Modifiés récemment" },
  { value: "-submissions", label: "Plus de réponses" },
  { value: "name", label: "Nom (A → Z)" },
];

type BuilderState = { open: boolean; id: number | null; tab: "fields" | "settings" | "share" | "responses" };

function FormCard({ form, index, lastAt, writable, onOpen, onToggle, onDuplicate, onDelete }: { form: FormRecord; index: number; lastAt?: string; writable: boolean; onOpen: (tab: BuilderState["tab"]) => void; onToggle: (v: boolean) => void; onDuplicate: () => void; onDelete: () => void }) {
  const url = publicFormUrl(form.slug);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3), type: "spring", stiffness: 260, damping: 26 }} className="h-full">
      <TiltCard className={cn("flex h-full flex-col p-5", !form.active && "opacity-80")} onClick={() => onOpen("fields")}>
        <div className="flex items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_10px_22px_-10px_rgba(91,108,255,.7)]", !form.active && "grayscale")} style={{ background: "linear-gradient(140deg, var(--accent), var(--accent-2))" }}>
            <ClipboardList className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{form.name}</div>
            <div className="truncate font-mono text-[11.5px] text-fg-3">/f/{form.slug}</div>
          </div>
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
            <Tooltip content={form.active ? "Actif : le lien accepte les réponses" : "Inactif : le lien est fermé"}>
              <span>
                <Switch size="sm" checked={form.active} onChange={onToggle} disabled={!writable} />
              </span>
            </Tooltip>
          </div>
        </div>

        {form.title && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-fg-2">« {form.title} »</p>}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusBadge options={LIFECYCLE} value={form.lifecycle} size="xs" />
          {form.create_deal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/12 px-1.5 py-px text-[10.5px] font-medium text-violet-700 dark:text-violet-300">
              <Briefcase className="size-3" /> Opportunité auto
            </span>
          )}
          {form.tags_to_add.slice(0, 2).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--hairline)] pt-3.5">
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen("responses"); }} className="min-w-0 flex-1 text-left">
            <div className="text-[24px] font-semibold leading-none tracking-[-0.03em] tabular">{number(form.submissions)}</div>
            <div className="mt-1 truncate text-[11.5px] text-fg-3" title={lastAt ? `Dernière réponse ${relative(lastAt)}` : undefined}>
              réponse{form.submissions > 1 ? "s" : ""} · {lastAt ? `dernière ${relative(lastAt)}` : `${form.fields.length} champs`}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {form.owner && <Avatar name={form.owner.name} color={(form.owner.color as string) ?? undefined} size={24} className="mr-1.5" />}
            <IconButton
              label="Copier le lien public"
              size="sm"
              onClick={async () => {
                if (await copyText(url)) toast.success("Lien copié", { description: url });
              }}
            >
              <Link2 className="size-4" />
            </IconButton>
            <a href={url} target="_blank" rel="noreferrer" aria-label="Ouvrir le formulaire public" title="Ouvrir le formulaire public" className="flex size-8 items-center justify-center rounded-[10px] text-fg-2 transition hover:bg-black/[0.045] hover:text-fg dark:hover:bg-white/[0.07]">
              <ExternalLink className="size-4" />
            </a>
            <Menu
              trigger={
                <button className="flex size-8 items-center justify-center rounded-[10px] text-fg-2 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Actions du formulaire">
                  <MoreHorizontal className="size-4" />
                </button>
              }
              items={[
                { label: "Modifier", icon: <PencilLine className="size-4" />, onSelect: () => onOpen("fields") },
                { label: "Partager / intégrer", icon: <Share2 className="size-4" />, onSelect: () => onOpen("share") },
                { label: "Voir les réponses", icon: <Inbox className="size-4" />, onSelect: () => onOpen("responses") },
                ...(writable
                  ? [
                      { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: onDuplicate },
                      { separator: true, label: "" },
                      { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: onDelete },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export default function FormsPage() {
  const user = useAuth((s) => s.user);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const ls = useListState({ filters: ["active"], defaultSort: "-updated_at", pageSize: 200 });
  const { data, isLoading } = useList<FormRecord>("forms", ls.params);
  const all = useList<FormRecord>("forms", { limit: 500, expand: 0 }).data?.items;
  const recent = useList<{ id: number; form_id: number; created_at: string }>("form-submissions", { sort: "-created_at", limit: 300, expand: 0 }).data?.items;
  const [builder, setBuilder] = useState<BuilderState>({ open: false, id: null, tab: "fields" });
  const [creating, setCreating] = useState(false);
  const writable = can(user, "member");
  const rows = data?.items ?? [];

  const lastByForm = useMemo(() => {
    const out: Record<number, string> = {};
    for (const s of recent ?? []) out[s.form_id] ??= s.created_at;
    return out;
  }, [recent]);
  const totalSubmissions = (all ?? []).reduce((s, f) => s + (f.submissions || 0), 0);
  const activeCount = all?.filter((f) => f.active).length ?? 0;

  const toggle = async (form: FormRecord, active: boolean) => {
    try {
      await api.patch(`/forms/${form.id}`, { active });
      invalidate("forms");
      toast.success(active ? "Formulaire activé" : "Formulaire désactivé", { description: active ? "Le lien public accepte de nouveau les réponses." : "Le lien public n'accepte plus de réponses." });
    } catch (e) {
      toastError(e);
    }
  };

  const duplicate = async (f: FormRecord) => {
    try {
      const copy = await api.post<FormRecord>("/forms", { name: `${f.name} (copie)`, title: f.title, description: f.description, fields: f.fields, submit_label: f.submit_label, success_message: f.success_message, redirect_url: f.redirect_url, active: f.active, lifecycle: f.lifecycle, tags_to_add: f.tags_to_add, owner_id: f.owner_id, create_deal: f.create_deal, pipeline_id: f.pipeline_id, stage_id: f.stage_id, notify: f.notify, theme: f.theme });
      invalidate("forms");
      toast.success("Formulaire dupliqué", { description: `Nouvelle adresse : /f/${copy.slug}` });
      setBuilder({ open: true, id: copy.id, tab: "fields" });
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (f: FormRecord) => {
    const ok = await confirm({ title: `Supprimer « ${f.name} » ?`, description: "Le lien public cessera de fonctionner (pensez à le retirer de votre site). Les contacts déjà créés et leurs preuves de consentement sont conservés.", danger: true, confirmLabel: "Supprimer" });
    if (!ok) return;
    try {
      await api.delete(`/forms/${f.id}`);
      invalidate("forms");
      toast.success("Formulaire supprimé");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Marketing"
        title="Formulaires"
        icon={<ClipboardList className="size-5" />}
        description={all ? `${number(all.length)} formulaire${all.length > 1 ? "s" : ""} de capture · ${number(totalSubmissions)} réponse${totalSubmissions > 1 ? "s" : ""} au total` : "Chargement…"}
        actions={
          writable && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouveau formulaire
            </Button>
          )
        }
      />
      <MarketingTabs className="mb-5" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Rechercher un formulaire…" className="lg:w-[300px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={!ls.filters.active} onClick={() => ls.setFilter("active", null)} count={all?.length}>
            Tous
          </FilterChip>
          <FilterChip active={ls.filters.active === "true"} onClick={() => ls.setFilter("active", ls.filters.active === "true" ? null : "true")} count={activeCount}>
            Actifs
          </FilterChip>
          <FilterChip active={ls.filters.active === "false"} onClick={() => ls.setFilter("active", ls.filters.active === "false" ? null : "false")} count={(all?.length ?? 0) - activeCount}>
            Inactifs
          </FilterChip>
        </div>
        <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="w-full sm:w-[210px]" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[226px] rounded-[22px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title={ls.activeFilterCount ? "Aucun formulaire ne correspond" : "Captez vos premiers leads"}
            description={ls.activeFilterCount ? "Essayez d'élargir la recherche ou les filtres." : "Créez un formulaire (contact, démo, newsletter…), partagez son lien ou intégrez-le à votre site : chaque réponse crée un contact qualifié, consentement à l'appui."}
            action={
              ls.activeFilterCount ? (
                <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button>
              ) : writable ? (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                  Nouveau formulaire
                </Button>
              ) : undefined
            }
          />
        </Glass>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((f, i) => (
            <FormCard key={f.id} form={f} index={i} lastAt={lastByForm[f.id]} writable={writable} onOpen={(tab) => setBuilder({ open: true, id: f.id, tab })} onToggle={(v) => toggle(f, v)} onDuplicate={() => duplicate(f)} onDelete={() => remove(f)} />
          ))}
        </div>
      )}

      <NewFormDialog open={creating} onOpenChange={setCreating} onCreated={(f) => setBuilder({ open: true, id: f.id, tab: "fields" })} />
      <FormBuilderSheet formId={builder.id} open={builder.open} initialTab={builder.tab} onOpenChange={(open) => setBuilder((b) => ({ ...b, open }))} />
    </div>
  );
}

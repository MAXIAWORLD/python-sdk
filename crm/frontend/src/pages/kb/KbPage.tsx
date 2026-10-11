import { BookOpen, Copy, ExternalLink, Eye, FilePen, Globe, MoreHorizontal, PenLine, Pencil, Plus, Send, ThumbsUp, Trash2, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { BarList } from "@/components/charts/Charts";
import { FilterChip, PageHeader, Panel, StatTile } from "@/components/data/blocks";
import { Glass, TiltCard } from "@/components/glass/Glass";
import { categoryStyle, excerpt, fold, KB_STATUS, NO_CATEGORY } from "@/components/support/kb";
import { KbEditor } from "@/components/support/KbEditor";
import { helpUrl } from "@/components/support/KbInsert";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/fields";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { number, plural, relative } from "@/lib/format";
import { toastError, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import type { KbArticle } from "@/lib/types";

type SortKey = "category" | "views" | "helpful" | "updated" | "title";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "category", label: "Par catégorie" },
  { value: "views", label: "Plus consultés" },
  { value: "helpful", label: "Plus utiles" },
  { value: "updated", label: "Récemment modifiés" },
  { value: "title", label: "Titre (A → Z)" },
];

const byTitle = (a: KbArticle, b: KbArticle) => a.title.localeCompare(b.title, "fr");
const COMPARE: Record<Exclude<SortKey, "category">, (a: KbArticle, b: KbArticle) => number> = {
  views: (a, b) => b.views - a.views || byTitle(a, b),
  helpful: (a, b) => b.helpful - a.helpful || b.views - a.views,
  updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
  title: byTitle,
};

interface ArticleActions {
  article: KbArticle;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function ArticleMenu({ article, onOpen, onToggle, onDelete, className }: ArticleActions & { className?: string }) {
  const published = article.status === "published";
  const copy = () =>
    navigator.clipboard
      .writeText(helpUrl(article.slug))
      .then(() => toast.success("Lien public copié"))
      .catch(() => toast.error("Copie impossible"));
  return (
    <div onClick={(e) => e.stopPropagation()} className={className}>
      <Menu
        trigger={
          <button type="button" aria-label="Actions" className="rounded-[9px] p-1.5 text-fg-3 transition hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]">
            <MoreHorizontal className="size-4" />
          </button>
        }
        items={[
          { label: "Modifier", icon: <Pencil className="size-4" />, onSelect: onOpen },
          ...(published
            ? [
                { label: "Voir dans le centre d'aide", icon: <ExternalLink className="size-4" />, onSelect: () => window.open(helpUrl(article.slug), "_blank", "noopener") },
                { label: "Copier le lien public", icon: <Copy className="size-4" />, onSelect: copy },
                { label: "Repasser en brouillon", icon: <Undo2 className="size-4" />, onSelect: onToggle },
              ]
            : [{ label: "Publier", icon: <Send className="size-4" />, onSelect: onToggle }]),
          { separator: true, label: "" },
          { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: onDelete },
        ]}
      />
    </div>
  );
}

function Stats({ article }: { article: KbArticle }) {
  return (
    <span className="flex items-center gap-3 tabular">
      <span className="inline-flex items-center gap-1" title="Vues">
        <Eye className="size-3.5" />
        {number(article.views)}
      </span>
      <span className="inline-flex items-center gap-1" title="Votes « utile »">
        <ThumbsUp className="size-3.5" />
        {number(article.helpful)}
      </span>
    </span>
  );
}

/** Card used by the flat sorts (most viewed, most useful, recent, A → Z). */
function ArticleCard(props: ArticleActions) {
  const { article, onOpen } = props;
  return (
    <TiltCard className="flex h-full flex-col p-4" onClick={onOpen} max={4}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusBadge options={KB_STATUS} value={article.status} size="xs" />
          {article.category && <span className="truncate text-[11.5px] text-fg-3">{article.category}</span>}
        </span>
        <ArticleMenu {...props} className="-mr-1.5 -mt-1.5" />
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{article.title}</h3>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-fg-2">{article.summary || excerpt(article.body, 140) || "Article vide"}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3.5 text-[11.5px] text-fg-3">
        <Stats article={article} />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{relative(article.updated_at)}</span>
          {article.author && <Avatar name={article.author.name} color={(article.author.color as string) ?? undefined} size={20} />}
        </span>
      </div>
    </TiltCard>
  );
}

/** One category of the knowledge base: a glass panel listing its articles. */
function Collection({ name, items, actions }: { name: string; items: KbArticle[]; actions: (a: KbArticle) => ArticleActions }) {
  const style = categoryStyle(name);
  const Icon = style.icon;
  const views = items.reduce((sum, a) => sum + a.views, 0);
  return (
    <Glass className="flex flex-col overflow-hidden" glow>
      <div className="flex items-center gap-3 px-4 pb-2 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_6px_14px_-6px_rgba(0,0,0,.45)]" style={{ background: style.gradient }}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</h2>
          <p className="text-[12px] text-fg-3">
            {plural(items.length, "article")} · {plural(views, "vue")}
          </p>
        </div>
      </div>
      <div className="px-2 pb-2">
        {items.map((a) => {
          const act = actions(a);
          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={act.onOpen}
              onKeyDown={(e) => e.key === "Enter" && act.onOpen()}
              className="group flex cursor-pointer items-start gap-3 rounded-[14px] px-2.5 py-2.5 transition hover:bg-black/[0.03] focus-visible:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              <span className={a.status === "published" ? "mt-[7px] size-2 shrink-0 rounded-full bg-emerald-500" : "mt-[7px] size-2 shrink-0 rounded-full border border-dashed border-fg-3"} title={a.status === "published" ? "Publié" : "Brouillon"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="line-clamp-2 text-[13.5px] font-medium leading-snug group-hover:text-accent">{a.title}</span>
                  {a.status !== "published" && <StatusBadge options={KB_STATUS} value={a.status} size="xs" className="mt-px" />}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[12px] text-fg-3">{a.summary || excerpt(a.body, 120) || "Article vide"}</p>
              </div>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11.5px] text-fg-3 tabular" title="Vues">
                <Eye className="size-3.5" />
                {number(a.views)}
              </span>
              <ArticleMenu {...act} className="-my-1 opacity-60 transition group-hover:opacity-100" />
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

export default function KbPage() {
  const [search, setSearch] = useSearchParams();
  const status = search.get("status") ?? "";
  const category = search.get("category") ?? "";
  const [q, setQ] = useState("");
  const [sort, setSort] = useLocalStorage<SortKey>("prisme-kb-sort", "category");
  const [editing, setEditing] = useState<{ article: KbArticle | null } | null>(null);
  const { data, isLoading } = useList<KbArticle>("kb-articles", { limit: 1000, sort: "category,title" });
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const all = useMemo(() => data?.items ?? [], [data]);

  const setParam = (key: string, value: string | null) =>
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const stats = useMemo(() => {
    const published = all.filter((a) => a.status === "published");
    return {
      published: published.length,
      drafts: all.length - published.length,
      views: all.reduce((s, a) => s + a.views, 0),
      helpful: all.reduce((s, a) => s + a.helpful, 0),
      top: [...published].sort((a, b) => b.views - a.views).slice(0, 6),
    };
  }, [all]);

  const categories = useMemo(() => [...new Set(all.map((a) => a.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "fr")), [all]);

  const filtered = useMemo(() => {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    return all.filter((a) => {
      if (status && a.status !== status) return false;
      if (category && (a.category || NO_CATEGORY) !== category) return false;
      if (!terms.length) return true;
      const hay = fold(`${a.title} ${a.summary ?? ""} ${a.category ?? ""} ${a.tags.join(" ")} ${a.body}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [all, q, status, category]);

  const sections = useMemo(() => {
    if (sort !== "category") return [{ name: "", items: [...filtered].sort(COMPARE[sort]) }];
    const map = new Map<string, KbArticle[]>();
    for (const a of filtered) {
      const key = a.category || NO_CATEGORY;
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, "fr"))).map(([name, items]) => ({ name, items: items.sort(byTitle) }));
  }, [filtered, sort]);

  const toggle = async (a: KbArticle) => {
    const next = a.status === "published" ? "draft" : "published";
    try {
      await api.patch(`/kb-articles/${a.id}`, { status: next });
      toast.success(next === "published" ? "Article publié" : "Article repassé en brouillon", next === "published" ? { description: `En ligne sur /aide/${a.slug}` } : undefined);
      invalidate("kb-articles");
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (a: KbArticle) => {
    if (!(await confirm({ title: `Supprimer « ${a.title} » ?`, description: "L'article disparaîtra du centre d'aide et les liens existants ne fonctionneront plus.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/kb-articles/${a.id}`);
      toast.success("Article supprimé");
      invalidate("kb-articles");
    } catch (e) {
      toastError(e);
    }
  };

  const filtersOn = !!(q || status || category);
  const actionsFor = (a: KbArticle): ArticleActions => ({ article: a, onOpen: () => setEditing({ article: a }), onToggle: () => toggle(a), onDelete: () => remove(a) });

  return (
    <div>
      <PageHeader
        title="Base de connaissances"
        icon={<BookOpen className="size-5" />}
        description={isLoading ? "Chargement…" : `${plural(all.length, "article")} · ${plural(stats.published, "publié")} · ${plural(stats.views, "vue")}`}
        actions={
          <>
            <Button variant="glass" icon={<Globe className="size-4" />} onClick={() => window.open("/aide", "_blank", "noopener")}>
              Centre d'aide public
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ article: null })}>
              Nouvel article
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Articles publiés"
          value={stats.published}
          format={(v) => number(v)}
          icon={<Globe className="size-4" />}
          hint="Visibles dans le centre d'aide"
          accent="linear-gradient(135deg,#1baf7a,#22d3ee)"
          onClick={() => setParam("status", "published")}
        />
        <StatTile
          label="Brouillons"
          value={stats.drafts}
          format={(v) => number(v)}
          icon={<FilePen className="size-4" />}
          hint={stats.drafts ? "À relire avant publication" : "Rien en attente"}
          accent="linear-gradient(135deg,#a1a1aa,#5b6cff)"
          onClick={() => setParam("status", "draft")}
        />
        <StatTile label="Vues cumulées" value={stats.views} format={(v) => number(v)} icon={<Eye className="size-4" />} hint={stats.top[0] ? `Top : ${stats.top[0].title}` : "Aucune vue"} accent="linear-gradient(135deg,#5b6cff,#8b5cf6)" />
        <StatTile
          label="Votes « utile »"
          value={stats.helpful}
          format={(v) => number(v)}
          icon={<ThumbsUp className="size-4" />}
          hint={stats.helpful && stats.views ? `${number((stats.helpful / stats.views) * 100, 1)} % des vues` : "Aucun vote enregistré"}
          accent="linear-gradient(135deg,#f472b6,#fbbf24)"
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Titre, contenu, catégorie…" className="lg:w-[320px]" />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <FilterChip active={!status} onClick={() => setParam("status", null)} count={all.length}>
            Tous
          </FilterChip>
          <FilterChip active={status === "published"} onClick={() => setParam("status", status === "published" ? null : "published")} count={stats.published}>
            Publiés
          </FilterChip>
          <FilterChip active={status === "draft"} onClick={() => setParam("status", status === "draft" ? null : "draft")} count={stats.drafts}>
            Brouillons
          </FilterChip>
        </div>
        <div className="flex items-center gap-2">
          <Select options={[{ value: "", label: "Toutes les catégories" }, ...categories, ...(all.some((a) => !a.category) ? [NO_CATEGORY] : [])]} value={category} onChange={(v) => setParam("category", v || null)} className="w-[190px]" />
          <Select options={SORTS} value={sort} onChange={(v) => setSort(v as SortKey)} className="w-[180px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {isLoading &&
            Array.from({ length: 2 }, (_, i) => (
              <div key={i}>
                <Skeleton className="mb-3 h-7 w-48" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {Array.from({ length: 3 }, (_, j) => (
                    <Skeleton key={j} className="h-[170px] rounded-[22px]" />
                  ))}
                </div>
              </div>
            ))}

          {!isLoading && filtered.length === 0 && (
            <Glass>
              {filtersOn ? (
                <EmptyState
                  icon={<BookOpen className="size-6" />}
                  title="Aucun article ne correspond"
                  description="Essayez un autre mot-clé ou retirez les filtres."
                  action={
                    <Button
                      onClick={() => {
                        setQ("");
                        setSearch(new URLSearchParams(), { replace: true });
                      }}
                    >
                      Réinitialiser
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<BookOpen className="size-6" />}
                  title="Votre base de connaissances est vide"
                  description="Rédigez des articles d'aide : ils alimentent le centre d'aide public et les réponses suggérées par Iris sur les tickets."
                  action={
                    <Button variant="primary" icon={<PenLine className="size-4" />} onClick={() => setEditing({ article: null })}>
                      Écrire le premier article
                    </Button>
                  }
                />
              )}
            </Glass>
          )}

          {sort === "category" ? (
            <div className="columns-1 gap-4 md:columns-2">
              {sections.map((section, i) => (
                <motion.div key={section.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }} className="mb-4 break-inside-avoid">
                  <Collection name={section.name} items={section.items} actions={actionsFor} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {sections[0]?.items.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                  <ArticleCard {...actionsFor(a)} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Les plus consultés" description="Vues dans le centre d'aide" icon={<Eye className="size-4" />}>
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : stats.top.length ? (
              <BarList
                items={stats.top.map((a) => ({ id: a.id, label: a.title, value: a.views, sub: a.category ?? undefined }))}
                onClick={(it) => {
                  const found = all.find((a) => a.id === it.id);
                  if (found) setEditing({ article: found });
                }}
              />
            ) : (
              <p className="text-[12.5px] text-fg-3">Aucun article publié pour l'instant.</p>
            )}
          </Panel>
          <Glass className="ai-border overflow-hidden p-4" glow>
            <div className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Globe className="size-4 text-accent" /> Centre d'aide public
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">Vos clients y trouvent les articles publiés, sans compte. Insérez-les en un clic dans vos réponses aux tickets.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="glass" icon={<ExternalLink className="size-3.5" />} onClick={() => window.open("/aide", "_blank", "noopener")}>
                Ouvrir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Copy className="size-3.5" />}
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${window.location.origin}/aide`)
                    .then(() => toast.success("Lien du centre d'aide copié"))
                    .catch(() => toast.error("Copie impossible"))
                }
              >
                Copier le lien
              </Button>
            </div>
          </Glass>
        </div>
      </div>

      <KbEditor open={!!editing} onOpenChange={(o) => !o && setEditing(null)} article={editing?.article} categories={categories} />
    </div>
  );
}

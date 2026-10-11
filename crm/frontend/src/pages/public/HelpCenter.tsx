import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CalendarDays, Check, Clock, Link2, ListTree, SearchX, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { PublicLayout, usePublicBranding, type PublicBranding } from "@/components/layout/PublicLayout";
import { ArticleMarkdown } from "@/components/support/ArticleMarkdown";
import { ArticleRow, Breadcrumb, CategoryCard, CategoryIcon, categoryHref, ContactCard, HelpSearchBox, type PublicKbItem } from "@/components/support/HelpParts";
import { headings, NO_CATEGORY, readingMinutes, stripTitle } from "@/components/support/kb";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { api, ApiError } from "@/lib/api";
import { date } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface PublicKbList {
  items: PublicKbItem[];
  branding: PublicBranding;
}

interface PublicKbArticle {
  title: string;
  category?: string | null;
  body: string;
  updated_at?: string | null;
}

function usePublicKb(q = "") {
  return useQuery({ queryKey: ["public-kb", q], queryFn: () => api.get<PublicKbList>("/public/kb", { q: q || undefined }), placeholderData: keepPreviousData, staleTime: 60_000 });
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

function groupByCategory(items: PublicKbItem[]) {
  const map = new Map<string, PublicKbItem[]>();
  for (const a of items) {
    const key = a.category || NO_CATEGORY;
    map.set(key, [...(map.get(key) ?? []), a]);
  }
  return [...map.entries()].sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, "fr")));
}

/** One article per category, round-robin: a varied selection for the home page. */
function recommended(groups: [string, PublicKbItem[]][], count = 6) {
  const out: PublicKbItem[] = [];
  for (let round = 0; out.length < count; round++) {
    const batch = groups.map(([, items]) => items[round]).filter((a): a is PublicKbItem => !!a);
    if (!batch.length) break;
    out.push(...batch);
  }
  return out.slice(0, count);
}

/* -------------------------------------------------------------------------- */
/* Home & search                                                              */
/* -------------------------------------------------------------------------- */

function HelpHome({ brand }: { brand?: PublicBranding }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const category = params.get("categorie");
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q.trim(), 250);
  const all = usePublicKb();
  const results = usePublicKb(dq);
  const groups = useMemo(() => groupByCategory(all.data?.items ?? []), [all.data]);
  const picks = useMemo(() => recommended(groups), [groups]);
  useDocumentTitle(category ? `${category} · Centre d'aide` : `Centre d'aide${brand?.company ? ` · ${brand.company}` : ""}`);

  const onSearch = (value: string) => {
    setQ(value);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) next.set("q", value.trim());
        else next.delete("q");
        next.delete("categorie");
        return next;
      },
      { replace: true },
    );
  };

  const total = all.data?.items.length ?? 0;
  const inCategory = category ? (groups.find(([name]) => name === category)?.[1] ?? []) : [];

  return (
    <>
      <section className="relative mb-10 pt-2 text-center sm:mb-12 sm:pt-6">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass-flat mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium text-fg-2">
          <Sparkles className="size-3.5 text-accent" /> Centre d'aide{total ? ` · ${total} article${total > 1 ? "s" : ""}` : ""}
        </motion.div>
        <h1 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] sm:text-[46px]">
          Comment pouvons-nous <span className="text-gradient">vous aider</span> ?
        </h1>
        <p className="mx-auto mt-3 max-w-[540px] text-balance text-[15px] text-fg-2 sm:text-[16px]">Guides pas à pas, réponses aux questions fréquentes et bonnes pratiques{brand?.company ? `, par l'équipe ${brand.company}` : ""}.</p>
        <div className="mx-auto mt-7 max-w-[660px] text-left">
          <HelpSearchBox value={q} onChange={onSearch} loading={results.isFetching && !!dq} />
        </div>
      </section>

      {dq ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[15px] font-semibold">
              {results.data ? `${results.data.items.length} résultat${results.data.items.length > 1 ? "s" : ""}` : "Recherche…"} <span className="font-normal text-fg-3">pour « {dq} »</span>
            </h2>
          </div>
          {results.data && results.data.items.length === 0 ? (
            <Glass radius="xl">
              <EmptyState
                icon={<SearchX className="size-6" />}
                title="Aucun article ne correspond"
                description="Essayez avec d'autres mots-clés, ou parcourez les rubriques ci-dessous."
                action={<Button onClick={() => onSearch("")}>Voir toutes les rubriques</Button>}
              />
            </Glass>
          ) : (
            <Glass radius="xl" className="p-2">
              {(results.data?.items ?? []).map((a) => (
                <ArticleRow key={a.slug} item={a} query={dq} />
              ))}
            </Glass>
          )}
        </section>
      ) : category ? (
        <section>
          <Breadcrumb items={[{ label: "Centre d'aide", to: "/aide" }, { label: category }]} />
          <div className="mb-5 flex items-center gap-4">
            <CategoryIcon category={category} size={52} />
            <div>
              <h2 className="text-[26px] font-semibold tracking-[-0.025em]">{category}</h2>
              <p className="text-[13.5px] text-fg-3">
                {inCategory.length} article{inCategory.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {all.isLoading ? (
            <Skeleton className="h-60 rounded-[28px]" />
          ) : inCategory.length ? (
            <Glass radius="xl" className="p-2">
              {inCategory.map((a) => (
                <ArticleRow key={a.slug} item={a} showCategory={false} />
              ))}
            </Glass>
          ) : (
            <Glass radius="xl">
              <EmptyState icon={<BookOpen className="size-6" />} title="Rubrique vide" description="Aucun article publié dans cette rubrique pour le moment." action={<Button onClick={() => navigate("/aide")}>Retour au centre d'aide</Button>} />
            </Glass>
          )}
        </section>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="mb-4 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Rubriques</h2>
            {all.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-[200px] rounded-[22px]" />
                ))}
              </div>
            ) : groups.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map(([name, items], i) => (
                  <motion.div key={name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.4) }}>
                    <CategoryCard name={name} items={items} onOpen={() => navigate(categoryHref(name))} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <Glass radius="xl">
                <EmptyState icon={<BookOpen className="size-6" />} title="Le centre d'aide arrive bientôt" description="Aucun article n'est encore publié. Contactez-nous directement en attendant." />
              </Glass>
            )}
          </section>

          {picks.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Articles recommandés</h2>
              <Glass radius="xl" className="grid gap-x-2 p-2 md:grid-cols-2">
                {picks.map((a) => (
                  <ArticleRow key={a.slug} item={a} />
                ))}
              </Glass>
            </section>
          )}
        </>
      )}

      <ContactCard brand={brand} className="mt-10" />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Article                                                                    */
/* -------------------------------------------------------------------------- */

function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(window.location.href).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-fg-3 transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.06]"
    >
      {done ? <Check className="size-3.5 text-emerald-500" /> : <Link2 className="size-3.5" />}
      {done ? "Lien copié" : "Copier le lien"}
    </button>
  );
}

function HelpArticle({ slug, brand }: { slug: string; brand?: PublicBranding }) {
  const {
    data: article,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-kb-article", slug],
    queryFn: () => api.get<PublicKbArticle>(`/public/kb/${encodeURIComponent(slug)}`),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const all = usePublicKb();
  useDocumentTitle(article ? `${article.title} · Centre d'aide` : "Centre d'aide");

  const body = useMemo(() => (article ? stripTitle(article.body, article.title) : ""), [article]);
  const toc = useMemo(() => headings(body), [body]);
  const related = useMemo(() => (all.data?.items ?? []).filter((a) => a.slug !== slug && (a.category || NO_CATEGORY) === (article?.category || NO_CATEGORY)).slice(0, 4), [all.data, slug, article]);
  const category = article?.category || NO_CATEGORY;

  if (error)
    return (
      <Glass radius="xl" className="mt-6">
        <EmptyState
          icon={<SearchX className="size-6" />}
          title={error instanceof ApiError && error.status === 404 ? "Article introuvable" : "Article indisponible"}
          description="Il a peut-être été déplacé ou dépublié. Recherchez votre question depuis l'accueil du centre d'aide."
          action={
            <Button asChild variant="primary">
              <Link to="/aide">
                <ArrowLeft className="size-4" /> Retour au centre d'aide
              </Link>
            </Button>
          }
        />
      </Glass>
    );

  return (
    <>
      <Breadcrumb items={[{ label: "Centre d'aide", to: "/aide" }, { label: category, to: categoryHref(category) }, { label: article?.title ?? "…" }]} />
      <div className={cn("grid grid-cols-1 items-start gap-6", toc.length > 1 && "lg:grid-cols-[minmax(0,1fr)_230px]")}>
        <Glass radius="xl" glow className="min-w-0 p-6 sm:p-10">
          {isLoading || !article ? (
            <div className="space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-6 h-48" />
            </div>
          ) : (
            <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Link to={categoryHref(category)} className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-accent">
                <CategoryIcon category={category} size={24} />
                {category}
              </Link>
              <h1 className="mt-3 text-balance text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[36px]">{article.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-3">
                {article.updated_at && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" /> Mis à jour le {date(article.updated_at, "d MMMM yyyy")}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" /> {readingMinutes(body)} min de lecture
                </span>
                <CopyLink />
              </div>
              <div className="my-7 h-px bg-[var(--hairline)]" />
              <ArticleMarkdown className="text-[15.5px] leading-[1.75] [&_h2]:mt-9 [&_h2]:text-[21px] [&_h3]:mt-7 [&_h3]:text-[17px] [&_li]:pl-1">{body}</ArticleMarkdown>
            </motion.article>
          )}
        </Glass>

        {toc.length > 1 && (
          <aside className="hidden lg:sticky lg:top-8 lg:block">
            <div className="mb-2 flex items-center gap-1.5 px-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">
              <ListTree className="size-3.5" /> Sommaire
            </div>
            <nav className="space-y-0.5 border-l border-[var(--hairline-strong)]">
              {toc.map((h) => (
                <a key={h.id} href={`#${h.id}`} className={cn("-ml-px block border-l border-transparent py-1 text-[13px] text-fg-2 transition hover:border-[var(--accent)] hover:text-fg", h.level === 3 ? "pl-6" : "pl-3")}>
                  {h.text}
                </a>
              ))}
            </nav>
          </aside>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Dans la même rubrique</h2>
          <Glass radius="xl" className="grid gap-x-2 p-2 md:grid-cols-2">
            {related.map((a) => (
              <ArticleRow key={a.slug} item={a} showCategory={false} />
            ))}
          </Glass>
        </section>
      )}

      <ContactCard brand={brand} className="mt-10" />
    </>
  );
}

/** Public help center: `/aide` (home, search, categories) and `/aide/<slug>` (article). No session needed. */
export default function HelpCenter() {
  const slug = (useParams()["*"] ?? "").replace(/\/+$/, "");
  const { data: brand } = usePublicBranding();
  return (
    <PublicLayout
      width="lg"
      actions={
        slug ? (
          <Button asChild variant="glass" size="sm">
            <Link to="/aide">
              <ArrowLeft className="size-4" /> Toutes les rubriques
            </Link>
          </Button>
        ) : undefined
      }
    >
      {slug ? <HelpArticle key={slug} slug={slug} brand={brand} /> : <HelpHome brand={brand} />}
    </PublicLayout>
  );
}

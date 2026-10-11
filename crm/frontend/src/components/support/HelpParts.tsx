import { ArrowRight, BookOpen, ChevronRight, Mail, MessageCircleQuestion, Phone, Search, X } from "lucide-react";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { Glass, TiltCard } from "@/components/glass/Glass";
import type { PublicBranding } from "@/components/layout/PublicLayout";
import { Kbd, Spinner } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { categoryStyle, NO_CATEGORY } from "./kb";

export interface PublicKbItem {
  slug: string;
  title: string;
  category?: string | null;
  summary?: string | null;
}

export const categoryHref = (category: string) => `/aide?categorie=${encodeURIComponent(category)}`;

/** Case-insensitive highlight of the search terms. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-[4px] bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** The large search field of the help center (« / » focuses it). */
export function HelpSearchBox({ value, onChange, loading, autoFocus }: { value: string; onChange: (v: string) => void; loading?: boolean; autoFocus?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === "/" && !(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Glass variant="strong" radius="xl" className="flex h-16 items-center gap-3 px-5 shadow-[var(--glass-shadow-lg)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklab,var(--accent)_55%,transparent)]">
      <Search className="size-5 shrink-0 text-fg-3" />
      <input
        ref={input}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un article : facture, RGPD, import…"
        aria-label="Rechercher dans le centre d'aide"
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-3 sm:text-[17px]"
      />
      {loading && <Spinner className="size-4 text-fg-3" />}
      {value ? (
        <button type="button" onClick={() => onChange("")} className="rounded-full p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Effacer la recherche">
          <X className="size-4" />
        </button>
      ) : (
        <Kbd className="hidden sm:inline-flex">/</Kbd>
      )}
    </Glass>
  );
}

export function CategoryIcon({ category, size = 40 }: { category?: string | null; size?: number }) {
  const style = categoryStyle(category);
  const Icon = style.icon;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[13px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_10px_24px_-12px_rgba(0,0,0,.55)]" style={{ width: size, height: size, background: style.gradient }}>
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  );
}

export function CategoryCard({ name, items, onOpen }: { name: string; items: PublicKbItem[]; onOpen: () => void }) {
  return (
    <TiltCard className="flex h-full flex-col p-5" onClick={onOpen} max={5}>
      <div className="flex items-center gap-3">
        <CategoryIcon category={name} />
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em]">{name}</h3>
          <p className="text-[12.5px] text-fg-3">
            {items.length} article{items.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {items.slice(0, 3).map((a) => (
          <li key={a.slug}>
            <Link to={`/aide/${a.slug}`} onClick={(e) => e.stopPropagation()} className="group flex items-start gap-2 text-[13.5px] text-fg-2 hover:text-accent">
              <BookOpen className="mt-[3px] size-3.5 shrink-0 text-fg-3 group-hover:text-accent" />
              <span className="line-clamp-2">{a.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[12.5px] font-medium text-accent">
        {items.length > 3 ? `Voir les ${items.length} articles` : "Ouvrir la rubrique"} <ArrowRight className="size-3.5" />
      </span>
    </TiltCard>
  );
}

export function ArticleRow({ item, query = "", showCategory = true }: { item: PublicKbItem; query?: string; showCategory?: boolean }) {
  return (
    <Link to={`/aide/${item.slug}`} className="group flex items-center gap-4 rounded-[18px] px-4 py-3.5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
        <BookOpen className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-snug group-hover:text-accent">
          <Highlight text={item.title} query={query} />
        </span>
        {item.summary && (
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-fg-2">
            <Highlight text={item.summary} query={query} />
          </span>
        )}
        {showCategory && <span className="mt-1 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-fg-3">{item.category || NO_CATEGORY}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-4 flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-fg-3">
      {items.map((it, i) => (
        <Fragment key={`${it.label}-${i}`}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0" />}
          {it.to ? (
            <Link to={it.to} className="font-medium text-fg-2 transition hover:text-accent">
              {it.label}
            </Link>
          ) : (
            <span className="truncate">{it.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** « Vous ne trouvez pas votre réponse ? » with the organisation's contact details. */
export function ContactCard({ brand, className }: { brand?: PublicBranding; className?: string }) {
  const website = brand?.website ? (brand.website.startsWith("http") ? brand.website : `https://${brand.website}`) : null;
  const actions: ReactNode[] = [];
  if (brand?.email)
    actions.push(
      <a key="mail" href={`mailto:${brand.email}`} className="btn-primary inline-flex h-10 items-center gap-2 rounded-[13px] px-4 text-[14px] font-medium">
        <Mail className="size-4" /> Écrire au support
      </a>,
    );
  if (brand?.phone)
    actions.push(
      <a key="tel" href={`tel:${brand.phone.replace(/\s+/g, "")}`} className="glass-flat inline-flex h-10 items-center gap-2 rounded-[13px] px-4 text-[14px] font-medium text-fg hover:bg-white/60 dark:hover:bg-white/10">
        <Phone className="size-4" /> {brand.phone}
      </a>,
    );
  if (!actions.length && website)
    actions.push(
      <a key="web" href={website} target="_blank" rel="noreferrer" className="glass-flat inline-flex h-10 items-center gap-2 rounded-[13px] px-4 text-[14px] font-medium text-fg">
        Nous contacter <ArrowRight className="size-4" />
      </a>,
    );
  return (
    <Glass glow radius="xl" className={cn("flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center", className)}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-accent-soft text-accent">
        <MessageCircleQuestion className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Vous ne trouvez pas votre réponse ?</h3>
        <p className="mt-0.5 text-[13.5px] text-fg-2">L'équipe support{brand?.company ? ` de ${brand.company}` : ""} est là pour vous aider : décrivez-nous votre situation.</p>
      </div>
      {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Glass>
  );
}

import { Bold, Check, Code, Copy, ExternalLink, Eye, Heading2, Italic, Link2, List, ListOrdered, PenLine, Quote, Sparkles, Square, ThumbsUp, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/markdown";
import { Sheet, Tooltip, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { number, relative } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { KbArticle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { helpUrl } from "./KbInsert";
import { splitTitle, stripTitle } from "./kb";

interface Draft {
  title: string;
  category: string;
  status: "draft" | "published";
  summary: string;
  body: string;
}

const EMPTY: Draft = { title: "", category: "", status: "draft", summary: "", body: "" };

function toDraft(a?: KbArticle | null): Draft {
  if (!a) return EMPTY;
  return { title: a.title, category: a.category ?? "", status: a.status === "published" ? "published" : "draft", summary: a.summary ?? "", body: a.body ?? "" };
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        aria-label={label}
        className="flex size-8 items-center justify-center rounded-[9px] text-fg-2 transition hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function PublicLink({ article, dirtyTitle }: { article: KbArticle | null; dirtyTitle: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!article) return <span className="truncate text-[12.5px] text-fg-3">Enregistrez l'article pour obtenir son lien public.</span>;
  if (article.status !== "published") return <span className="truncate text-[12.5px] text-fg-3">Brouillon : invisible dans le centre d'aide.</span>;
  const url = helpUrl(article.slug);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copie impossible, sélectionnez le lien manuellement.");
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="glass-inset flex min-w-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12.5px]">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="truncate font-medium tabular">/aide/{article.slug}</span>
      </span>
      <IconButton label={copied ? "Lien copié" : "Copier le lien public"} size="sm" onClick={copy}>
        {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
      </IconButton>
      <IconButton label="Ouvrir dans le centre d'aide" size="sm" onClick={() => window.open(url, "_blank", "noopener")}>
        <ExternalLink className="size-4" />
      </IconButton>
      {dirtyTitle && <span className="hidden text-[11.5px] text-orange-600 xl:inline dark:text-orange-400">Le lien suivra le nouveau titre.</span>}
    </div>
  );
}

/** Large side sheet to write a help article: fields, AI drafting, markdown with live preview side by side. */
export function KbEditor({ open, onOpenChange, article, categories }: { open: boolean; onOpenChange: (o: boolean) => void; article?: KbArticle | null; categories: string[] }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [baseline, setBaseline] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<KbArticle | null>(null);
  const [topic, setTopic] = useState("");
  const [pane, setPane] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const ai = useAiGenerate();
  const confirm = useConfirm();
  const invalidate = useInvalidate();

  // Reset the form each time the sheet opens on another article.
  const key = `${open}-${article?.id ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    const d = toDraft(article);
    setDraft(d);
    setBaseline(d);
    setSaved(article ?? null);
    setTopic("");
    setPane("write");
  }
  if (!open && lastKey) setLastKey("");

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const requestClose = async () => {
    if (ai.loading) ai.stop();
    if (dirty && !(await confirm({ title: "Abandonner les modifications ?", description: "Les changements non enregistrés de cet article seront perdus.", confirmLabel: "Abandonner", danger: true }))) return;
    onOpenChange(false);
  };

  const generate = async () => {
    const subject = (topic || draft.title).trim();
    if (!subject) return toast.error("Indiquez le sujet de l'article (ou un titre).");
    setPane("preview");
    const fillTitle = !draft.title.trim();
    const apply = (full: string) => {
      const { title, body } = splitTitle(full);
      if (title && fillTitle) set("title", title);
      set("body", body);
    };
    const out = await ai.run("kb_article", { topic: subject }, apply);
    if (out) apply(out.trim());
  };

  const save = async () => {
    const payload = { title: draft.title.trim(), category: draft.category.trim() || null, status: draft.status, summary: draft.summary.trim() || null, body: draft.body };
    if (!payload.title) return toast.error("Donnez un titre à l'article.");
    setSaving(true);
    try {
      const row = saved ? await api.patch<KbArticle>(`/kb-articles/${saved.id}`, payload) : await api.post<KbArticle>("/kb-articles", payload);
      setSaved(row);
      const d = toDraft(row);
      setDraft(d);
      setBaseline(d);
      invalidate("kb-articles");
      toast.success(saved ? "Article enregistré" : "Article créé", row.status === "published" ? { description: `En ligne sur /aide/${row.slug}` } : { description: "Enregistré comme brouillon." });
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!saved) return;
    if (!(await confirm({ title: `Supprimer « ${saved.title} » ?`, description: "L'article disparaîtra du centre d'aide et les liens existants ne fonctionneront plus.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await api.delete(`/kb-articles/${saved.id}`);
      toast.success("Article supprimé");
      invalidate("kb-articles");
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    }
  };

  /** Wrap the selection (bold, italic, code, link). */
  const wrap = (before: string, after: string, placeholder: string) => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = draft.body.slice(s, e) || placeholder;
    set("body", draft.body.slice(0, s) + before + selected + after + draft.body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  /** Prefix each selected line (titles, lists, quotes). */
  const prefix = (make: (index: number) => string) => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const start = draft.body.lastIndexOf("\n", s - 1) + 1;
    const block = draft.body.slice(start, e) || "";
    const next = block
      .split("\n")
      .map((line, i) => make(i) + line.replace(/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/, ""))
      .join("\n");
    set("body", draft.body.slice(0, start) + next + draft.body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + next.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  };

  const dirtyTitle = !!saved && draft.title.trim() !== saved.title;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}
      width={1180}
      title={
        <span className="flex items-center gap-2">
          <PenLine className="size-4 text-accent" />
          {saved ? "Modifier l'article" : "Nouvel article"}
          {dirty && <span className="rounded-full bg-orange-500/12 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-300">Non enregistré</span>}
        </span>
      }
      footer={
        <>
          <div className="mr-auto min-w-0">
            <PublicLink article={saved} dirtyTitle={dirtyTitle} />
          </div>
          {saved && (
            <Button variant="ghost" className="text-red-500" icon={<Trash2 className="size-4" />} onClick={remove}>
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          )}
          <Button variant="ghost" onClick={requestClose}>
            Fermer
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {saved ? "Enregistrer" : "Créer l'article"}
          </Button>
        </>
      }
    >
      <div className="flex min-h-full flex-col gap-4" onKeyDown={onKeyDown}>
        <input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Titre de l'article" aria-label="Titre" className="w-full bg-transparent text-[24px] font-semibold tracking-[-0.02em] outline-none placeholder:text-fg-3" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Field label="Catégorie">
            <Input value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="Facturation, Compte, Intégrations…" list="kb-categories" />
            <datalist id="kb-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Résumé" hint="Affiché dans le centre d'aide et les résultats de recherche.">
            <Input value={draft.summary} onChange={(e) => set("summary", e.target.value)} placeholder="En une phrase, ce que l'article permet de faire" />
          </Field>
          <Field label="Statut">
            <Segmented
              value={draft.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "draft", label: "Brouillon" },
                { value: "published", label: "Publié" },
              ]}
            />
          </Field>
        </div>

        <div className="glass-inset rounded-[16px] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#b26bff]">
            <Sparkles className="size-3.5" /> Rédaction assistée par Iris
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder={draft.title ? `Sujet : ${draft.title}` : "Sujet de l'article : configurer le SSO, émettre un avoir…"}
              className="flex-1"
            />
            {ai.loading ? (
              <Button variant="glass" icon={<Square className="size-3.5" />} onClick={ai.stop}>
                Arrêter
              </Button>
            ) : (
              <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={generate}>
                Rédiger avec l'IA
              </Button>
            )}
          </div>
          {draft.body && !ai.loading && <p className="mt-1.5 text-[11.5px] text-fg-3">La génération remplace le contenu actuel.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="glass-flat flex items-center gap-0.5 rounded-[12px] p-1">
            <ToolButton label="Intertitre" onClick={() => prefix(() => "## ")}>
              <Heading2 className="size-4" />
            </ToolButton>
            <ToolButton label="Gras" onClick={() => wrap("**", "**", "texte en gras")}>
              <Bold className="size-4" />
            </ToolButton>
            <ToolButton label="Italique" onClick={() => wrap("_", "_", "texte en italique")}>
              <Italic className="size-4" />
            </ToolButton>
            <ToolButton label="Liste à puces" onClick={() => prefix(() => "- ")}>
              <List className="size-4" />
            </ToolButton>
            <ToolButton label="Liste numérotée" onClick={() => prefix((i) => `${i + 1}. `)}>
              <ListOrdered className="size-4" />
            </ToolButton>
            <ToolButton label="Citation / astuce" onClick={() => prefix(() => "> ")}>
              <Quote className="size-4" />
            </ToolButton>
            <ToolButton label="Code" onClick={() => wrap("`", "`", "code")}>
              <Code className="size-4" />
            </ToolButton>
            <ToolButton label="Lien" onClick={() => wrap("[", "](https://)", "texte du lien")}>
              <Link2 className="size-4" />
            </ToolButton>
          </div>
          <Segmented
            className="lg:hidden"
            value={pane}
            onChange={setPane}
            options={[
              { value: "write", label: "Écrire" },
              { value: "preview", label: "Aperçu" },
            ]}
          />
          <span className="hidden text-[11.5px] text-fg-3 lg:inline">Markdown · aperçu en direct · ⌘S pour enregistrer</span>
        </div>

        <div className="grid min-h-[420px] flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <textarea
            ref={area}
            value={draft.body}
            onChange={(e) => set("body", e.target.value)}
            aria-label="Contenu (markdown)"
            placeholder={"## Avant de commencer\n\nExpliquez le contexte…\n\n## Étapes\n\n1. Ouvrez…\n2. Cliquez sur…\n\n> Astuce : …"}
            className={cn(
              "min-h-[420px] w-full resize-none rounded-[16px] bg-[var(--field)] px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-fg outline-none ring-1 ring-inset ring-[var(--hairline-strong)] placeholder:text-fg-3 focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]",
              pane === "preview" && "hidden lg:block",
            )}
          />
          <div className={cn("glass-inset min-h-[420px] overflow-y-auto rounded-[16px] px-5 py-4", pane === "write" && "hidden lg:block")}>
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">
              <Eye className="size-3.5" /> Aperçu
            </div>
            {draft.title && <h1 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{draft.title}</h1>}
            {draft.body ? <Markdown streaming={ai.loading}>{stripTitle(draft.body, draft.title)}</Markdown> : <p className="text-[13px] text-fg-3">Le rendu de l'article s'affiche ici pendant que vous écrivez.</p>}
          </div>
        </div>

        {saved && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5" /> {number(saved.views)} vue{saved.views > 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ThumbsUp className="size-3.5" /> {number(saved.helpful)} « utile »
            </span>
            {saved.author && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={saved.author.name} color={(saved.author.color as string) ?? undefined} size={18} /> {saved.author.name}
              </span>
            )}
            <span>Modifié {relative(saved.updated_at)}</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

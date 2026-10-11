import { Bold, Braces, Heading2, Italic, Link2, List, ListOrdered, MailCheck, Minus, MousePointerClick, PenLine, Quote, Sparkles, Square, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useAiGenerate } from "@/components/ai/AiGenerate";
import { useAiStatus } from "@/components/ai/ChatView";
import { Panel } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { Menu, Tooltip, useConfirm } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { CAMPAIGN_VARIABLES, personalize, splitCampaignCopy, unknownVariables, type SampleContact } from "../campaign-utils";
import { EmailPreview, type EmailOrg } from "../EmailPreview";
import { CharCount, Callout } from "../ui";
import type { CampaignDraft } from "../useCampaignDraft";

type Target = "subject" | "preheader" | "body";
type Format = "bold" | "italic" | "h2" | "link" | "ul" | "ol" | "quote" | "cta" | "hr";

/** Applies a markdown format around the selection of a textarea and returns the new text + selection. */
function formatText(value: string, start: number, end: number, format: Format) {
  const sel = value.slice(start, end);
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const wrap = (before: string, after: string, placeholder: string) => {
    const inner = sel || placeholder;
    return { text: value.slice(0, start) + before + inner + after + value.slice(end), from: start + before.length, to: start + before.length + inner.length };
  };
  const prefix = (p: string) => ({ text: value.slice(0, lineStart) + p + value.slice(lineStart), from: start + p.length, to: end + p.length });
  const block = (snippet: string, selectFrom: number, selectLen: number) => {
    const pre = start > 0 && value[start - 1] !== "\n" ? "\n\n" : start > 1 && value[start - 2] !== "\n" ? "\n" : "";
    const text = value.slice(0, start) + pre + snippet + "\n\n" + value.slice(end);
    const from = start + pre.length + selectFrom;
    return { text, from, to: from + selectLen };
  };
  switch (format) {
    case "bold":
      return wrap("**", "**", "texte en gras");
    case "italic":
      return wrap("_", "_", "texte en italique");
    case "link":
      return sel ? { text: value.slice(0, start) + `[${sel}](https://)` + value.slice(end), from: start + sel.length + 3, to: start + sel.length + 11 } : wrap("[", "](https://)", "texte du lien");
    case "h2":
      return prefix("## ");
    case "ul":
      return prefix("- ");
    case "ol":
      return prefix("1. ");
    case "quote":
      return prefix("> ");
    case "cta": {
      const label = sel || "Je découvre l'offre →";
      return block(`[**${label}**](https://)`, 3, label.length);
    }
    case "hr":
      return block("---", 0, 0);
  }
}

const TOOLS: { format: Format; label: string; icon: ReactNode }[] = [
  { format: "h2", label: "Intertitre", icon: <Heading2 className="size-4" /> },
  { format: "bold", label: "Gras", icon: <Bold className="size-4" /> },
  { format: "italic", label: "Italique", icon: <Italic className="size-4" /> },
  { format: "link", label: "Lien", icon: <Link2 className="size-4" /> },
  { format: "ul", label: "Liste à puces", icon: <List className="size-4" /> },
  { format: "ol", label: "Liste numérotée", icon: <ListOrdered className="size-4" /> },
  { format: "quote", label: "Citation", icon: <Quote className="size-4" /> },
  { format: "cta", label: "Appel à l'action", icon: <MousePointerClick className="size-4" /> },
  { format: "hr", label: "Séparateur", icon: <Minus className="size-4" /> },
];

/* -------------------------------------------------------------------------- */
/* AI writer                                                                  */
/* -------------------------------------------------------------------------- */

function AiWriter({ audienceHint, hasContent, onCopy }: { audienceHint: string; hasContent: boolean; onCopy: (c: { subject: string; preheader: string; body: string }) => void }) {
  const ai = useAiGenerate();
  const status = useAiStatus();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(!hasContent);
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState(audienceHint);
  const configured = status.data?.configured !== false;

  const run = async () => {
    if (!brief.trim()) return;
    if (hasContent && !(await confirm({ title: "Remplacer le contenu actuel ?", description: "L'objet, le pré-en-tête et le message seront réécrits par Iris. Vous pourrez ensuite les modifier librement.", confirmLabel: "Rédiger" }))) return;
    const full = await ai.run("campaign_copy", { brief: brief.trim(), audience: audience.trim() || undefined }, (text) => {
      const copy = splitCampaignCopy(text);
      if (copy) onCopy(copy);
    });
    const copy = full ? splitCampaignCopy(full) : null;
    if (copy) onCopy(copy);
  };

  return (
    <div className="glass ai-border overflow-hidden rounded-[22px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="ai-gradient flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-[0_8px_20px_-8px_rgba(178,107,255,.8)]">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Rédiger avec Iris</span>
          <span className="block truncate text-[12px] text-fg-3">Décrivez votre message : Iris propose l'objet, le pré-en-tête et le corps.</span>
        </span>
        {ai.loading ? <span className="text-[12px] font-medium text-[#b26bff]">Rédaction…</span> : <span className="text-[12px] font-medium text-fg-3">{open ? "Masquer" : "Ouvrir"}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 pb-4 pt-3">
              {!configured && (
                <Callout tone="warning" action={<Button size="sm" onClick={() => navigate("/settings?tab=ai")}>Configurer</Button>}>
                  Aucun fournisseur d'IA n'est configuré : ajoutez-en un dans Paramètres › IA pour utiliser Iris.
                </Callout>
              )}
              <Field label="Brief">
                <Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ex. : inviter nos clients au webinar du 14 novembre sur la facturation électronique 2026, inscription gratuite, 45 minutes." />
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Cible">
                  <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex. : DAF de PME clientes" />
                </Field>
                {ai.loading ? (
                  <Button variant="glass" icon={<Square className="size-3.5" />} onClick={ai.stop}>
                    Arrêter
                  </Button>
                ) : (
                  <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={run} disabled={!brief.trim() || !configured}>
                    Rédiger
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step                                                                       */
/* -------------------------------------------------------------------------- */

export function ContentStep({
  draft,
  editable,
  patch,
  sample,
  org,
  sender,
  audienceHint,
  samples,
  onSampleChange,
}: {
  draft: CampaignDraft;
  editable: boolean;
  patch: (p: Partial<CampaignDraft>) => void;
  sample: SampleContact;
  org: EmailOrg;
  sender: { name: string; email: string };
  audienceHint: string;
  samples?: { id: number; name: string }[];
  onSampleChange?: (id: number) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const preheaderRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<Target>("body");
  const unknown = unknownVariables(draft.subject, draft.preheader, draft.body);

  const restore = (el: HTMLInputElement | HTMLTextAreaElement | null, from: number, to: number) =>
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from, to);
    });

  const applyFormat = (format: Format) => {
    const el = bodyRef.current;
    if (!el) return;
    const r = formatText(draft.body, el.selectionStart, el.selectionEnd, format);
    patch({ body: r.text });
    restore(el, r.from, r.to);
  };

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const target = lastFocus.current;
    const el = target === "body" ? bodyRef.current : target === "subject" ? subjectRef.current : preheaderRef.current;
    const value = draft[target];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    patch(target === "subject" ? { subject: next } : target === "preheader" ? { preheader: next } : { body: next });
    restore(el, start + token.length, start + token.length);
  };

  const variablesMenu = (
    <Menu
      align="end"
      width={250}
      trigger={
        <Button variant="ghost" size="xs" icon={<Braces className="size-3.5" />} disabled={!editable}>
          Variables
        </Button>
      }
      items={CAMPAIGN_VARIABLES.map((v) => ({ label: <span className="flex w-full items-center justify-between gap-3">{v.label}<code className="text-[11px] text-fg-3">{`{{${v.key}}}`}</code></span>, onSelect: () => insertVariable(v.key) }))}
    />
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        {editable && <AiWriter audienceHint={audienceHint} hasContent={!!(draft.subject || draft.body)} onCopy={(c) => patch({ subject: c.subject || draft.subject, preheader: c.preheader, body: c.body })} />}

        <Panel title="Expéditeur et objet" icon={<PenLine className="size-4" />} actions={variablesMenu}>
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nom de l'expéditeur">
                <Input value={draft.from_name} onChange={(e) => patch({ from_name: e.target.value })} placeholder={sender.name || "Votre entreprise"} disabled={!editable} />
              </Field>
              <Field label="Email de l'expéditeur">
                <Input type="email" value={draft.from_email} onChange={(e) => patch({ from_email: e.target.value })} placeholder={sender.email || "Adresse des paramètres d'envoi"} disabled={!editable} />
              </Field>
            </div>
            <Field label="Objet" required action={<CharCount value={personalize(draft.subject, sample)} ideal={50} max={70} />} hint="Idéal : moins de 50 caractères (variables remplacées) pour rester lisible sur mobile.">
              <Input ref={subjectRef} value={draft.subject} onFocus={() => (lastFocus.current = "subject")} onChange={(e) => patch({ subject: e.target.value })} placeholder="Ex. : {{contact.first_name}}, votre invitation pour le 14 novembre" disabled={!editable} />
            </Field>
            <Field label="Pré-en-tête" action={<CharCount value={personalize(draft.preheader, sample)} ideal={90} max={130} />} hint="Le texte d'aperçu affiché après l'objet dans la boîte de réception.">
              <Input ref={preheaderRef} value={draft.preheader} onFocus={() => (lastFocus.current = "preheader")} onChange={(e) => patch({ preheader: e.target.value })} placeholder="Ex. : 45 minutes pour tout comprendre — places limitées." disabled={!editable} />
            </Field>
          </div>
        </Panel>

        <Panel title="Message" description="Markdown simple : intertitres, listes, liens et boutons d'appel à l'action." bodyClassName="px-5 pb-5 pt-2">
          {editable && (
            <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded-[12px] bg-black/[0.03] p-1 dark:bg-white/[0.04]">
              {TOOLS.map((t) => (
                <Tooltip key={t.format} content={t.label}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat(t.format)} className="flex size-8 items-center justify-center rounded-[9px] text-fg-2 transition hover:bg-white/70 hover:text-fg dark:hover:bg-white/10" aria-label={t.label}>
                    {t.icon}
                  </button>
                </Tooltip>
              ))}
              <span className="mx-1 h-5 w-px bg-[var(--hairline-strong)]" />
              {CAMPAIGN_VARIABLES.slice(0, 2).map((v) => (
                <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(v.key)} className="h-8 rounded-[9px] px-2 text-[12px] font-medium text-accent transition hover:bg-accent-soft">
                  + {v.label}
                </button>
              ))}
            </div>
          )}
          <Textarea
            ref={bodyRef}
            rows={18}
            value={draft.body}
            onFocus={() => (lastFocus.current = "body")}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder={"Bonjour {{contact.first_name}},\n\nVotre message…\n\n[Découvrir l'offre →](https://)"}
            className="min-h-[320px] font-[450] leading-[1.65]"
            disabled={!editable}
          />
          {unknown.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-[12px] bg-amber-400/12 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Variable{unknown.length > 1 ? "s" : ""} inconnue{unknown.length > 1 ? "s" : ""} : {unknown.map((u) => `{{${u}}}`).join(", ")} — {unknown.length > 1 ? "elles seront remplacées" : "elle sera remplacée"} par un texte vide.
              </span>
            </div>
          )}
          <Callout tone="privacy" className="mt-3" icon={<MailCheck className="size-[18px]" />}>
            Le <b className="font-semibold text-fg">lien de désinscription</b> et l'identité de votre entreprise sont ajoutés automatiquement en pied de chaque email (obligation légale) : inutile de les écrire.
          </Callout>
        </Panel>
      </div>

      <div className={cn("min-w-0 xl:sticky xl:top-[88px]")}>
        <Panel title="Aperçu en direct" description="Tel qu'il apparaîtra dans la boîte de réception" bodyClassName="px-4 pb-4 pt-3 sm:px-5">
          <EmailPreview content={{ fromName: draft.from_name || sender.name || org.name, fromEmail: draft.from_email || sender.email, subject: draft.subject, preheader: draft.preheader, body: draft.body }} sample={sample} org={org} samples={samples} onSampleChange={onSampleChange} />
        </Panel>
      </div>
    </div>
  );
}

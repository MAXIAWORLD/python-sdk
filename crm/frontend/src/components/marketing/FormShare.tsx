import { ChevronDown, Code2, Download, ExternalLink, Inbox, Link2, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/display";
import { Input } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { toastError, useList } from "@/lib/hooks";
import type { FormField, LeadForm, Paginated, Ref } from "@/lib/types";
import { cn, downloadBlob } from "@/lib/utils";
import { embedCode, publicFormUrl } from "./form-utils";
import { Callout, CopyButton, SectionTitle } from "./ui";

/* -------------------------------------------------------------------------- */
/* Share                                                                      */
/* -------------------------------------------------------------------------- */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function FormShare({ form, slug, active, onSlug, onActivate }: { form: LeadForm; slug: string; active: boolean; onSlug: (s: string) => void; onActivate: () => void }) {
  const url = publicFormUrl(form.slug);
  const code = embedCode(form);
  const slugChanged = slug !== form.slug;
  return (
    <div className="space-y-6">
      {!active && (
        <Callout tone="warning" title="Formulaire désactivé" action={<Button size="sm" onClick={onActivate}>Activer</Button>}>
          Le lien public affiche « Formulaire indisponible » et n'accepte aucune réponse.
        </Callout>
      )}
      <section>
        <SectionTitle hint="À partager par email, sur vos réseaux ou dans une signature.">Lien public</SectionTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="glass-inset flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[12px] px-3 text-[13px]">
            <Link2 className="size-4 shrink-0 text-accent" />
            <span className="truncate font-mono text-[12.5px]">{url}</span>
          </div>
          <div className="flex gap-2">
            <CopyButton value={url} variant="glass" toastMessage="Lien copié" />
            <Button variant="glass" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Ouvrir
              </a>
            </Button>
          </div>
        </div>
      </section>
      <section>
        <SectionTitle hint="Lettres minuscules, chiffres et tirets. Changer l'adresse invalide les anciens liens.">Adresse du formulaire</SectionTitle>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[12.5px] text-fg-3">/f/</span>
          <Input value={slug} onChange={(e) => onSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} className="font-mono text-[13px]" aria-invalid={!SLUG_RE.test(slug)} />
        </div>
        {!SLUG_RE.test(slug) ? <p className="mt-1.5 text-[12px] text-red-500">Adresse invalide : utilisez uniquement a-z, 0-9 et des tirets.</p> : slugChanged ? <p className="mt-1.5 text-[12px] text-amber-600 dark:text-amber-300">Enregistrez pour appliquer la nouvelle adresse.</p> : null}
      </section>
      <section>
        <SectionTitle hint="Collez ce code dans votre site (WordPress, Webflow, Wix…). Le formulaire s'adapte à la largeur disponible.">Intégration sur votre site</SectionTitle>
        <div className="relative overflow-hidden rounded-[16px] bg-[#0b0e1a] ring-1 ring-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2 text-[11.5px] text-[#9aa3d6]">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="size-3.5" /> HTML
            </span>
            <CopyButton value={code} size="xs" variant="ghost" label="Copier le code" className="text-[#c9d1ff] hover:bg-white/10 hover:text-white" toastMessage="Code d'intégration copié" />
          </div>
          <pre className="whitespace-pre-wrap break-all p-3.5 text-[12px] leading-relaxed text-[#c9d1ff]">
            <code>{code}</code>
          </pre>
        </div>
      </section>
      <Callout tone="privacy" icon={<ShieldCheck className="size-[18px]" />} title="Conforme par conception">
        Case de consentement non pré-cochée, mention d'information RGPD, preuve du consentement horodatée (date, IP, libellé) dans le registre, champ piège anti-robots et limitation des envois.
      </Callout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

interface Submission {
  id: number;
  created_at: string;
  form_id: number;
  contact_id?: number | null;
  contact?: Ref | null;
  data: Record<string, unknown>;
  referrer?: string | null;
}

const PAGE = 20;

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function FormSubmissions({ form, fields }: { form: LeadForm; fields: FormField[] }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = useList<Submission>("form-submissions", { form_id: form.id, sort: "-created_at", limit: PAGE, offset: page * PAGE });
  const rows = data?.items ?? [];
  const labels = Object.fromEntries(fields.map((f) => [f.name, f.label]));
  const keysOf = (s: Submission) => Object.keys(s.data ?? {});

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.get<Paginated<Submission>>("/form-submissions", { form_id: form.id, sort: "-created_at", limit: 1000 });
      const names = [...new Set([...fields.map((f) => f.name), ...all.items.flatMap(keysOf)])];
      const header = ["Date", "Contact", ...names.map((n) => labels[n] ?? n), "Page d'origine"];
      const lines = all.items.map((s) => [dateTime(s.created_at), s.contact?.name ?? "", ...names.map((n) => s.data?.[n] ?? ""), s.referrer ?? ""].map(csvCell).join(";"));
      downloadBlob(new Blob(["﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" }), `reponses-${form.slug}.csv`);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-[16px]" />
        ))}
      </div>
    );

  if (!rows.length)
    return (
      <EmptyState
        icon={<Inbox className="size-6" />}
        title="Aucune réponse enregistrée"
        description={form.submissions ? `Le compteur indique ${form.submissions} soumission(s), mais aucun détail n'est conservé pour ce formulaire.` : "Partagez le lien ou intégrez le formulaire à votre site : chaque réponse crée ou met à jour un contact."}
      />
    );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg-2">
          <b className="font-semibold text-fg tabular">{data?.total}</b> réponse{(data?.total ?? 0) > 1 ? "s" : ""}
        </span>
        <Button size="sm" variant="glass" icon={<Download className="size-3.5" />} loading={exporting} onClick={exportCsv}>
          Exporter (CSV)
        </Button>
      </div>
      <div className="space-y-1.5">
        {rows.map((s) => {
          const keys = keysOf(s);
          const preview = keys
            .map((k) => s.data[k])
            .filter((v) => v !== "" && v !== null && v !== undefined)
            .slice(0, 3)
            .join(" · ");
          const expanded = open === s.id;
          return (
            <div key={s.id} className="rounded-[16px] bg-black/[0.025] dark:bg-white/[0.035]">
              <button type="button" onClick={() => setOpen(expanded ? null : s.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={expanded}>
                <Avatar name={s.contact?.name ?? "?"} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{s.contact?.name ?? "Contact supprimé"}</span>
                  <span className="block truncate text-[12px] text-fg-3">{preview || "—"}</span>
                </span>
                <span className="shrink-0 text-[11.5px] text-fg-3" title={dateTime(s.created_at)}>
                  {relative(s.created_at)}
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", expanded && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-[var(--hairline)] px-3.5 py-3 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)]">
                      {keys.map((k) => (
                        <div key={k} className="contents">
                          <dt className="text-fg-3">{labels[k] ?? k}</dt>
                          <dd className="whitespace-pre-wrap break-words">{String(s.data[k] ?? "") || "—"}</dd>
                        </div>
                      ))}
                      <dt className="text-fg-3">Reçue le</dt>
                      <dd>{dateTime(s.created_at)}</dd>
                      {s.referrer && (
                        <>
                          <dt className="text-fg-3">Page d'origine</dt>
                          <dd className="truncate">{s.referrer}</dd>
                        </>
                      )}
                    </dl>
                    {s.contact && (
                      <div className="px-3.5 pb-3">
                        <Link to={`/contacts/${s.contact.id}`} className="text-[12.5px] font-medium text-accent hover:underline">
                          Ouvrir la fiche contact →
                        </Link>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      {data && data.total > PAGE && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-fg-2">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Précédentes
          </Button>
          <span className="tabular">
            {page + 1} / {Math.ceil(data.total / PAGE)}
          </span>
          <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>
            Suivantes
          </Button>
        </div>
      )}
    </div>
  );
}

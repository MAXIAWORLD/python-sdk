import { Package, Sparkles, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { extractJson, useAiGenerate } from "@/components/ai/AiGenerate";
import { useAiStatus } from "@/components/ai/ChatView";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { Checkbox, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { money } from "@/lib/format";
import type { LineItem } from "@/lib/types";
import { uid } from "@/lib/utils";
import { computeTotals, formatDecimal, round2, vatLabel } from "./lib";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Turn Iris' ```json block into editor lines (tolerates `{lines: [...]}` and loose numbers). */
function parseProposal(text: string, defaultVat: number): LineItem[] | null {
  const data = extractJson<unknown>(text);
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.lines) ? data.lines : null;
  if (!rows) return null;
  return rows.filter(isRecord).flatMap((r): LineItem[] => {
    const description = typeof r.description === "string" ? r.description.trim() : "";
    if (!description) return [];
    return [
      {
        id: uid(),
        type: "item",
        product_id: typeof r.product_id === "number" ? r.product_id : null,
        description,
        details: typeof r.details === "string" && r.details.trim() ? r.details.trim() : null,
        quantity: toNumber(r.quantity, 1),
        unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "unité",
        unit_price: toNumber(r.unit_price, 0),
        vat_rate: toNumber(r.vat_rate, defaultVat),
        discount: 0,
      },
    ];
  });
}

export function AiLinesDialog({ open, onOpenChange, defaultBrief, defaultVat, franchise, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; defaultBrief: string; defaultVat: number; franchise: boolean; onAdd: (lines: LineItem[]) => void }) {
  const ai = useAiGenerate();
  const status = useAiStatus();
  const unavailable = status.data ? !status.data.configured : false;
  const [brief, setBrief] = useState(defaultBrief);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setBrief(defaultBrief);
      setExcluded([]);
      ai.setText("");
    }
  }

  const proposal = useMemo(() => (ai.loading || !ai.text ? null : parseProposal(ai.text, defaultVat)), [ai.loading, ai.text, defaultVat]);
  const chosen = (proposal ?? []).filter((l) => !excluded.includes(l.id ?? ""));
  const totals = computeTotals(chosen, 0, { franchise, defaultVat });
  const failed = !ai.loading && !!ai.text && (!proposal || proposal.length === 0);

  const generate = () => {
    setExcluded([]);
    ai.run("quote_lines", { brief: brief.trim() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) ai.stop();
        onOpenChange(o);
      }}
      size="lg"
      icon={<Sparkles className="size-5" />}
      title="Proposer des lignes avec Iris"
      description="Décrivez le besoin du client : Iris compose les lignes en s'appuyant sur votre catalogue et vos tarifs. Vous validez avant ajout."
      footer={
        <>
          {proposal && proposal.length > 0 && (
            <span className="mr-auto text-[12.5px] text-fg-2">
              Total sélectionné : <b className="font-semibold text-fg tabular">{money(totals.linesTotal)} HT</b>
            </span>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!chosen.length || ai.loading}
            onClick={() => {
              onAdd(chosen);
              onOpenChange(false);
            }}
          >
            Ajouter {chosen.length > 0 ? `${chosen.length} ligne${chosen.length > 1 ? "s" : ""}` : "les lignes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="glass-inset rounded-[18px] p-3">
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="Ex. : refonte du site vitrine (5 pages), intégration d'un CMS, 2 jours de formation de l'équipe et maintenance sur 12 mois."
            className="border-0 bg-transparent ring-0 hover:bg-transparent focus:bg-transparent focus:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && brief.trim()) generate();
            }}
          />
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <span className="text-[11.5px] text-fg-3">⌘ / Ctrl + Entrée pour lancer</span>
            <Button variant="ai" size="sm" icon={<Wand2 className="size-3.5" />} loading={ai.loading} disabled={!brief.trim() || unavailable} onClick={generate}>
              {proposal ? "Régénérer" : "Proposer"}
            </Button>
          </div>
        </div>

        {unavailable && (
          <p className="rounded-[14px] bg-violet-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-fg-2">
            Iris n'est pas encore connectée à un modèle d'IA.{" "}
            <Link to="/settings?tab=ai" className="font-semibold text-accent hover:underline">
              Configurer un fournisseur dans Paramètres › IA
            </Link>
          </p>
        )}

        <AnimatePresence mode="wait">
          {ai.loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#b26bff]">
                <Sparkles className="size-3.5 animate-pulse" /> Iris analyse le besoin et votre catalogue…
              </div>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 rounded-[14px]" />
              ))}
            </motion.div>
          )}
          {failed && (
            <motion.p key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[14px] bg-orange-500/10 px-3.5 py-3 text-[13px] text-orange-700 dark:text-orange-300">
              La réponse d'Iris n'a pas pu être transformée en lignes. Précisez le besoin (prestations, quantités) puis relancez.
            </motion.p>
          )}
          {proposal && proposal.length > 0 && (
            <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
              {proposal.map((line, i) => {
                const on = !excluded.includes(line.id ?? "");
                const total = round2((line.quantity ?? 1) * (line.unit_price ?? 0));
                return (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`flex items-start gap-3 rounded-[14px] px-3 py-2.5 transition ${on ? "bg-black/[0.03] dark:bg-white/[0.045]" : "opacity-50"}`}
                  >
                    <Checkbox checked={on} onChange={(v) => setExcluded((x) => (v ? x.filter((id) => id !== line.id) : [...x, line.id ?? ""]))} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[13.5px] font-medium">
                        {line.product_id ? <Package className="size-3.5 shrink-0 text-accent" aria-label="Produit du catalogue" /> : null}
                        <span className="truncate">{line.description}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-fg-3 tabular">
                        {formatDecimal(line.quantity ?? 1)} {line.unit} × {money(line.unit_price)} HT{franchise ? "" : ` · TVA ${vatLabel(line.vat_rate ?? defaultVat)}`}
                      </div>
                    </div>
                    <span className="shrink-0 text-[13.5px] font-semibold tabular">{money(total)}</span>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Dialog>
  );
}

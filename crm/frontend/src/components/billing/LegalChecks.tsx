import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { Panel } from "@/components/data/blocks";
import { Badge, Skeleton } from "@/components/ui/display";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface LegalCheckResult {
  errors: string[];
  warnings: string[];
}

/** GET /invoices/{id}/checks — keyed under "invoices" so any invoice change refreshes it. */
export function useInvoiceChecks(id: number | null | undefined, version?: string) {
  return useQuery({
    queryKey: ["invoices", "checks", id, version],
    queryFn: () => api.get<LegalCheckResult>(`/invoices/${id}/checks`),
    enabled: !!id,
    placeholderData: (prev) => prev,
  });
}

export type FixTarget = "doc-buyer" | "doc-lines" | "doc-due";

interface Fix {
  label: string;
  to?: string;
  anchor?: FixTarget;
}

/** Map a backend message to the place where it can be fixed. */
export function fixFor(message: string, companyId?: number | null): Fix | null {
  if (/client manquant/i.test(message)) return { label: "Choisir le client", anchor: "doc-buyer" };
  if (/(du client|client «|client établi)/i.test(message)) return companyId ? { label: "Fiche client", to: `/companies/${companyId}` } : { label: "Choisir le client", anchor: "doc-buyer" };
  if (/(Paramètres › Entreprise|votre entreprise|capital social|RCS|franchise en base)/i.test(message)) return { label: "Paramètres › Entreprise", to: "/settings?tab=company" };
  if (/ligne/i.test(message)) return { label: "Voir les lignes", anchor: "doc-lines" };
  if (/délai de paiement/i.test(message)) return { label: "Modifier l'échéance", anchor: "doc-due" };
  return null;
}

export function scrollToAnchor(anchor: FixTarget) {
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 4px color-mix(in oklab, var(--accent) 35%, transparent)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1400, easing: "ease-out" });
}

function FixLink({ fix, onFix }: { fix: Fix; onFix?: () => void }) {
  const cls = "mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:underline";
  if (fix.to)
    return (
      <Link to={fix.to} onClick={onFix} className={cls}>
        {fix.label} <ArrowRight className="size-3" />
      </Link>
    );
  return (
    <button
      type="button"
      className={cls}
      onClick={() => {
        onFix?.();
        // Let a surrounding dialog close before scrolling the document.
        if (fix.anchor) window.setTimeout(() => scrollToAnchor(fix.anchor as FixTarget), onFix ? 260 : 0);
      }}
    >
      {fix.label} <ArrowRight className="size-3" />
    </button>
  );
}

export function CheckList({ result, companyId, onFix }: { result: LegalCheckResult; companyId?: number | null; onFix?: () => void }) {
  return (
    <ul className="space-y-1.5">
      {result.errors.map((m) => {
        const fix = fixFor(m, companyId);
        return (
          <motion.li key={`e-${m}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5 rounded-[14px] bg-red-500/[0.08] px-3 py-2.5 text-[12.5px] leading-snug">
            <XCircle className="mt-px size-4 shrink-0 text-red-500" />
            <div className="min-w-0">
              <div className="text-fg">{m}</div>
              {fix && <FixLink fix={fix} onFix={onFix} />}
            </div>
          </motion.li>
        );
      })}
      {result.warnings.map((m) => {
        const fix = fixFor(m, companyId);
        return (
          <motion.li key={`w-${m}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5 rounded-[14px] bg-amber-400/[0.12] px-3 py-2.5 text-[12.5px] leading-snug">
            <AlertTriangle className="mt-px size-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <div className="text-fg">{m}</div>
              {fix && <FixLink fix={fix} onFix={onFix} />}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Mandatory mentions & blocking errors before issuing (Code de commerce art. L441-9, CGI art. 242 nonies A). */
export function LegalChecksPanel({ result, loading, stale, companyId, onRefresh, saved = true }: { result?: LegalCheckResult; loading?: boolean; stale?: boolean; companyId?: number | null; onRefresh?: () => void; saved?: boolean }) {
  const errors = result?.errors.length ?? 0;
  const warnings = result?.warnings.length ?? 0;
  return (
    <Panel
      title="Contrôles légaux"
      icon={<ShieldCheck className="size-4" />}
      actions={
        <div className="flex items-center gap-1.5">
          {result && errors > 0 && <Badge tone="red">{errors} bloquant{errors > 1 ? "s" : ""}</Badge>}
          {result && warnings > 0 && <Badge tone="yellow">{warnings}</Badge>}
          {onRefresh && saved && (
            <button type="button" onClick={onRefresh} className="rounded-full p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Relancer les contrôles" title="Relancer les contrôles">
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </button>
          )}
        </div>
      }
    >
      {!saved ? (
        <p className="text-[12.5px] text-fg-3">Enregistrez le brouillon pour vérifier les mentions obligatoires.</p>
      ) : !result ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-[14px]" />
          <Skeleton className="h-10 rounded-[14px]" />
        </div>
      ) : errors + warnings === 0 ? (
        <div className="flex items-start gap-2.5 rounded-[14px] bg-emerald-500/[0.09] px-3 py-3 text-[12.5px]">
          <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-500" />
          <div>
            <div className="font-semibold text-emerald-700 dark:text-emerald-300">Mentions obligatoires présentes</div>
            <div className="mt-0.5 text-fg-2">Identités, SIREN, TVA, adresses, lignes et délai de paiement sont conformes.</div>
          </div>
        </div>
      ) : (
        <CheckList result={result} companyId={companyId} />
      )}
      {stale && saved && <p className="mt-3 text-[11.5px] text-fg-3">Basé sur la dernière version enregistrée.</p>}
    </Panel>
  );
}

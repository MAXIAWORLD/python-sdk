import { useMutation } from "@tanstack/react-query";
import { Fingerprint, Link2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { dateTime, plural } from "@/lib/format";
import { errorMessage } from "@/lib/hooks";
import { copyText, shortHash } from "./lib";

interface IntegrityResult {
  ok: boolean;
  count: number;
  broken: { id: number; number: string }[];
  last_hash: string;
  checked_at: string;
}

/** Recompute the SHA-256 chain of every issued invoice and credit note (GET /invoices/integrity). */
export function IntegrityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const check = useMutation({ mutationFn: () => api.get<IntegrityResult>("/invoices/integrity") });
  const { mutate, reset } = check;
  useEffect(() => {
    if (open) mutate();
    else reset();
  }, [open, mutate, reset]);
  const r = check.data;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Fingerprint className="size-5" />}
      title="Intégrité du registre des factures"
      description="Chaque pièce émise est scellée par une empreinte SHA-256 qui inclut celle de la pièce précédente : toute altération a posteriori rompt la chaîne."
      footer={
        <>
          <Button variant="ghost" icon={<RefreshCw className="size-4" />} loading={check.isPending} onClick={() => check.mutate()}>
            Revérifier
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </>
      }
    >
      <AnimatePresence mode="wait">
        {check.isPending && (
          <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <Skeleton className="h-24 rounded-[20px]" />
            <Skeleton className="h-10 rounded-[14px]" />
          </motion.div>
        )}
        {check.isError && (
          <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[14px] bg-red-500/10 px-3.5 py-3 text-[13px] text-red-700 dark:text-red-300">
            {errorMessage(check.error)}
          </motion.p>
        )}
        {r && !check.isPending && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3">
            <div className={`flex items-center gap-4 rounded-[22px] p-4 ring-1 ring-inset ${r.ok ? "bg-emerald-500/[0.08] ring-emerald-500/25" : "bg-red-500/[0.08] ring-red-500/30"}`}>
              <motion.span initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className={`flex size-14 shrink-0 items-center justify-center rounded-[18px] text-white ${r.ok ? "bg-[linear-gradient(135deg,#1baf7a,#34d399)]" : "bg-[linear-gradient(135deg,#ff453a,#ff9f0a)]"}`}>
                {r.ok ? <ShieldCheck className="size-7" /> : <ShieldAlert className="size-7" />}
              </motion.span>
              <div className="min-w-0">
                <div className={`text-[16px] font-semibold ${r.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{r.ok ? "Chaîne intègre" : "Rupture de la chaîne détectée"}</div>
                <div className="text-[13px] text-fg-2">
                  {r.count ? `${plural(r.count, "pièce émise vérifiée", "pièces émises vérifiées")} (factures et avoirs)` : "Aucune pièce émise pour l'instant."}
                  {!r.ok && ` · ${plural(r.broken.length, "pièce altérée", "pièces altérées")}`}
                </div>
              </div>
            </div>
            {!r.ok && (
              <div className="space-y-1">
                {r.broken.map((b) => (
                  <Link key={b.id} to={`/invoices/${b.id}`} onClick={() => onOpenChange(false)} className="flex items-center justify-between rounded-[12px] bg-red-500/[0.06] px-3 py-2 text-[13px] font-medium hover:bg-red-500/[0.1]">
                    {b.number || `Pièce #${b.id}`}
                    <span className="text-[12px] text-red-600 dark:text-red-400">empreinte invalide</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="glass-inset space-y-1.5 rounded-[16px] px-3.5 py-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-fg-3">
                  <Link2 className="size-3.5" /> Dernière empreinte
                </span>
                <button type="button" onClick={() => copyText(r.last_hash, "Empreinte copiée")} className="font-mono text-[12px] text-fg-2 hover:text-fg" title="Copier l'empreinte complète">
                  {shortHash(r.last_hash, 12, 8)}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-3">Vérifiée le</span>
                <span className="text-fg-2">{dateTime(r.checked_at)}</span>
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-fg-3">Contrôle technique d'inaltérabilité fourni par Prisme ; il ne constitue pas une certification. Vous restez responsable de la conservation de vos factures (10 ans).</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}

import { Check, Copy, FileSearch, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { usePublicBranding } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Copy to clipboard                                                          */
/* -------------------------------------------------------------------------- */

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Clipboard API unavailable (insecure context, old browser): legacy fallback.
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function CopyButton({ value, label, message, className }: { value: string; label: string; message: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={`Copier ${label}`}
      title={`Copier ${label}`}
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true);
          toast.success(message);
        } else toast.error("Copie impossible : sélectionnez le texte manuellement.");
      }}
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors",
        copied ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-fg-3 hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={copied ? "ok" : "copy"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Status banner                                                              */
/* -------------------------------------------------------------------------- */

export type BannerTone = "accent" | "green" | "red" | "orange" | "gray" | "violet";

const BANNER: Record<BannerTone, { box: string; icon: string }> = {
  accent: { box: "bg-accent-soft ring-[color-mix(in_oklab,var(--accent)_28%,transparent)]", icon: "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white" },
  green: { box: "bg-emerald-500/[0.09] ring-emerald-500/25", icon: "bg-emerald-500 text-white" },
  red: { box: "bg-red-500/[0.08] ring-red-500/25", icon: "bg-red-500 text-white" },
  orange: { box: "bg-orange-500/[0.09] ring-orange-500/25", icon: "bg-orange-500 text-white" },
  violet: { box: "bg-violet-500/[0.09] ring-violet-500/25", icon: "bg-violet-500 text-white" },
  gray: { box: "bg-black/[0.035] ring-[var(--hairline-strong)] dark:bg-white/[0.05]", icon: "bg-zinc-500 text-white" },
};

export function StatusBanner({ tone, icon, title, description, action }: { tone: BannerTone; icon: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  const t = BANNER[tone];
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={cn("no-print flex flex-col gap-3 rounded-[20px] px-4 py-3.5 ring-1 ring-inset backdrop-blur-xl sm:flex-row sm:items-center", t.box)} role="status">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full shadow-[0_6px_16px_-6px_rgba(0,0,0,.45)]", t.icon)}>{icon}</span>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold leading-snug">{title}</div>
          {description && <div className="mt-0.5 text-[13px] text-fg-2">{description}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 pl-12 sm:pl-0">{action}</div>}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading & error states                                                     */
/* -------------------------------------------------------------------------- */

export function DocSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Glass radius="xl" className="space-y-6 p-6 sm:p-10">
        <div className="flex justify-between gap-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="size-12 rounded-[14px]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-[16px]" />
          <Skeleton className="h-28 rounded-[16px]" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="ml-auto h-36 w-full rounded-[18px] sm:w-[340px]" />
      </Glass>
      <div className="order-first space-y-4 lg:order-none">
        <Skeleton className="h-56 rounded-[24px]" />
      </div>
    </div>
  );
}

export function DocError({ error, kind, onRetry }: { error: unknown; kind: "quote" | "invoice"; onRetry: () => void }) {
  const { data: brand } = usePublicBranding();
  const status = error instanceof ApiError ? error.status : 0;
  const docLabel = kind === "quote" ? "ce devis" : "cette facture";
  const view =
    status === 404
      ? {
          icon: <FileSearch className="size-6" />,
          title: kind === "quote" ? "Devis introuvable" : "Facture introuvable",
          text: `Le lien de ${docLabel} est peut-être incomplet, ou le document n'est plus disponible en ligne. Demandez un nouveau lien à votre interlocuteur.`,
          retry: false,
        }
      : status === 429
        ? { icon: <ShieldAlert className="size-6" />, title: "Trop de tentatives", text: "Par sécurité, l'accès est momentanément limité. Réessayez dans quelques minutes.", retry: true }
        : { icon: <WifiOff className="size-6" />, title: "Document momentanément indisponible", text: `Impossible d'afficher ${docLabel}. Vérifiez votre connexion puis réessayez.`, retry: true };
  return (
    <Glass radius="xl" className="mx-auto mt-2 max-w-[560px] px-6 py-12 text-center sm:mt-10 sm:px-10">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass mx-auto mb-5 flex size-16 items-center justify-center rounded-[20px] text-accent">
        {view.icon}
      </motion.div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{view.title}</h1>
      <p className="mx-auto mt-2 max-w-[420px] text-[14px] text-fg-2">{view.text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {view.retry && (
          <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
            Réessayer
          </Button>
        )}
        {brand?.email && (
          <Button variant="glass" asChild>
            <a href={`mailto:${brand.email}`}>Contacter {brand.company || "l'émetteur"}</a>
          </Button>
        )}
      </div>
    </Glass>
  );
}

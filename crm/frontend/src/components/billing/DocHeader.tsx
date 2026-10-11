import { ArrowLeft, Check } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Skeleton, Spinner } from "@/components/ui/display";
import { relative } from "@/lib/format";

export type SaveState = "new" | "dirty" | "saving" | "saved" | "readonly";

export function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt?: string | null }) {
  if (state === "readonly") return null;
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-3">
        <Spinner className="size-3" /> Enregistrement…
      </span>
    );
  if (state === "dirty" || state === "new")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
        <span className="size-1.5 rounded-full bg-amber-400" />
        {state === "new" ? "Non enregistré" : "Modifications non enregistrées"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-fg-3">
      <Check className="size-3.5 text-emerald-500" /> Enregistré{savedAt ? ` ${relative(savedAt)}` : ""}
    </span>
  );
}

/** Top of the quote / invoice editors (back link goes through the unsaved-changes guard). */
export function DocHeader({ back, backLabel, title, badges, subtitle, actions, loading }: { back: string; backLabel: string; title?: ReactNode; badges?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; loading?: boolean }) {
  return (
    <div className="mb-5">
      <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-2 transition hover:text-fg">
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {loading ? <Skeleton className="h-9 w-64" /> : <h1 className="truncate text-[26px] font-semibold tracking-[-0.025em] tabular sm:text-[30px]">{title}</h1>}
            {badges}
          </div>
          {subtitle && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-fg-2">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </motion.div>
    </div>
  );
}

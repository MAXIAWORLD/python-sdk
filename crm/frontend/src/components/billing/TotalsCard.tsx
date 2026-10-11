import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NumField } from "./fields";
import { formatDecimal, vatLabel, type DocTotals } from "./lib";

/** "− 262,57 €" with a real minus sign (or a plain amount when positive). */
export function signedMoney(value: number, currency = "EUR") {
  return value < 0 ? `− ${money(-value, currency)}` : money(value, currency);
}

export function TotalRow({ label, value, hint, strong, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; strong?: boolean; tone?: "muted" | "good" | "warn" | "bad"; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1 text-[13.5px]", className)}>
      <span className={cn("min-w-0", strong ? "font-semibold text-fg" : "text-fg-2")}>
        {label}
        {hint && <span className="ml-1.5 text-[11.5px] text-fg-3">{hint}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 text-right tabular",
          strong ? "font-semibold text-fg" : "text-fg",
          tone === "muted" && "text-fg-3",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-orange-600 dark:text-orange-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** HT / remise / TVA par taux / TTC — same computation as the PDF. */
export function TotalsCard({ totals, currency = "EUR", franchise, discount, onDiscountChange, children, className, totalLabel = "Total TTC" }: { totals: DocTotals; currency?: string; franchise?: boolean; discount: number; onDiscountChange?: (value: number) => void; children?: ReactNode; className?: string; totalLabel?: string }) {
  const m = (v: number) => money(v, currency);
  return (
    <div className={cn("rounded-[22px] bg-black/[0.025] p-4 ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.035] sm:p-5", className)}>
      <TotalRow label={discount ? "Total HT avant remise" : "Total HT"} value={m(totals.linesTotal)} />
      {onDiscountChange ? (
        <div className="flex items-center justify-between gap-3 py-1 text-[13.5px]">
          <span className="flex items-center gap-2 text-fg-2">
            Remise globale
            <NumField value={discount || null} onChange={(v) => onDiscountChange(Math.min(100, Math.max(0, v ?? 0)))} placeholder="0" suffix="%" aria-label="Remise globale en pourcentage" className="w-[82px]" />
          </span>
          <span className={cn("tabular", discount ? "text-fg" : "text-fg-3")}>{discount ? signedMoney(-totals.discountAmount, currency) : "—"}</span>
        </div>
      ) : (
        discount > 0 && <TotalRow label={`Remise globale (${formatDecimal(discount)} %)`} value={signedMoney(-totals.discountAmount, currency)} />
      )}
      {discount > 0 && <TotalRow label="Total HT net" value={m(totals.subtotal)} strong />}
      <div className="my-1.5 h-px bg-[var(--hairline)]" />
      {franchise ? (
        <TotalRow label="TVA non applicable, art. 293 B du CGI" value={m(0)} tone="muted" />
      ) : totals.breakdown.length === 0 ? (
        <TotalRow label="TVA" value={m(0)} tone="muted" />
      ) : (
        totals.breakdown.map((b) => <TotalRow key={b.rate} label={`TVA ${vatLabel(b.rate)}`} hint={`sur ${m(b.base)}`} value={m(b.amount)} />)
      )}
      <div className="mt-2 flex items-end justify-between gap-4 border-t border-[var(--hairline-strong)] pt-3">
        <span className="pb-0.5 text-[13.5px] font-semibold">{totalLabel}</span>
        <span className="relative overflow-hidden text-[26px] font-semibold leading-none tracking-[-0.03em] tabular">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={totals.total} className="inline-block" initial={{ y: 10, opacity: 0, filter: "blur(3px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: -10, opacity: 0, filter: "blur(3px)" }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              {m(totals.total)}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      {children && <div className="mt-3 border-t border-dashed border-[var(--hairline-strong)] pt-2">{children}</div>}
    </div>
  );
}

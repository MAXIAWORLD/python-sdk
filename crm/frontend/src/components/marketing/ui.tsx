import { Check, Copy, Info, ShieldCheck, TriangleAlert, CircleX, CircleCheck } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Clipboard                                                                  */
/* -------------------------------------------------------------------------- */

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Button that copies a value and briefly shows a check mark. */
export function CopyButton({ value, label = "Copier", copiedLabel = "Copié", toastMessage, ...rest }: { value: string; label?: string; copiedLabel?: string; toastMessage?: string } & Omit<ButtonProps, "onClick" | "value">) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      {...rest}
      icon={copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
      onClick={async () => {
        const ok = await copyText(value);
        if (!ok) return toast.error("Copie impossible : sélectionnez le texte manuellement.");
        setCopied(true);
        if (toastMessage) toast.success(toastMessage);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Callouts                                                                   */
/* -------------------------------------------------------------------------- */

type CalloutTone = "info" | "success" | "warning" | "danger" | "privacy";

const CALLOUT: Record<CalloutTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] ring-[color-mix(in_oklab,var(--accent)_22%,transparent)]", icon: "text-accent", Icon: Info },
  success: { box: "bg-emerald-500/[0.08] ring-emerald-500/20", icon: "text-emerald-600 dark:text-emerald-400", Icon: CircleCheck },
  warning: { box: "bg-amber-400/[0.12] ring-amber-500/25", icon: "text-amber-600 dark:text-amber-300", Icon: TriangleAlert },
  danger: { box: "bg-red-500/[0.08] ring-red-500/25", icon: "text-red-600 dark:text-red-400", Icon: CircleX },
  privacy: { box: "bg-violet-500/[0.07] ring-violet-500/20", icon: "text-violet-600 dark:text-violet-300", Icon: ShieldCheck },
};

export function Callout({ tone = "info", title, children, action, icon, className }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  const t = CALLOUT[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-[16px] px-3.5 py-3 ring-1 ring-inset", t.box, className)}>
      <span className={cn("mt-0.5 shrink-0", t.icon)}>{icon ?? <t.Icon className="size-[18px]" />}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg-2">
        {title && <div className="mb-0.5 text-[13.5px] font-semibold text-fg">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Animated success mark                                                      */
/* -------------------------------------------------------------------------- */

export function SuccessMark({ size = 84, tone = "var(--accent)" }: { size?: number; tone?: string }) {
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in oklab, ${tone} 40%, transparent), transparent 68%)` }}
        initial={{ scale: 0.5, opacity: 0.9 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="relative flex size-full items-center justify-center rounded-full text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_18px_40px_-14px_rgba(40,60,200,.55)]"
        style={{ background: `linear-gradient(140deg, color-mix(in oklab, ${tone} 82%, white), ${tone} 55%, ${tone === "var(--accent)" ? "color-mix(in oklab, var(--accent-2) 80%, var(--accent))" : `color-mix(in oklab, ${tone} 72%, #000)`})` }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      >
        <svg viewBox="0 0 52 52" width={size * 0.5} height={size * 0.5} fill="none" aria-hidden>
          <motion.path d="M14 27.5 22.5 36 39 17" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }} />
        </svg>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-fg-3">{children}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-fg-3">{hint}</div>}
      </div>
      {action}
    </div>
  );
}

/** Character counter coloured against a recommended maximum. */
export function CharCount({ value, ideal, max }: { value: string; ideal: number; max: number }) {
  const n = [...value].length;
  const tone = n === 0 ? "text-fg-3" : n <= ideal ? "text-emerald-600 dark:text-emerald-400" : n <= max ? "text-amber-600 dark:text-amber-300" : "text-red-500";
  return <span className={cn("text-[11.5px] font-medium tabular", tone)}>{n} car.</span>;
}

/** "Demande de démo !" → "demande-de-demo" (or "demande_de_demo"). */
export function slugify(value: string, separator: "-" | "_" = "-") {
  const flat = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator);
  return flat.split(separator).filter(Boolean).join(separator).slice(0, 60);
}

import { CircleCheck, CircleSlash, CircleX, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { SegmentRule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { actionVisual, conditionFields, conditionLabel, triggerVisual, type AutomationCatalog } from "./catalog";

/** Gradient tile carrying a white icon (trigger / action identity). */
export function IconTile({ icon: Icon, accent, size = 36, className }: { icon: LucideIcon; accent: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_6px_14px_-6px_rgba(0,0,0,.45)]", className)}
      style={{ width: size, height: size, borderRadius: size * 0.32, background: accent }}
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} />
    </span>
  );
}

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Text where {{variables}} are displayed as discreet chips. */
export function VarText({ text, label, className }: { text: string; label?: (path: string) => string; className?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={`${m.index}-${m[1]}`} className="mx-px inline-flex items-center rounded-[6px] bg-accent-soft px-1 py-px align-baseline font-mono text-[0.86em] font-medium text-accent">
        {label ? label(m[1]) : m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

export function triggerConfigLabel(type: string, config: Record<string, unknown> | undefined, forms?: { id: number; name: string }[]) {
  if (type === "deal.stage_changed" && config?.to_stage) return `vers « ${String(config.to_stage)} »`;
  if (type === "form.submitted" && config?.form_id) {
    const form = forms?.find((f) => String(f.id) === String(config.form_id));
    return form ? `« ${form.name} »` : "formulaire précis";
  }
  return "";
}

function Chip({ icon: Icon, accent, children }: { icon?: LucideIcon; accent?: string; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-[9px] bg-black/[0.04] py-[3px] pl-[3px] pr-2 text-[12px] font-medium text-fg dark:bg-white/[0.06]">
      {Icon && accent && (
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[6px] text-white" style={{ background: accent }}>
          <Icon className="size-[11px]" />
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Readable « Quand … → si … → alors … » summary of an automation. */
export function FlowSummary({
  trigger,
  conditions,
  actions,
  catalog,
  forms,
  className,
}: {
  trigger: { type: string; config?: Record<string, unknown> };
  conditions: SegmentRule[];
  actions: { type: string }[];
  catalog?: AutomationCatalog;
  forms?: { id: number; name: string }[];
  className?: string;
}) {
  const t = triggerVisual(catalog, trigger.type);
  const groups = conditionFields(trigger.type, t.entity);
  const extra = triggerConfigLabel(trigger.type, trigger.config, forms);
  const rows: { label: string; content: ReactNode }[] = [
    {
      label: "Quand",
      content: (
        <Chip icon={t.icon} accent={t.accent}>
          {t.label}
          {extra && <span className="font-normal text-fg-2"> {extra}</span>}
        </Chip>
      ),
    },
    {
      label: "Si",
      content: conditions.length ? (
        <span className="text-[12.5px] leading-relaxed text-fg-2">
          {conditions.map((c, i) => {
            const l = conditionLabel(groups, c);
            return (
              <Fragment key={i}>
                {i > 0 && <span className="text-fg-3"> et </span>}
                <span className="font-medium text-fg">{l.field}</span> {l.op}
                {l.value && <span className="font-medium text-fg"> {l.value}</span>}
              </Fragment>
            );
          })}
        </span>
      ) : (
        <span className="text-[12.5px] text-fg-3">à chaque fois</span>
      ),
    },
    {
      label: "Alors",
      content: actions.length ? (
        <span className="flex flex-wrap gap-1">
          {actions.map((a, i) => {
            const v = actionVisual(catalog, a.type);
            return (
              <Chip key={i} icon={v.icon} accent={v.accent}>
                {v.label}
              </Chip>
            );
          })}
        </span>
      ) : (
        <span className="text-[12.5px] text-fg-3">aucune action</span>
      ),
    },
  ];
  return (
    <div className={cn("relative space-y-2", className)}>
      <span className="absolute bottom-3 left-[17px] top-3 w-px bg-[var(--hairline-strong)]" aria-hidden />
      {rows.map((r) => (
        <div key={r.label} className="relative flex items-start gap-2.5">
          <span className="relative z-10 mt-[3px] w-[36px] shrink-0 rounded-full bg-[var(--bg-2)] py-px text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-3 ring-1 ring-[var(--hairline)] dark:bg-[#11131f]">{r.label}</span>
          <div className="min-w-0 flex-1">{r.content}</div>
        </div>
      ))}
    </div>
  );
}

export function RunStatusIcon({ status, className }: { status?: string | null; className?: string }) {
  if (status === "success") return <CircleCheck className={cn("text-emerald-500", className)} />;
  if (status === "error") return <CircleX className={cn("text-red-500", className)} />;
  return <CircleSlash className={cn("text-fg-3", className)} />;
}

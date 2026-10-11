import { Check, CircleX, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FilterChip } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { date } from "@/lib/format";
import type { Deal, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { readableOn } from "./visuals";

type SegmentState = "done" | "current" | "todo" | "muted";

const NOTCH = 12;

function chevronClip(first: boolean, last: boolean) {
  if (first && last) return undefined;
  const tip = last ? "100% 0, 100% 100%" : `calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%`;
  const tail = first ? "0 100%" : `0 100%, ${NOTCH}px 50%`;
  return `polygon(0 0, ${tip}, ${tail})`;
}

function segmentStyle(state: SegmentState, color: string, fill: string, first: boolean, last: boolean): CSSProperties {
  const clipPath = chevronClip(first, last);
  if (state === "current")
    return {
      clipPath,
      color: readableOn(color),
      background: `linear-gradient(135deg, color-mix(in oklab, ${color} 74%, white), ${color} 58%, color-mix(in oklab, ${color} 84%, black))`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.55), inset 0 -10px 18px -12px rgba(0,0,0,.35)",
    };
  if (state === "done") return { clipPath, background: `color-mix(in oklab, ${fill} 20%, transparent)` };
  return { clipPath, background: "var(--hairline)" };
}

/**
 * Pipeline progress of a deal: open stages as interlocking glass chevrons, won / lost outcomes as buttons.
 * Clicking a stage asks the page to move the deal there.
 */
export function StageBar({ deal, stages, pending, daysInStage, onSelect }: { deal: Deal; stages: Stage[]; pending: number | null; daysInStage: number; onSelect: (stage: Stage) => void }) {
  const open = stages.filter((s) => !s.is_won && !s.is_lost);
  const won = stages.find((s) => s.is_won);
  const lost = stages.find((s) => s.is_lost);
  const currentIndex = open.findIndex((s) => s.id === deal.stage_id);
  const busy = pending !== null;
  const track = useRef<HTMLDivElement>(null);

  // On narrow screens the track scrolls: keep the current stage in view.
  useEffect(() => {
    const el = track.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el || !current || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
  }, [currentIndex, open.length]);
  // Franchised stages share one tint (the current stage color, or the won color) so progress reads as a single fill.
  const fill = deal.status === "won" ? (won?.color ?? "#30d158") : (open[currentIndex]?.color ?? "var(--accent)");

  const stateOf = (i: number): SegmentState => {
    if (deal.status === "won") return "done";
    if (deal.status === "lost") return "muted";
    if (i < currentIndex) return "done";
    return i === currentIndex ? "current" : "todo";
  };

  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <div ref={track} className="glass-inset relative flex min-w-0 flex-1 overflow-x-auto rounded-[18px] p-1" role="list" aria-label="Étapes du pipeline">
        {open.map((s, i) => {
          const state = stateOf(i);
          const first = i === 0;
          const last = i === open.length - 1;
          const current = state === "current";
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              disabled={busy || current}
              aria-current={current ? "step" : undefined}
              aria-label={current ? `Étape actuelle : ${s.name}` : `Déplacer vers « ${s.name} »`}
              title={current ? `Étape actuelle · ${s.probability} %` : `Déplacer vers « ${s.name} » (${s.probability} %)`}
              onClick={() => onSelect(s)}
              className={cn(
                "group relative h-[54px] min-w-[118px] flex-1 text-left outline-none transition-[filter,opacity] duration-200 focus-visible:brightness-110",
                !first && "-ml-[9px]",
                first && "rounded-l-[14px]",
                last && "rounded-r-[14px]",
                !current && "text-fg-2 hover:brightness-[0.96] disabled:cursor-default dark:hover:brightness-150",
                state === "muted" && "opacity-55",
                busy && !current && "cursor-wait",
              )}
              style={segmentStyle(state, s.color, fill, first, last)}
            >
              {current && (
                <>
                  <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.4),rgba(255,255,255,0)_58%)] opacity-60" />
                  <motion.span
                    key={`sweep-${s.id}`}
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent)]"
                    initial={{ x: "-120%" }}
                    animate={{ x: "260%" }}
                    transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
                  />
                </>
              )}
              <span className={cn("relative flex h-full min-w-0 flex-col justify-center", first ? "pl-4" : "pl-[24px]", last ? "pr-4" : "pr-6")}>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-tight">
                  {pending === s.id ? <Spinner className="size-3.5 shrink-0" /> : state === "done" && <Check className="size-3.5 shrink-0" strokeWidth={3} style={{ color: fill }} />}
                  <span className="truncate">{s.name}</span>
                </span>
                <span className={cn("mt-0.5 truncate text-[11px] tabular", current ? "opacity-85" : "text-fg-3")}>{current ? `${s.probability} % · ${daysInStage} j` : `${s.probability} %`}</span>
              </span>
            </button>
          );
        })}
      </div>

      {(won || lost) && (
        <div className="grid grid-cols-2 gap-2 lg:flex">
          {won && (
            <button
              type="button"
              disabled={busy || deal.status === "won"}
              onClick={() => onSelect(won)}
              className={cn(
                "flex h-[54px] min-w-0 items-center justify-center gap-2 rounded-[16px] px-4 text-[13.5px] font-semibold transition lg:min-w-[150px]",
                deal.status === "won"
                  ? "bg-[linear-gradient(135deg,#4ade80,#1baf7a_55%,#0f8a5f)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_12px_26px_-14px_#1baf7a]"
                  : "glass-flat text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300",
              )}
            >
              {pending === won.id ? <Spinner className="size-4" /> : <Trophy className="size-4 shrink-0" />}
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="truncate">{deal.status === "won" ? "Gagnée" : "Marquer gagnée"}</span>
                {deal.status === "won" && deal.closed_at && <span className="text-[11px] font-medium opacity-85">le {date(deal.closed_at, "d MMM yyyy")}</span>}
              </span>
            </button>
          )}
          {lost && (
            <button
              type="button"
              disabled={busy || deal.status === "lost"}
              onClick={() => onSelect(lost)}
              title={deal.status === "lost" && deal.lost_reason ? `Motif : ${deal.lost_reason}` : undefined}
              className={cn(
                "flex h-[54px] min-w-0 items-center justify-center gap-2 rounded-[16px] px-4 text-[13.5px] font-semibold transition lg:min-w-[150px] lg:max-w-[230px]",
                deal.status === "lost"
                  ? "bg-[linear-gradient(135deg,#fb7185,#e34948_55%,#b8323a)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_12px_26px_-14px_#e34948]"
                  : "glass-flat text-red-600 hover:bg-red-500/10 dark:text-red-400",
              )}
            >
              {pending === lost.id ? <Spinner className="size-4" /> : <CircleX className="size-4 shrink-0" />}
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="truncate">{deal.status === "lost" ? "Perdue" : "Marquer perdue"}</span>
                {deal.status === "lost" && (deal.lost_reason || deal.closed_at) && <span className="max-w-full truncate text-[11px] font-medium opacity-85">{deal.lost_reason ?? `le ${date(deal.closed_at, "d MMM yyyy")}`}</span>}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lost reason                                                                */
/* -------------------------------------------------------------------------- */

export const LOST_REASONS = ["Prix trop élevé", "Choix d'un concurrent", "Pas de budget", "Projet abandonné / reporté", "Pas de réponse", "Besoin mal qualifié", "Autre"];

/** Asks why a deal is lost (chips + free text) before moving it to the lost stage. */
export function LostReasonDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setReason(LOST_REASONS[0]);
      setDetail("");
    }
  }
  const confirm = () => onConfirm(detail.trim() ? `${reason} — ${detail.trim()}` : reason);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Pourquoi cette affaire est-elle perdue ?"
      description="Ces raisons alimentent l'analyse gains / pertes des rapports."
      icon={<CircleX className="size-5" />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={confirm}>
            Marquer perdue
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {LOST_REASONS.map((r) => (
            <FilterChip key={r} active={reason === r} onClick={() => setReason(r)}>
              {r}
            </FilterChip>
          ))}
        </div>
        <Field label="Précisions (facultatif)">
          <Input value={detail} onChange={(e) => setDetail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirm()} placeholder="Ex. : concurrent X moins cher de 20 %" />
        </Field>
      </div>
    </Dialog>
  );
}

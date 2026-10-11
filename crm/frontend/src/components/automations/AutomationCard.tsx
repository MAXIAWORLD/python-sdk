import { Copy, FlaskConical, History, MoreHorizontal, Pencil, Play, Power, PowerOff, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { TiltCard } from "@/components/glass/Glass";
import { IconButton } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/display";
import { Switch } from "@/components/ui/fields";
import { Menu, Tooltip } from "@/components/ui/overlay";
import { dateTime, plural, relative } from "@/lib/format";
import type { Automation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RUN_STATUS, triggerVisual, type AutomationCatalog } from "./catalog";
import { FlowSummary, IconTile } from "./parts";

/** Stops clicks (also those bubbling from portals) from reaching the clickable card. */
function Isolate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

export function AutomationCard({
  automation: a,
  catalog,
  forms,
  canEdit,
  index,
  onOpen,
  onToggle,
  onTest,
  onHistory,
  onDuplicate,
  onDelete,
}: {
  automation: Automation;
  catalog?: AutomationCatalog;
  forms?: { id: number; name: string }[];
  canEdit: boolean;
  index: number;
  onOpen: () => void;
  onToggle: (active: boolean) => void;
  onTest: () => void;
  onHistory: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = triggerVisual(catalog, a.trigger?.type ?? "");
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3), duration: 0.3 }} className="h-full">
      <TiltCard className="flex h-full flex-col p-4 sm:p-5" onClick={onOpen} max={3}>
        <div className="flex items-start gap-3">
          <IconTile icon={t.icon} accent={t.accent} size={42} className={cn("transition", !a.active && "opacity-60 grayscale")} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{a.name}</h3>
              {!a.active && (
                <Badge tone="gray" size="xs" className="mt-0.5">
                  Inactive
                </Badge>
              )}
            </div>
            <p className={cn("mt-0.5 line-clamp-2 text-[12.5px] leading-snug", a.description ? "text-fg-2" : "text-fg-3")}>{a.description || `Module ${t.group ? t.group.toLowerCase() : "général"}`}</p>
          </div>
          <Isolate className="pt-0.5">
            <Tooltip content={a.active ? "Désactiver" : "Activer"}>
              <span>
                <Switch size="sm" checked={a.active} onChange={onToggle} disabled={!canEdit} />
              </span>
            </Tooltip>
          </Isolate>
        </div>

        <FlowSummary className={cn("mt-4", !a.active && "opacity-75")} trigger={a.trigger} conditions={a.conditions ?? []} actions={a.actions ?? []} catalog={catalog} forms={forms} />

        <div className="mt-auto pt-4">
          <div className="flex items-center gap-2.5 border-t border-[var(--hairline)] pt-3 text-[12px] text-fg-3">
            <span className="inline-flex items-center gap-1 font-medium text-fg-2">
              <Play className="size-3" />
              {plural(a.run_count ?? 0, "exécution")}
            </span>
            <span className="truncate" title={a.last_run_at ? dateTime(a.last_run_at) : undefined}>
              {a.last_run_at ? `· ${relative(a.last_run_at)}` : "· jamais exécutée"}
            </span>
            {a.last_status && <StatusBadge options={RUN_STATUS} value={a.last_status} size="xs" />}
            <Isolate className="ml-auto">
              <Menu
                trigger={
                  <IconButton size="sm" label="Actions">
                    <MoreHorizontal className="size-4" />
                  </IconButton>
                }
                items={[
                  { label: canEdit ? "Modifier" : "Ouvrir", icon: <Pencil className="size-4" />, onSelect: onOpen },
                  { label: "Tester", icon: <FlaskConical className="size-4" />, onSelect: onTest, disabled: !canEdit },
                  { label: "Historique des exécutions", icon: <History className="size-4" />, onSelect: onHistory },
                  { label: a.active ? "Désactiver" : "Activer", icon: a.active ? <PowerOff className="size-4" /> : <Power className="size-4" />, onSelect: () => onToggle(!a.active), disabled: !canEdit },
                  { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: onDuplicate, disabled: !canEdit },
                  { separator: true, label: "" },
                  { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: onDelete, disabled: !canEdit },
                ]}
              />
            </Isolate>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

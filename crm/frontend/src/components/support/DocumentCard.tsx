import { Building2, Download, Eye, FolderInput, FolderKanban, LifeBuoy, MoreHorizontal, Pencil, Target, Trash2, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { TiltCard } from "@/components/glass/Glass";
import { Checkbox } from "@/components/ui/fields";
import { Menu, type MenuItem } from "@/components/ui/overlay";
import { fileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { extOf, fileHref, fileKind, kindMeta, linksOf, type Doc, type LinkKind } from "./files";
import { ago } from "./time";

export const LINK_ICON: Record<LinkKind, ReactNode> = {
  company: <Building2 className="size-3" />,
  contact: <UserRound className="size-3" />,
  deal: <Target className="size-3" />,
  project: <FolderKanban className="size-3" />,
  ticket: <LifeBuoy className="size-3" />,
};

export interface DocActions {
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}

export function docMenuItems(a: DocActions): MenuItem[] {
  return [
    { label: "Aperçu", icon: <Eye className="size-4" />, onSelect: a.onOpen },
    { label: "Télécharger", icon: <Download className="size-4" />, onSelect: a.onDownload },
    { label: "Renommer", icon: <Pencil className="size-4" />, onSelect: a.onRename },
    { label: "Déplacer", icon: <FolderInput className="size-4" />, onSelect: a.onMove },
    { separator: true, label: "" },
    { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: a.onDelete },
  ];
}

/** Square-ish visual of a file: real thumbnail for images, tinted icon otherwise. */
export function FileThumb({ doc, className, iconSize = 40 }: { doc: Doc; className?: string; iconSize?: number }) {
  const kind = fileKind(doc.mime, doc.name);
  const meta = kindMeta(kind);
  const [failed, setFailed] = useState(false);
  if (kind === "image" && !failed)
    return (
      <div className={cn("overflow-hidden bg-black/[0.04] dark:bg-white/[0.05]", className)}>
        <img src={fileHref(doc)} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      </div>
    );
  const ext = extOf(doc.name);
  return (
    <div className={cn("relative flex items-center justify-center bg-gradient-to-br", meta.tint, className)}>
      <meta.icon className={meta.fg} style={{ width: iconSize, height: iconSize }} strokeWidth={1.4} />
      {ext && iconSize >= 32 && <span className={cn("absolute bottom-2.5 right-2.5 rounded-[6px] bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide dark:bg-black/30", meta.fg)}>{ext}</span>}
    </div>
  );
}

export function DocumentCard({ doc, now, selected, selecting, onToggle, actions }: { doc: Doc; now: number; selected: boolean; selecting: boolean; onToggle: (v: boolean) => void; actions: DocActions }) {
  const links = linksOf(doc);
  return (
    <TiltCard className={cn("group flex h-full flex-col overflow-hidden p-0", selected && "ring-2 ring-[var(--accent)]")} onClick={actions.onOpen} max={4}>
      <div className="relative">
        <FileThumb doc={doc} className="aspect-[4/3] w-full rounded-t-[22px]" />
        <div
          onClick={(e) => e.stopPropagation()}
          className={cn("absolute left-2.5 top-2.5 rounded-[8px] bg-white/80 p-1 shadow-sm backdrop-blur transition dark:bg-black/40", selected || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        >
          <Checkbox checked={selected} onChange={onToggle} />
        </div>
        <div onClick={(e) => e.stopPropagation()} className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          <Menu
            trigger={
              <button type="button" aria-label="Actions" className="flex size-8 items-center justify-center rounded-[10px] bg-white/80 text-fg-2 shadow-sm backdrop-blur hover:text-fg dark:bg-black/40">
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={docMenuItems(actions)}
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="line-clamp-2 break-words text-[13px] font-medium leading-snug" title={doc.name}>
          {doc.name}
        </div>
        <div className="mt-1 text-[11.5px] text-fg-3 tabular">
          {fileSize(doc.size)} · {ago(doc.created_at, now)}
        </div>
        {links.length > 0 && (
          <div className="mt-auto flex min-w-0 items-center gap-1 pt-2">
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-black/[0.045] px-2 py-0.5 text-[11px] font-medium text-fg-2 dark:bg-white/[0.07]">
              {LINK_ICON[links[0].kind]}
              <span className="truncate">{links[0].name}</span>
            </span>
            {links.length > 1 && <span className="text-[11px] text-fg-3">+{links.length - 1}</span>}
          </div>
        )}
      </div>
    </TiltCard>
  );
}

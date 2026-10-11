import { Download, ExternalLink, FileText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { Sheet } from "@/components/ui/overlay";
import { download } from "@/lib/api";
import { toastError } from "@/lib/hooks";

/** Large side sheet with the server-rendered PDF (exact legal rendering). */
export function PdfPreview({ open, onOpenChange, path, version, title, filename, note, extraActions }: { open: boolean; onOpenChange: (open: boolean) => void; path: string; version?: string; title: string; filename: string; note?: ReactNode; extraActions?: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setLoaded(false);
  }
  const src = `/api${path}?v=${encodeURIComponent(version ?? "")}#view=FitH`;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width={1000}
      title={
        <span className="flex items-center gap-2">
          <FileText className="size-4 text-accent" /> {title}
        </span>
      }
      footer={
        <>
          {note && <span className="mr-auto hidden text-[12px] text-fg-3 sm:block">{note}</span>}
          {extraActions}
          <Button variant="ghost" asChild>
            <a href={`/api${path}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Nouvel onglet
            </a>
          </Button>
          <Button variant="primary" icon={<Download className="size-4" />} onClick={() => download(path, filename).catch(toastError)}>
            Télécharger
          </Button>
        </>
      }
    >
      <div className="relative h-full min-h-[70vh]">
        {!loaded && <Skeleton className="absolute inset-0 rounded-[18px]" />}
        {open && <iframe key={src} title={title} src={src} onLoad={() => setLoaded(true)} className="relative h-full min-h-[70vh] w-full rounded-[18px] bg-white ring-1 ring-[var(--hairline)]" />}
      </div>
    </Sheet>
  );
}

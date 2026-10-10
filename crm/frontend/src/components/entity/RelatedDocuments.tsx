import { FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, Paperclip, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/data/blocks";
import { Spinner } from "@/components/ui/display";
import { useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { fileSize, relative } from "@/lib/format";
import { toastError, useInvalidate, useList, useRemove } from "@/lib/hooks";
import type { DocumentFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Scope } from "./Timeline";

export function fileIcon(mime?: string | null, name?: string) {
  const n = (name ?? "").toLowerCase();
  if (mime?.startsWith("image/")) return FileImage;
  if (mime?.startsWith("video/")) return FileVideo;
  if (/\.(xlsx?|csv|ods|numbers)$/.test(n)) return FileSpreadsheet;
  if (/\.(zip|rar|7z)$/.test(n)) return FileArchive;
  return FileText;
}

/** Upload files (multipart) attached to a record. Returns a function taking a FileList. */
export function useUpload(scope: Scope & { folder?: string }) {
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const upload = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        for (const [k, v] of Object.entries(scope)) if (v !== undefined && v !== null) form.append(k, String(v));
        await api.post("/documents/upload", form);
      }
      toast.success(files.length > 1 ? `${files.length} fichiers ajoutés` : "Fichier ajouté");
      invalidate("documents");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

/** Files attached to a record, with drag & drop upload. */
export function RelatedDocuments({ scope, className }: { scope: Scope; className?: string }) {
  const { data } = useList<DocumentFile>("documents", { ...scope, sort: "-created_at", limit: 50 });
  const { upload, busy } = useUpload(scope);
  const remove = useRemove("documents");
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    upload(e.dataTransfer.files);
  };

  return (
    <Panel title="Documents" icon={<Paperclip className="size-4" />} className={className} bodyClassName="px-3 pb-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn("mb-2 flex w-full items-center justify-center gap-2 rounded-[14px] border border-dashed px-3 py-4 text-[12.5px] transition", over ? "border-[var(--accent)] bg-accent-soft text-accent" : "border-[var(--hairline-strong)] text-fg-3 hover:text-fg-2")}
      >
        {busy ? <Spinner className="size-4" /> : <UploadCloud className="size-4" />}
        Glissez des fichiers ou cliquez pour ajouter
      </button>
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      {data?.items.map((d) => {
        const Icon = fileIcon(d.mime, d.name);
        return (
          <div key={d.id} className="group flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
              <Icon className="size-4" />
            </span>
            <a href={`/api/files/${d.filename}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium hover:text-accent">{d.name}</div>
              <div className="text-[11.5px] text-fg-3">
                {fileSize(d.size)} · {relative(d.created_at)}
              </div>
            </a>
            <button
              onClick={async () => {
                if (await confirm({ title: `Supprimer « ${d.name} » ?`, danger: true, confirmLabel: "Supprimer" })) remove.mutate(d.id);
              }}
              className="rounded-[8px] p-1 text-fg-3 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
              aria-label="Supprimer"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        );
      })}
    </Panel>
  );
}

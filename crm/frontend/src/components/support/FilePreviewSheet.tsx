import { useQuery } from "@tanstack/react-query";
import { Building2, Download, ExternalLink, FolderInput, FolderOpen, LifeBuoy, Pencil, Target, Trash2, UserRound, FolderKanban } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { KeyValue } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Avatar, Skeleton, Spinner } from "@/components/ui/display";
import { Markdown } from "@/components/ui/markdown";
import { Sheet } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { dateTime, fileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { extOf, fileHref, fileKind, kindMeta, linksOf, type Doc, type LinkKind } from "./files";

const LINK_ICONS: Record<LinkKind, ReactNode> = {
  company: <Building2 className="size-3.5" />,
  contact: <UserRound className="size-3.5" />,
  deal: <Target className="size-3.5" />,
  project: <FolderKanban className="size-3.5" />,
  ticket: <LifeBuoy className="size-3.5" />,
};

const TEXT_LIMIT = 200_000;

/** Fetch the file through the API (session cookie) and expose it as a blob: URL (PDF viewer, no CSP sandbox). */
function useObjectUrl(path: string | null) {
  const { data: blob, isError } = useQuery({ queryKey: ["file-blob", path], queryFn: () => api.blob(path!), enabled: !!path, staleTime: Infinity, gcTime: 0, retry: false });
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return { url, isError };
}

function useText(path: string | null) {
  return useQuery({ queryKey: ["file-text", path], queryFn: async () => (await api.blob(path!)).slice(0, TEXT_LIMIT).text(), enabled: !!path, staleTime: Infinity, gcTime: 0, retry: false });
}

/** Minimal CSV reader (quotes, `;` or `,` separators) for the table preview. */
function parseCsv(text: string, maxRows = 60) {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if ((cell || row.length) && rows.length < maxRows) rows.push([...row, cell]);
  return rows;
}

function Preview({ doc }: { doc: Doc }) {
  const kind = fileKind(doc.mime, doc.name);
  const ext = extOf(doc.name);
  const path = `/files/${encodeURIComponent(doc.filename)}`;
  const pdf = useObjectUrl(kind === "pdf" ? path : null);
  const text = useText(kind === "text" || ext === "csv" ? path : null);
  const meta = kindMeta(kind);

  if (kind === "image")
    return (
      <div className="flex max-h-[58vh] min-h-[240px] items-center justify-center bg-[repeating-conic-gradient(var(--hairline)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] p-3">
        <img src={fileHref(doc)} alt={doc.name} className="max-h-[54vh] max-w-full rounded-[10px] object-contain shadow-[var(--glass-shadow)]" />
      </div>
    );
  if (kind === "pdf")
    return pdf.url ? (
      <iframe title={`Aperçu de ${doc.name}`} src={pdf.url} className="h-[62vh] w-full bg-white" />
    ) : pdf.isError ? (
      <Unavailable doc={doc} message="Impossible de charger l'aperçu du PDF." />
    ) : (
      <div className="flex h-[62vh] items-center justify-center text-fg-3">
        <Spinner className="size-5" />
      </div>
    );
  if (kind === "video") return <video controls preload="metadata" src={fileHref(doc)} className="max-h-[58vh] w-full bg-black" />;
  if (kind === "audio")
    return (
      <div className="p-6">
        <audio controls preload="metadata" src={fileHref(doc)} className="w-full" />
      </div>
    );
  if (text.data !== undefined) {
    if (ext === "csv") {
      const rows = parseCsv(text.data);
      return (
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i === 0 ? "font-semibold" : undefined}>
                  {r.map((c, j) => (
                    <td key={j} className={cn("whitespace-nowrap border-b border-[var(--hairline)] px-3 py-1.5", i === 0 && "sticky top-0 bg-[var(--glass-solid)]")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (ext === "md")
      return (
        <div className="max-h-[58vh] overflow-y-auto px-5 py-4">
          <Markdown>{text.data}</Markdown>
        </div>
      );
    return <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-[12.5px] leading-relaxed">{text.data}</pre>;
  }
  if (text.isLoading)
    return (
      <div className="space-y-2 p-5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  return <Unavailable doc={doc} message={`Pas d'aperçu pour les fichiers ${ext ? `.${ext}` : meta.label.toLowerCase()} : téléchargez-le pour l'ouvrir.`} />;
}

function Unavailable({ doc, message }: { doc: Doc; message: string }) {
  const meta = kindMeta(fileKind(doc.mime, doc.name));
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 bg-gradient-to-br px-6 py-14 text-center", meta.tint)}>
      <meta.icon className={cn("size-14", meta.fg)} strokeWidth={1.4} />
      <p className="max-w-[340px] text-[13px] text-fg-2">{message}</p>
    </div>
  );
}

/** Side sheet: preview (image, PDF, video, audio, text, CSV) + file details and actions. */
export function FilePreviewSheet({ doc, onClose, onRename, onMove, onDelete }: { doc: Doc | null; onClose: () => void; onRename: (d: Doc) => void; onMove: (d: Doc) => void; onDelete: (d: Doc) => void }) {
  const links = doc ? linksOf(doc) : [];
  const kind = doc ? kindMeta(fileKind(doc.mime, doc.name)) : null;
  return (
    <Sheet
      open={!!doc}
      onOpenChange={(o) => !o && onClose()}
      width={760}
      title={doc?.name}
      footer={
        doc && (
          <>
            <Button variant="ghost" className="mr-auto text-red-500" icon={<Trash2 className="size-4" />} onClick={() => onDelete(doc)}>
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
            <Button variant="glass" asChild>
              <a href={fileHref(doc)} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                <span className="hidden sm:inline">Ouvrir</span>
              </a>
            </Button>
            <Button variant="primary" asChild>
              <a href={fileHref(doc)} download={doc.name}>
                <Download className="size-4" /> Télécharger
              </a>
            </Button>
          </>
        )
      }
    >
      {doc && kind && (
        <div className="space-y-5">
          <div className="glass-inset overflow-hidden rounded-[20px]">
            <Preview doc={doc} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="glass" icon={<Pencil className="size-3.5" />} onClick={() => onRename(doc)}>
              Renommer
            </Button>
            <Button size="sm" variant="glass" icon={<FolderInput className="size-3.5" />} onClick={() => onMove(doc)}>
              Déplacer
            </Button>
          </div>

          <div className="divide-y divide-[var(--hairline)]">
            <KeyValue label="Type">
              <span className={cn("inline-flex items-center gap-1.5", kind.fg)}>
                <kind.icon className="size-4" />
                {kind.label}
              </span>
              <span className="ml-1.5 text-[12px] text-fg-3">{doc.mime ?? extOf(doc.name).toUpperCase()}</span>
            </KeyValue>
            <KeyValue label="Taille">
              <span className="tabular">{fileSize(doc.size)}</span>
            </KeyValue>
            <KeyValue label="Dossier">
              <span className="inline-flex items-center gap-1.5">
                <FolderOpen className="size-4 text-fg-3" />
                {doc.folder || <span className="text-fg-3">Sans dossier</span>}
              </span>
            </KeyValue>
            <KeyValue label="Ajouté">
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                {dateTime(doc.created_at)}
                {doc.uploaded_by && (
                  <span className="inline-flex items-center gap-1 text-fg-3">
                    par <Avatar name={doc.uploaded_by.name} color={(doc.uploaded_by.color as string) ?? undefined} size={18} /> {doc.uploaded_by.name}
                  </span>
                )}
              </span>
            </KeyValue>
            <KeyValue label="Lié à">
              {links.length ? (
                <span className="flex flex-wrap justify-end gap-1.5">
                  {links.map((l) => (
                    <Link key={`${l.kind}-${l.id}`} to={l.to} className="glass-flat inline-flex max-w-[260px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-fg-2 hover:text-accent">
                      {LINK_ICONS[l.kind]}
                      <span className="truncate">{l.name}</span>
                    </Link>
                  ))}
                </span>
              ) : (
                <span className="text-fg-3">Aucune fiche</span>
              )}
            </KeyValue>
            {doc.description && (
              <KeyValue label="Description">
                <span className="whitespace-pre-wrap">{doc.description}</span>
              </KeyValue>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

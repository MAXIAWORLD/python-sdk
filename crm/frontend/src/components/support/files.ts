import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation, type LucideIcon } from "lucide-react";
import type { DocumentFile, Ref } from "@/lib/types";

/** Document as returned by the API (the ticket link is not in the shared type). */
export type Doc = DocumentFile & { ticket_id?: number | null; ticket?: Ref | null };

export type FileKind = "image" | "pdf" | "doc" | "sheet" | "slides" | "archive" | "video" | "audio" | "text" | "other";

export const FILE_KINDS: { value: FileKind; label: string; icon: LucideIcon; tint: string; fg: string }[] = [
  { value: "image", label: "Images", icon: FileImage, tint: "from-sky-400/25 to-cyan-400/10", fg: "text-sky-600 dark:text-sky-300" },
  { value: "pdf", label: "PDF", icon: FileText, tint: "from-rose-500/25 to-orange-400/10", fg: "text-rose-600 dark:text-rose-300" },
  { value: "doc", label: "Documents", icon: FileText, tint: "from-blue-500/25 to-indigo-400/10", fg: "text-blue-600 dark:text-blue-300" },
  { value: "sheet", label: "Tableurs", icon: FileSpreadsheet, tint: "from-emerald-500/25 to-teal-400/10", fg: "text-emerald-600 dark:text-emerald-300" },
  { value: "slides", label: "Présentations", icon: Presentation, tint: "from-orange-500/25 to-amber-400/10", fg: "text-orange-600 dark:text-orange-300" },
  { value: "archive", label: "Archives", icon: FileArchive, tint: "from-zinc-500/25 to-zinc-400/10", fg: "text-zinc-600 dark:text-zinc-300" },
  { value: "video", label: "Vidéos", icon: FileVideo, tint: "from-violet-500/25 to-fuchsia-400/10", fg: "text-violet-600 dark:text-violet-300" },
  { value: "audio", label: "Audio", icon: FileAudio, tint: "from-pink-500/25 to-rose-400/10", fg: "text-pink-600 dark:text-pink-300" },
  { value: "text", label: "Texte", icon: FileCode, tint: "from-slate-500/25 to-slate-400/10", fg: "text-slate-600 dark:text-slate-300" },
  { value: "other", label: "Autres", icon: File, tint: "from-zinc-400/20 to-zinc-300/10", fg: "text-zinc-500 dark:text-zinc-400" },
];

export function extOf(name?: string | null) {
  const m = (name ?? "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : "";
}

/** Classify a file from its MIME type, falling back on its extension. */
export function fileKind(mime?: string | null, name?: string | null): FileKind {
  const m = (mime ?? "").toLowerCase();
  const ext = extOf(name);
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("video/") || ["mp4", "mov"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ext === "mp3") return "audio";
  if (["xls", "xlsx", "ods", "numbers", "csv"].includes(ext) || m.includes("spreadsheet") || m.includes("excel")) return "sheet";
  if (["ppt", "pptx", "key"].includes(ext) || m.includes("presentation") || m.includes("powerpoint")) return "slides";
  if (["doc", "docx", "odt", "pages", "rtf"].includes(ext) || m.includes("wordprocessing") || m.includes("msword")) return "doc";
  if (["zip", "rar", "7z", "gz"].includes(ext) || m.includes("zip") || m.includes("compressed")) return "archive";
  if (["txt", "md", "json", "xml"].includes(ext) || m.startsWith("text/") || m.includes("json") || m.includes("xml")) return "text";
  return "other";
}

export function kindMeta(kind: FileKind) {
  return FILE_KINDS.find((k) => k.value === kind) ?? FILE_KINDS[FILE_KINDS.length - 1];
}

export const fileHref = (d: Pick<DocumentFile, "filename">) => `/api/files/${encodeURIComponent(d.filename)}`;

export type LinkKind = "company" | "contact" | "deal" | "project" | "ticket";

export const LINK_KINDS: { value: LinkKind; label: string; resource: string; path: string }[] = [
  { value: "company", label: "Entreprises", resource: "companies", path: "/companies" },
  { value: "contact", label: "Contacts", resource: "contacts", path: "/contacts" },
  { value: "deal", label: "Opportunités", resource: "deals", path: "/deals" },
  { value: "project", label: "Projets", resource: "projects", path: "/projects" },
  { value: "ticket", label: "Tickets", resource: "tickets", path: "/tickets" },
];

/** Every CRM record a document is attached to, with its page. */
export function linksOf(d: Doc) {
  const out: { kind: LinkKind; id: number; name: string; to: string }[] = [];
  for (const k of LINK_KINDS) {
    const ref = d[k.value] as Ref | null | undefined;
    const id = d[`${k.value}_id` as keyof Doc] as number | null | undefined;
    if (id) out.push({ kind: k.value, id, name: ref?.name ?? `#${id}`, to: `${k.path}/${id}` });
  }
  return out;
}

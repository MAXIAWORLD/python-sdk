import { CloudUpload, Files, FolderClosed, FolderInput, FolderOpen, FolderPlus, HardDrive, Inbox, LayoutGrid, MoreHorizontal, Rows3, SearchX, Trash2, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { BulkBar } from "@/components/entity/EntityBlocks";
import { useUpload } from "@/components/entity/RelatedDocuments";
import { Glass } from "@/components/glass/Glass";
import { DocumentCard, docMenuItems, FileThumb, LINK_ICON, type DocActions } from "@/components/support/DocumentCard";
import { BodyPortal } from "@/components/support/BodyPortal";
import { DropOverlay, useFileDrop } from "@/components/support/DropOverlay";
import { MoveDialog, RenameDialog } from "@/components/support/FileDialogs";
import { FilePreviewSheet } from "@/components/support/FilePreviewSheet";
import { FILE_KINDS, fileHref, fileKind, LINK_KINDS, linksOf, type Doc, type FileKind, type LinkKind } from "@/components/support/files";
import { fold } from "@/components/support/kb";
import { ago, useNow } from "@/components/support/time";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton, Spinner } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Field, Input, SearchInput, Select } from "@/components/ui/fields";
import { Dialog, Menu, useConfirm } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { fileSize, plural, relative } from "@/lib/format";
import { toastError, useInvalidate, useList, useLocalStorage } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NONE = "__none__";

type Sort = "-created_at" | "created_at" | "name" | "-name" | "-size" | "size";

const SORTS: { value: Sort; label: string }[] = [
  { value: "-created_at", label: "Plus récents" },
  { value: "created_at", label: "Plus anciens" },
  { value: "name", label: "Nom (A → Z)" },
  { value: "-size", label: "Plus volumineux" },
];

function compare(sort: Sort) {
  const desc = sort.startsWith("-") ? -1 : 1;
  const key = sort.replace(/^-/, "");
  return (a: Doc, b: Doc) => {
    if (key === "name") return desc * a.name.localeCompare(b.name, "fr", { numeric: true });
    if (key === "size") return desc * (a.size - b.size);
    return desc * a.created_at.localeCompare(b.created_at);
  };
}

function triggerDownload(d: Doc) {
  const a = document.createElement("a");
  a.href = fileHref(d);
  a.download = d.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function DocumentsPage() {
  const now = useNow(60_000);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder");
  const type = (params.get("type") ?? "") as FileKind | "";
  const link = (params.get("link") ?? "") as LinkKind | "none" | "";
  const linkId = Number(params.get("link_id")) || null;
  const [q, setQ] = useState("");
  const [sort, setSort] = useLocalStorage<Sort>("prisme-documents-sort", "-created_at");
  const [view, setView] = useLocalStorage<"grid" | "list">("prisme-documents-view", "grid");
  const [selected, setSelected] = useState<number[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<Doc | null>(null);
  const [moving, setMoving] = useState<Doc[]>([]);
  const [newFolders, setNewFolders] = useState<string[]>([]);
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useList<Doc>("documents", { limit: 1000, sort: "-created_at" });
  const all = useMemo(() => data?.items ?? [], [data]);
  const currentFolder = folder && folder !== NONE ? folder : null;
  const { upload, busy } = useUpload({ folder: currentFolder ?? undefined });
  const dragging = useFileDrop((files) => upload(files));

  const setParam = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
    setSelected([]);
  };

  const folders = useMemo(() => {
    const map = new Map<string, { count: number; size: number }>();
    for (const d of all) {
      if (!d.folder) continue;
      const f = map.get(d.folder) ?? { count: 0, size: 0 };
      map.set(d.folder, { count: f.count + 1, size: f.size + d.size });
    }
    for (const f of newFolders) if (!map.has(f)) map.set(f, { count: 0, size: 0 });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [all, newFolders]);
  const folderNames = folders.map(([name]) => name);
  const totalSize = all.reduce((s, d) => s + d.size, 0);
  const unfiled = all.filter((d) => !d.folder).length;

  const inFolder = useMemo(() => all.filter((d) => (folder === NONE ? !d.folder : folder ? d.folder === folder : true)), [all, folder]);
  const kindCounts = useMemo(() => {
    const counts = new Map<FileKind, number>();
    for (const d of inFolder) counts.set(fileKind(d.mime, d.name), (counts.get(fileKind(d.mime, d.name)) ?? 0) + 1);
    return counts;
  }, [inFolder]);

  const visible = useMemo(() => {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    return inFolder
      .filter((d) => {
        if (type && fileKind(d.mime, d.name) !== type) return false;
        const links = linksOf(d);
        if (link === "none" && links.length) return false;
        if (link && link !== "none") {
          const match = links.find((l) => l.kind === link);
          if (!match || (linkId && match.id !== linkId)) return false;
        }
        if (!terms.length) return true;
        const hay = fold(`${d.name} ${d.description ?? ""} ${d.folder ?? ""} ${d.tags.join(" ")} ${links.map((l) => l.name).join(" ")}`);
        return terms.every((t) => hay.includes(t));
      })
      .sort(compare(sort));
  }, [inFolder, type, link, linkId, q, sort]);

  const previewDoc = all.find((d) => d.id === previewId) ?? null;
  const selectedDocs = all.filter((d) => selected.includes(d.id));
  const filtersOn = !!(q || type || link);

  const remove = async (docs: Doc[]) => {
    const title = docs.length > 1 ? `Supprimer ${docs.length} fichiers ?` : `Supprimer « ${docs[0].name} » ?`;
    if (!(await confirm({ title, description: "Les fichiers seront définitivement effacés du stockage. Cette action est irréversible.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      if (docs.length === 1) await api.delete(`/documents/${docs[0].id}`);
      else await api.post("/documents/bulk", { action: "delete", ids: docs.map((d) => d.id) });
      toast.success(docs.length > 1 ? `${docs.length} fichiers supprimés` : "Fichier supprimé");
      setSelected((s) => s.filter((id) => !docs.some((d) => d.id === id)));
      if (previewId && docs.some((d) => d.id === previewId)) setPreviewId(null);
      invalidate("documents");
    } catch (e) {
      toastError(e);
    }
  };

  const actionsFor = (d: Doc): DocActions => ({
    onOpen: () => setPreviewId(d.id),
    onDownload: () => triggerDownload(d),
    onRename: () => setRenaming(d),
    onMove: () => setMoving([d]),
    onDelete: () => remove([d]),
  });

  const createFolder = () => {
    const name = folderDraft.trim();
    if (!name) return;
    setNewFolders((f) => (f.includes(name) ? f : [...f, name]));
    setFolderDialog(false);
    setFolderDraft("");
    setParam({ folder: name });
    toast.success(`Dossier « ${name} » prêt`, { description: "Déposez-y vos fichiers : il est enregistré dès le premier ajout." });
  };

  const columns: Column<Doc>[] = [
    {
      key: "name",
      header: "Nom",
      sortKey: "name",
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-3">
          <FileThumb doc={d} className="size-10 shrink-0 rounded-[11px]" iconSize={20} />
          <div className="min-w-0">
            <div className="truncate font-medium">{d.name}</div>
            <div className="truncate text-[12px] text-fg-3">{d.description || FILE_KINDS.find((k) => k.value === fileKind(d.mime, d.name))?.label}</div>
          </div>
        </div>
      ),
    },
    {
      key: "links",
      header: "Lié à",
      hideOnMobile: true,
      cell: (d) => {
        const links = linksOf(d);
        if (!links.length) return <span className="text-fg-3">—</span>;
        return (
          <div className="flex min-w-0 items-center gap-1">
            <Link
              to={links[0].to}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 max-w-[200px] items-center gap-1 rounded-full bg-black/[0.045] px-2 py-0.5 text-[12px] font-medium text-fg-2 hover:text-accent dark:bg-white/[0.07]"
            >
              {LINK_ICON[links[0].kind]}
              <span className="truncate">{links[0].name}</span>
            </Link>
            {links.length > 1 && <span className="text-[11px] text-fg-3">+{links.length - 1}</span>}
          </div>
        );
      },
    },
    {
      key: "folder",
      header: "Dossier",
      hideOnMobile: true,
      cell: (d) =>
        d.folder ? (
          <span className="inline-flex items-center gap-1.5 text-fg-2">
            <FolderClosed className="size-3.5 text-fg-3" />
            {d.folder}
          </span>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    { key: "size", header: "Taille", sortKey: "size", align: "right", hideOnMobile: true, cell: (d) => <span className="tabular text-fg-2">{fileSize(d.size)}</span> },
    {
      key: "created",
      header: "Ajouté",
      sortKey: "created_at",
      align: "right",
      hideOnMobile: true,
      cell: (d) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] text-fg-3" title={relative(d.created_at)}>
          {ago(d.created_at, now)}
          {d.uploaded_by && <Avatar name={d.uploaded_by.name} color={(d.uploaded_by.color as string) ?? undefined} size={22} />}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "48px",
      cell: (d) => (
        <div onClick={(e) => e.stopPropagation()} className="inline-flex">
          <Menu
            trigger={
              <button type="button" aria-label="Actions" className="rounded-[9px] p-1.5 text-fg-3 hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]">
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={docMenuItems(actionsFor(d))}
          />
        </div>
      ),
    },
  ];

  const folderButton = (key: string | null, label: string, count: number, icon: ReactNode) => {
    const active = (folder ?? null) === key;
    return (
      <button
        key={key ?? "__all__"}
        type="button"
        onClick={() => setParam({ folder: key })}
        className={cn("flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left text-[13.5px] font-medium transition", active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.06]")}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={cn("text-[11.5px] tabular", active ? "text-accent" : "text-fg-3")}>{count}</span>
      </button>
    );
  };

  const emptyState = !all.length ? (
    <EmptyState
      icon={<CloudUpload className="size-6" />}
      title="Aucun document pour l'instant"
      description="Glissez-déposez vos fichiers n'importe où sur cette page, ou importez-les : contrats, devis signés, maquettes, pièces justificatives…"
      action={
        <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
          Importer des fichiers
        </Button>
      }
    />
  ) : filtersOn ? (
    <EmptyState
      icon={<SearchX className="size-6" />}
      title="Aucun fichier ne correspond"
      description="Modifiez la recherche ou retirez les filtres."
      action={
        <Button
          onClick={() => {
            setQ("");
            setParam({ type: null, link: null, link_id: null });
          }}
        >
          Réinitialiser les filtres
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<FolderOpen className="size-6" />}
      title={currentFolder ? `« ${currentFolder} » est vide` : "Aucun fichier sans dossier"}
      description={currentFolder ? "Déposez des fichiers sur la page pour les ranger dans ce dossier." : "Tous vos fichiers sont rangés dans des dossiers."}
      action={
        currentFolder ? (
          <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
            Ajouter des fichiers
          </Button>
        ) : undefined
      }
    />
  );

  const linkMeta = LINK_KINDS.find((k) => k.value === link);

  return (
    <div>
      <PageHeader
        title="Documents"
        icon={<FolderOpen className="size-5" />}
        description={isLoading ? "Chargement…" : all.length ? `${plural(all.length, "fichier")} · ${fileSize(totalSize)} · ${plural(folders.length, "dossier")}` : "Aucun fichier pour l'instant"}
        actions={
          <>
            <Button variant="glass" icon={<FolderPlus className="size-4" />} onClick={() => setFolderDialog(true)}>
              Nouveau dossier
            </Button>
            <Button variant="primary" icon={busy ? <Spinner className="size-4" /> : <Upload className="size-4" />} disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Envoi…" : "Importer"}
            </Button>
          </>
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files ? Array.from(e.target.files) : null);
          e.target.value = "";
        }}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Folders */}
        <aside className="hidden lg:sticky lg:top-[92px] lg:block">
          <Glass radius="lg" className="p-2.5">
            <div className="space-y-0.5">
              {folderButton(null, "Tous les fichiers", all.length, <Files className="size-4 shrink-0" />)}
              {folderButton(NONE, "Sans dossier", unfiled, <Inbox className="size-4 shrink-0" />)}
            </div>
            <div className="mb-1 mt-3 flex items-center justify-between px-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Dossiers</span>
              <button type="button" onClick={() => setFolderDialog(true)} className="rounded-[7px] p-1 text-fg-3 transition hover:bg-black/[0.05] hover:text-accent dark:hover:bg-white/[0.08]" aria-label="Nouveau dossier">
                <FolderPlus className="size-3.5" />
              </button>
            </div>
            <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
              {folders.map(([name, f]) => folderButton(name, name, f.count, folder === name ? <FolderOpen className="size-4 shrink-0" /> : <FolderClosed className="size-4 shrink-0" />))}
              {!folders.length && !isLoading && <p className="px-2.5 py-2 text-[12px] text-fg-3">Créez des dossiers pour ranger vos fichiers (contrats, factures fournisseurs…).</p>}
            </div>
            <div className="mt-3 rounded-[14px] bg-black/[0.025] p-3 dark:bg-white/[0.035]">
              <div className="flex items-center gap-2 text-[12px] font-medium text-fg-2">
                <HardDrive className="size-3.5 text-fg-3" /> {fileSize(totalSize)} utilisés
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-fg-3">Glissez des fichiers n'importe où sur la page pour les ajouter au dossier ouvert.</p>
            </div>
          </Glass>
        </aside>

        <div className="min-w-0">
          {/* Mobile folders */}
          <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
            <FilterChip active={!folder} onClick={() => setParam({ folder: null })} count={all.length}>
              Tous
            </FilterChip>
            <FilterChip active={folder === NONE} onClick={() => setParam({ folder: NONE })} count={unfiled}>
              Sans dossier
            </FilterChip>
            {folders.map(([name, f]) => (
              <FilterChip key={name} active={folder === name} onClick={() => setParam({ folder: name })} count={f.count}>
                {name}
              </FilterChip>
            ))}
          </div>

          <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Nom, description, fiche liée…" className="xl:w-[280px]" />
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              <FilterChip active={!type} onClick={() => setParam({ type: null })}>
                Tous types
              </FilterChip>
              {FILE_KINDS.filter((k) => kindCounts.get(k.value)).map((k) => (
                <FilterChip key={k.value} active={type === k.value} onClick={() => setParam({ type: type === k.value ? null : k.value })} count={kindCounts.get(k.value)}>
                  <k.icon className="size-3.5" /> {k.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select
              options={[{ value: "", label: "Toutes les fiches" }, ...LINK_KINDS.map((k) => ({ value: k.value, label: `Liés à : ${k.label.toLowerCase()}` })), { value: "none", label: "Non rattachés" }]}
              value={link}
              onChange={(v) => setParam({ link: v || null, link_id: null })}
              className="w-[210px]"
            />
            {linkMeta && (
              <div className="w-[240px]">
                <EntitySelect resource={linkMeta.resource} value={linkId} onChange={(id) => setParam({ link_id: id ? String(id) : null })} placeholder={`Toutes les fiches (${linkMeta.label.toLowerCase()})`} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Select options={SORTS} value={sort} onChange={(v) => setSort(v as Sort)} className="w-[170px]" />
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "grid", label: <LayoutGrid className="size-4" aria-label="Grille" /> },
                  { value: "list", label: <Rows3 className="size-4" aria-label="Liste" /> },
                ]}
              />
            </div>
          </div>

          {view === "grid" ? (
            isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] rounded-[22px]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <Glass radius="xl" className="border-2 border-dashed border-[var(--hairline-strong)]">
                {emptyState}
              </Glass>
            ) : (
              <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <AnimatePresence initial={false}>
                  {visible.map((d) => (
                    <motion.div key={d.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.2 }}>
                      <DocumentCard doc={d} now={now} selected={selected.includes(d.id)} selecting={selected.length > 0} onToggle={(v) => setSelected((s) => (v ? [...s, d.id] : s.filter((x) => x !== d.id)))} actions={actionsFor(d)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )
          ) : (
            <Glass className="overflow-hidden" radius="lg">
              <DataTable
                columns={columns}
                rows={visible}
                loading={isLoading}
                sort={sort}
                onSortChange={(s) => setSort(s as Sort)}
                onRowClick={(d) => setPreviewId(d.id)}
                selectable
                selected={selected}
                onSelectedChange={setSelected}
                empty={emptyState}
              />
            </Glass>
          )}
          {data && data.total > all.length && (
            <p className="mt-3 text-center text-[12px] text-fg-3">
              Affichage des {all.length} fichiers les plus récents sur {data.total}.
            </p>
          )}
        </div>
      </div>

      <BodyPortal>
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          <Button size="sm" variant="ghost" icon={<FolderInput className="size-4" />} onClick={() => setMoving(selectedDocs)}>
            Déplacer
          </Button>
          <Button size="sm" variant="ghost" className="text-red-500" icon={<Trash2 className="size-4" />} onClick={() => remove(selectedDocs)}>
            Supprimer
          </Button>
        </BulkBar>
      </BodyPortal>

      <DropOverlay active={dragging} folder={currentFolder} />
      <BodyPortal>
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="glass glass-strong fixed bottom-24 right-5 z-50 flex items-center gap-2.5 rounded-[16px] px-4 py-3 text-[13px] font-medium shadow-[var(--glass-shadow-lg)] lg:bottom-6"
            >
              <Spinner className="size-4 text-accent" /> Envoi des fichiers{currentFolder ? ` dans « ${currentFolder} »` : ""}…
            </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>

      <FilePreviewSheet doc={previewDoc} onClose={() => setPreviewId(null)} onRename={(d) => setRenaming(d)} onMove={(d) => setMoving([d])} onDelete={(d) => remove([d])} />
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} />
      <MoveDialog docs={moving} folders={folderNames} onClose={() => setMoving([])} onMoved={() => setSelected([])} />
      <Dialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        size="sm"
        title="Nouveau dossier"
        icon={<FolderPlus className="size-5" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFolderDialog(false)}>
              Annuler
            </Button>
            <Button variant="primary" disabled={!folderDraft.trim()} onClick={createFolder}>
              Créer et ouvrir
            </Button>
          </>
        }
      >
        <Field label="Nom du dossier" hint="Les dossiers regroupent vos fichiers ; un fichier peut ensuite être déplacé à tout moment.">
          <Input autoFocus value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} placeholder="Ex. : Contrats clients" />
        </Field>
      </Dialog>
    </div>
  );
}

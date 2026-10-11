import { Check, FolderInput, FolderOpen, FolderPlus, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { toastError, useInvalidate } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { Doc } from "./files";

/** Rename a document (display name; the stored file is unchanged). */
export function RenameDialog({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<number | null>(null);
  const invalidate = useInvalidate();
  if (doc && doc.id !== lastId) {
    setLastId(doc.id);
    setName(doc.name);
  }
  if (!doc && lastId !== null) setLastId(null);

  const submit = async () => {
    if (!doc || !name.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/documents/${doc.id}`, { name: name.trim() });
      toast.success("Fichier renommé");
      invalidate("documents");
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!doc}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Renommer le fichier"
      icon={<Pencil className="size-5" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={submit}>
            Renommer
          </Button>
        </>
      }
    >
      <Field label="Nouveau nom">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          onFocus={(e) => {
            const dot = e.currentTarget.value.lastIndexOf(".");
            e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length);
          }}
        />
      </Field>
    </Dialog>
  );
}

/** Move one or several documents to an existing or new folder (or out of any folder). */
export function MoveDialog({ docs, folders, onClose, onMoved }: { docs: Doc[]; folders: string[]; onClose: () => void; onMoved?: (folder: string | null) => void }) {
  const [target, setTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const invalidate = useInvalidate();
  const key = docs.map((d) => d.id).join(",");
  if (key && key !== lastKey) {
    setLastKey(key);
    setTarget(docs.length === 1 ? (docs[0].folder ?? null) : null);
    setCreating("");
  }
  if (!key && lastKey) setLastKey("");

  const destination = creating.trim() || target;

  const submit = async () => {
    if (!docs.length) return;
    setBusy(true);
    try {
      const data = { folder: destination || null };
      if (docs.length === 1) await api.patch(`/documents/${docs[0].id}`, data);
      else await api.post("/documents/bulk", { action: "update", ids: docs.map((d) => d.id), data });
      toast.success(docs.length > 1 ? `${docs.length} fichiers déplacés` : "Fichier déplacé", { description: destination ? `Dans « ${destination} »` : "Retiré de son dossier" });
      invalidate("documents");
      onMoved?.(destination || null);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const option = (value: string | null, label: string) => {
    const active = !creating.trim() && target === value;
    return (
      <button
        key={value ?? "__none__"}
        type="button"
        onClick={() => {
          setCreating("");
          setTarget(value);
        }}
        className={cn("flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13.5px] transition", active ? "bg-accent-soft font-medium text-accent" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]")}
      >
        <FolderOpen className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {active && <Check className="size-4" />}
      </button>
    );
  };

  return (
    <Dialog
      open={docs.length > 0}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={docs.length > 1 ? `Déplacer ${docs.length} fichiers` : `Déplacer « ${docs[0]?.name ?? ""} »`}
      icon={<FolderInput className="size-5" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Déplacer
          </Button>
        </>
      }
    >
      <div className="max-h-[300px] space-y-0.5 overflow-y-auto">
        {option(null, "Sans dossier")}
        {folders.map((f) => option(f, f))}
      </div>
      <Field label="…ou un nouveau dossier" className="mt-3">
        <Input value={creating} onChange={(e) => setCreating(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Ex. : Contrats 2026" icon={<FolderPlus className="size-4" />} />
      </Field>
    </Dialog>
  );
}

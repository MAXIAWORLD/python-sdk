import { CloudUpload, FolderOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BodyPortal } from "./BodyPortal";

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/** Window-wide file drag & drop: returns whether files are being dragged over the page. */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    if (!enabled) return;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) handler.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);

  return dragging;
}

/** Full-screen liquid glass drop zone. */
export function DropOverlay({ active, folder }: { active: boolean; folder?: string | null }) {
  return (
    <BodyPortal>
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/20 p-6 backdrop-blur-[6px] dark:bg-black/45"
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="glass glass-strong liquid flex w-full max-w-[560px] flex-col items-center rounded-[32px] border-2 border-dashed border-[color-mix(in_oklab,var(--accent)_55%,transparent)] px-8 py-14 text-center shadow-[var(--glass-shadow-lg)]"
            >
              <motion.span animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }} className="btn-primary flex size-16 items-center justify-center rounded-[22px]">
                <CloudUpload className="size-8" />
              </motion.span>
              <p className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">Déposez vos fichiers ici</p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] text-fg-2">
                <FolderOpen className="size-4" />
                {folder ? (
                  <>
                    Ils seront rangés dans <b className="font-semibold text-fg">« {folder} »</b>
                  </>
                ) : (
                  "Ils seront ajoutés sans dossier"
                )}
              </p>
              <p className="mt-4 text-[12px] text-fg-3">PDF, images, documents Office, tableurs, archives… · 25 Mo maximum par fichier</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </BodyPortal>
  );
}

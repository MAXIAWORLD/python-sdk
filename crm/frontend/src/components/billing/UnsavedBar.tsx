import { RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/display";
import { isMac } from "@/lib/utils";

/** Floating liquid-glass bar shown while the document has unsaved changes. */
export function UnsavedBar({ visible, saving, onSave, onDiscard, label = "Modifications non enregistrées", saveLabel = "Enregistrer" }: { visible: boolean; saving?: boolean; onSave: () => void; onDiscard?: () => void; label?: string; saveLabel?: string }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0, x: "-50%" }}
          animate={{ y: 0, opacity: 1, x: "-50%" }}
          exit={{ y: 80, opacity: 0, x: "-50%" }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="no-print fixed bottom-24 left-1/2 z-40 w-max max-w-[calc(100vw-24px)] lg:bottom-6"
          role="status"
        >
          <div className="glass glass-strong liquid flex items-center gap-2 rounded-[20px] py-2 pl-4 pr-2 shadow-[var(--glass-shadow-lg)]">
            <span className="relative mr-1 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-400" />
            </span>
            <span className="mr-1 whitespace-nowrap text-[13px] font-medium">{label}</span>
            {onDiscard && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={onDiscard} disabled={saving}>
                <span className="hidden sm:inline">Annuler</span>
              </Button>
            )}
            <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={saving} onClick={onSave}>
              {saveLabel}
              <Kbd className="ml-0.5 hidden border-white/30 bg-white/15 text-white sm:inline-flex">{isMac() ? "⌘S" : "Ctrl S"}</Kbd>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

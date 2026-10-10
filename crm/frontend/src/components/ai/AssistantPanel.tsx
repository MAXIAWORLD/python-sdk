import { useQuery } from "@tanstack/react-query";
import { History, Maximize2, Minimize2, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/ui/button";
import { Menu } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useUI } from "@/stores/ui";
import { ChatView, IrisOrb } from "./ChatView";
import { useChat, type Conversation } from "./useChat";

/** Floating assistant: stays open while you keep working in the CRM. */
export function AssistantPanel() {
  const { assistantOpen, closeAssistant, assistantWide, setAssistantWide, consumePrompt, assistantContext, assistantPrompt } = useUI();
  const chat = useChat();
  const navigate = useNavigate();
  const { data: history } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () => api.get<{ items: Conversation[] }>("/ai/conversations"),
    enabled: assistantOpen,
  });

  useEffect(() => {
    if (!assistantOpen || !assistantPrompt) return;
    const p = consumePrompt();
    if (p) {
      chat.reset();
      setTimeout(() => chat.send(p, useUI.getState().assistantContext), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantOpen, assistantPrompt]);

  return (
    <AnimatePresence>
      {assistantOpen && (
        <motion.aside
          initial={{ opacity: 0, x: 40, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="glass glass-strong fixed inset-2 z-50 flex flex-col overflow-hidden rounded-[28px] shadow-[var(--glass-shadow-lg)] sm:inset-auto sm:bottom-3 sm:right-3 sm:top-3"
          style={{ width: undefined }}
        >
          <div className={assistantWide ? "flex h-full w-full flex-col sm:w-[min(760px,calc(100vw-24px))]" : "flex h-full w-full flex-col sm:w-[440px]"}>
            <div className="flex items-center gap-2.5 border-b border-[var(--hairline)] px-4 py-3">
              <IrisOrb size={30} thinking={chat.streaming} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{chat.title}</div>
                <div className="text-[11.5px] text-fg-3">Assistant IA du CRM</div>
              </div>
              <Menu
                width={300}
                trigger={
                  <IconButton label="Historique" size="sm">
                    <History className="size-4" />
                  </IconButton>
                }
                items={[
                  ...(history?.items ?? []).slice(0, 12).map((c) => ({ label: <span className="block truncate">{c.title}</span>, shortcut: relative(c.updated_at), onSelect: () => chat.load(c.id) })),
                  ...(history?.items?.length ? [{ separator: true, label: "" }] : []),
                  { label: "Toutes les conversations", onSelect: () => navigate("/assistant") },
                ]}
              />
              <IconButton label="Nouvelle conversation" size="sm" onClick={chat.reset}>
                <Plus className="size-4" />
              </IconButton>
              <IconButton label={assistantWide ? "Réduire" : "Agrandir"} size="sm" className="hidden sm:inline-flex" onClick={() => setAssistantWide(!assistantWide)}>
                {assistantWide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </IconButton>
              <IconButton label="Fermer" size="sm" onClick={closeAssistant}>
                <X className="size-4" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <ChatView chat={chat} context={assistantContext} compact={!assistantWide} />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

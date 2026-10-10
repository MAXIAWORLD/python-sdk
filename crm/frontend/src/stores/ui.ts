import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type Effects = "max" | "balanced" | "low";

export interface AssistantContext {
  type?: string;
  id?: number;
  label?: string;
  page?: string;
}

interface UIState {
  theme: ThemeMode;
  effects: Effects;
  sidebarCollapsed: boolean;
  assistantOpen: boolean;
  assistantWide: boolean;
  assistantPrompt: string | null;
  assistantContext: AssistantContext | null;
  commandOpen: boolean;
  quickCreate: string | null;
  setTheme: (t: ThemeMode) => void;
  setEffects: (e: Effects) => void;
  toggleSidebar: () => void;
  openAssistant: (prompt?: string | null) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  setAssistantWide: (v: boolean) => void;
  consumePrompt: () => string | null;
  setAssistantContext: (c: AssistantContext | null) => void;
  setCommandOpen: (v: boolean) => void;
  openQuickCreate: (resource: string | null) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "system",
      effects: "max",
      sidebarCollapsed: false,
      assistantOpen: false,
      assistantWide: false,
      assistantPrompt: null,
      assistantContext: null,
      commandOpen: false,
      quickCreate: null,
      setTheme: (theme) => {
        try {
          localStorage.setItem("prisme-theme", theme);
        } catch {
          /* ignore */
        }
        set({ theme });
      },
      setEffects: (effects) => set({ effects }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      openAssistant: (prompt = null) => set({ assistantOpen: true, assistantPrompt: prompt }),
      closeAssistant: () => set({ assistantOpen: false }),
      toggleAssistant: () => set({ assistantOpen: !get().assistantOpen }),
      setAssistantWide: (assistantWide) => set({ assistantWide }),
      consumePrompt: () => {
        const p = get().assistantPrompt;
        if (p) set({ assistantPrompt: null });
        return p;
      },
      setAssistantContext: (assistantContext) => set({ assistantContext }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      openQuickCreate: (quickCreate) => set({ quickCreate }),
    }),
    {
      name: "prisme-ui",
      partialize: (s) => ({ theme: s.theme, effects: s.effects, sidebarCollapsed: s.sidebarCollapsed, assistantWide: s.assistantWide }),
    },
  ),
);

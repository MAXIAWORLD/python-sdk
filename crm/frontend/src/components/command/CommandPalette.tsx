import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { BookOpen, Building2, CornerDownLeft, FileText, FolderKanban, LifeBuoy, Moon, Package, Plus, Receipt, Sparkles, SquareCheckBig, SquareKanban, Sun, Timer, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as RDialog } from "radix-ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ALL_NAV } from "@/components/layout/nav";
import { Kbd, Spinner } from "@/components/ui/display";
import { api } from "@/lib/api";
import { toastError, useDebounced, useInvalidate } from "@/lib/hooks";
import { useUI } from "@/stores/ui";

interface SearchResult {
  type: string;
  id: number;
  title: string;
  subtitle?: string | null;
}

const TYPE_META: Record<string, { label: string; icon: typeof User; path: (id: number) => string }> = {
  contacts: { label: "Contacts", icon: User, path: (id) => `/contacts/${id}` },
  companies: { label: "Entreprises", icon: Building2, path: (id) => `/companies/${id}` },
  deals: { label: "Opportunités", icon: SquareKanban, path: (id) => `/deals/${id}` },
  quotes: { label: "Devis", icon: FileText, path: (id) => `/quotes/${id}` },
  invoices: { label: "Factures", icon: Receipt, path: (id) => `/invoices/${id}` },
  tickets: { label: "Tickets", icon: LifeBuoy, path: (id) => `/tickets/${id}` },
  projects: { label: "Projets", icon: FolderKanban, path: (id) => `/projects/${id}` },
  tasks: { label: "Tâches", icon: SquareCheckBig, path: () => `/tasks` },
  products: { label: "Produits", icon: Package, path: () => `/products` },
  "kb-articles": { label: "Articles", icon: BookOpen, path: (id) => `/kb?article=${id}` },
};

const itemCls = "flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] text-fg-2 data-[selected=true]:bg-black/[0.05] data-[selected=true]:text-fg dark:data-[selected=true]:bg-white/[0.08]";
const groupCls = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-fg-3";

export function CommandPalette() {
  const { commandOpen, setCommandOpen, openAssistant, openQuickCreate, theme, setTheme } = useUI();
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 180);
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!useUI.getState().commandOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        useUI.getState().toggleAssistant();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  useEffect(() => {
    if (!commandOpen) setQuery("");
  }, [commandOpen]);

  const { data, isFetching } = useQuery({ queryKey: ["search", q], queryFn: () => api.get<{ results: SearchResult[] }>("/search", { q }), enabled: commandOpen && q.length >= 2 });
  const results = data?.results ?? [];
  const groups = Object.entries(
    results.reduce<Record<string, SearchResult[]>>((acc, r) => {
      (acc[r.type] ||= []).push(r);
      return acc;
    }, {}),
  );

  const go = (path: string) => {
    setCommandOpen(false);
    navigate(path);
  };
  const act = (fn: () => void) => {
    setCommandOpen(false);
    setTimeout(fn, 60);
  };
  const startTimer = async () => {
    try {
      await api.post("/timer/start", {});
      invalidate("timer");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <RDialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <AnimatePresence>
        {commandOpen && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[70] bg-black/25 backdrop-blur-[6px] dark:bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </RDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[12vh]">
              <RDialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="glass glass-strong pointer-events-auto w-full max-w-[640px] overflow-hidden rounded-[26px] shadow-[var(--glass-shadow-lg)]"
                >
                  <RDialog.Title className="sr-only">Palette de commandes</RDialog.Title>
                  <RDialog.Description className="sr-only">Rechercher dans le CRM, naviguer, créer ou demander à l'IA</RDialog.Description>
                  <Command loop shouldFilter={true} className="flex max-h-[min(70vh,560px)] flex-col">
                    <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-5">
                      <Sparkles className="size-5 text-[#b26bff]" />
                      <Command.Input value={query} onValueChange={setQuery} placeholder="Rechercher, naviguer, créer… ou poser une question à Iris" className="h-[58px] flex-1 bg-transparent text-[16px] outline-none placeholder:text-fg-3" />
                      {isFetching && <Spinner className="size-4 text-fg-3" />}
                      <Kbd>Échap</Kbd>
                    </div>
                    <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
                      <Command.Empty className="px-4 py-8 text-center text-[13px] text-fg-3">Aucun résultat — appuyez sur Entrée pour demander à Iris.</Command.Empty>

                      {query.trim().length > 0 && (
                        <Command.Group heading="Intelligence artificielle" className={groupCls}>
                          <Command.Item value={`ia ${query}`} onSelect={() => act(() => openAssistant(query))} className={itemCls}>
                            <span className="ai-gradient flex size-7 items-center justify-center rounded-[9px] text-white">
                              <Sparkles className="size-4" />
                            </span>
                            <span className="flex-1 truncate">
                              Demander à Iris : <span className="font-medium text-fg">« {query} »</span>
                            </span>
                            <CornerDownLeft className="size-4 text-fg-3" />
                          </Command.Item>
                        </Command.Group>
                      )}

                      {groups.map(([type, rows]) => {
                        const meta = TYPE_META[type];
                        if (!meta) return null;
                        return (
                          <Command.Group key={type} heading={meta.label} className={groupCls}>
                            {rows.map((r) => (
                              <Command.Item key={`${type}-${r.id}`} value={`${type}-${r.id} ${r.title} ${r.subtitle ?? ""} ${query}`} onSelect={() => go(meta.path(r.id))} className={itemCls}>
                                <meta.icon className="size-4 text-fg-3" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-fg">{r.title}</span>
                                  {r.subtitle && <span className="block truncate text-[12px] text-fg-3">{r.subtitle}</span>}
                                </span>
                              </Command.Item>
                            ))}
                          </Command.Group>
                        );
                      })}

                      <Command.Group heading="Créer" className={groupCls}>
                        {[
                          { label: "Nouveau contact", icon: User, run: () => openQuickCreate("contacts") },
                          { label: "Nouvelle entreprise", icon: Building2, run: () => openQuickCreate("companies") },
                          { label: "Nouvelle opportunité", icon: SquareKanban, run: () => openQuickCreate("deals") },
                          { label: "Nouvelle tâche", icon: SquareCheckBig, run: () => openQuickCreate("tasks") },
                          { label: "Nouveau devis", icon: FileText, run: () => navigate("/quotes/new") },
                          { label: "Nouvelle facture", icon: Receipt, run: () => navigate("/invoices/new") },
                          { label: "Nouveau ticket", icon: LifeBuoy, run: () => openQuickCreate("tickets") },
                        ].map((c) => (
                          <Command.Item key={c.label} value={`créer ${c.label}`} onSelect={() => act(c.run)} className={itemCls}>
                            <Plus className="size-4 text-fg-3" />
                            <c.icon className="size-4 text-fg-3" />
                            {c.label}
                          </Command.Item>
                        ))}
                      </Command.Group>

                      <Command.Group heading="Aller à" className={groupCls}>
                        {ALL_NAV.map((n) => (
                          <Command.Item key={n.to} value={`aller ${n.label}`} onSelect={() => go(n.to)} className={itemCls}>
                            <n.icon className="size-4 text-fg-3" />
                            <span className="flex-1">{n.label}</span>
                            {n.shortcut && <span className="text-[11px] text-fg-3">{n.shortcut}</span>}
                          </Command.Item>
                        ))}
                      </Command.Group>

                      <Command.Group heading="Actions" className={groupCls}>
                        <Command.Item value="chronomètre démarrer temps" onSelect={() => act(startTimer)} className={itemCls}>
                          <Timer className="size-4 text-fg-3" /> Démarrer le chronomètre
                        </Command.Item>
                        <Command.Item value="thème sombre clair basculer" onSelect={() => act(() => setTheme(theme === "dark" ? "light" : "dark"))} className={itemCls}>
                          {theme === "dark" ? <Sun className="size-4 text-fg-3" /> : <Moon className="size-4 text-fg-3" />} Basculer le thème
                        </Command.Item>
                      </Command.Group>
                    </Command.List>
                  </Command>
                </motion.div>
              </RDialog.Content>
            </div>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

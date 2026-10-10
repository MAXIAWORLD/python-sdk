import { useQuery } from "@tanstack/react-query";
import { Bell, Building2, CalendarPlus, CheckCheck, FileText, LifeBuoy, Plus, Receipt, Search, Sparkles, SquareCheckBig, SquareKanban, Square, Timer, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button, IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/display";
import { Menu, Popover } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { duration, relative } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Notification, Paginated, TimeEntry } from "@/lib/types";
import { cn, isMac } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { LogoMark } from "./Logo";
import { ALL_NAV } from "./nav";

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCommandOpen, toggleAssistant, openQuickCreate, assistantOpen } = useUI();
  const current = ALL_NAV.filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <header className="sticky top-3 z-30 mb-5">
      <div className="glass glass-strong flex h-[58px] items-center gap-2 rounded-[22px] px-3 sm:px-4">
        <Link to="/" className="mr-1 lg:hidden">
          <LogoMark size={32} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] text-fg-3">
            {current && <current.icon className="hidden size-4 sm:block" />}
            <span className="truncate font-medium text-fg-2">{current?.label ?? "Prisme"}</span>
          </div>
        </div>

        <button onClick={() => setCommandOpen(true)} className="glass-flat hidden h-9 w-[300px] items-center gap-2 rounded-[12px] px-3 text-[13px] text-fg-3 transition hover:text-fg-2 md:flex xl:w-[380px]">
          <Search className="size-4" />
          <span className="flex-1 text-left">Rechercher, créer, demander à l'IA…</span>
          <Kbd>{isMac() ? "⌘" : "Ctrl"} K</Kbd>
        </button>
        <IconButton label="Rechercher" className="md:hidden" onClick={() => setCommandOpen(true)}>
          <Search className="size-[18px]" />
        </IconButton>

        <TimerChip />

        <Menu
          trigger={
            <Button variant="primary" size="sm" icon={<Plus className="size-4" strokeWidth={2.5} />} className="hidden sm:inline-flex">
              Créer
            </Button>
          }
          items={[
            { label: "Contact", icon: <UserPlus className="size-4" />, onSelect: () => openQuickCreate("contacts"), shortcut: "C" },
            { label: "Entreprise", icon: <Building2 className="size-4" />, onSelect: () => openQuickCreate("companies") },
            { label: "Opportunité", icon: <SquareKanban className="size-4" />, onSelect: () => openQuickCreate("deals"), shortcut: "O" },
            { label: "Tâche", icon: <SquareCheckBig className="size-4" />, onSelect: () => openQuickCreate("tasks"), shortcut: "T" },
            { label: "Rendez-vous", icon: <CalendarPlus className="size-4" />, onSelect: () => openQuickCreate("events") },
            { separator: true, label: "" },
            { label: "Devis", icon: <FileText className="size-4" />, onSelect: () => navigate("/quotes/new") },
            { label: "Facture", icon: <Receipt className="size-4" />, onSelect: () => navigate("/invoices/new") },
            { label: "Ticket", icon: <LifeBuoy className="size-4" />, onSelect: () => openQuickCreate("tickets") },
          ]}
        />

        <Notifications />

        <button
          onClick={toggleAssistant}
          className={cn("ai-border relative flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-semibold transition", assistantOpen ? "ai-gradient text-white" : "glass-flat text-fg hover:brightness-110")}
          aria-label="Assistant IA"
        >
          <Sparkles className={cn("size-4", !assistantOpen && "text-[#b26bff]")} />
          <span className="hidden sm:inline">Iris</span>
        </button>
      </div>
    </header>
  );
}

function TimerChip() {
  const invalidate = useInvalidate();
  const { data } = useQuery({ queryKey: ["timer"], queryFn: () => api.get<{ entry: TimeEntry | null }>("/timer"), refetchInterval: 60_000 });
  const entry = data?.entry;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!entry) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [entry]);
  if (!entry?.started_at) return null;
  const secs = Math.max(0, Math.floor((now - new Date(entry.started_at).getTime()) / 1000));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const stop = async () => {
    try {
      await api.post("/timer/stop");
      invalidate("timer", "time-entries", "projects");
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <motion.button initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={stop} className="glass-flat flex h-9 items-center gap-2 rounded-[12px] px-2.5 text-[13px] font-semibold tabular" title={`${entry.project?.name ?? "Chronomètre"} — cliquer pour arrêter`}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
      </span>
      <Timer className="size-4 text-fg-3" />
      {hh}:{mm}:{ss}
      <Square className="size-3 fill-current text-fg-3" />
    </motion.button>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["notifications", "list"], queryFn: () => api.get<Paginated<Notification>>("/notifications", { limit: 30, sort: "-created_at" }), refetchInterval: 120_000 });
  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  const markAll = async () => {
    await api.post("/notifications/read-all");
    invalidate("notifications");
  };
  const openItem = async (n: Notification) => {
    if (!n.read_at) {
      await api.patch(`/notifications/${n.id}`, { read_at: new Date().toISOString() });
      invalidate("notifications");
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={380}
      trigger={
        <button className="relative flex size-9 items-center justify-center rounded-[12px] text-fg-2 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Notifications">
          <Bell className="size-[18px]" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute right-1 top-1 flex min-w-[17px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#ff375f,#ff9f0a)] px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_var(--bg)]">
                {unread > 9 ? "9+" : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
        <span className="text-[14px] font-semibold">Notifications</span>
        {unread > 0 && (
          <button onClick={markAll} className="flex items-center gap-1 text-[12px] font-medium text-accent">
            <CheckCheck className="size-3.5" /> Tout marquer comme lu
          </button>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto p-1.5">
        {items.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-fg-3">Aucune notification</div>}
        {items.map((n) => (
          <button key={n.id} onClick={() => openItem(n)} className="flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]")} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium leading-snug">{n.title}</span>
              {n.body && <span className="mt-0.5 block truncate text-[12.5px] text-fg-2">{n.body}</span>}
              <span className="mt-0.5 block text-[11.5px] text-fg-3">{relative(n.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

export { duration };

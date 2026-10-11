import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { AssistantPanel } from "@/components/ai/AssistantPanel";
import { CommandPalette } from "@/components/command/CommandPalette";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Backdrop } from "@/components/glass/Backdrop";
import { useGlobalGlow } from "@/components/glass/useGlow";
import { Skeleton } from "@/components/ui/display";
import { useRealtime } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { MobileDock } from "./MobileDock";
import { ALL_NAV } from "./nav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const DETAIL_TYPES: Record<string, string> = {
  contacts: "contact",
  companies: "entreprise",
  deals: "opportunité",
  quotes: "devis",
  invoices: "facture",
  projects: "projet",
  tickets: "ticket",
};

export function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-[360px]" />
    </div>
  );
}

function QuickCreateHost() {
  const { quickCreate, openQuickCreate } = useUI();
  const navigate = useNavigate();
  return (
    <RecordDialog
      resource={quickCreate ?? "contacts"}
      open={!!quickCreate}
      onOpenChange={(o) => !o && openQuickCreate(null)}
      onSaved={(row) => {
        const paths: Record<string, string> = { contacts: "/contacts", companies: "/companies", deals: "/deals", tickets: "/tickets", projects: "/projects" };
        if (quickCreate && paths[quickCreate]) navigate(`${paths[quickCreate]}/${row.id}`);
      }}
    />
  );
}

export function AppShell() {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const setAssistantContext = useUI((s) => s.setAssistantContext);
  const location = useLocation();
  const navigate = useNavigate();
  useGlobalGlow();
  useRealtime((n) =>
    toast(n.title, {
      description: n.body,
      action: n.link ? { label: "Voir", onClick: () => navigate(n.link!) } : undefined,
    }),
  );

  useEffect(() => {
    const [, section, id] = location.pathname.split("/");
    const nav = ALL_NAV.filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];
    if (section && DETAIL_TYPES[section] && id && /^\d+$/.test(id)) setAssistantContext({ type: DETAIL_TYPES[section], id: Number(id), page: nav?.label });
    else setAssistantContext(nav ? { page: nav.label } : null);
  }, [location.pathname, setAssistantContext]);

  const pageKey = location.pathname.split("/").slice(0, 3).join("/");

  return (
    <div className="min-h-screen">
      <Backdrop />
      <Sidebar />
      <main className={cn("min-h-screen px-3 pb-32 pt-3 transition-[padding] duration-300 sm:px-4 lg:pb-10 lg:pr-5", collapsed ? "lg:pl-[104px]" : "lg:pl-[294px]")}>
        <div className="mx-auto w-full max-w-[1640px]">
          <Topbar />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={pageKey} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }} exit={{ opacity: 0, y: -6, filter: "blur(3px)" }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <MobileDock />
      <AssistantPanel />
      <CommandPalette />
      <QuickCreateHost />
    </div>
  );
}

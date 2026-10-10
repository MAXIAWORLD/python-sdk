import { LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { Avatar, Kbd } from "@/components/ui/display";
import { Menu } from "@/components/ui/overlay";
import { Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { cn, isMac } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";
import { Logo } from "./Logo";
import { NAV } from "./nav";

export function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const setCommandOpen = useUI((s) => s.setCommandOpen);
  const { user, branding } = useAuth();
  const location = useLocation();

  const isActive = (to: string, end?: boolean) => (end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/"));

  return (
    <motion.aside
      animate={{ width: collapsed ? 78 : 268 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="glass glass-strong fixed bottom-3 left-3 top-3 z-40 hidden flex-col rounded-[28px] lg:flex"
    >
      <div className={cn("flex items-center justify-between px-4 pb-2 pt-4", collapsed && "justify-center px-2")}>
        <NavLink to="/" className="rounded-xl">
          <Logo name={branding.app_name} collapsed={collapsed} />
        </NavLink>
        {!collapsed && (
          <button onClick={toggle} className="rounded-[10px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Réduire le menu">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        {collapsed ? (
          <Tooltip content="Rechercher" side="right">
            <button onClick={() => setCommandOpen(true)} className="glass-flat flex h-10 w-full items-center justify-center rounded-[13px] text-fg-2 hover:text-fg" aria-label="Rechercher">
              <Search className="size-4" />
            </button>
          </Tooltip>
        ) : (
          <button onClick={() => setCommandOpen(true)} className="glass-flat liquid flex h-10 w-full items-center gap-2 rounded-[13px] px-3 text-[13px] text-fg-3 transition hover:text-fg-2">
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">Rechercher…</span>
            <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 [scrollbar-width:none]">
        <LayoutGroup id="sidebar">
          {NAV.map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              {!collapsed && <div className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-3">{group.label}</div>}
              {collapsed && <div className="mx-auto my-2 h-px w-6 bg-[var(--hairline-strong)]" />}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.to, item.end);
                  const Icon = item.icon;
                  const link = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-[12px] px-3 text-[13.5px] font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        active ? "text-fg" : "text-fg-2 hover:text-fg",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-pill"
                          className="glass liquid absolute inset-0 rounded-[12px]"
                          transition={{ type: "spring", stiffness: 480, damping: 36 }}
                        />
                      )}
                      {!active && <span className="absolute inset-0 rounded-[12px] opacity-0 transition-opacity group-hover:bg-black/[0.04] group-hover:opacity-100 dark:group-hover:bg-white/[0.05]" />}
                      <Icon className={cn("relative z-10 size-[18px] shrink-0 transition-colors", active ? "text-accent" : "text-fg-3 group-hover:text-fg-2", item.to === "/assistant" && "text-[#b26bff]")} strokeWidth={active ? 2.2 : 1.9} />
                      {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                      {!collapsed && item.to === "/assistant" && <span className="ai-gradient relative z-10 ml-auto rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-white">IA</span>}
                    </NavLink>
                  );
                  return collapsed ? (
                    <Tooltip key={item.to} content={item.label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  );
                })}
              </div>
            </div>
          ))}
        </LayoutGroup>
      </nav>

      <div className={cn("border-t border-[var(--hairline)] p-3", collapsed && "px-2")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button onClick={toggle} className="rounded-[10px] p-2 text-fg-3 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Déplier le menu">
              <PanelLeftOpen className="size-4" />
            </button>
            <UserMenu compact />
          </div>
        ) : (
          <UserMenu />
        )}
      </div>
      {user && null}
    </motion.aside>
  );
}

export function UserMenu({ compact }: { compact?: boolean }) {
  const { user, set } = useAuth();
  const { theme, setTheme } = useUI();
  const navigate = useNavigate();
  if (!user) return null;
  const logout = async () => {
    await api.post("/auth/logout");
    set({ user: null });
    navigate("/login");
  };
  const roleLabel = { admin: "Administrateur", manager: "Manager", member: "Membre", viewer: "Lecteur" }[user.role];
  return (
    <Menu
      align="start"
      width={240}
      trigger={
        <button className={cn("flex w-full items-center gap-2.5 rounded-[14px] p-1.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", compact && "w-auto justify-center p-1")}>
          <Avatar name={user.name} color={user.color} src={user.avatar_url} size={compact ? 34 : 36} />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{user.name}</span>
              <span className="block truncate text-[11.5px] text-fg-3">{roleLabel}</span>
            </span>
          )}
        </button>
      }
      items={[
        { label: "Mon profil", onSelect: () => navigate("/settings?tab=profile") },
        { separator: true, label: "" },
        { label: "Thème clair", icon: <Sun className="size-4" />, onSelect: () => setTheme("light"), shortcut: theme === "light" ? "✓" : undefined },
        { label: "Thème sombre", icon: <Moon className="size-4" />, onSelect: () => setTheme("dark"), shortcut: theme === "dark" ? "✓" : undefined },
        { label: "Selon le système", icon: <Monitor className="size-4" />, onSelect: () => setTheme("system"), shortcut: theme === "system" ? "✓" : undefined },
        { separator: true, label: "" },
        { label: "Se déconnecter", icon: <LogOut className="size-4" />, onSelect: logout, danger: true },
      ]}
    />
  );
}

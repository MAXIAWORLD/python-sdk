import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  FileText,
  Filter,
  FolderKanban,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Package,
  Receipt,
  Repeat,
  Settings,
  Sparkles,
  SquareCheckBig,
  SquareKanban,
  Timer,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true, shortcut: "G D" },
      { to: "/assistant", label: "Assistant IA", icon: Sparkles, shortcut: "⌘J" },
      { to: "/reports", label: "Rapports", icon: ChartColumn },
    ],
  },
  {
    label: "Relation client",
    items: [
      { to: "/contacts", label: "Contacts", icon: Users, shortcut: "G C" },
      { to: "/companies", label: "Entreprises", icon: Building2, shortcut: "G E" },
      { to: "/deals", label: "Pipeline", icon: SquareKanban, shortcut: "G P" },
      { to: "/inbox", label: "Boîte mail", icon: Inbox },
    ],
  },
  {
    label: "Ventes & facturation",
    items: [
      { to: "/quotes", label: "Devis", icon: FileText },
      { to: "/invoices", label: "Factures", icon: Receipt, shortcut: "G F" },
      { to: "/subscriptions", label: "Abonnements", icon: Repeat },
      { to: "/products", label: "Catalogue", icon: Package },
    ],
  },
  {
    label: "Delivery",
    items: [
      { to: "/projects", label: "Projets", icon: FolderKanban },
      { to: "/tasks", label: "Tâches", icon: SquareCheckBig, shortcut: "G T" },
      { to: "/time", label: "Temps", icon: Timer },
      { to: "/calendar", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/tickets", label: "Tickets", icon: LifeBuoy },
      { to: "/kb", label: "Base de connaissances", icon: BookOpen },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/campaigns", label: "Campagnes", icon: Megaphone },
      { to: "/segments", label: "Segments", icon: Filter },
      { to: "/forms", label: "Formulaires", icon: ClipboardList },
    ],
  },
  {
    label: "Outils",
    items: [
      { to: "/documents", label: "Documents", icon: FolderOpen },
      { to: "/automations", label: "Automatisations", icon: Workflow },
      { to: "/settings", label: "Paramètres", icon: Settings },
    ],
  },
];

export const ALL_NAV: NavItem[] = NAV.flatMap((g) => g.items);

export const MOBILE_NAV: NavItem[] = [ALL_NAV[0], ALL_NAV.find((n) => n.to === "/contacts")!, ALL_NAV.find((n) => n.to === "/deals")!, ALL_NAV.find((n) => n.to === "/tasks")!];

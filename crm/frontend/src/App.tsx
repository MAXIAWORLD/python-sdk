import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { Backdrop } from "./components/glass/Backdrop";
import { AppShell, PageFallback } from "./components/layout/AppShell";
import { LogoMark } from "./components/layout/Logo";
import { api, setUnauthorizedHandler } from "./lib/api";
import type { User } from "./lib/types";
import { useAuth, type Branding } from "./stores/auth";
import { useUI } from "./stores/ui";

const Login = lazy(() => import("./pages/auth/Login"));
const Setup = lazy(() => import("./pages/auth/Setup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ContactsPage = lazy(() => import("./pages/contacts/ContactsPage"));
const ContactDetail = lazy(() => import("./pages/contacts/ContactDetail"));
const CompaniesPage = lazy(() => import("./pages/companies/CompaniesPage"));
const CompanyDetail = lazy(() => import("./pages/companies/CompanyDetail"));
const PipelinePage = lazy(() => import("./pages/deals/PipelinePage"));
const DealDetail = lazy(() => import("./pages/deals/DealDetail"));
const QuotesPage = lazy(() => import("./pages/quotes/QuotesPage"));
const QuoteEditor = lazy(() => import("./pages/quotes/QuoteEditor"));
const InvoicesPage = lazy(() => import("./pages/invoices/InvoicesPage"));
const InvoiceEditor = lazy(() => import("./pages/invoices/InvoiceEditor"));
const SubscriptionsPage = lazy(() => import("./pages/subscriptions/SubscriptionsPage"));
const ProductsPage = lazy(() => import("./pages/products/ProductsPage"));
const ProjectsPage = lazy(() => import("./pages/projects/ProjectsPage"));
const ProjectDetail = lazy(() => import("./pages/projects/ProjectDetail"));
const TasksPage = lazy(() => import("./pages/tasks/TasksPage"));
const TimePage = lazy(() => import("./pages/time/TimePage"));
const CalendarPage = lazy(() => import("./pages/calendar/CalendarPage"));
const TicketsPage = lazy(() => import("./pages/tickets/TicketsPage"));
const TicketDetail = lazy(() => import("./pages/tickets/TicketDetail"));
const KbPage = lazy(() => import("./pages/kb/KbPage"));
const CampaignsPage = lazy(() => import("./pages/marketing/CampaignsPage"));
const CampaignEditor = lazy(() => import("./pages/marketing/CampaignEditor"));
const SegmentsPage = lazy(() => import("./pages/marketing/SegmentsPage"));
const FormsPage = lazy(() => import("./pages/marketing/FormsPage"));
const InboxPage = lazy(() => import("./pages/inbox/InboxPage"));
const DocumentsPage = lazy(() => import("./pages/documents/DocumentsPage"));
const AutomationsPage = lazy(() => import("./pages/automations/AutomationsPage"));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage"));
const AssistantPage = lazy(() => import("./pages/assistant/AssistantPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const PublicQuote = lazy(() => import("./pages/public/PublicQuote"));
const PublicInvoice = lazy(() => import("./pages/public/PublicInvoice"));
const PublicForm = lazy(() => import("./pages/public/PublicForm"));
const Unsubscribe = lazy(() => import("./pages/public/Unsubscribe"));
const HelpCenter = lazy(() => import("./pages/public/HelpCenter"));
const NotFound = lazy(() => import("./pages/NotFound"));

function useThemeSync() {
  const theme = useUI((s) => s.theme);
  const effects = useUI((s) => s.effects);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute("content", dark ? "#05060d" : "#eef0f7");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("fx-low", effects === "low");
    root.classList.toggle("fx-balanced", effects === "balanced");
  }, [effects]);
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Backdrop variant="auth" />
      <div className="animate-[float_3s_ease-in-out_infinite]">
        <LogoMark size={64} />
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready, setupRequired } = useAuth();
  const location = useLocation();
  if (!ready) return <BootScreen />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function App() {
  useThemeSync();
  const set = useAuth((s) => s.set);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ setup_required: boolean; user: User | null; branding: Branding }>("/auth/status")
      .then((s) => {
        set({ user: s.user, setupRequired: s.setup_required, branding: s.branding, ready: true });
        if (s.branding?.accent) document.documentElement.style.setProperty("--accent", s.branding.accent);
      })
      .catch(() => set({ ready: true }));
    setUnauthorizedHandler(() => {
      set({ user: null });
      if (!location.pathname.startsWith("/login")) navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    });
  }, [set, navigate]);

  return (
    <Suspense fallback={<BootScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/p/quote/:token" element={<PublicQuote />} />
        <Route path="/p/invoice/:token" element={<PublicInvoice />} />
        <Route path="/f/:slug" element={<PublicForm />} />
        <Route path="/u/:token" element={<Unsubscribe />} />
        <Route path="/aide/*" element={<HelpCenter />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/:id" element={<CompanyDetail />} />
          <Route path="deals" element={<PipelinePage />} />
          <Route path="deals/:id" element={<DealDetail />} />
          <Route path="quotes" element={<QuotesPage />} />
          <Route path="quotes/:id" element={<QuoteEditor />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:id" element={<InvoiceEditor />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="time" element={<TimePage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="kb" element={<KbPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="campaigns/:id" element={<CampaignEditor />} />
          <Route path="segments" element={<SegmentsPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="automations" element={<AutomationsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export { PageFallback };

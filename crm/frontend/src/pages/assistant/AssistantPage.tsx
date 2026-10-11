import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ArrowUp,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Eye,
  FilePlus2,
  FileText,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  ListChecks,
  Lock,
  Mail,
  MessageSquare,
  MessageSquareReply,
  MessagesSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PencilLine,
  Pin,
  PinOff,
  PlugZap,
  Receipt,
  ReceiptText,
  Repeat,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquareCheckBig,
  SquareKanban,
  SquarePen,
  Stamp,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ChatView, IrisOrb, useAiStatus } from "@/components/ai/ChatView";
import { useChat, type Conversation } from "@/components/ai/useChat";
import { FilterChip } from "@/components/data/blocks";
import { Glass } from "@/components/glass/Glass";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, Spinner } from "@/components/ui/display";
import { fieldBase, SearchInput } from "@/components/ui/fields";
import { Menu, Sheet, useConfirm } from "@/components/ui/overlay";
import type { Tone } from "@/lib/constants";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { toastError, useLocalStorage } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

type AiStatus = NonNullable<ReturnType<typeof useAiStatus>["data"]>;

interface AiTool {
  name: string;
  title: string;
  description: string;
  risk: string;
}

/* -------------------------------------------------------------------------- */
/* Static content                                                             */
/* -------------------------------------------------------------------------- */

const SUGGESTIONS: { module: string; icon: LucideIcon; color: string; prompt: string }[] = [
  { module: "Facturation", icon: Receipt, color: "#10b981", prompt: "Quelles factures sont en retard ? Rédige les relances adaptées à chaque client." },
  { module: "Ventes", icon: Target, color: "#8b5cf6", prompt: "Prépare mon brief commercial de la semaine : affaires chaudes, risques et priorités." },
  { module: "Devis", icon: FileText, color: "#0ea5e9", prompt: "Crée une tâche de suivi pour chaque devis envoyé il y a plus de 7 jours sans réponse." },
  { module: "Leads", icon: UserPlus, color: "#5b6cff", prompt: "Qualifie les leads entrants d'aujourd'hui et propose un score BANT pour chacun." },
  { module: "Abonnements", icon: Repeat, color: "#6366f1", prompt: "Analyse l'évolution de mon MRR ce trimestre et explique les principaux mouvements." },
  { module: "Support", icon: LifeBuoy, color: "#f97316", prompt: "Quels tickets risquent de dépasser leur SLA ? Propose une réponse pour chacun." },
  { module: "Projets", icon: FolderKanban, color: "#14b8a6", prompt: "Quels projets dérivent en budget ou en délai ? Résume la situation et les actions à mener." },
  { module: "Agenda", icon: CalendarDays, color: "#ec4899", prompt: "Résume ma semaine : rendez-vous, échéances et tâches en retard." },
];

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_crm: Search,
  list_records: ListChecks,
  get_record: BookOpen,
  get_metrics: TrendingUp,
  get_pipeline: SquareKanban,
  create_record: FilePlus2,
  update_record: Pencil,
  delete_record: Trash2,
  move_deal: ArrowRightLeft,
  log_activity: MessageSquare,
  create_quote: FileText,
  create_invoice: Receipt,
  convert_quote: ReceiptText,
  issue_invoice: Stamp,
  record_payment: Wallet,
  send_email: Mail,
  reply_ticket: MessageSquareReply,
  create_task: SquareCheckBig,
  schedule_event: CalendarPlus,
};

const RISKS: { value: string; label: string; badge: string; tone: Tone; icon: LucideIcon }[] = [
  { value: "read", label: "Lecture", badge: "Lecture seule", tone: "green", icon: Eye },
  { value: "write", label: "Écriture", badge: "Écriture", tone: "blue", icon: PencilLine },
  { value: "sensitive", label: "Sensibles", badge: "Sensible", tone: "orange", icon: ShieldAlert },
];

const DAY = 86_400_000;

function groupConversations(items: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: { label: string; items: Conversation[] }[] = ["Épinglées", "Aujourd'hui", "Hier", "7 derniers jours", "30 derniers jours", "Plus anciennes"].map((label) => ({ label, items: [] }));
  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    const index = c.pinned ? 0 : t >= today ? 1 : t >= today - DAY ? 2 : t >= today - 7 * DAY ? 3 : t >= today - 30 * DAY ? 4 : 5;
    groups[index].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Conversations sidebar                                                      */
/* -------------------------------------------------------------------------- */

interface ConversationActions {
  onSelect: (c: Conversation) => void;
  onRename: (c: Conversation, title: string) => void;
  onPin: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const title = value.trim();
    onDone(save && title && title !== initial ? title : null);
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      maxLength={120}
      aria-label="Titre de la conversation"
      className={cn(fieldBase, "h-9 text-[13px]")}
    />
  );
}

function ConversationItem({ conv, active, actions }: { conv: Conversation; active: boolean; actions: ConversationActions }) {
  const [renaming, setRenaming] = useState(false);
  if (renaming)
    return (
      <div className="px-1 py-1">
        <RenameInput
          initial={conv.title}
          onDone={(title) => {
            setRenaming(false);
            if (title) actions.onRename(conv, title);
          }}
        />
      </div>
    );
  return (
    <div className={cn("group relative flex items-center rounded-[13px] transition-colors", active ? "bg-accent-soft" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]")}>
      <button type="button" onClick={() => actions.onSelect(conv)} onDoubleClick={() => setRenaming(true)} className="min-w-0 flex-1 px-3 py-2 text-left">
        <span className={cn("flex items-center gap-1.5 text-[13px]", active ? "font-medium text-accent" : "text-fg")}>
          {conv.pinned && <Pin className="size-3 shrink-0 opacity-60" />}
          <span className="truncate">{conv.title}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-3">
          {conv.status === "awaiting_approval" && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-300">
              <span className="size-1.5 rounded-full bg-amber-500" /> À valider ·
            </span>
          )}
          {relative(conv.updated_at)}
        </span>
      </button>
      <div className="pr-1 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100 lg:[&:has([data-state=open])]:opacity-100">
        <Menu
          width={210}
          trigger={
            <IconButton size="xs" label="Options de la conversation">
              <MoreHorizontal className="size-3.5" />
            </IconButton>
          }
          items={[
            { label: "Renommer", icon: <Pencil className="size-4" />, onSelect: () => setRenaming(true) },
            { label: conv.pinned ? "Désépingler" : "Épingler", icon: conv.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />, onSelect: () => actions.onPin(conv) },
            { separator: true, label: "" },
            { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => actions.onDelete(conv) },
          ]}
        />
      </div>
    </div>
  );
}

function ConversationList({ conversations, loading, activeId, onNew, actions }: { conversations: Conversation[]; loading: boolean; activeId: number | null; onNew: () => void; actions: ConversationActions }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = groupConversations(needle ? conversations.filter((c) => c.title.toLowerCase().includes(needle)) : conversations);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 p-3">
        <Button variant="primary" className="w-full" icon={<SquarePen className="size-4" />} onClick={onNew}>
          Nouvelle conversation
        </Button>
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher…" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-2 px-2 pt-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon={<MessagesSquare className="size-6" />} title={needle ? "Aucun résultat" : "Aucune conversation"} description={needle ? "Essayez un autre mot-clé." : "Vos échanges avec Iris apparaîtront ici."} className="px-4 py-10" />
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-2.5">
              <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">{g.label}</div>
              <AnimatePresence initial={false}>
                {g.items.map((c) => (
                  <motion.div key={c.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                    <ConversationItem conv={c} active={c.id === activeId} actions={actions} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status, MCP, tools                                                         */
/* -------------------------------------------------------------------------- */

function ProviderStatus({ status, loading }: { status?: AiStatus; loading: boolean }) {
  if (loading) return <Skeleton className="mt-1 h-3 w-36" />;
  if (!status?.configured)
    return (
      <Link to="/settings?tab=ai" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-600 hover:underline dark:text-amber-300">
        <span className="size-1.5 rounded-full bg-amber-500" />
        IA non configurée · configurer
        <ChevronRight className="size-3" />
      </Link>
    );
  const p = status.default_provider;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
      <span className="truncate">{p ? `${p.name} · ${p.model}` : "Aucun fournisseur par défaut"}</span>
    </span>
  );
}

function McpCard() {
  return (
    <Link to="/settings?tab=mcp" className="group glass-flat flex items-center gap-3 rounded-[18px] p-2.5 text-left transition hover:-translate-y-0.5">
      <span className="ai-gradient flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-[0_8px_18px_-8px_rgba(178,107,255,.8)]">
        <PlugZap className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug">Utiliser votre abonnement Claude via MCP</span>
        <span className="block truncate text-[12px] leading-snug text-fg-3">Pilotez Prisme depuis Claude Desktop, sans clé API.</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

function ToolsDrawer({ open, onOpenChange, tools, loading, requireApproval, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; tools: AiTool[]; loading: boolean; requireApproval: boolean; isAdmin: boolean }) {
  const [risk, setRisk] = useState("all");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = tools.filter((t) => (risk === "all" || t.risk === risk) && (!needle || `${t.title} ${t.name} ${t.description}`.toLowerCase().includes(needle)));
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Outils d'Iris"
      width={580}
      footer={
        <>
          {isAdmin && (
            <Button variant="ghost" asChild>
              <Link to="/settings?tab=ai">Paramètres de l'IA</Link>
            </Button>
          )}
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-fg-2">Iris agit dans Prisme au moyen de {tools.length || "ses"} outils, avec vos droits d'accès. Elle choisit uniquement ceux nécessaires à votre demande.</p>
      <div className="mt-4 flex gap-3 rounded-[18px] bg-accent-soft p-3.5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="text-[12.5px] leading-relaxed text-fg-2">
          <div className="mb-0.5 text-[13px] font-semibold text-fg">Vous gardez la main</div>
          {requireApproval
            ? "Chaque action d'écriture (création, modification, déplacement…) vous est présentée avant exécution : vous l'autorisez ou la refusez."
            : "La validation des actions d'écriture courantes est désactivée dans les paramètres : elles s'exécutent directement."}{" "}
          Les actions sensibles — envoi d'email, émission de facture, enregistrement de paiement, suppression — demandent toujours votre accord explicite.
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un outil…" />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={risk === "all"} onClick={() => setRisk("all")} count={tools.length}>
            Tous
          </FilterChip>
          {RISKS.map((r) => (
            <FilterChip key={r.value} active={risk === r.value} onClick={() => setRisk(risk === r.value ? "all" : r.value)} count={tools.filter((t) => t.risk === r.value).length}>
              {r.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {loading && <Skeleton className="h-60 rounded-[16px]" />}
        {!loading && visible.length === 0 && <EmptyState icon={<Wrench className="size-6" />} title="Aucun outil ne correspond" className="py-10" />}
        {RISKS.map((r) => {
          const items = visible.filter((t) => t.risk === r.value);
          if (!items.length) return null;
          return (
            <section key={r.value}>
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-fg-3">
                <r.icon className="size-3.5" />
                {r.label} · {items.length}
                {r.value !== "read" && (r.value === "sensitive" || requireApproval) && (
                  <span className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-fg-3">
                    <Lock className="size-3" /> validation requise
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {items.map((t) => {
                  const Icon = TOOL_ICONS[t.name] ?? Sparkles;
                  return (
                    <div key={t.name} className="flex gap-3 rounded-[16px] bg-black/[0.025] p-3 dark:bg-white/[0.035]">
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[11px]", t.risk === "sensitive" ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-accent-soft text-accent")}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[13.5px] font-semibold">{t.title}</span>
                          <code className="font-mono text-[11px] text-fg-3">{t.name}</code>
                        </div>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{t.description}</p>
                      </div>
                      <Badge tone={r.tone} size="xs" className="mt-0.5 self-start">
                        {r.badge}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Welcome                                                                    */
/* -------------------------------------------------------------------------- */

function HeroComposer({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [autoFocus] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(200, Math.max(56, ta.scrollHeight))}px`;
  }, [text]);
  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="glass ai-border mt-7 w-full max-w-[720px] rounded-[24px] p-2.5 text-left">
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        rows={2}
        placeholder="Demandez n'importe quoi à Iris…"
        aria-label="Message pour Iris"
        className="block max-h-[200px] w-full resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed outline-none placeholder:text-fg-3 disabled:opacity-50"
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="hidden text-[11.5px] text-fg-3 sm:inline">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</span>
        <button type="button" onClick={submit} disabled={!text.trim() || disabled} className="ai-gradient ml-auto flex size-9 items-center justify-center rounded-[12px] text-white shadow-[0_8px_20px_-8px_rgba(178,107,255,.9)] transition disabled:opacity-40" aria-label="Envoyer">
          <ArrowUp className="size-4" strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

function SuggestionGrid({ onPick, disabled }: { onPick: (prompt: string) => void; disabled?: boolean }) {
  return (
    <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {SUGGESTIONS.map((s, i) => (
        <motion.button
          key={s.module}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s.prompt)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + i * 0.03, duration: 0.3 }}
          className="glass-flat group flex flex-col rounded-[18px] p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)] disabled:pointer-events-none"
        >
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[9px]" style={{ background: `color-mix(in oklab, ${s.color} 16%, transparent)`, color: s.color }}>
              <s.icon className="size-3.5" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3">{s.module}</span>
          </span>
          <span className={cn("mt-2 text-[13px] leading-snug", disabled ? "text-fg-3" : "text-fg-2 group-hover:text-fg")}>{s.prompt}</span>
        </motion.button>
      ))}
    </div>
  );
}

function Welcome({ status, statusLoading, canChat, isAdmin, onSend }: { status?: AiStatus; statusLoading: boolean; canChat: boolean; isAdmin: boolean; onSend: (text: string) => void }) {
  const user = useAuth((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "";
  const configured = !!status?.configured;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1000px] flex-col items-center justify-center px-4 py-8 text-center sm:px-8">
        <IrisOrb size={92} />
        <h1 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]">
          Bonjour {firstName}, <span className="text-iridescent">que puis-je faire pour vous ?</span>
        </h1>
        <p className="mt-2 max-w-[580px] text-[14px] leading-relaxed text-fg-2">
          {status?.assistant_name ?? "Iris"} connaît tout votre CRM : elle cherche, analyse, rédige et agit pour vous. Les actions importantes vous sont toujours soumises avant exécution.
        </p>

        {statusLoading ? (
          <Skeleton className="mt-7 h-[118px] w-full max-w-[720px] rounded-[24px]" />
        ) : configured ? (
          <>
            <HeroComposer onSend={onSend} disabled={!canChat} />
            {!canChat && <p className="mt-2 text-[12.5px] text-fg-3">Votre rôle (lecteur) permet de consulter l'historique, mais pas de converser avec Iris.</p>}
          </>
        ) : (
          <div className="mt-7 w-full max-w-[760px]">
            <div className="grid gap-3 text-left sm:grid-cols-2">
              <div className="glass relative flex flex-col rounded-[22px] p-4">
                <Badge tone="violet" size="xs" className="absolute right-4 top-4">
                  Recommandé
                </Badge>
                <span className="flex size-10 items-center justify-center rounded-[13px] bg-accent-soft text-accent">
                  <KeyRound className="size-5" />
                </span>
                <h2 className="mt-3 text-[15px] font-semibold">Connecter une intelligence artificielle</h2>
                <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-fg-2">Ajoutez une clé API (Claude, OpenAI, Mistral, Gemini, Groq…) ou un modèle local (Ollama, LM Studio). Les clés sont chiffrées et les données personnelles peuvent être pseudonymisées.</p>
                {isAdmin ? (
                  <Button variant="primary" className="mt-4 self-start" asChild>
                    <Link to="/settings?tab=ai">
                      Configurer l'IA <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <p className="mt-4 text-[12px] text-fg-3">Demandez à un administrateur d'effectuer cette configuration.</p>
                )}
              </div>
              <div className="glass flex flex-col rounded-[22px] p-4">
                <span className="ai-gradient flex size-10 items-center justify-center rounded-[13px] text-white">
                  <PlugZap className="size-5" />
                </span>
                <h2 className="mt-3 text-[15px] font-semibold">Utiliser votre abonnement Claude via MCP</h2>
                <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-fg-2">Avec Claude Pro ou Max, connectez Claude Desktop au serveur MCP intégré de Prisme : Claude consulte et met à jour votre CRM, sans clé API ni coût supplémentaire.</p>
                <Button variant="glass" className="mt-4 self-start" asChild>
                  <Link to="/settings?tab=mcp">
                    Connecter Claude <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-9 w-full">
          <div className="mb-3 flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">
            <Sparkles className="size-3.5 text-[#b26bff]" />
            {configured ? "Suggestions" : "Ce qu'Iris pourra faire pour vous"}
          </div>
          <SuggestionGrid onPick={onSend} disabled={!configured || !canChat} />
        </div>

      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function AssistantPage() {
  const chat = useChat();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const user = useAuth((s) => s.user);
  const [params, setParams] = useSearchParams();
  const { data: status, isLoading: statusLoading } = useAiStatus();
  const conversations = useQuery({ queryKey: ["ai-conversations"], queryFn: () => api.get<{ items: Conversation[] }>("/ai/conversations") });
  const tools = useQuery({ queryKey: ["ai-tools"], queryFn: () => api.get<{ tools: AiTool[] }>("/ai/tools"), staleTime: Infinity });
  const [collapsed, setCollapsed] = useLocalStorage("prisme-assistant-sidebar-collapsed", false);
  const [drawer, setDrawer] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const urlConversation = useRef(params.get("c"));

  const items = useMemo(() => conversations.data?.items ?? [], [conversations.data]);
  const active = items.find((c) => c.id === chat.conversationId) ?? null;
  const title = active?.title ?? chat.title;
  const canChat = can(user, "member");
  const isAdmin = can(user, "admin");

  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-conversations"] });

  const open = async (id: number) => {
    setDrawer(false);
    setRenaming(false);
    if (id === chat.conversationId) return;
    setOpening(id);
    try {
      await chat.load(id);
    } catch {
      toast.error("Conversation introuvable", { description: "Elle a peut-être été supprimée." });
      chat.reset();
      setParams({}, { replace: true });
    } finally {
      setOpening(null);
    }
  };

  const startNew = () => {
    chat.reset();
    setDrawer(false);
    setRenaming(false);
    setParams({}, { replace: true });
  };

  // The full-page assistant replaces the floating panel.
  useEffect(() => {
    if (useUI.getState().assistantOpen) useUI.getState().closeAssistant();
  }, []);

  // Deep link: /assistant?c=12 opens that conversation once.
  const { load, reset } = chat;
  useEffect(() => {
    const id = Number(urlConversation.current);
    urlConversation.current = null;
    if (!id) return;
    setOpening(id);
    load(id)
      .catch(() => {
        toast.error("Conversation introuvable");
        reset();
      })
      .finally(() => setOpening(null));
  }, [load, reset]);

  // Keep the URL in sync once a conversation exists (created on first message).
  useEffect(() => {
    if (!chat.conversationId) return;
    setParams(
      (p) => {
        if (p.get("c") === String(chat.conversationId)) return p;
        const next = new URLSearchParams(p);
        next.set("c", String(chat.conversationId));
        return next;
      },
      { replace: true },
    );
  }, [chat.conversationId, setParams]);

  const actions: ConversationActions = {
    onSelect: (c) => open(c.id),
    onRename: async (c, newTitle) => {
      try {
        await api.patch(`/ai/conversations/${c.id}`, { title: newTitle });
        refresh();
      } catch (e) {
        toastError(e);
      }
    },
    onPin: async (c) => {
      try {
        await api.patch(`/ai/conversations/${c.id}`, { pinned: !c.pinned });
        toast.success(c.pinned ? "Conversation désépinglée" : "Conversation épinglée");
        refresh();
      } catch (e) {
        toastError(e);
      }
    },
    onDelete: async (c) => {
      const ok = await confirm({ title: "Supprimer cette conversation ?", description: `« ${c.title} » et tout son historique seront définitivement supprimés.`, danger: true, confirmLabel: "Supprimer" });
      if (!ok) return;
      try {
        await api.delete(`/ai/conversations/${c.id}`);
        if (c.id === chat.conversationId) startNew();
        toast.success("Conversation supprimée");
        refresh();
      } catch (e) {
        toastError(e);
      }
    },
  };

  const send = (text: string) => chat.send(text, null);
  const sidebar = <ConversationList conversations={items} loading={conversations.isLoading} activeId={chat.conversationId} onNew={startNew} actions={actions} />;

  return (
    <div className="flex h-[calc(100dvh-218px)] min-h-[520px] gap-4 lg:h-[calc(100dvh-130px)]">
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div key="sidebar" initial={{ width: 0, opacity: 0 }} animate={{ width: 288, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="hidden shrink-0 overflow-hidden lg:block">
            <Glass radius="xl" className="flex h-full w-[288px] flex-col overflow-hidden">
              {sidebar}
              {status?.configured && (
                <div className="border-t border-[var(--hairline)] p-3">
                  <McpCard />
                </div>
              )}
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <Glass radius="xl" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-2.5 sm:px-4">
          <IconButton label="Conversations" className="lg:hidden" onClick={() => setDrawer(true)}>
            <PanelLeftOpen className="size-[18px]" />
          </IconButton>
          <IconButton label={collapsed ? "Afficher les conversations" : "Masquer les conversations"} className="hidden lg:inline-flex" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </IconButton>
          <IrisOrb size={30} thinking={chat.streaming} />
          <div className="min-w-0 flex-1">
            {renaming && active ? (
              <RenameInput
                initial={active.title}
                onDone={(t) => {
                  setRenaming(false);
                  if (t) actions.onRename(active, t);
                }}
              />
            ) : (
              <>
                <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{chat.messages.length || active ? title : status?.assistant_name ?? "Iris"}</div>
                <ProviderStatus status={status} loading={statusLoading} />
              </>
            )}
          </div>
          <Button size="sm" variant="glass" icon={<Wrench className="size-3.5" />} onClick={() => setToolsOpen(true)} aria-label="Outils disponibles">
            <span className="hidden sm:inline">Outils</span>
            {!!tools.data?.tools.length && <span className="rounded-full bg-black/[0.06] px-1.5 text-[10.5px] tabular text-fg-2 dark:bg-white/10">{tools.data.tools.length}</span>}
          </Button>
          <IconButton label="Nouvelle conversation" onClick={startNew}>
            <SquarePen className="size-[18px]" />
          </IconButton>
          {active && (
            <Menu
              trigger={
                <IconButton label="Plus d'options">
                  <MoreHorizontal className="size-[18px]" />
                </IconButton>
              }
              items={[
                { label: "Renommer", icon: <Pencil className="size-4" />, onSelect: () => setRenaming(true) },
                { label: active.pinned ? "Désépingler" : "Épingler", icon: active.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />, onSelect: () => actions.onPin(active) },
                { separator: true, label: "" },
                { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => actions.onDelete(active) },
              ]}
            />
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          {chat.messages.length === 0 ? (
            <motion.div key="welcome" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <Welcome status={status} statusLoading={statusLoading} canChat={canChat} isAdmin={isAdmin} onSend={send} />
            </motion.div>
          ) : (
            <motion.div key={`chat-${chat.conversationId ?? "new"}`} className="mx-auto h-full w-full max-w-[900px]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <ChatView chat={chat} context={null} />
            </motion.div>
          )}
          <AnimatePresence>
            {opening !== null && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_oklab,var(--bg)_45%,transparent)] backdrop-blur-[6px]">
                <span className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[13px] text-fg-2">
                  <Spinner className="size-4" /> Ouverture de la conversation…
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Glass>

      <Sheet open={drawer} onOpenChange={setDrawer} side="left" width={340} title="Conversations">
        <div className="-m-5 flex h-[calc(100%+40px)] flex-col">
          {sidebar}
          {status?.configured && (
            <div className="border-t border-[var(--hairline)] p-3">
              <McpCard />
            </div>
          )}
        </div>
      </Sheet>

      <ToolsDrawer open={toolsOpen} onOpenChange={setToolsOpen} tools={tools.data?.tools ?? []} loading={tools.isLoading} requireApproval={status?.require_approval ?? true} isAdmin={isAdmin} />
    </div>
  );
}

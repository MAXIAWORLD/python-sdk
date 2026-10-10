import { useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  BookOpen,
  Brain,
  Calendar,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FilePlus2,
  ListChecks,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  Pencil,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/display";
import { Markdown } from "@/components/ui/markdown";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import type { AssistantContext } from "@/stores/ui";
import type { ChatBlock, ChatMessage } from "./useChat";

interface AiStatus {
  configured: boolean;
  default_provider: { id: number; name: string; kind: string; model: string } | null;
  assistant_name: string;
  require_approval: boolean;
  mcp_enabled: boolean;
}

export function useAiStatus() {
  return useQuery({ queryKey: ["ai-status"], queryFn: () => api.get<AiStatus>("/ai/status"), staleTime: 60_000 });
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_crm: Search,
  list_records: ListChecks,
  get_record: BookOpen,
  get_metrics: TrendingUp,
  get_pipeline: TrendingUp,
  create_record: FilePlus2,
  update_record: Pencil,
  delete_record: Trash2,
  move_deal: TrendingUp,
  log_activity: MessageSquare,
  create_quote: FilePlus2,
  create_invoice: Receipt,
  convert_quote: Receipt,
  issue_invoice: ShieldCheck,
  record_payment: Wallet,
  send_email: Mail,
  reply_ticket: MessageSquare,
  create_task: ListChecks,
  schedule_event: Calendar,
};

/** The assistant's living orb. */
export function IrisOrb({ size = 72, thinking }: { size?: number; thinking?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: "conic-gradient(from 0deg, #7c8cff, #c084fc, #f472b6, #fbbf24, #22d3ee, #7c8cff)", filter: `blur(${size / 7}px)` }}
        animate={{ rotate: 360, scale: thinking ? [1, 1.12, 1] : 1 }}
        transition={{ rotate: { duration: thinking ? 3 : 9, repeat: Infinity, ease: "linear" }, scale: { duration: 1.6, repeat: Infinity } }}
      />
      <div className="glass absolute inset-[14%] rounded-full" style={{ background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,.95), rgba(255,255,255,.2) 38%, rgba(255,255,255,.05) 70%)" }} />
      <Sparkles className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" style={{ width: size * 0.3, height: size * 0.3 }} />
    </div>
  );
}

function ToolCard({ block, onDecide, awaiting }: { block: Extract<ChatBlock, { type: "tool" }>; onDecide?: (approve: boolean) => void; awaiting?: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[block.name] ?? Sparkles;
  const status = {
    running: { label: "En cours", cls: "text-accent", icon: <Spinner className="size-3.5" /> },
    auto: { label: "En attente", cls: "text-fg-3", icon: <Spinner className="size-3.5" /> },
    pending: { label: "À valider", cls: "text-amber-600 dark:text-amber-300", icon: <CircleAlert className="size-3.5" /> },
    done: { label: "Fait", cls: "text-emerald-600 dark:text-emerald-400", icon: <Check className="size-3.5" /> },
    error: { label: "Erreur", cls: "text-red-500", icon: <X className="size-3.5" /> },
    denied: { label: "Refusé", cls: "text-fg-3", icon: <X className="size-3.5" /> },
  }[block.status];
  const link = block.data?.link as string | undefined;
  const sensitive = block.risk === "sensitive";
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("glass-inset overflow-hidden rounded-[14px]", block.status === "pending" && "ring-1 ring-amber-400/60")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[9px]", sensitive ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-accent-soft text-accent")}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{block.title}</span>
          {block.error && <span className="block truncate text-[11.5px] text-red-500">{block.error}</span>}
        </span>
        <span className={cn("flex shrink-0 items-center gap-1 text-[11.5px] font-medium", status.cls)}>
          {status.icon}
          {status.label}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <pre className="mx-3 mb-2 max-h-48 overflow-auto rounded-[10px] bg-black/[0.04] p-2.5 text-[11px] leading-relaxed text-fg-2 dark:bg-white/[0.05]">{JSON.stringify(block.input ?? {}, null, 2)}</pre>
          </motion.div>
        )}
      </AnimatePresence>
      {block.status === "pending" && awaiting && onDecide && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] px-3 py-2">
          <span className="mr-auto text-[11.5px] text-fg-3">{sensitive ? "Action sensible : validation obligatoire" : "Validation requise"}</span>
          <Button size="xs" variant="ghost" onClick={() => onDecide(false)}>
            Refuser
          </Button>
          <Button size="xs" variant="primary" onClick={() => onDecide(true)} icon={<Check className="size-3.5" />}>
            Autoriser
          </Button>
        </div>
      )}
      {block.status === "done" && link && (
        <div className="border-t border-[var(--hairline)] px-3 py-1.5">
          <Link to={link} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
            Ouvrir <ExternalLink className="size-3" />
          </Link>
        </div>
      )}
    </motion.div>
  );
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[12.5px]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-fg-3 hover:text-fg-2">
        <Brain className={cn("size-3.5", live && "animate-pulse text-[#b26bff]")} />
        {live ? "Réflexion en cours…" : "Raisonnement"}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-[var(--hairline-strong)] pl-3 text-fg-2">{text}</div>}
    </div>
  );
}

function MessageView({ message, last, streaming, pendingIds, onDecide }: { message: ChatMessage; last: boolean; streaming: boolean; pendingIds: string[]; onDecide: (id: string, approve: boolean) => void }) {
  if (message.role === "user") {
    const text = message.blocks[0]?.type === "text" ? message.blocks[0].text : "";
    return (
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
        <div className="max-w-[86%] whitespace-pre-wrap rounded-[20px] rounded-br-[8px] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_10px_24px_-12px_var(--accent)]">{text}</div>
      </motion.div>
    );
  }
  const lastText = [...message.blocks].reverse().find((b) => b.type === "text");
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        <IrisOrb size={28} thinking={last && streaming} />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {message.blocks.map((b, i) => {
          if (b.type === "text") return <Markdown key={i} streaming={last && streaming && b === lastText}>{b.text}</Markdown>;
          if (b.type === "thinking") return <Thinking key={i} text={b.text} live={last && streaming && i === message.blocks.length - 1} />;
          if (b.type === "error")
            return (
              <div key={i} className="flex items-start gap-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {b.text}
              </div>
            );
          return <ToolCard key={b.id} block={b} awaiting={pendingIds.includes(b.id)} onDecide={(approve) => onDecide(b.id, approve)} />;
        })}
        {last && streaming && message.blocks.length === 0 && (
          <div className="flex items-center gap-2 text-[13px] text-fg-3">
            <Spinner className="size-3.5" /> Iris réfléchit…
          </div>
        )}
      </div>
    </motion.div>
  );
}

const SUGGESTIONS = [
  "Fais-moi le brief du jour",
  "Quelles factures sont en retard et combien ça représente ?",
  "Quels deals sont à risque ce mois-ci ?",
  "Crée une tâche pour relancer mes devis envoyés",
  "Analyse l'évolution de mon MRR",
  "Prépare un devis pour 5 jours de développement",
];

export function ChatView({ chat, context, compact }: { chat: ReturnType<typeof import("./useChat").useChat>; context?: AssistantContext | null; compact?: boolean }) {
  const { data: status } = useAiStatus();
  const user = useAuth((s) => s.user);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages, chat.pending]);

  useEffect(() => {
    const ta = textarea.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(180, ta.scrollHeight) + "px";
  }, [input]);

  const submit = (text = input) => {
    if (!text.trim()) return;
    chat.send(text, context);
    setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const dictate = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new SR() as { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void };
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput((base ? base + " " : "") + transcript);
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  };
  const canDictate = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const pendingIds = chat.pending.map((p) => p.id);
  const approveAll = (approve: boolean) => chat.decide(Object.fromEntries(chat.pending.map((p) => [p.id, approve])));
  const decideOne = (id: string, approve: boolean) => {
    if (chat.pending.length <= 1) chat.decide({ [id]: approve });
    else chat.decide(Object.fromEntries(chat.pending.map((p) => [p.id, p.id === id ? approve : false])));
  };

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {chat.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <IrisOrb size={compact ? 76 : 96} />
            <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">
              Bonjour {firstName} <span className="text-iridescent">— je suis {status?.assistant_name ?? "Iris"}</span>
            </h2>
            <p className="mt-1.5 max-w-[420px] text-[13.5px] text-fg-2">Je peux chercher, analyser, créer et mettre à jour tout votre CRM : contacts, deals, devis, factures, projets, tickets… Les actions importantes vous sont toujours soumises.</p>
            {status && !status.configured ? (
              <div className="glass mt-6 w-full max-w-[460px] rounded-[20px] p-4 text-left">
                <p className="text-[14px] font-semibold">Connectez une intelligence artificielle</p>
                <p className="mt-1 text-[12.5px] text-fg-2">Ajoutez une clé API (Claude, OpenAI, Mistral, Gemini…) ou un modèle local Ollama. Avec un abonnement Claude Pro/Max, pilotez aussi le CRM depuis Claude Desktop via MCP.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" asChild>
                    <Link to="/settings?tab=ai">Ajouter une clé API</Link>
                  </Button>
                  <Button size="sm" variant="glass" asChild>
                    <Link to="/settings?tab=mcp">Utiliser mon abonnement Claude</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className={cn("mt-6 grid w-full gap-2", compact ? "grid-cols-1" : "max-w-[640px] sm:grid-cols-2")}>
                {SUGGESTIONS.slice(0, compact ? 4 : 6).map((s) => (
                  <button key={s} onClick={() => submit(s)} className="glass-flat rounded-[14px] px-3.5 py-2.5 text-left text-[13px] text-fg-2 transition hover:-translate-y-0.5 hover:text-fg">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {chat.messages.map((m, i) => (
              <MessageView key={m.id} message={m} last={i === chat.messages.length - 1} streaming={chat.streaming} pendingIds={pendingIds} onDecide={decideOne} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {chat.pending.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-[16px] bg-amber-500/12 px-3 py-2 text-[12.5px]">
            <span>{chat.pending.length} actions attendent votre validation</span>
            <span className="flex gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => approveAll(false)}>
                Tout refuser
              </Button>
              <Button size="xs" variant="primary" onClick={() => approveAll(true)}>
                Tout autoriser
              </Button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="glass ai-border rounded-[22px] p-2">
          {context && (context.label || context.page) && (
            <div className="mb-1 flex items-center gap-1.5 px-2 pt-1 text-[11.5px] text-fg-3">
              <Sparkles className="size-3 text-[#b26bff]" /> Contexte : {context.label ?? context.page}
            </div>
          )}
          <textarea
            ref={textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={chat.pending.length ? "Validez ou refusez l'action ci-dessus, ou écrivez pour continuer…" : "Demandez n'importe quoi à Iris…"}
            className="block max-h-[180px] w-full resize-none bg-transparent px-2.5 py-2 text-[14px] leading-relaxed outline-none placeholder:text-fg-3"
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="truncate text-[11px] text-fg-3">{status?.default_provider ? `${status.default_provider.name} · ${status.default_provider.model}` : ""}</span>
            <div className="flex items-center gap-1">
              {canDictate && (
                <button onClick={dictate} className={cn("flex size-8 items-center justify-center rounded-[10px] text-fg-3 transition hover:text-fg", listening && "pulse-ring bg-red-500/15 text-red-500")} aria-label="Dicter">
                  {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </button>
              )}
              {chat.streaming ? (
                <button onClick={chat.stop} className="flex size-8 items-center justify-center rounded-[11px] bg-black/80 text-white dark:bg-white/90 dark:text-black" aria-label="Arrêter">
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button onClick={() => submit()} disabled={!input.trim()} className="ai-gradient flex size-8 items-center justify-center rounded-[11px] text-white transition disabled:opacity-40" aria-label="Envoyer">
                  <ArrowUp className="size-4" strokeWidth={2.6} />
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-fg-3">Contenu généré par IA : vérifiez les informations importantes.</p>
      </div>
    </div>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { api, streamSSE } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import type { AssistantContext } from "@/stores/ui";

export type ToolStatus = "running" | "pending" | "auto" | "done" | "error" | "denied";

export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "error"; text: string }
  | { type: "tool"; id: string; name: string; title: string; input?: Record<string, unknown>; status: ToolStatus; risk?: string; data?: Record<string, unknown> | null; error?: string | null };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: ChatBlock[];
}

interface StoredMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: Record<string, unknown>[];
}

export interface Conversation {
  id: number;
  title: string;
  model?: string | null;
  provider_id?: number | null;
  updated_at: string;
  pinned: boolean;
  status: string;
}

function fromStored(messages: StoredMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const toolIndex = new Map<string, { type: "tool" } & ChatBlock>();
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ id: `u${m.id}`, role: "user", blocks: [{ type: "text", text: String(m.content.find((b) => b.type === "text")?.text ?? "") }] });
    } else if (m.role === "assistant") {
      const blocks: ChatBlock[] = [];
      for (const b of m.content) {
        if (b.type === "text" && b.text) blocks.push({ type: "text", text: String(b.text) });
        else if (b.type === "thinking" && b.text) blocks.push({ type: "thinking", text: String(b.text) });
        else if (b.type === "tool_call") {
          const block = { type: "tool" as const, id: String(b.id), name: String(b.name), title: String(b.title ?? b.name), input: b.input as Record<string, unknown>, status: (b.status as ToolStatus) ?? "done", risk: b.risk as string | undefined };
          blocks.push(block);
          toolIndex.set(block.id, block);
        }
      }
      const prev = out[out.length - 1];
      if (prev && prev.role === "assistant") prev.blocks.push(...blocks);
      else out.push({ id: `a${m.id}`, role: "assistant", blocks });
    } else if (m.role === "tool") {
      for (const r of m.content) {
        const block = toolIndex.get(String(r.tool_call_id));
        if (block && block.type === "tool") {
          block.data = (r.preview as Record<string, unknown>) ?? null;
          if (r.ok === false && block.status !== "denied") block.status = "error";
        }
      }
    }
  }
  return out;
}

export function useChat() {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [title, setTitle] = useState<string>("Nouvelle conversation");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<{ id: string; name: string; title: string; input?: Record<string, unknown>; risk?: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const patchAssistant = useCallback((fn: (blocks: ChatBlock[]) => ChatBlock[]) => {
    setMessages((prev) => {
      const next = [...prev];
      let last = next[next.length - 1];
      if (!last || last.role !== "assistant") {
        last = { id: `a-${Date.now()}`, role: "assistant", blocks: [] };
        next.push(last);
      } else {
        last = { ...last, blocks: [...last.blocks] };
        next[next.length - 1] = last;
      }
      last.blocks = fn(last.blocks);
      return next;
    });
  }, []);

  const handleEvent = useCallback(
    (ev: Record<string, unknown>) => {
      switch (ev.type) {
        case "text":
        case "thinking": {
          const kind = ev.type as "text" | "thinking";
          patchAssistant((blocks) => {
            const last = blocks[blocks.length - 1];
            if (last && last.type === kind) return [...blocks.slice(0, -1), { ...last, text: last.text + String(ev.text ?? "") }];
            return [...blocks, { type: kind, text: String(ev.text ?? "") }];
          });
          break;
        }
        case "tool_call":
          patchAssistant((blocks) => [...blocks, { type: "tool", id: String(ev.id), name: String(ev.name), title: String(ev.title ?? ev.name), input: ev.input as Record<string, unknown>, status: (ev.status as ToolStatus) ?? "running", risk: ev.risk as string }]);
          break;
        case "tool_result":
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              blocks: m.blocks.map((b) => (b.type === "tool" && b.id === ev.id ? { ...b, status: ev.denied ? "denied" : ev.ok ? "done" : "error", data: (ev.data as Record<string, unknown>) ?? null, error: (ev.error as string) ?? null } : b)),
            })),
          );
          break;
        case "approval_required":
          setPending((ev.calls as typeof pending) ?? []);
          break;
        case "title":
          setTitle(String(ev.title));
          qc.invalidateQueries({ queryKey: ["ai-conversations"] });
          break;
        case "error":
          patchAssistant((blocks) => [...blocks, { type: "error", text: String(ev.message ?? "Erreur") }]);
          break;
        case "done":
          break;
      }
    },
    [patchAssistant, qc],
  );

  const run = useCallback(
    async (path: string, body: unknown) => {
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamSSE(path, body, handleEvent, controller.signal);
      } catch (e) {
        if ((e as Error).name !== "AbortError") patchAssistant((blocks) => [...blocks, { type: "error", text: errorMessage(e) }]);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // The assistant may have changed CRM data: refresh everything visible.
        qc.invalidateQueries();
      }
    },
    [handleEvent, patchAssistant, qc],
  );

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const conv = await api.post<Conversation>("/ai/conversations", {});
    setConversationId(conv.id);
    return conv.id;
  }, [conversationId]);

  const send = useCallback(
    async (text: string, context?: AssistantContext | null) => {
      const message = text.trim();
      if (!message || streaming) return;
      setPending([]);
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", blocks: [{ type: "text", text: message }] }]);
      try {
        const id = await ensureConversation();
        await run(`/ai/conversations/${id}/messages`, { message, context: context ?? undefined });
      } catch (e) {
        patchAssistant((blocks) => [...blocks, { type: "error", text: errorMessage(e) }]);
      }
    },
    [ensureConversation, run, streaming, patchAssistant],
  );

  const decide = useCallback(
    async (decisions: Record<string, boolean>) => {
      if (!conversationId) return;
      setMessages((prev) => prev.map((m) => ({ ...m, blocks: m.blocks.map((b) => (b.type === "tool" && b.id in decisions ? { ...b, status: decisions[b.id] ? "running" : "denied" } : b)) })));
      setPending([]);
      await run(`/ai/conversations/${conversationId}/approve`, { decisions });
    },
    [conversationId, run],
  );

  const load = useCallback(async (id: number) => {
    const conv = await api.get<Conversation & { messages: StoredMessage[] }>(`/ai/conversations/${id}`);
    setConversationId(conv.id);
    setTitle(conv.title);
    const msgs = fromStored(conv.messages);
    setMessages(msgs);
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
    setPending(
      conv.status === "awaiting_approval" && lastAssistant
        ? lastAssistant.blocks.filter((b): b is Extract<ChatBlock, { type: "tool" }> => b.type === "tool" && b.status === "pending").map((b) => ({ id: b.id, name: b.name, title: b.title, input: b.input, risk: b.risk }))
        : [],
    );
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(null);
    setTitle("Nouvelle conversation");
    setMessages([]);
    setPending([]);
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { conversationId, title, messages, streaming, pending, send, decide, load, reset, stop };
}

import { Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { streamSSE } from "@/lib/api";
import { toastError } from "@/lib/hooks";

/** Stream a one-shot AI generation (« ✨ » actions across the CRM). */
export function useAiGenerate() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async (kind: string, params: Record<string, unknown> = {}, onChunk?: (full: string) => void) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setText("");
    let full = "";
    let failure: string | null = null;
    try {
      await streamSSE(
        "/ai/quick",
        { kind, params },
        (ev) => {
          if (ev.type === "text") {
            full += String(ev.text ?? "");
            setText(full);
            onChunk?.(full);
          } else if (ev.type === "error") {
            failure = String(ev.message ?? "Erreur de génération");
          }
        },
        controller.signal,
      );
      if (failure) toastError(new Error(failure));
    } catch (e) {
      if ((e as Error).name !== "AbortError") toastError(e);
    } finally {
      setLoading(false);
    }
    return full;
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);
  return { text, loading, run, stop, setText };
}

export function AiButton({ children = "Générer avec l'IA", ...rest }: ButtonProps) {
  return (
    <Button variant="ai" size="sm" icon={<Sparkles className="size-3.5" />} {...rest}>
      {children}
    </Button>
  );
}

/** Split "Objet : …\n\nCorps" generations into subject + body. */
export function splitSubject(text: string) {
  const m = text.match(/^\s*(?:Objet|Subject)\s*:\s*(.+)\n+/i);
  if (!m) return { subject: "", body: text.trim() };
  let body = text.slice(m[0].length);
  body = body.replace(/^\s*Pré-en-tête\s*:.*\n+/i, "");
  return { subject: m[1].trim(), body: body.trim() };
}

/** Extract the first ```json block of a generation. */
export function extractJson<T = unknown>(text: string): T | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  try {
    return JSON.parse(m ? m[1] : text) as T;
  } catch {
    return null;
  }
}

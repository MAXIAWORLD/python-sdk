import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { date, relative } from "@/lib/format";
import { toastError } from "@/lib/hooks";
import type { ApiToken } from "@/lib/types";
import { SecretReveal } from "./shared";

export type TokenScope = "api" | "mcp";

export const TOKENS_KEY = ["auth-tokens"] as const;

export function useApiTokens() {
  return useQuery({ queryKey: TOKENS_KEY, queryFn: () => api.get<{ items: ApiToken[] }>("/auth/tokens"), select: (d) => d.items });
}

/** Creates a personal token; the plain value is returned once and never stored by Prisme. */
export function useCreateToken() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const create = async (name: string, scopes: TokenScope[]) => {
    setBusy(true);
    try {
      const res = await api.post<{ token: string; item: ApiToken }>("/auth/tokens", { name, scopes });
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
      return res.token;
    } catch (e) {
      toastError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { create, busy };
}

const SCOPE_LABEL: Record<string, string> = { api: "API REST", mcp: "MCP (Claude)" };

export function TokenList({ tokens, loading, empty }: { tokens: ApiToken[]; loading?: boolean; empty?: { title: string; description: string } }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const revoke = async (t: ApiToken) => {
    const ok = await confirm({ title: `Révoquer le jeton « ${t.name} » ?`, description: "Les applications qui l'utilisent (Claude, scripts, agenda…) perdront immédiatement l'accès. Cette action est définitive.", confirmLabel: "Révoquer", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/auth/tokens/${t.id}`);
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
      toast.success("Jeton révoqué");
    } catch (e) {
      toastError(e);
    }
  };

  if (loading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 rounded-[14px]" />
        <Skeleton className="h-14 rounded-[14px]" />
      </div>
    );
  if (!tokens.length) return <EmptyState icon={<KeyRound className="size-6" />} title={empty?.title ?? "Aucun jeton"} description={empty?.description ?? "Créez un jeton pour connecter une application à Prisme."} className="py-8" />;

  return (
    <ul className="divide-y divide-[var(--hairline)]">
      <AnimatePresence initial={false}>
        {tokens.map((t) => (
          <motion.li key={t.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-black/[0.04] text-fg-2 dark:bg-white/[0.06]">
              <KeyRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[13.5px] font-medium">{t.name}</span>
                {t.scopes.map((s) => (
                  <Badge key={s} tone={s === "mcp" ? "violet" : "blue"} size="xs">
                    {SCOPE_LABEL[s] ?? s}
                  </Badge>
                ))}
              </div>
              <div className="truncate text-[12px] text-fg-3">
                <span className="font-mono">{t.prefix}…</span> · créé le {date(t.created_at)} · {t.last_used_at ? `utilisé ${relative(t.last_used_at)}` : "jamais utilisé"}
              </div>
            </div>
            <IconButton label={`Révoquer ${t.name}`} size="sm" onClick={() => revoke(t)} className="text-fg-3 hover:text-red-500">
              <Trash2 className="size-4" />
            </IconButton>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const DEFAULT_SCOPES: TokenScope[] = ["api"];

export function CreateTokenDialog({ open, onOpenChange, defaultName = "", defaultScopes = DEFAULT_SCOPES }: { open: boolean; onOpenChange: (o: boolean) => void; defaultName?: string; defaultScopes?: TokenScope[] }) {
  const { create, busy } = useCreateToken();
  const [name, setName] = useState(defaultName);
  const [scopes, setScopes] = useState<TokenScope[]>(defaultScopes);
  const [token, setToken] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(defaultName);
      setScopes(defaultScopes);
      setToken(null);
    }
  }
  const toggle = (s: TokenScope, on: boolean) => setScopes((cur) => (on ? Array.from(new Set([...cur, s])) : cur.filter((x) => x !== s)));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !scopes.length) return;
    const value = await create(name.trim(), scopes);
    if (value) setToken(value);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<KeyRound className="size-5" />}
      title={token ? "Votre nouveau jeton" : "Nouveau jeton API"}
      description={token ? undefined : "Le jeton agit en votre nom, avec vos droits. Donnez-lui un nom explicite pour le retrouver."}
      footer={
        token ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            J'ai copié le jeton
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button variant="primary" loading={busy} disabled={!name.trim() || !scopes.length} onClick={() => submit()}>
              Créer le jeton
            </Button>
          </>
        )
      }
    >
      {token ? (
        <SecretReveal value={token} title="Jeton créé — copiez-le maintenant">
          Pour votre sécurité, il ne sera plus jamais affiché. En cas de perte, révoquez-le et créez-en un nouveau.
        </SecretReveal>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nom du jeton" required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Zapier, script d'export, Claude Code" maxLength={80} />
          </Field>
          <div>
            <div className="mb-2 text-[12.5px] font-medium text-fg-2">Autorisations</div>
            <div className="space-y-2.5">
              <Checkbox checked={scopes.includes("api")} onChange={(v) => toggle("api", v)} label={<span><b className="font-medium">API REST</b> <span className="text-fg-3">— intégrations, scripts, abonnement agenda</span></span>} />
              <Checkbox checked={scopes.includes("mcp")} onChange={(v) => toggle("mcp", v)} label={<span><b className="font-medium">MCP</b> <span className="text-fg-3">— Claude Desktop, Claude Code et autres clients MCP</span></span>} />
            </div>
          </div>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Dialog>
  );
}

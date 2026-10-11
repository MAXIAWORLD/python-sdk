import { useQuery } from "@tanstack/react-query";
import { BookOpen, Bot, KeyRound, Laptop, Link2, ListChecks, Plug, Plus, ShieldCheck, Terminal, Wrench } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/display";
import { Field, Input, Switch } from "@/components/ui/fields";
import { Segmented, Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { TokenList, useApiTokens, useCreateToken } from "./ApiTokens";
import { Callout, CodeBlock, SaveBar, SecretReveal, SettingsCard, TabHeader, useSectionForm } from "./shared";

interface McpInfo {
  http_url: string;
  enabled: boolean;
  claude_code_http: string;
  claude_code_stdio: string;
  claude_desktop: Record<string, unknown>;
  claude_desktop_remote: Record<string, unknown>;
  tools: string[];
}

interface ToolInfo {
  name: string;
  title: string;
  description: string;
  risk: "read" | "write" | "sensitive";
}

const RISK = {
  read: { label: "Lecture", tone: "green" as const },
  write: { label: "Écriture", tone: "blue" as const },
  sensitive: { label: "Sensible", tone: "orange" as const },
};

const RISK_ORDER: Record<ToolInfo["risk"], number> = { read: 0, write: 1, sensitive: 2 };

const PROMPTS = ["Brief du jour", "Préparer un rendez-vous", "Relances de factures", "Revue de pipeline", "Enregistrer un lead"];

const PLACEHOLDER = "<VOTRE_JETON>";

function ConnectionDiagram({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[15px] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_10px_24px_-10px_rgba(217,119,87,.8)]" style={{ background: "linear-gradient(145deg,#d97757,#b4532f)" }}>
        Cl
      </span>
      <div className="relative h-[3px] w-16 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.1] sm:w-24">
        {enabled && <motion.span className="absolute inset-y-0 w-1/3 rounded-full ai-gradient" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />}
      </div>
      <span className="glass flex size-12 shrink-0 items-center justify-center rounded-[15px]">
        <LogoMark size={30} />
      </span>
    </div>
  );
}

export default function McpTab() {
  const me = useAuth((s) => s.user);
  const isAdmin = can(me, "admin");
  const info = useQuery({ queryKey: ["mcp-info"], queryFn: () => api.get<McpInfo>("/settings/mcp") });
  const tools = useQuery({ queryKey: ["ai-tools"], queryFn: () => api.get<{ tools: ToolInfo[] }>("/ai/tools"), staleTime: Infinity, select: (d) => [...d.tools].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.title.localeCompare(b.title, "fr")) });
  const mcp = useSectionForm("mcp");
  const tokens = useApiTokens();
  const { create, busy } = useCreateToken();
  const [tokenName, setTokenName] = useState("Claude Desktop");
  const [token, setToken] = useState<string | null>(null);
  const [client, setClient] = useState<"desktop" | "code" | "connector">("desktop");
  const [desktopMode, setDesktopMode] = useState<"remote" | "local">("remote");

  const enabled = mcp.ready ? mcp.values.enabled : (info.data?.enabled ?? true);
  const withToken = (text: string) => (token ? text.split(PLACEHOLDER).join(token) : text);
  const mcpTokens = useMemo(() => (tokens.data ?? []).filter((t) => t.scopes.includes("mcp")), [tokens.data]);
  const d = info.data;
  const isHttps = d?.http_url.startsWith("https://");

  const createToken = async () => {
    const value = await create(tokenName.trim() || "Claude", ["mcp"]);
    if (value) setToken(value);
  };

  return (
    <div className="space-y-5">
      <TabHeader title="Claude via MCP" description="Utilisez votre abonnement Claude pour piloter Prisme depuis Claude Desktop ou Claude Code, sans clé API d'IA." />

      <Glass glow radius="xl" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full opacity-20 blur-3xl" style={{ background: "#d97757" }} />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <ConnectionDiagram enabled={enabled} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.015em]">Votre CRM, directement dans Claude</h3>
              <Badge tone={enabled ? "green" : "gray"} dot>
                {enabled ? "Serveur MCP actif" : "Serveur MCP désactivé"}
              </Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
              Le protocole MCP (Model Context Protocol) donne à Claude accès aux mêmes outils qu'Iris : recherche, fiches, pipeline, devis, factures, tâches, emails… Claude agit avec <b className="font-semibold text-fg">vos droits</b> et les mêmes règles métier que l'interface (factures inaltérables, oppositions RGPD respectées).
            </p>
            {mcp.ready && (
              <div className="mt-3 inline-flex items-center gap-3 rounded-[14px] bg-black/[0.03] px-3 py-2 dark:bg-white/[0.05]">
                <Switch size="sm" checked={enabled} onChange={(v) => mcp.set("enabled", v)} disabled={!isAdmin} />
                <span className="text-[12.5px] text-fg-2">
                  <b className="font-semibold text-fg">Accès MCP par jeton</b> {enabled ? "autorisé" : "bloqué"} pour toute l'organisation
                </span>
              </div>
            )}
          </div>
        </div>
      </Glass>

      <SettingsCard title="1. Créez un jeton dédié" description="Un jeton par appareil ou client : vous pourrez le révoquer à tout moment sans toucher aux autres." icon={<KeyRound className="size-4" />}>
        {token ? (
          <SecretReveal value={token} title="Jeton MCP créé — il a été inséré dans les configurations ci-dessous">
            Copiez-le maintenant : il ne sera plus jamais affiché. Ne le partagez pas, il donne accès à Prisme avec vos droits.
          </SecretReveal>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createToken();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <Field label="Nom du jeton" className="flex-1">
              <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Claude Desktop — MacBook" maxLength={80} />
            </Field>
            <Button type="submit" variant="primary" loading={busy} icon={<Plus className="size-4" />}>
              Créer le jeton MCP
            </Button>
          </form>
        )}
      </SettingsCard>

      <SettingsCard title="2. Ajoutez Prisme à Claude" description="Copiez la configuration correspondant à votre client, puis redémarrez-le." icon={<Plug className="size-4" />}>
        {!d ? (
          <Skeleton className="h-[220px] rounded-[16px]" />
        ) : (
          <div className="space-y-4">
            <Tabs
              value={client}
              onChange={setClient}
              items={[
                { value: "desktop", label: "Claude Desktop", icon: <Laptop className="size-4" /> },
                { value: "code", label: "Claude Code", icon: <Terminal className="size-4" /> },
                { value: "connector", label: "Connecteur distant", icon: <Link2 className="size-4" /> },
              ]}
            />
            {client === "desktop" && (
              <div className="space-y-3">
                <Segmented
                  value={desktopMode}
                  onChange={setDesktopMode}
                  options={[
                    { value: "remote", label: "Via l'URL de Prisme (jeton)" },
                    { value: "local", label: "Sur cet ordinateur (stdio)" },
                  ]}
                />
                <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg-2">
                  <li>Dans Claude Desktop, ouvrez Réglages › Développeur › Modifier la configuration.</li>
                  <li>
                    Collez ce bloc dans <code className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[12px]">claude_desktop_config.json</code> (fusionnez avec vos autres serveurs <code className="text-[12px]">mcpServers</code>).
                  </li>
                  <li>Redémarrez Claude Desktop : « prisme » apparaît dans la liste des outils.</li>
                </ol>
                {desktopMode === "remote" ? (
                  <>
                    <CodeBlock label="claude_desktop_config.json — accès par URL" code={withToken(JSON.stringify(d.claude_desktop_remote, null, 2))} />
                    <p className="text-[12px] text-fg-3">Nécessite Node.js sur l'ordinateur (commande npx). {!token && "Créez d'abord un jeton : il remplacera automatiquement <VOTRE_JETON>."}</p>
                  </>
                ) : (
                  <>
                    <CodeBlock label="claude_desktop_config.json — serveur local" code={JSON.stringify(d.claude_desktop, null, 2)} />
                    <p className="text-[12px] text-fg-3">À utiliser lorsque Prisme est installé sur le même ordinateur que Claude Desktop : aucun jeton n'est nécessaire, l'accès se fait avec le compte indiqué dans PRISME_MCP_USER.</p>
                  </>
                )}
              </div>
            )}
            {client === "code" && (
              <div className="space-y-3">
                <CodeBlock label="Terminal — connexion HTTP avec jeton (recommandé)" code={withToken(d.claude_code_http)} />
                <CodeBlock label="Terminal — serveur local (même machine)" code={d.claude_code_stdio} />
                <p className="text-[12px] text-fg-3">
                  Vérifiez ensuite la connexion avec <code className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[12px]">claude mcp list</code>, puis demandez par exemple : « Quelles factures sont en retard ? ».
                </p>
              </div>
            )}
            {client === "connector" && (
              <div className="space-y-3">
                <p className="text-[13px] text-fg-2">Pour les clients qui acceptent un connecteur MCP distant par simple URL (connecteurs personnalisés), l'adresse ci-dessous inclut votre jeton.</p>
                <CodeBlock label="URL du serveur MCP" code={withToken(`${d.http_url}?key=${PLACEHOLDER}`)} />
                {!isHttps && (
                  <Callout tone="warn" title="Prisme doit être accessible en HTTPS">
                    Les connecteurs distants exigent une adresse publique sécurisée. Exposez Prisme derrière un nom de domaine avec certificat TLS (proxy inverse, tunnel…).
                  </Callout>
                )}
                <Callout tone="danger" icon={<ShieldCheck className="size-4" />}>
                  Cette URL contient votre jeton : ne la partagez pas et révoquez le jeton si elle a pu être exposée.
                </Callout>
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Ce que Claude peut faire" description={tools.data ? `${tools.data.length} outils exposés, les mêmes que ceux d'Iris.` : "Outils exposés au client MCP."} icon={<Wrench className="size-4" />}>
        {tools.isLoading ? (
          <Skeleton className="h-[160px] rounded-[16px]" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {(tools.data ?? []).map((t) => (
                <div key={t.name} className="flex items-start gap-2.5 rounded-[14px] bg-black/[0.025] px-3 py-2.5 dark:bg-white/[0.035]">
                  <ListChecks className={cn("mt-0.5 size-4 shrink-0", t.risk === "read" ? "text-emerald-500" : t.risk === "write" ? "text-sky-500" : "text-orange-500")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium">{t.title}</span>
                      <Badge tone={RISK[t.risk]?.tone ?? "gray"} size="xs">
                        {RISK[t.risk]?.label ?? t.risk}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-snug text-fg-3" title={t.description}>
                      {t.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
                <BookOpen className="size-3.5" /> Invites prêtes à l'emploi :
              </span>
              {PROMPTS.map((p) => (
                <span key={p} className="glass-flat rounded-full px-2.5 py-1 text-[12px] font-medium text-fg-2">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Jetons MCP" description="Jetons personnels autorisés pour MCP. Révoquez ceux que vous n'utilisez plus." icon={<Bot className="size-4" />}>
        <TokenList tokens={mcpTokens} loading={tokens.isLoading} empty={{ title: "Aucun jeton MCP", description: "Créez un jeton à l'étape 1 pour connecter Claude." }} />
      </SettingsCard>

      <SaveBar forms={[mcp]} />
    </div>
  );
}

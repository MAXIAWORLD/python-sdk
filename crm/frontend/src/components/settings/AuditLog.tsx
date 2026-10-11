import { ArrowRight, ExternalLink, History } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FilterChip } from "@/components/data/blocks";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Glass } from "@/components/glass/Glass";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/fields";
import { Sheet } from "@/components/ui/overlay";
import type { Tone } from "@/lib/constants";
import { dateTime, relative } from "@/lib/format";
import { useDebounced, useList } from "@/lib/hooks";
import type { Ref } from "@/lib/types";

interface AuditRow {
  id: number;
  created_at: string;
  user_id?: number | null;
  user?: Ref | null;
  action: string;
  entity?: string | null;
  entity_id?: number | null;
  summary?: string | null;
  changes: Record<string, unknown>;
}

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  create: { label: "Création", tone: "green" },
  update: { label: "Modification", tone: "blue" },
  delete: { label: "Suppression", tone: "red" },
  login: { label: "Connexion", tone: "gray" },
  export: { label: "Export", tone: "violet" },
  import: { label: "Import", tone: "teal" },
  anonymize: { label: "Anonymisation", tone: "orange" },
  settings: { label: "Paramètres", tone: "indigo" },
  issue: { label: "Émission", tone: "indigo" },
  payment: { label: "Paiement", tone: "green" },
  payment_delete: { label: "Paiement supprimé", tone: "red" },
  token: { label: "Jeton API", tone: "cyan" },
  password: { label: "Mot de passe", tone: "yellow" },
  setup: { label: "Installation", tone: "gray" },
  ai: { label: "Action IA", tone: "pink" },
};

const ENTITIES: Record<string, { label: string; path?: string }> = {
  contact: { label: "Contact", path: "/contacts" },
  company: { label: "Entreprise", path: "/companies" },
  deal: { label: "Opportunité", path: "/deals" },
  quote: { label: "Devis", path: "/quotes" },
  invoice: { label: "Facture", path: "/invoices" },
  project: { label: "Projet", path: "/projects" },
  ticket: { label: "Ticket", path: "/tickets" },
  subscription: { label: "Abonnement" },
  task: { label: "Tâche" },
  product: { label: "Produit" },
  user: { label: "Utilisateur" },
  settings: { label: "Paramètres" },
  api_token: { label: "Jeton API" },
  fec: { label: "FEC" },
  backup: { label: "Sauvegarde" },
  tool: { label: "Outil IA" },
  pipeline: { label: "Pipeline" },
  stage: { label: "Étape" },
  webhook: { label: "Webhook" },
  ai_provider: { label: "Fournisseur IA" },
  campaign: { label: "Campagne" },
  automation: { label: "Automatisation" },
  document: { label: "Document" },
  activity: { label: "Activité" },
  event: { label: "Événement" },
  time_entry: { label: "Temps" },
  email: { label: "Email" },
  segment: { label: "Segment" },
  form: { label: "Formulaire" },
  kb_article: { label: "Article d'aide" },
  email_template: { label: "Modèle d'email" },
  ticket_message: { label: "Message de ticket" },
};

const FILTER_ACTIONS = ["create", "update", "delete", "login", "export", "import", "anonymize", "settings", "issue", "ai"];

function formatValue(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ChangesView({ changes }: { changes: Record<string, unknown> }) {
  const entries = Object.entries(changes ?? {});
  if (!entries.length) return <p className="text-[13px] text-fg-3">Aucun détail enregistré pour cette action.</p>;
  const isDiff = entries.every(([, v]) => Array.isArray(v) && v.length === 2);
  if (!isDiff) return <pre className="glass-inset overflow-x-auto rounded-[14px] p-3 font-mono text-[12px] leading-relaxed">{JSON.stringify(changes, null, 2)}</pre>;
  return (
    <div className="space-y-2">
      {entries.map(([field, value]) => {
        const [before, after] = value as [unknown, unknown];
        return (
          <div key={field} className="rounded-[14px] bg-black/[0.03] p-3 dark:bg-white/[0.04]">
            <div className="mb-1 font-mono text-[11.5px] font-semibold text-fg-2">{field}</div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="min-w-0 break-all rounded-[8px] bg-red-500/10 px-2 py-0.5 text-red-700 line-through decoration-red-500/40 dark:text-red-300">{formatValue(before)}</span>
              <ArrowRight className="size-3.5 shrink-0 text-fg-3" />
              <span className="min-w-0 break-all rounded-[8px] bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{formatValue(after)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AuditLog() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [action, setAction] = useState<string | null>(null);
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const pageSize = 15;
  const params = useMemo(() => ({ q: dq || undefined, action: action ?? undefined, entity: entity || undefined, sort: "-created_at", limit: pageSize, offset: page * pageSize }), [dq, action, entity, page]);
  const { data, isLoading } = useList<AuditRow>("audit-logs", params);

  const columns: Column<AuditRow>[] = [
    { key: "date", header: "Date", cell: (r) => <span className="whitespace-nowrap text-[12.5px] tabular text-fg-2" title={dateTime(r.created_at)}>{relative(r.created_at)}</span> },
    {
      key: "user",
      header: "Utilisateur",
      hideOnMobile: true,
      cell: (r) =>
        r.user ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={r.user.name} color={(r.user.color as string) ?? undefined} size={22} />
            <span className="truncate">{r.user.name}</span>
          </span>
        ) : (
          <span className="text-fg-3">Système</span>
        ),
    },
    {
      key: "action",
      header: "Action",
      cell: (r) => (
        <Badge tone={ACTIONS[r.action]?.tone ?? "gray"} size="xs" dot>
          {ACTIONS[r.action]?.label ?? r.action}
        </Badge>
      ),
    },
    {
      key: "object",
      header: "Élément",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-[13px]">{r.summary || "—"}</div>
          <div className="text-[11.5px] text-fg-3">
            {r.entity ? (ENTITIES[r.entity]?.label ?? r.entity) : ""}
            {r.entity_id ? ` #${r.entity_id}` : ""}
          </div>
        </div>
      ),
    },
  ];

  const entityPath = open?.entity && open.entity_id && ENTITIES[open.entity]?.path ? `${ENTITIES[open.entity].path}/${open.entity_id}` : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
          placeholder="Rechercher dans le journal…"
          className="lg:w-[260px]"
        />
        <Select
          value={entity}
          onChange={(v) => {
            setEntity(v);
            setPage(0);
          }}
          options={Object.entries(ENTITIES).map(([value, e]) => ({ value, label: e.label }))}
          placeholder="Tous les éléments"
          className="lg:w-[200px]"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          active={!action}
          onClick={() => {
            setAction(null);
            setPage(0);
          }}
        >
          Toutes
        </FilterChip>
        {FILTER_ACTIONS.map((a) => (
          <FilterChip
            key={a}
            active={action === a}
            onClick={() => {
              setAction(action === a ? null : a);
              setPage(0);
            }}
          >
            {ACTIONS[a].label}
          </FilterChip>
        ))}
      </div>
      <Glass variant="flat" radius="md" className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          dense
          onRowClick={setOpen}
          page={page}
          pageSize={pageSize}
          total={data?.total}
          onPageChange={setPage}
          empty={<EmptyState icon={<History className="size-6" />} title="Aucune entrée" description="Aucune action ne correspond à ces filtres." />}
        />
      </Glass>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title="Détail de l'action" width={500}>
        {open && (
          <div className="space-y-5">
            <div className="space-y-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-3">Action</span>
                <Badge tone={ACTIONS[open.action]?.tone ?? "gray"} dot>
                  {ACTIONS[open.action]?.label ?? open.action}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-3">Date</span>
                <span className="font-medium">{dateTime(open.created_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-3">Utilisateur</span>
                <span className="font-medium">{open.user?.name ?? "Système"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-3">Élément</span>
                <span className="min-w-0 truncate text-right font-medium">
                  {open.entity ? (ENTITIES[open.entity]?.label ?? open.entity) : "—"}
                  {open.entity_id ? ` #${open.entity_id}` : ""}
                </span>
              </div>
              {open.summary && (
                <div className="rounded-[14px] bg-black/[0.03] p-3 text-[13px] dark:bg-white/[0.04]">
                  <span className="text-fg-3">Résumé : </span>
                  {open.summary}
                </div>
              )}
              {entityPath && open.action !== "delete" && (
                <Link to={entityPath} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent">
                  Ouvrir l'élément <ExternalLink className="size-3.5" />
                </Link>
              )}
            </div>
            <div>
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">Modifications</div>
              <ChangesView changes={open.changes} />
            </div>
            <p className="text-[12px] text-fg-3">Le journal est en lecture seule et ne contient jamais de secrets (mots de passe, clés, signatures).</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

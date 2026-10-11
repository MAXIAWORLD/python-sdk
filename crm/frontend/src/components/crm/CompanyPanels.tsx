import { Check, Circle, CircleAlert, CircleCheck, CircleX, Copy, ExternalLink, Landmark, Pencil, ShieldCheck, TriangleAlert, Wallet, Wand2, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/data/blocks";
import { PropertyList } from "@/components/entity/PropertyList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { useUpdate } from "@/lib/hooks";
import type { FieldDef } from "@/lib/schemas";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";
import { legalReport, type LegalCheck, type LegalReport } from "./legal";

const LEGAL_FIELDS: (string | FieldDef)[] = [
  "address",
  "zip",
  "city",
  "country",
  "legal_form",
  "siren",
  "siret",
  { name: "vat_number", label: "N° TVA", type: "text" },
  { name: "delivery_address", label: "Adresse de livraison", type: "text" },
  "is_public_entity",
];

function formatVat(v: string) {
  return v.startsWith("FR") && v.length === 13 ? `${v.slice(0, 4)} ${v.slice(4, 7)} ${v.slice(7, 10)} ${v.slice(10)}` : v;
}

const STATE_ICON = {
  ok: <CircleCheck className="size-4 text-emerald-500" />,
  missing: <CircleAlert className="size-4 text-amber-500" />,
  invalid: <CircleX className="size-4 text-red-500" />,
  optional: <Circle className="size-4 text-fg-3" strokeDasharray="3 3" />,
};

function CheckRow({ check }: { check: LegalCheck }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className="mt-px shrink-0">{STATE_ICON[check.state]}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium leading-snug">
          {check.label}
          {!check.required && <span className="ml-1.5 text-[11px] font-normal text-fg-3">facultatif</span>}
        </div>
        <div className={cn("text-[12px] leading-snug", check.state === "invalid" ? "text-red-600 dark:text-red-400" : "text-fg-3")}>{check.hint}</div>
      </div>
    </li>
  );
}

function regionNote(report: LegalReport, country?: string | null) {
  switch (report.region) {
    case "fr":
      return report.ready
        ? "Mentions client conformes à la réforme de la facturation électronique (2026-2027)."
        : "Mentions client exigées sur les factures B2B (réforme de la facturation électronique 2026-2027).";
    case "eu":
      return "Client établi dans l'UE : la TVA est autoliquidée par le client.";
    case "non_eu":
      return "Client hors UE : aucun numéro de TVA intracommunautaire n'est exigé.";
    default:
      return `Pays « ${country ?? ""} » non reconnu : vérifiez les mentions applicables.`;
  }
}

/** Readiness of the client identity for B2B invoicing, with a per-criterion checklist. */
export function LegalReadiness({ company }: { company: Company }) {
  const report = useMemo(() => legalReport(company), [company]);
  const update = useUpdate("companies", { message: "Numéro de TVA renseigné" });
  const blocking = report.checks.filter((c) => (c.required && c.state !== "ok") || c.state === "invalid").length;
  const required = report.checks.filter((c) => c.required);

  return (
    <div className={cn("rounded-[16px] p-3.5 ring-1 ring-inset", report.ready ? "bg-emerald-500/[0.08] ring-emerald-500/20" : "bg-amber-400/[0.1] ring-amber-500/25")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4)]", report.ready ? "bg-gradient-to-br from-emerald-400 to-teal-500" : "bg-gradient-to-br from-amber-400 to-orange-500")}>
          {report.ready ? <ShieldCheck className="size-4" /> : <TriangleAlert className="size-4" />}
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-snug">{report.ready ? "Prêt pour la facturation B2B" : `${blocking} point${blocking > 1 ? "s" : ""} à régler avant de facturer`}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-fg-2">{regionNote(report, company.country)}</div>
        </div>
      </div>
      {required.length > 0 && (
        <div className="mt-3 flex gap-1" aria-label={`${report.requiredOk} critère(s) obligatoire(s) sur ${report.requiredTotal}`}>
          {required.map((c, i) => (
            <motion.span
              key={c.id}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
              className={cn("h-1.5 flex-1 origin-left rounded-full", c.state === "ok" ? "bg-emerald-500" : c.state === "invalid" ? "bg-red-500" : "bg-amber-400")}
            />
          ))}
        </div>
      )}
      <ul className="mt-2">
        {report.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
      {report.vatSuggestion && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-white/50 px-2.5 py-2 text-[12px] dark:bg-white/[0.06]">
          <span className="min-w-0 text-fg-2">
            N° TVA calculé depuis le SIREN : <b className="font-semibold tabular text-fg">{formatVat(report.vatSuggestion)}</b>
          </span>
          <Button size="xs" variant="subtle" icon={<Wand2 className="size-3.5" />} loading={update.isPending} onClick={() => update.mutate({ id: company.id, data: { vat_number: report.vatSuggestion } })}>
            Appliquer
          </Button>
        </div>
      )}
    </div>
  );
}

export function LegalPanel({ company }: { company: Company }) {
  return (
    <Panel title="Facturation & légal" icon={<Landmark className="size-4" />}>
      <LegalReadiness company={company} />
      <PropertyList resource="companies" record={company} fields={LEGAL_FIELDS} className="mt-2" />
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Web3                                                                       */
/* -------------------------------------------------------------------------- */

const EXPLORERS: Record<string, (address: string) => string> = {
  Ethereum: (a) => `https://etherscan.io/address/${a}`,
  Polygon: (a) => `https://polygonscan.com/address/${a}`,
  Base: (a) => `https://basescan.org/address/${a}`,
  Arbitrum: (a) => `https://arbiscan.io/address/${a}`,
  Optimism: (a) => `https://optimistic.etherscan.io/address/${a}`,
  Avalanche: (a) => `https://snowtrace.io/address/${a}`,
  "BNB Chain": (a) => `https://bscscan.com/address/${a}`,
  Solana: (a) => `https://solscan.io/account/${a}`,
  Bitcoin: (a) => `https://mempool.space/address/${a}`,
  TON: (a) => `https://tonviewer.com/${a}`,
  SUI: (a) => `https://suiscan.xyz/mainnet/account/${a}`,
  XRP: (a) => `https://xrpscan.com/account/${a}`,
  Tron: (a) => `https://tronscan.org/#/address/${a}`,
};

function shortAddress(a: string) {
  return a.length > 16 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Treasury wallet of a Web3 client: chain, address (editable in place), copy and block-explorer link. */
export function Web3Panel({ company }: { company: Company }) {
  const update = useUpdate("companies", { message: "Adresse wallet mise à jour" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!company.wallet_address && !company.chain) return null;
  const address = company.wallet_address ?? "";
  const explorer = address && company.chain ? EXPLORERS[company.chain]?.(address) : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Adresse copiée");
    } catch {
      toast.error("Copie impossible dans ce navigateur.");
    }
  };

  const save = async () => {
    try {
      await update.mutateAsync({ id: company.id, data: { wallet_address: draft.trim() || null } });
      setEditing(false);
    } catch {
      /* erreur déjà signalée */
    }
  };

  const iconButton = "rounded-[9px] p-1.5 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10";

  return (
    <Panel title="Web3" icon={<Wallet className="size-4" />}>
      <div className="glass-inset rounded-[14px] px-3 py-2.5">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="0x…"
              className="h-9 font-mono text-[12.5px]"
              autoFocus
              aria-label="Adresse wallet / trésorerie"
            />
            <button type="button" onClick={save} className="rounded-[9px] p-1.5 text-accent hover:bg-accent-soft" aria-label="Valider">
              <Check className="size-4" />
            </button>
            <button type="button" onClick={() => setEditing(false)} className={iconButton} aria-label="Annuler">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4)]">
              <Wallet className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-fg-3">Adresse de trésorerie</div>
              <div className="truncate font-mono text-[12.5px] text-fg" title={address || undefined}>
                {address ? shortAddress(address) : "Non renseignée"}
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              {address && (
                <button type="button" onClick={copy} className={iconButton} aria-label="Copier l'adresse" title="Copier l'adresse">
                  <Copy className="size-3.5" />
                </button>
              )}
              {explorer && (
                <a href={explorer} target="_blank" rel="noreferrer" className={iconButton} aria-label="Voir sur l'explorateur de blocs" title="Voir sur l'explorateur de blocs">
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setDraft(address);
                  setEditing(true);
                }}
                className={iconButton}
                aria-label="Modifier l'adresse"
                title="Modifier l'adresse"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      <PropertyList resource="companies" record={company} fields={["chain"]} className="mt-1" />
      <p className="mt-2 text-[11.5px] leading-snug text-fg-3">Les règlements en crypto-actifs s'enregistrent sur la facture (moyen « Crypto-actifs » et hash de transaction).</p>
    </Panel>
  );
}

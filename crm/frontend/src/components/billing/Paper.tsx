import { AlertTriangle, ArrowUpRight, Building2, Mail, PenLine, ShieldCheck, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { CompanyLogo, Skeleton } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { dateTime } from "@/lib/format";
import { useItem } from "@/lib/hooks";
import type { Company, Contact, Party } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AutoTextarea } from "./fields";
import { addressLines, copyText, formatSiren, sellerMissing, shortHash, type CompanyIdentity } from "./lib";

/* -------------------------------------------------------------------------- */
/* Sheet                                                                      */
/* -------------------------------------------------------------------------- */

/** The document itself: a sheet of paper made of glass. */
export function PaperSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Glass variant="strong" radius="xl" className={cn("relative min-w-0 overflow-hidden bg-white/[0.86] dark:bg-transparent", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--accent),var(--accent-2),var(--accent-3))]" />
      <div className="@container px-4 pb-6 pt-7 sm:px-7 sm:pb-8 sm:pt-9">{children}</div>
    </Glass>
  );
}

const STAMP_TONES = {
  green: "text-emerald-600 ring-emerald-500/60 dark:text-emerald-400",
  indigo: "text-indigo-600 ring-indigo-500/55 dark:text-indigo-300",
  red: "text-red-600 ring-red-500/55 dark:text-red-400",
  orange: "text-orange-600 ring-orange-500/55 dark:text-orange-300",
  gray: "text-fg-3 ring-[var(--hairline-strong)]",
};

/** Rubber stamp in the corner of a finalized document (Signé, Payée, Annulée…). */
export function Stamp({ label, sub, tone = "green" }: { label: string; sub?: string; tone?: keyof typeof STAMP_TONES }) {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, scale: 1.5, rotate: -18 }}
      animate={{ opacity: 0.9, scale: 1, rotate: -9 }}
      transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
      className={cn("pointer-events-none mt-3 inline-block rounded-[12px] px-3 py-1.5 text-center ring-[2.5px] ring-inset", STAMP_TONES[tone])}
    >
      <div className="text-[15px] font-black uppercase leading-none tracking-[0.2em]">{label}</div>
      {sub && <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] opacity-80">{sub}</div>}
    </motion.div>
  );
}

export function SheetSection({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("mt-8", className)}>
      {(title || actions) && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          {title && <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function MetaField({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11.5px] leading-snug text-fg-3">{hint}</div>}
    </div>
  );
}

/** Document type + number (top right of the sheet). */
export function DocHeading({ kind, number, placeholder, children, stamp }: { kind: string; number?: string | null; placeholder: string; children?: ReactNode; stamp?: ReactNode }) {
  return (
    <div className="min-w-0 @lg:text-right">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-accent">{kind}</div>
      {number ? <div className="mt-1 text-[24px] font-semibold tracking-[-0.02em] tabular">{number}</div> : <div className="mt-1.5 text-[14px] font-medium italic text-fg-3">{placeholder}</div>}
      {children && <div className="mt-2 space-y-0.5 text-[12.5px] text-fg-2">{children}</div>}
      {stamp}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Parties                                                                    */
/* -------------------------------------------------------------------------- */

function Identifiers({ party }: { party: Party }) {
  const ids = [party.siren ? `SIREN ${formatSiren(String(party.siren))}` : null, party.vat_number ? `TVA ${party.vat_number}` : null].filter(Boolean);
  if (!ids.length) return null;
  return <div className="text-fg-3 tabular">{ids.join(" · ")}</div>;
}

/** Issuer identity — live settings for drafts, frozen snapshot once sent/issued. */
export function SellerBlock({ seller, live }: { seller: CompanyIdentity | Party; live?: boolean }) {
  const name = String((seller as CompanyIdentity).legal_name || seller.name || "");
  const logo = typeof seller.logo_url === "string" && seller.logo_url ? seller.logo_url : null;
  const missing = live ? sellerMissing(seller as CompanyIdentity) : [];
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        {logo ? <img src={logo} alt="" className="size-11 rounded-[13px] bg-white object-contain p-1 shadow-sm" /> : <CompanyLogo name={name || "?"} size={44} />}
        <div className="min-w-0">
          <div className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{name || "Votre entreprise"}</div>
          {seller.legal_form && <div className="text-[12px] text-fg-3">{[seller.legal_form, seller.capital ? `au capital de ${seller.capital} €` : null].filter(Boolean).join(" ")}</div>}
        </div>
      </div>
      <div className="mt-3 space-y-0.5 text-[12.5px] leading-relaxed text-fg-2">
        {addressLines(seller).map((l) => (
          <div key={l}>{l}</div>
        ))}
        <Identifiers party={seller} />
        {(seller.email || seller.phone) && <div className="text-fg-3">{[seller.email, seller.phone].filter(Boolean).join(" · ")}</div>}
      </div>
      {missing.length > 0 && (
        <Link to="/settings?tab=company" className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-orange-500/12 px-2.5 py-1 text-[11.5px] font-medium text-orange-700 transition hover:bg-orange-500/20 dark:text-orange-300">
          <AlertTriangle className="size-3" /> À compléter : {missing.join(", ")}
          <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

/** Frozen client identity (snapshot taken when the document was sent / issued). */
export function BuyerSnapshot({ buyer, title, companyId }: { buyer: Party; title: string; companyId?: number | null }) {
  const name = String(buyer.name ?? "");
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</div>
      {name ? (
        <div className="rounded-[18px] bg-black/[0.025] p-4 ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.035]">
          <div className="flex items-center gap-2.5">
            <CompanyLogo name={name} size={30} />
            <div className="min-w-0">
              {companyId ? (
                <Link to={`/companies/${companyId}`} className="block truncate text-[14.5px] font-semibold hover:text-accent">
                  {name}
                </Link>
              ) : (
                <div className="truncate text-[14.5px] font-semibold">{name}</div>
              )}
              {buyer.contact_name && <div className="truncate text-[12px] text-fg-3">À l'attention de {buyer.contact_name}</div>}
            </div>
          </div>
          <div className="mt-2.5 space-y-0.5 text-[12.5px] leading-relaxed text-fg-2">
            {addressLines(buyer).map((l) => (
              <div key={l}>{l}</div>
            ))}
            <Identifiers party={buyer} />
            {buyer.email && <div className="text-fg-3">{buyer.email}</div>}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-fg-3">Aucun client.</p>
      )}
    </div>
  );
}

type BuyerPatch = { company_id?: number | null; contact_id?: number | null };

function splitName(text: string) {
  const parts = text.trim().split(/\s+/);
  return { first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") };
}

/** Client picker (company + contact) with a live preview of the billing identity. */
export function BuyerEditor({ title, companyId, contactId, onChange }: { title: string; companyId: number | null; contactId: number | null; onChange: (patch: BuyerPatch) => void }) {
  const company = useItem<Company>("companies", companyId);
  const contact = useItem<Contact>("contacts", contactId);
  const [creating, setCreating] = useState<{ resource: "companies" | "contacts"; initial: Record<string, unknown> } | null>(null);
  const c = company.data;
  const incomplete = c && !(c.address && c.city);

  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</div>
      <div className="space-y-2">
        <EntitySelect
          resource="companies"
          value={companyId}
          initialLabel={c?.name}
          placeholder="Choisir une entreprise cliente…"
          onChange={(id) => {
            const patch: BuyerPatch = { company_id: id };
            if (contact.data && contact.data.company_id !== id) patch.contact_id = null;
            onChange(patch);
          }}
          onCreate={(q) => setCreating({ resource: "companies", initial: { name: q, type: "client" } })}
        />
        <EntitySelect
          resource="contacts"
          value={contactId}
          initialLabel={contact.data?.full_name}
          params={companyId ? { company_id: companyId } : undefined}
          placeholder={companyId ? "Interlocuteur (facultatif)" : "…ou un particulier / un contact"}
          onChange={(id, row) => {
            const patch: BuyerPatch = { contact_id: id };
            const rowCompany = row && typeof row.company_id === "number" ? row.company_id : null;
            if (!companyId && rowCompany) patch.company_id = rowCompany;
            onChange(patch);
          }}
          onCreate={(q) => setCreating({ resource: "contacts", initial: { ...splitName(q), company_id: companyId ?? undefined } })}
        />
      </div>

      {companyId && company.isLoading && <Skeleton className="mt-3 h-20 rounded-[16px]" />}
      {c && (
        <div className="mt-3 rounded-[16px] bg-black/[0.025] p-3.5 text-[12.5px] leading-relaxed text-fg-2 ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.035]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              {addressLines(c).map((l) => (
                <div key={l}>{l}</div>
              ))}
              <Identifiers party={{ siren: c.siren ?? (c.siret ?? "").slice(0, 9), vat_number: c.vat_number ?? undefined }} />
              {(contact.data?.email || c.email) && (
                <div className="flex items-center gap-1 text-fg-3">
                  <Mail className="size-3" /> {contact.data?.email || c.email}
                </div>
              )}
            </div>
            <Link to={`/companies/${c.id}`} className="shrink-0 rounded-[8px] p-1 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" title="Ouvrir la fiche entreprise" aria-label="Ouvrir la fiche entreprise">
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {(incomplete || (!c.siren && !c.siret && (!c.country || /^(fr|france)$/i.test(c.country)))) && (
            <Link to={`/companies/${c.id}`} className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-orange-700 hover:underline dark:text-orange-300">
              <AlertTriangle className="size-3 shrink-0" />
              {incomplete ? "Adresse de facturation incomplète — compléter la fiche" : "SIREN du client manquant (obligatoire en B2B) — compléter la fiche"}
            </Link>
          )}
        </div>
      )}
      {!companyId && contact.data && (
        <div className="mt-3 flex items-center gap-2 rounded-[16px] bg-black/[0.025] p-3 text-[12.5px] text-fg-2 ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.035]">
          <UserRound className="size-4 text-fg-3" /> Client particulier · {[contact.data.address, contact.data.city].filter(Boolean).join(", ") || "adresse à compléter"}
        </div>
      )}
      {!companyId && !contactId && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-fg-3">
          <Building2 className="size-3.5" /> Tapez un nom inconnu pour créer le client à la volée.
        </p>
      )}

      {creating && (
        <RecordDialog
          resource={creating.resource}
          open
          onOpenChange={(o) => !o && setCreating(null)}
          initial={creating.initial}
          onSaved={(row) => {
            if (creating.resource === "companies") onChange({ company_id: row.id, contact_id: null });
            else onChange({ contact_id: row.id, ...(companyId ? {} : { company_id: typeof row.company_id === "number" ? row.company_id : null }) });
            setCreating(null);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Signature (quotes)                                                         */
/* -------------------------------------------------------------------------- */

export interface SignatureProof {
  accepted_at?: string | null;
  signed_by?: string | null;
  signer_email?: string | null;
  signature?: string | null;
  signature_hash?: string | null;
  signature_ip?: string | null;
}

export function SignatureBox({ proof, declinedAt }: { proof: SignatureProof; declinedAt?: string | null }) {
  if (proof.accepted_at) {
    return (
      <div className="rounded-[20px] bg-emerald-500/[0.07] p-4 ring-1 ring-inset ring-emerald-500/25">
        <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-4" /> Bon pour accord — signé électroniquement
        </div>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          {proof.signature?.startsWith("data:image") ? (
            <img src={proof.signature} alt={`Signature de ${proof.signed_by ?? "client"}`} className="h-20 w-full max-w-[220px] rounded-[14px] bg-white object-contain p-2 shadow-sm" />
          ) : (
            <div className="flex h-20 w-full max-w-[220px] items-center justify-center rounded-[14px] bg-white px-3 text-center font-[cursive] text-[20px] text-[#1c2340] shadow-sm">{proof.signed_by}</div>
          )}
          <div className="min-w-0 text-[12.5px] leading-relaxed text-fg-2">
            <div className="text-[14px] font-semibold text-fg">{proof.signed_by}</div>
            {proof.signer_email && <div>{proof.signer_email}</div>}
            <div>Le {dateTime(proof.accepted_at)}</div>
            {proof.signature_ip && <div className="text-fg-3">Adresse IP : {proof.signature_ip}</div>}
            {proof.signature_hash && (
              <button type="button" onClick={() => copyText(proof.signature_hash ?? "", "Empreinte copiée")} className="mt-1 font-mono text-[11px] text-fg-3 hover:text-fg" title="Copier l'empreinte complète">
                SHA-256 {shortHash(proof.signature_hash, 14, 8)}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (declinedAt) {
    return (
      <div className="rounded-[20px] bg-red-500/[0.07] p-4 text-[13px] text-red-700 ring-1 ring-inset ring-red-500/25 dark:text-red-300">
        Devis refusé par le client le {dateTime(declinedAt)}.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-dashed border-[var(--hairline-strong)] p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-accent-soft text-accent">
        <PenLine className="size-4" />
      </span>
      <div className="text-[12.5px] leading-relaxed text-fg-2">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">Bon pour accord</div>
        Signature électronique du client via le lien sécurisé : nom, email, date, adresse IP et empreinte SHA-256 conservés comme preuve.
      </div>
    </div>
  );
}

/** Free text of the document (notes, conditions): ghost textarea when editable, paragraph otherwise. */
export function NotesBlock({ label, value, readOnly, onChange, placeholder }: { label: string; value: string; readOnly: boolean; onChange: (v: string) => void; placeholder: string }) {
  if (readOnly && !value.trim()) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">{label}</div>
      {readOnly ? (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{value}</p>
      ) : (
        <AutoTextarea value={value} onChange={onChange} placeholder={placeholder} minRows={3} className="-mx-2.5 w-[calc(100%+1.25rem)] text-[13px] leading-relaxed" />
      )}
    </div>
  );
}

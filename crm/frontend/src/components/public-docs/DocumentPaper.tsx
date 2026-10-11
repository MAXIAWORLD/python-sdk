import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Glass } from "@/components/glass/Glass";
import { money } from "@/lib/format";
import type { LineItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatSiren, legalIdentity, quantityLabel, vatLabel, websiteHref } from "./doc-utils";
import type { BuyerParty, SellerParty } from "./types";

export interface TotalRow {
  label: ReactNode;
  value: string;
  variant?: "strong" | "accent" | "muted" | "success";
}

export interface DocDate {
  label: string;
  value: string;
  tone?: "danger";
}

/* -------------------------------------------------------------------------- */
/* Parties                                                                    */
/* -------------------------------------------------------------------------- */

function PartyBlock({ label, name, lines, accent }: { label: string; name?: string; lines: ReactNode[]; accent?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-[18px]", accent ? "glass-inset p-4" : "py-4 sm:p-4")}>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{label}</div>
      <div className="text-[15px] font-semibold leading-snug">{name || "—"}</div>
      <div className="mt-1 space-y-0.5 text-[13px] leading-relaxed text-fg-2">
        {lines.filter(Boolean).map((l, i) => (
          <div key={i} className="break-words">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function sellerLines(s: SellerParty): ReactNode[] {
  const site = websiteHref(s.website);
  return [
    s.address,
    [s.zip, s.city].filter(Boolean).join(" "),
    s.country && s.country !== "France" ? s.country : null,
    [s.siren && `SIREN ${formatSiren(s.siren)}`, s.vat_number && `TVA ${s.vat_number}`].filter(Boolean).join(" · "),
    s.email && (
      <a href={`mailto:${s.email}`} className="hover:text-accent">
        {s.email}
      </a>
    ),
    s.phone && (
      <a href={`tel:${s.phone.replace(/\s+/g, "")}`} className="hover:text-accent">
        {s.phone}
      </a>
    ),
    site && (
      <a href={site} target="_blank" rel="noreferrer" className="hover:text-accent">
        {site.replace(/^https?:\/\//, "")}
      </a>
    ),
  ];
}

function buyerLines(b: BuyerParty): ReactNode[] {
  return [
    b.contact_name ? `À l'attention de ${b.contact_name}` : null,
    b.address,
    [b.zip, b.city].filter(Boolean).join(" "),
    b.country && b.country !== "France" ? b.country : null,
    [b.siren && `SIREN ${formatSiren(b.siren)}`, b.vat_number && `TVA ${b.vat_number}`].filter(Boolean).join(" · "),
    b.email,
    b.delivery_address ? `Livraison : ${b.delivery_address}` : null,
  ];
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                      */
/* -------------------------------------------------------------------------- */

function LinesTable({ lines, currency }: { lines: LineItem[]; currency: string }) {
  const items = lines.filter((l) => (l.type ?? "item") === "item");
  const showDiscount = items.some((l) => (l.discount ?? 0) > 0);
  const cols = showDiscount ? 6 : 5;
  if (!lines.length) return <p className="rounded-[16px] bg-black/[0.03] p-4 text-center text-[13px] text-fg-3 dark:bg-white/[0.04]">Aucune ligne.</p>;
  return (
    <div className="overflow-hidden rounded-[18px] ring-1 ring-inset ring-[var(--hairline-strong)]">
      {/* Desktop / tablet */}
      <table className="hidden w-full border-collapse text-[13.5px] sm:table">
        <thead>
          <tr className="bg-black/[0.03] text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3 dark:bg-white/[0.04]">
            <th className="px-4 py-2.5 font-semibold">Désignation</th>
            <th className="px-3 py-2.5 text-right font-semibold">Qté</th>
            <th className="px-3 py-2.5 text-right font-semibold">PU HT</th>
            {showDiscount && <th className="px-3 py-2.5 text-right font-semibold">Remise</th>}
            <th className="px-3 py-2.5 text-right font-semibold">TVA</th>
            <th className="px-4 py-2.5 text-right font-semibold">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const key = l.id ?? String(i);
            if (l.type === "section")
              return (
                <tr key={key}>
                  <td colSpan={cols} className="border-t border-[var(--hairline)] px-4 pb-1.5 pt-3.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent">
                    {l.description}
                  </td>
                </tr>
              );
            if (l.type === "text")
              return (
                <tr key={key}>
                  <td colSpan={cols} className="whitespace-pre-line border-t border-[var(--hairline)] px-4 py-2.5 text-[13px] italic text-fg-2">
                    {l.description}
                  </td>
                </tr>
              );
            return (
              <tr key={key} className="align-top">
                <td className="border-t border-[var(--hairline)] px-4 py-3">
                  <div className="font-medium">{l.description}</div>
                  {l.details && <div className="mt-0.5 whitespace-pre-line text-[12.5px] text-fg-3">{l.details}</div>}
                </td>
                <td className="whitespace-nowrap border-t border-[var(--hairline)] px-3 py-3 text-right tabular text-fg-2">{quantityLabel(l.quantity, l.unit)}</td>
                <td className="whitespace-nowrap border-t border-[var(--hairline)] px-3 py-3 text-right tabular text-fg-2">{money(l.unit_price, currency)}</td>
                {showDiscount && <td className="whitespace-nowrap border-t border-[var(--hairline)] px-3 py-3 text-right tabular text-fg-2">{l.discount ? `−${vatLabel(l.discount)}` : "—"}</td>}
                <td className="whitespace-nowrap border-t border-[var(--hairline)] px-3 py-3 text-right tabular text-fg-2">{vatLabel(l.vat_rate ?? 0)}</td>
                <td className="whitespace-nowrap border-t border-[var(--hairline)] px-4 py-3 text-right font-semibold tabular">{money(l.total, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile: stacked lines */}
      <div className="divide-y divide-[var(--hairline)] sm:hidden">
        {lines.map((l, i) => {
          const key = l.id ?? String(i);
          if (l.type === "section")
            return (
              <div key={key} className="bg-black/[0.025] px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent dark:bg-white/[0.035]">
                {l.description}
              </div>
            );
          if (l.type === "text")
            return (
              <p key={key} className="whitespace-pre-line px-4 py-2.5 text-[13px] italic text-fg-2">
                {l.description}
              </p>
            );
          return (
            <div key={key} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-[14px] font-medium leading-snug">{l.description}</div>
                <div className="shrink-0 text-[14px] font-semibold tabular">{money(l.total, currency)}</div>
              </div>
              {l.details && <div className="mt-0.5 whitespace-pre-line text-[12.5px] text-fg-3">{l.details}</div>}
              <div className="mt-1 text-[12.5px] text-fg-3 tabular">
                {quantityLabel(l.quantity, l.unit)} × {money(l.unit_price, currency)}
                {l.discount ? ` · remise ${vatLabel(l.discount)}` : ""} · TVA {vatLabel(l.vat_rate ?? 0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                     */
/* -------------------------------------------------------------------------- */

function TotalsBox({ rows }: { rows: TotalRow[] }) {
  return (
    <div className="glass-inset w-full rounded-[20px] p-2 sm:w-[360px]">
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            "flex items-baseline justify-between gap-4 rounded-[14px] px-3 py-1.5 text-[13.5px]",
            r.variant === "strong" && "mt-1 border-t border-[var(--hairline-strong)] pt-3 text-[17px] font-semibold tracking-[-0.01em]",
            r.variant === "accent" && "mt-1.5 bg-accent-soft py-2.5 font-semibold text-accent",
            r.variant === "success" && "mt-1.5 bg-emerald-500/12 py-2.5 font-semibold text-emerald-700 dark:text-emerald-300",
            r.variant === "muted" && "text-fg-3",
          )}
        >
          <span className={cn(!r.variant && "text-fg-2")}>{r.label}</span>
          <span className="shrink-0 tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Paper                                                                      */
/* -------------------------------------------------------------------------- */

export interface DocumentPaperProps {
  kicker: string;
  number: string;
  stamp?: { label: string; tone: "green" | "red" | "orange" | "gray" } | null;
  dates: DocDate[];
  title?: string | null;
  seller: SellerParty;
  buyer: BuyerParty;
  buyerLabel: string;
  lines: LineItem[];
  currency: string;
  totals: TotalRow[];
  mentions?: (string | null | undefined | false)[];
  sections?: { title: string; body: ReactNode }[];
  logoUrl?: string | null;
}

const STAMP = {
  green: "text-emerald-600 ring-emerald-500/60 dark:text-emerald-400",
  red: "text-red-600 ring-red-500/60 dark:text-red-400",
  orange: "text-orange-600 ring-orange-500/60 dark:text-orange-400",
  gray: "text-zinc-500 ring-zinc-400/60",
};

/** A quote / invoice rendered as a sheet of glass paper (same content as the PDF). */
export function DocumentPaper({ kicker, number, stamp, dates, title, seller, buyer, buyerLabel, lines, currency, totals, mentions = [], sections = [], logoUrl }: DocumentPaperProps) {
  const sellerName = seller.trade_name || seller.name;
  const logo = logoUrl || seller.logo_url;
  return (
    <Glass variant="strong" radius="xl" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--accent-2),var(--accent-3))]" />
      <article className="p-5 sm:p-8 lg:p-10">
        <header className="flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">{kicker}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] tabular sm:text-[30px]">{number}</h2>
              {stamp && (
                <motion.span
                  initial={{ scale: 1.5, opacity: 0, rotate: -14 }}
                  animate={{ scale: 1, opacity: 1, rotate: -7 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
                  className={cn("inline-block rounded-[10px] px-2.5 py-0.5 text-[12.5px] font-bold uppercase tracking-[0.18em] ring-2 ring-inset", STAMP[stamp.tone])}
                >
                  {stamp.label}
                </motion.span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap">
              {dates.map((d) => (
                <div key={d.label} className="min-w-0">
                  <dt className="text-[11.5px] font-medium text-fg-3">{d.label}</dt>
                  <dd className={cn("text-[13.5px] font-medium tabular", d.tone === "danger" && "text-red-600 dark:text-red-400")}>{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            {logo ? (
              <img src={logo} alt={sellerName ?? ""} className="h-11 max-w-[160px] object-contain" />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-[18px] font-bold text-white shadow-[0_10px_24px_-10px_var(--accent)]">{(sellerName ?? "?").charAt(0)}</span>
            )}
            <span className="text-[14px] font-semibold tracking-[-0.01em] sm:text-right">{sellerName}</span>
          </div>
        </header>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <PartyBlock label="Émetteur" name={seller.name} lines={sellerLines(seller)} />
          <PartyBlock label={buyerLabel} name={buyer.name} lines={buyerLines(buyer)} accent />
        </div>

        {title && <h3 className="mt-8 text-[18px] font-semibold tracking-[-0.015em]">{title}</h3>}
        <div className={title ? "mt-3" : "mt-8"}>
          <LinesTable lines={lines} currency={currency} />
        </div>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5 text-[12.5px] text-fg-3">
            {mentions.filter(Boolean).map((m) => (
              <p key={String(m)}>{m}</p>
            ))}
          </div>
          <TotalsBox rows={totals} />
        </div>

        {sections.length > 0 && (
          <div className="mt-8 space-y-5">
            {sections.map((s) => (
              <section key={s.title}>
                <h4 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-fg-3">{s.title}</h4>
                <div className="whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{s.body}</div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-10 space-y-1 border-t border-[var(--hairline)] pt-5 text-[11.5px] leading-relaxed text-fg-3">
          <p>{legalIdentity(seller)}</p>
          {seller.mediator && <p>Médiateur de la consommation : {seller.mediator}</p>}
          {seller.insurance && <p>Assurance professionnelle : {seller.insurance}</p>}
        </footer>
      </article>
    </Glass>
  );
}

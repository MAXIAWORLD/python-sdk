import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Clock, FileDown, Mail, PenLine, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ContactCard, SummaryRow } from "@/components/public-docs/AsideCards";
import { natureLabel, vatLabel } from "@/components/public-docs/doc-utils";
import { DocumentPaper, type DocumentPaperProps, type TotalRow } from "@/components/public-docs/DocumentPaper";
import { DocError, DocSkeleton, StatusBanner } from "@/components/public-docs/PublicBits";
import { DeclineDialog, QuoteSignForm, SignatureProof, type SignedProof } from "@/components/public-docs/QuoteSignature";
import type { PublicQuoteDoc } from "@/components/public-docs/types";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { date, daysFromNow, money, plural } from "@/lib/format";

type QuoteState = "pending" | "signed" | "invoiced" | "declined" | "expired";

function quoteState(q: PublicQuoteDoc): QuoteState {
  if (q.status === "invoiced") return "invoiced";
  if (q.status === "accepted" || q.accepted_at) return "signed";
  if (q.status === "declined") return "declined";
  if (q.status === "expired" || (q.valid_until && (daysFromNow(q.valid_until) ?? 0) < 0)) return "expired";
  return "pending";
}

function validityLabel(validUntil?: string | null) {
  const days = daysFromNow(validUntil);
  if (days === null) return "Sans limite de validité";
  if (days < 0) return `Expiré depuis le ${date(validUntil, "d MMMM yyyy")}`;
  if (days === 0) return "Dernier jour de validité";
  return `Encore ${plural(days, "jour")} pour signer`;
}

function quoteTotals(q: PublicQuoteDoc): TotalRow[] {
  const rows: TotalRow[] = [{ label: "Total HT", value: money(q.lines_total, q.currency) }];
  if (q.discount) {
    rows.push({ label: `Remise globale (${vatLabel(q.discount)})`, value: `−${money(q.discount_amount, q.currency)}` });
    rows.push({ label: "Total HT net", value: money(q.subtotal, q.currency) });
  }
  for (const v of q.vat_breakdown) rows.push({ label: `TVA ${vatLabel(v.rate)} sur ${money(v.base, q.currency)}`, value: money(v.amount, q.currency), variant: "muted" });
  rows.push({ label: "Total TTC", value: money(q.total, q.currency), variant: "strong" });
  if (q.deposit_percent) rows.push({ label: `Acompte à la commande (${vatLabel(q.deposit_percent)})`, value: money((q.total * q.deposit_percent) / 100, q.currency), variant: "accent" });
  return rows;
}

const STAMPS: Partial<Record<QuoteState, DocumentPaperProps["stamp"]>> = {
  signed: { label: "Signé", tone: "green" },
  invoiced: { label: "Signé", tone: "green" },
  declined: { label: "Refusé", tone: "red" },
  expired: { label: "Expiré", tone: "orange" },
};

/** Signed proof merged on top of the cached document until the refetch lands. */
function withProof(q: PublicQuoteDoc, proof: SignedProof | null): PublicQuoteDoc {
  if (!proof || q.accepted_at) return q;
  return { ...q, status: "accepted", accepted_at: proof.accepted_at, signed_by: proof.name, signer_email: proof.email, signature: proof.signature, signature_hash: proof.signature_hash };
}

export default function PublicQuote() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["public-quote", token], queryFn: () => api.get<PublicQuoteDoc>(`/public/quotes/${encodeURIComponent(token)}`), retry: false, staleTime: 60_000 });
  const [proof, setProof] = useState<SignedProof | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [ctaInView, setCtaInView] = useState(true);
  const summaryRef = useRef<HTMLDivElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const proofRef = useRef<HTMLDivElement>(null);

  const quote = query.data ? withProof(query.data, proof) : undefined;
  const state = quote ? quoteState(quote) : null;
  const company = quote ? quote.seller.trade_name || quote.seller.name || quote.branding.company || "" : "";

  const number = quote?.number;
  useEffect(() => {
    if (number) document.title = `Devis ${number}${company ? ` — ${company}` : ""}`;
  }, [number, company]);

  /* Mobile signing bar: only once both the summary card and the form are out of view */
  useEffect(() => {
    const targets = [summaryRef.current, signRef.current].filter((el): el is HTMLDivElement => !!el);
    if (state !== "pending" || !targets.length) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setCtaInView(visible.size > 0);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    for (const t of targets) io.observe(t);
    return () => io.disconnect();
  }, [state]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["public-quote", token] });
  const scrollToSign = () => signRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (query.isLoading)
    return (
      <PublicLayout width="xl">
        <DocSkeleton />
      </PublicLayout>
    );
  if (query.error || !quote || !state)
    return (
      <PublicLayout width="lg">
        <DocError error={query.error} kind="quote" onRetry={() => query.refetch()} />
      </PublicLayout>
    );

  const pdfHref = `/api/public/quotes/${encodeURIComponent(token)}/pdf`;
  const pdfName = `Devis-${quote.number}.pdf`;
  const pending = state === "pending";
  const mailto = quote.seller.email ? `mailto:${quote.seller.email}?subject=${encodeURIComponent(`Devis ${quote.number}`)}` : null;
  const deposit = quote.deposit_percent ? (quote.total * quote.deposit_percent) / 100 : 0;
  const signedAt = quote.accepted_at ? date(quote.accepted_at, "d MMMM yyyy 'à' HH:mm") : null;

  const banner = {
    pending: (
      <StatusBanner
        tone="accent"
        icon={<PenLine className="size-[18px]" />}
        title="Ce devis attend votre signature"
        description={`Valable jusqu'au ${date(quote.valid_until, "d MMMM yyyy")} · ${validityLabel(quote.valid_until).toLowerCase()}.`}
      />
    ),
    signed: (
      <StatusBanner
        tone="green"
        icon={<CircleCheck className="size-[18px]" />}
        title={`Devis signé le ${signedAt}`}
        description={`Par ${quote.signed_by ?? "le client"}${quote.signer_email ? ` (${quote.signer_email})` : ""} — signature électronique horodatée.`}
      />
    ),
    invoiced: <StatusBanner tone="violet" icon={<CircleCheck className="size-[18px]" />} title="Devis signé et facturé" description={signedAt ? `Accepté le ${signedAt} par ${quote.signed_by ?? "le client"}.` : "Ce devis a été accepté puis facturé."} />,
    declined: (
      <StatusBanner
        tone="red"
        icon={<CircleX className="size-[18px]" />}
        title={`Devis refusé${quote.declined_at ? ` le ${date(quote.declined_at, "d MMMM yyyy")}` : ""}`}
        description="Votre réponse a bien été transmise. Vous pouvez toujours télécharger le devis ou nous contacter."
      />
    ),
    expired: (
      <StatusBanner
        tone="orange"
        icon={<Clock className="size-[18px]" />}
        title={`Ce devis a expiré${quote.valid_until ? ` le ${date(quote.valid_until, "d MMMM yyyy")}` : ""}`}
        description={`Contactez ${company || "l'émetteur"} pour recevoir une proposition actualisée.`}
        action={
          mailto && (
            <Button size="sm" variant="glass" asChild>
              <a href={mailto}>
                <Mail className="size-4" /> Nous écrire
              </a>
            </Button>
          )
        }
      />
    ),
  }[state];

  return (
    <PublicLayout
      width="xl"
      title={`Devis ${quote.number}`}
      subtitle={`${quote.title ? `${quote.title} · ` : ""}Proposition pour ${quote.buyer.name ?? "vous"}`}
      actions={
        <Button size="sm" variant="glass" asChild>
          <a href={pdfHref} download={pdfName}>
            <FileDown className="size-4" /> PDF
          </a>
        </Button>
      }
    >
      <div className="space-y-5 pb-20 lg:pb-0">
        {banner}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <DocumentPaper
              kicker="Devis"
              number={quote.number}
              stamp={STAMPS[state]}
              dates={[
                { label: "Établi le", value: date(quote.issue_date, "d MMMM yyyy") },
                { label: "Valable jusqu'au", value: date(quote.valid_until, "d MMMM yyyy"), tone: state === "expired" ? "danger" : undefined },
                { label: "Nature", value: natureLabel(quote.nature) },
              ]}
              title={quote.title}
              seller={quote.seller}
              buyer={quote.buyer}
              buyerLabel="Destinataire"
              lines={quote.lines}
              currency={quote.currency}
              totals={quoteTotals(quote)}
              logoUrl={quote.branding.logo_url}
              mentions={[quote.seller.vat_regime === "franchise" && "TVA non applicable, art. 293 B du CGI", quote.vat_mention, quote.deposit_percent ? `Un acompte de ${vatLabel(quote.deposit_percent)} du montant TTC est demandé à la commande.` : null]}
              sections={[...(quote.notes ? [{ title: "Notes", body: quote.notes }] : []), ...(quote.terms ? [{ title: "Conditions", body: quote.terms }] : [])]}
            />
            {pending && (
              <div ref={signRef} id="signature" className="scroll-mt-6">
                <QuoteSignForm
                  quote={quote}
                  token={token}
                  onSigned={(p) => {
                    setProof(p);
                    refresh();
                    requestAnimationFrame(() => proofRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }}
                  onDecline={() => setDeclineOpen(true)}
                  onConflict={refresh}
                />
              </div>
            )}
            {(state === "signed" || state === "invoiced") && (
              <div ref={proofRef} className="scroll-mt-6">
                <SignatureProof quote={quote} fresh={!!proof} company={company} pdfHref={pdfHref} pdfName={pdfName} />
              </div>
            )}
          </div>

          <aside className="order-first space-y-4 lg:sticky lg:top-6 lg:order-none">
            <Glass ref={summaryRef} radius="xl" glow className="p-5">
              <div className="text-[12.5px] font-medium text-fg-3">Montant total TTC</div>
              <div className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.035em] tabular">{money(quote.total, quote.currency)}</div>
              <div className="text-[12.5px] text-fg-3 tabular">
                {money(quote.subtotal, quote.currency)} HT · TVA {money(quote.tax_total, quote.currency)}
              </div>
              {deposit > 0 && (
                <div className="mt-3 rounded-[14px] bg-accent-soft px-3 py-2 text-[12.5px] text-fg-2">
                  <b className="font-semibold text-accent tabular">{money(deposit, quote.currency)}</b> d'acompte ({vatLabel(quote.deposit_percent ?? 0)}) à la commande
                </div>
              )}
              <dl className="mt-3 divide-y divide-[var(--hairline)]">
                <SummaryRow label="Validité">{state === "expired" ? <span className="text-orange-600 dark:text-orange-400">Expiré</span> : date(quote.valid_until, "d MMM yyyy")}</SummaryRow>
                {pending && <SummaryRow label="Délai">{validityLabel(quote.valid_until)}</SummaryRow>}
                <SummaryRow label="Pour">{quote.buyer.name ?? "—"}</SummaryRow>
              </dl>
              <div className="no-print mt-4 space-y-2">
                {pending && (
                  <Button variant="primary" size="lg" className="w-full" icon={<PenLine className="size-4" />} onClick={scrollToSign}>
                    Signer le devis
                  </Button>
                )}
                <Button variant="glass" className="w-full" asChild>
                  <a href={pdfHref} download={pdfName}>
                    <FileDown className="size-4" /> {state === "signed" || state === "invoiced" ? "Télécharger le devis signé" : "Télécharger le PDF"}
                  </a>
                </Button>
                {pending && (
                  <Button variant="ghost" className="w-full text-fg-3" onClick={() => setDeclineOpen(true)}>
                    Refuser le devis
                  </Button>
                )}
                {(state === "expired" || state === "declined") && mailto && (
                  <Button variant="glass" className="w-full" asChild>
                    <a href={mailto}>
                      <Mail className="size-4" /> Demander une nouvelle proposition
                    </a>
                  </Button>
                )}
              </div>
              {(pending || state === "signed" || state === "invoiced") && (
                <p className="mt-4 flex gap-2.5 border-t border-[var(--hairline)] pt-3.5 text-[11.5px] leading-relaxed text-fg-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  Signature électronique simple (règlement eIDAS) : horodatage et empreinte SHA-256 conservés comme preuve.
                </p>
              )}
            </Glass>
            <div className="hidden lg:block">
              <ContactCard seller={quote.seller} subject={`Devis ${quote.number}`} />
            </div>
          </aside>
        </div>
        <div className="lg:hidden">
          <ContactCard seller={quote.seller} subject={`Devis ${quote.number}`} />
        </div>
      </div>

      {/* Mobile: signing call-to-action always at hand */}
      <AnimatePresence>
        {pending && !ctaInView && (
          <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }} className="no-print fixed inset-x-3 bottom-3 z-30 lg:hidden">
            <div className="glass glass-strong flex items-center gap-3 rounded-[22px] py-2.5 pl-4 pr-2.5 shadow-[var(--glass-shadow-lg)]">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-fg-3">Devis {quote.number}</div>
                <div className="truncate text-[16px] font-semibold tabular">{money(quote.total, quote.currency)} TTC</div>
              </div>
              <Button variant="primary" icon={<PenLine className="size-4" />} onClick={scrollToSign}>
                Signer
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeclineDialog open={declineOpen} onOpenChange={setDeclineOpen} token={token} number={quote.number} onDone={refresh} />
    </PublicLayout>
  );
}

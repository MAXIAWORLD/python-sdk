import { ArrowUpRight, ChevronDown, Scale } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Input } from "@/components/ui/fields";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutoTextarea, NumField } from "./fields";

const PENALTY_PRESETS = [
  { label: "Taux BCE + 10 points", value: "En cas de retard de paiement, application de pénalités au taux d'intérêt appliqué par la BCE à son opération de refinancement la plus récente majoré de 10 points (art. L441-10 du Code de commerce)." },
  { label: "3 × taux d'intérêt légal", value: "En cas de retard de paiement, application de pénalités égales à trois fois le taux d'intérêt légal (art. L441-10 du Code de commerce)." },
];

const DISCOUNT_PRESETS = ["Pas d'escompte pour paiement anticipé.", "Escompte de 1 % pour paiement sous 10 jours."];

export interface TermsValue {
  late_penalty_rate: string;
  early_payment_discount: string;
  recovery_fee: number | null;
  vat_mention: string;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium transition", active ? "bg-accent-soft text-accent" : "bg-black/[0.04] text-fg-2 hover:text-fg dark:bg-white/[0.06]")}>
      {children}
    </button>
  );
}

function DebitsRow({ vatOnDebits }: { vatOnDebits: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-fg-2">Option pour le paiement de la TVA d'après les débits</span>
      <Link to="/settings?tab=company" className="inline-flex shrink-0 items-center gap-1 font-medium text-fg hover:text-accent" title="Réglage de l'entreprise (Paramètres › Entreprise)">
        {vatOnDebits ? "Oui" : "Non"} <ArrowUpRight className="size-3 text-fg-3" />
      </Link>
    </div>
  );
}

/** Late-payment penalties, recovery fee, early-payment discount, VAT mentions (B2B mandatory mentions). */
export function InvoiceTermsEditor({ value, onChange, vatOnDebits, franchise, credit }: { value: TermsValue; onChange: (patch: Partial<TermsValue>) => void; vatOnDebits: boolean; franchise: boolean; credit?: boolean }) {
  const [open, setOpen] = useState(false);
  const summary = [credit ? null : `Indemnité ${money(value.recovery_fee ?? 40, "EUR", { decimals: 0 })}`, value.early_payment_discount || null, franchise ? "Franchise de TVA" : value.vat_mention ? "Mention d'exonération de TVA" : null, vatOnDebits ? "TVA sur les débits" : null].filter(Boolean);
  return (
    <div className="rounded-[20px] ring-1 ring-inset ring-[var(--hairline)]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          <Scale className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">Mentions légales de paiement</span>
          <span className="block truncate text-[12px] text-fg-3">{summary.join(" · ") || "Pénalités de retard, indemnité forfaitaire, escompte"}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-[var(--hairline)] px-4 py-4">
              {!credit && (
                <>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-fg-2">Pénalités de retard</span>
                      <div className="flex flex-wrap gap-1">
                        {PENALTY_PRESETS.map((p) => (
                          <Chip key={p.label} active={value.late_penalty_rate === p.value} onClick={() => onChange({ late_penalty_rate: p.value })}>
                            {p.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <AutoTextarea value={value.late_penalty_rate} onChange={(v) => onChange({ late_penalty_rate: v })} minRows={2} className="-mx-2.5 w-[calc(100%+1.25rem)] text-[12.5px] text-fg-2" placeholder="Taux et conditions des pénalités de retard (mention obligatoire)" />
                  </div>
                  <div className="grid gap-4 @lg:grid-cols-[180px_minmax(0,1fr)]">
                    <div>
                      <div className="mb-1 text-[12.5px] font-medium text-fg-2">Indemnité forfaitaire</div>
                      <NumField size="field" value={value.recovery_fee} onChange={(v) => onChange({ recovery_fee: v })} suffix="€" aria-label="Indemnité forfaitaire de recouvrement" />
                      <div className="mt-1 text-[11.5px] text-fg-3">40 € minimum (art. D441-5)</div>
                    </div>
                    <div>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12.5px] font-medium text-fg-2">Escompte pour paiement anticipé</span>
                        <div className="flex flex-wrap gap-1">
                          {DISCOUNT_PRESETS.map((p) => (
                            <Chip key={p} active={value.early_payment_discount === p} onClick={() => onChange({ early_payment_discount: p })}>
                              {p.startsWith("Pas") ? "Aucun" : "1 % à 10 jours"}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <Input value={value.early_payment_discount} onChange={(e) => onChange({ early_payment_discount: e.target.value })} placeholder="Ex. : pas d'escompte pour paiement anticipé" />
                    </div>
                  </div>
                </>
              )}
              {!franchise && (
                <div>
                  <div className="mb-1 text-[12.5px] font-medium text-fg-2">Mention de TVA (lignes à 0 %)</div>
                  <Input value={value.vat_mention} onChange={(e) => onChange({ vat_mention: e.target.value })} placeholder="Automatique selon le pays du client et la nature de l'opération" />
                  <div className="mt-1 text-[11.5px] leading-snug text-fg-3">
                    Prisme ajoute à l'enregistrement la mention légale adaptée (autoliquidation, livraison intracommunautaire, export…). Saisissez un texte pour la remplacer, videz le champ pour revenir au calcul automatique.
                  </div>
                </div>
              )}
              <DebitsRow vatOnDebits={vatOnDebits} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Same mentions, as printed on an issued invoice. */
export function InvoiceTermsReadOnly({ penalties, recoveryFee, discount, vatMention, vatOnDebits, franchise, credit }: { penalties?: string | null; recoveryFee?: number | null; discount?: string | null; vatMention?: string | null; vatOnDebits: boolean; franchise: boolean; credit: boolean }) {
  const lines = [
    franchise ? "TVA non applicable, art. 293 B du CGI" : vatMention,
    vatOnDebits ? "Option pour le paiement de la TVA d'après les débits." : null,
    credit ? null : penalties,
    credit ? null : `Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : ${money(recoveryFee ?? 40)} (art. D441-5 du Code de commerce).`,
    credit ? null : discount,
  ].filter((x): x is string => !!x && !!x.trim());
  if (!lines.length) return null;
  return (
    <div className="rounded-[18px] bg-black/[0.02] px-4 py-3 text-[11.5px] leading-relaxed text-fg-3 ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.025]">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}

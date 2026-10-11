import { AlertTriangle, BookOpenCheck, CalendarClock, FileCheck2, FileText, Hash, Lock, Percent, RotateCcw, Scale, Send } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { NATURES, VAT_RATES } from "@/lib/constants";
import { daysFromNow } from "@/lib/format";
import { useDebounced, useList } from "@/lib/hooks";
import type { Invoice, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import {
  Callout,
  ChoiceCards,
  FieldGroup,
  FormGrid,
  NumberField,
  ReadOnlyNotice,
  Restricted,
  SaveBar,
  SelectField,
  SettingsCard,
  SwitchField,
  TabHeader,
  TextareaField,
  TextField,
  useSectionForm,
  type FormErrors,
  type SectionForm,
} from "./shared";
import type { AccountingSettings, BillingSettings, CompanySettings, EinvoicingSettings } from "./types";

const LATE_PENALTY_DEFAULT =
  "En cas de retard de paiement, application de pénalités au taux d'intérêt appliqué par la BCE à son opération de refinancement la plus récente majoré de 10 points (art. L441-10 du Code de commerce).";

const PREFIX_RE = /^[A-Z0-9]{1,8}$/;

function validateBilling(v: BillingSettings): FormErrors<BillingSettings> {
  const e: FormErrors<BillingSettings> = {};
  for (const key of ["quote_prefix", "invoice_prefix", "credit_prefix"] as const) {
    if (!PREFIX_RE.test(v[key] || "")) e[key] = "1 à 8 lettres majuscules ou chiffres, sans tiret.";
  }
  if (v.invoice_prefix && v.invoice_prefix === v.credit_prefix) e.credit_prefix = "Les avoirs doivent avoir leur propre série.";
  if (v.payment_days > 60) e.payment_days = "Plafond légal : 60 jours à compter de la date d'émission (art. L441-10 du Code de commerce).";
  if (v.payment_days < 0) e.payment_days = "Le délai ne peut pas être négatif.";
  if (v.quote_validity_days < 1 || v.quote_validity_days > 365) e.quote_validity_days = "Entre 1 et 365 jours.";
  if (v.recovery_fee < 0) e.recovery_fee = "Montant invalide.";
  return e;
}

function validateAccounting(v: AccountingSettings): FormErrors<AccountingSettings> {
  const e: FormErrors<AccountingSettings> = {};
  for (const key of ["account_customers", "account_services", "account_goods", "account_vat", "account_bank"] as const) {
    if (!/^\d{3,12}$/.test(v[key] || "")) e[key] = "Numéro de compte du plan comptable (chiffres uniquement).";
  }
  for (const key of ["journal_sales", "journal_bank"] as const) {
    if (!/^[A-Z0-9]{1,6}$/.test(v[key] || "")) e[key] = "Code journal : 1 à 6 caractères.";
  }
  if (!/^[A-Z0-9]{0,4}$/.test(v.customer_aux_prefix || "")) e.customer_aux_prefix = "4 caractères maximum.";
  return e;
}

const upper = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/* -------------------------------------------------------------------------- */
/* Numbering                                                                  */
/* -------------------------------------------------------------------------- */

function useLastInvoice(prefix: string, year: number, kind: "invoice" | "credit_note") {
  const p = useDebounced(prefix, 300);
  return useList<Invoice>("invoices", { locked: true, number__contains: `${p}-${year}-`, kind__in: kind === "credit_note" ? "credit_note" : "invoice,deposit", sort: "-sequence", limit: 1 }, { enabled: PREFIX_RE.test(p) });
}

function NumberingRow({ form, field, label, description, example, locked, lockedReason, loading }: { form: SectionForm<BillingSettings>; field: "quote_prefix" | "invoice_prefix" | "credit_prefix"; label: string; description: string; example: string; locked: boolean; lockedReason?: string; loading: boolean }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_132px_236px]">
      <div>
        <div className="flex items-center gap-2 text-[14px] font-medium">
          {label}
          {locked && (
            <Badge tone="gray" size="xs">
              <Lock className="size-3" /> Verrouillé
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{locked && lockedReason ? lockedReason : description}</p>
      </div>
      <Field error={form.errors[field]}>
        <Input value={form.values[field] ?? ""} onChange={(e) => form.set(field, upper(e.target.value))} disabled={!form.canEdit || locked} maxLength={8} icon={locked ? <Lock className="size-3.5" /> : <Hash className="size-3.5" />} className="font-mono" aria-label={`Préfixe ${label}`} />
      </Field>
      <div className="glass-inset flex h-10 items-center justify-between gap-2 rounded-[12px] px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-3">Prochain</span>
        {loading ? <Skeleton className="h-4 w-24" /> : <span className="truncate font-mono text-[13px] font-semibold tabular">{example}</span>}
      </div>
    </div>
  );
}

function NumberingCard({ form }: { form: SectionForm<BillingSettings> }) {
  const year = new Date().getFullYear();
  const v = form.values;
  const savedInvoicePrefix = form.server?.invoice_prefix ?? "";
  const savedCreditPrefix = form.server?.credit_prefix ?? "";
  const lastInvoice = useLastInvoice(v.invoice_prefix || "", year, "invoice");
  const lastCredit = useLastInvoice(v.credit_prefix || "", year, "credit_note");
  const issuedWithSavedInvoicePrefix = useList<Invoice>("invoices", { locked: true, number__contains: `${savedInvoicePrefix}-${year}-`, limit: 1 }, { enabled: !!savedInvoicePrefix });
  const issuedWithSavedCreditPrefix = useList<Invoice>("invoices", { locked: true, number__contains: `${savedCreditPrefix}-${year}-`, limit: 1 }, { enabled: !!savedCreditPrefix });
  const lastQuote = useList<Quote>("quotes", { number__contains: `-${year}-`, sort: "-id", limit: 1 });

  const nextSeq = (row?: { sequence?: number | null }) => (row?.sequence ?? 0) + 1;
  const quoteSeq = Number(lastQuote.data?.items[0]?.number?.match(/(\d+)$/)?.[1] ?? 0) + 1;
  const invoiceCount = issuedWithSavedInvoicePrefix.data?.total ?? 0;
  const creditCount = issuedWithSavedCreditPrefix.data?.total ?? 0;

  return (
    <SettingsCard title="Numérotation" description={`Séries continues et chronologiques, par préfixe et par année (ex. FA-${year}-00001). Le numéro définitif est attribué à l'émission.`} icon={<Hash className="size-4" />}>
      <div className="divide-y divide-[var(--hairline)]">
        <NumberingRow form={form} field="quote_prefix" label="Devis" description="Numéro attribué dès la création du devis." example={`${v.quote_prefix || "DEV"}-${year}-${String(quoteSeq).padStart(4, "0")}`} locked={false} loading={lastQuote.isLoading} />
        <NumberingRow
          form={form}
          field="invoice_prefix"
          label="Factures et acomptes"
          description="Modifiable tant qu'aucune facture n'a été émise cette année avec ce préfixe."
          example={`${v.invoice_prefix || "FA"}-${year}-${String(nextSeq(lastInvoice.data?.items[0])).padStart(5, "0")}`}
          locked={invoiceCount > 0}
          lockedReason={`${invoiceCount} facture${invoiceCount > 1 ? "s" : ""} émise${invoiceCount > 1 ? "s" : ""} en ${year} : la série doit rester continue jusqu'à la fin de l'année.`}
          loading={lastInvoice.isLoading}
        />
        <NumberingRow
          form={form}
          field="credit_prefix"
          label="Avoirs"
          description="Série distincte pour les factures rectificatives."
          example={`${v.credit_prefix || "AV"}-${year}-${String(nextSeq(lastCredit.data?.items[0])).padStart(5, "0")}`}
          locked={creditCount > 0}
          lockedReason={`${creditCount} avoir${creditCount > 1 ? "s" : ""} émis en ${year} : la série doit rester continue jusqu'à la fin de l'année.`}
          loading={lastCredit.isLoading}
        />
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Payment terms                                                              */
/* -------------------------------------------------------------------------- */

function PaymentTermsCard({ form }: { form: SectionForm<BillingSettings> }) {
  const v = form.values;
  const penaltyId = useId();
  const days = v.payment_days ?? 0;
  const termsWarning =
    days > 60 ? null : days > 45 ? (
      <Callout tone="warn" title="Délai long">
        Au-delà de 45 jours fin de mois, le délai doit être expressément convenu au contrat et ne peut jamais dépasser 60 jours à compter de l'émission de la facture (loi de modernisation de l'économie).
      </Callout>
    ) : days > 30 ? (
      <Callout tone="info" title="Délai supérieur à 30 jours">
        Sans accord entre les parties, le délai légal est de 30 jours après la réception des marchandises ou l'exécution de la prestation. Vérifiez qu'il figure dans vos conditions générales.
      </Callout>
    ) : null;
  return (
    <SettingsCard title="Conditions de paiement" description="Reprises par défaut sur chaque nouvelle facture (mentions obligatoires entre professionnels)." icon={<CalendarClock className="size-4" />}>
      <div className="space-y-4">
        <FormGrid>
          <NumberField form={form} name="payment_days" label="Délai de paiement" suffix="jours" min={0} hint={days === 0 ? "Paiement à réception de facture." : "À compter de la date d'émission. Maximum légal : 60 jours."} />
          <TextField form={form} name="payment_methods" label="Moyens de paiement acceptés" placeholder="Virement bancaire, carte bancaire" />
        </FormGrid>
        {termsWarning}
        <FieldGroup
          label="Pénalités de retard"
          htmlFor={penaltyId}
          hint="Taux au moins égal à 3 fois le taux d'intérêt légal. La mention par défaut reprend le taux BCE majoré de 10 points."
          error={form.errors.late_penalty_rate}
          action={
            form.canEdit && v.late_penalty_rate !== LATE_PENALTY_DEFAULT ? (
              <button type="button" onClick={() => form.set("late_penalty_rate", LATE_PENALTY_DEFAULT)} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                <RotateCcw className="size-3" /> Mention légale par défaut
              </button>
            ) : undefined
          }
        >
          <Textarea id={penaltyId} value={v.late_penalty_rate ?? ""} onChange={(e) => form.set("late_penalty_rate", e.target.value)} rows={3} disabled={!form.canEdit} />
        </FieldGroup>
        <FormGrid>
          <NumberField
            form={form}
            name="recovery_fee"
            label="Indemnité forfaitaire de recouvrement"
            suffix="€"
            min={0}
            step={1}
            hint={
              v.recovery_fee !== 40 ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  Montant fixé par décret à 40 € (art. D441-5 du Code de commerce).
                </span>
              ) : (
                "40 € : montant fixé par décret (art. D441-5 du Code de commerce)."
              )
            }
          />
          <TextField form={form} name="early_payment_discount" label="Escompte pour paiement anticipé" placeholder="Pas d'escompte pour paiement anticipé." hint="Mention obligatoire, même en l'absence d'escompte." />
        </FormGrid>
        <SwitchField form={form} name="auto_overdue" label="Passer automatiquement les factures en retard" description="Chaque heure, les factures échues et non réglées passent au statut « En retard » et apparaissent dans les relances." />
        <SwitchField form={form} name="auto_reminders" label="Relances automatiques par email" description="Un rappel de paiement (PDF joint, mentions des pénalités) part chaque jour de retard indiqué ci-dessous. Nécessite l'envoi d'emails configuré." />
        {v.auto_reminders && <ReminderDays form={form} />}
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* VAT                                                                        */
/* -------------------------------------------------------------------------- */

function VatCard({ billing, company }: { billing: SectionForm<BillingSettings>; company: SectionForm<CompanySettings> }) {
  const franchise = company.values.vat_regime === "franchise";
  return (
    <SettingsCard title="TVA" description="Régime de TVA de l'entreprise et taux appliqué par défaut aux nouvelles lignes." icon={<Percent className="size-4" />}>
      <div className="space-y-4">
        <ChoiceCards
          value={franchise ? "franchise" : "normal"}
          onChange={(v) => company.set("vat_regime", v)}
          disabled={!company.canEdit}
          className="grid-cols-1 md:grid-cols-2"
          options={[
            { value: "normal", label: "Assujetti à la TVA", description: "TVA collectée sur vos ventes et reversée à l'État." },
            { value: "franchise", label: "Franchise en base", description: "Factures sans TVA avec la mention « TVA non applicable, art. 293 B du CGI »." },
          ]}
        />
        <FormGrid>
          <Field label="Taux de TVA par défaut" hint={franchise ? "Sans effet en franchise en base." : "Taux normal : 20 %."}>
            <Select options={VAT_RATES.map((r) => ({ value: String(r), label: `${String(r).replace(".", ",")} %` }))} value={String(billing.values.default_vat ?? 20)} onChange={(r) => billing.set("default_vat", Number(r))} disabled={!billing.canEdit || franchise} />
          </Field>
          <SelectField form={billing} name="default_nature" label="Nature des opérations par défaut" options={NATURES} hint="Mention exigée par la réforme de la facturation électronique." />
        </FormGrid>
        <SwitchField
          form={company}
          name="vat_on_debits"
          label="Option pour le paiement de la TVA d'après les débits"
          description="Pour les prestations de services : la mention « Option pour le paiement de la taxe d'après les débits » est ajoutée sur vos factures."
        />
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* E-invoicing                                                                */
/* -------------------------------------------------------------------------- */

const MILESTONES = [
  { date: "2026-09-01", label: "1er septembre 2026", items: ["Réception des factures électroniques obligatoire pour toutes les entreprises", "Émission obligatoire pour les grandes entreprises et les ETI"] },
  { date: "2027-09-01", label: "1er septembre 2027", items: ["Émission obligatoire pour les PME et les micro-entreprises", "E-reporting des transactions B2C et internationales pour tous"] },
];

function ReformTimeline() {
  return (
    <ol className="relative space-y-4 pl-6">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--hairline-strong)]" aria-hidden />
      {MILESTONES.map((m) => {
        const left = daysFromNow(m.date) ?? 0;
        const passed = left <= 0;
        return (
          <li key={m.date} className="relative">
            <span className={cn("absolute -left-6 top-1 flex size-[15px] items-center justify-center rounded-full ring-4 ring-[var(--bg)]", passed ? "bg-emerald-500" : "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))]")} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold">{m.label}</span>
              {passed ? (
                <Badge tone="green" size="xs" dot>
                  En vigueur
                </Badge>
              ) : (
                <Badge tone="indigo" size="xs">
                  Dans {left > 60 ? `${Math.round(left / 30)} mois` : `${left} jours`}
                </Badge>
              )}
            </div>
            <ul className="mt-1 space-y-0.5 text-[12.5px] text-fg-2">
              {m.items.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/** Days of delay that trigger each automatic reminder (e.g. 7, 15, 30). */
function ReminderDays({ form }: { form: SectionForm<BillingSettings> }) {
  const [draft, setDraft] = useState(() => form.values.reminder_days.join(", "));
  const apply = (text: string) => {
    setDraft(text);
    const days = [...new Set(text.split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 365))].sort((a, b) => a - b);
    form.set("reminder_days", days);
  };
  return (
    <FieldGroup label="Jours de retard déclenchant une relance" hint={form.values.reminder_days.length ? `Relances à J+${form.values.reminder_days.join(", J+")} après l'échéance.` : "Indiquez au moins un nombre de jours."}>
      <Input value={draft} onChange={(e) => apply(e.target.value)} placeholder="7, 15, 30" inputMode="numeric" disabled={!form.canEdit} className="max-w-[240px]" />
    </FieldGroup>
  );
}

function EinvoicingCard({ form }: { form: SectionForm<EinvoicingSettings> }) {
  if (!form.ready) return null;
  const v = form.values;
  return (
    <SettingsCard title="Facturation électronique" description="Réforme 2026-2027 : vos factures B2B transitent par une plateforme agréée (PA) choisie par vous." icon={<Send className="size-4" />}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <SwitchField form={form} name="enabled" label="Générer les factures au format Factur-X" description="PDF lisible avec le fichier XML structuré intégré (norme EN 16931), accepté par les plateformes agréées." />
          <FormGrid>
            <Field label="Format" hint="PDF/A-3 avec XML CII embarqué.">
              <Input value={v.format === "factur-x" ? "Factur-X" : v.format.toUpperCase()} disabled />
            </Field>
            <SelectField
              form={form}
              name="profile"
              label="Profil Factur-X"
              options={[
                { value: "en16931", label: "EN 16931 (recommandé)" },
                { value: "extended", label: "Extended (données étendues)" },
              ]}
              hint="EN 16931 couvre toutes les mentions exigées par la réforme."
            />
            <TextField form={form} name="platform_name" label="Plateforme agréée choisie" placeholder="Nom de votre plateforme agréée" className="sm:col-span-2" hint="Consultez la liste officielle des plateformes immatriculées publiée par l'administration fiscale. Déposez-y vos factures Factur-X (export PDF ou XML depuis chaque facture)." />
          </FormGrid>
          <Callout tone="neutral" icon={<Scale className="size-4" />}>
            Prisme prépare des factures conformes (Factur-X EN 16931, nouvelles mentions : SIREN du client, adresse de livraison, nature des opérations, option sur les débits). Prisme n'est pas une plateforme agréée : vous restez responsable du dépôt de vos factures auprès de la plateforme choisie.
          </Callout>
        </div>
        <div className="glass-inset h-fit rounded-[18px] p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            <CalendarClock className="size-4 text-accent" /> Calendrier de la réforme
          </div>
          <ReformTimeline />
        </div>
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Accounting                                                                 */
/* -------------------------------------------------------------------------- */

function AccountingCard({ form }: { form: SectionForm<AccountingSettings> }) {
  const navigate = useNavigate();
  const canExport = useAuth((s) => can(s.user, "manager"));
  if (!form.ready) return null;
  return (
    <SettingsCard
      title="Comptabilité"
      description="Comptes et journaux utilisés pour l'export du fichier des écritures comptables (FEC)."
      icon={<BookOpenCheck className="size-4" />}
      actions={
        canExport ? (
          <Button size="sm" variant="glass" icon={<FileCheck2 className="size-3.5" />} onClick={() => navigate("/settings?tab=data#fec")}>
            Exporter le FEC
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">Journaux</div>
          <FormGrid className="lg:grid-cols-3">
            <TextField form={form} name="journal_sales" label="Journal des ventes" normalize={upper} maxLength={6} />
            <TextField form={form} name="journal_bank" label="Journal de banque" normalize={upper} maxLength={6} />
            <TextField form={form} name="customer_aux_prefix" label="Préfixe des comptes clients" normalize={upper} maxLength={4} hint="Ex. C00042 pour le client n° 42." />
          </FormGrid>
        </div>
        <div>
          <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">Comptes du plan comptable général</div>
          <FormGrid className="lg:grid-cols-3">
            <TextField form={form} name="account_customers" label="Clients" inputMode="numeric" placeholder="411000" />
            <TextField form={form} name="account_services" label="Prestations de services" inputMode="numeric" placeholder="706000" />
            <TextField form={form} name="account_goods" label="Ventes de marchandises" inputMode="numeric" placeholder="707000" />
            <TextField form={form} name="account_vat" label="TVA collectée" inputMode="numeric" placeholder="445710" />
            <TextField form={form} name="account_bank" label="Banque" inputMode="numeric" placeholder="512000" />
          </FormGrid>
        </div>
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab                                                                        */
/* -------------------------------------------------------------------------- */

export default function BillingTab() {
  const billing = useSectionForm("billing", { validate: validateBilling });
  const company = useSectionForm("company");
  const einvoicing = useSectionForm("einvoicing");
  const accounting = useSectionForm("accounting", { validate: validateAccounting });
  const isAdmin = useAuth((s) => can(s.user, "admin"));
  if (!billing.ready) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-[260px] rounded-[22px]" />
        <Skeleton className="h-[360px] rounded-[22px]" />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <TabHeader title="Facturation" description="Numérotation, TVA, conditions de paiement et mentions reprises sur vos devis et factures." />
      {!billing.canEdit && <ReadOnlyNotice />}

      <NumberingCard form={billing} />
      <VatCard billing={billing} company={company} />
      <PaymentTermsCard form={billing} />

      <SettingsCard title="Devis & conditions générales" description="Textes ajoutés par défaut à vos documents commerciaux." icon={<FileText className="size-4" />}>
        <div className="space-y-4">
          <FormGrid>
            <NumberField form={billing} name="quote_validity_days" label="Validité des devis" suffix="jours" min={1} hint="Date limite calculée automatiquement à la création." />
          </FormGrid>
          <TextareaField form={billing} name="quote_terms" label="Conditions des devis" rows={3} hint="Affichées sur le devis et sur la page de signature en ligne." />
          <TextareaField form={billing} name="invoice_terms" label="Conditions générales de vente (factures)" rows={5} placeholder="Collez ici vos conditions générales ou un lien vers celles-ci." hint="Ajoutées aux nouvelles factures. Les CGV doivent être communiquées à tout client professionnel qui en fait la demande." />
          <TextareaField form={billing} name="footer" label="Pied de page des documents" rows={2} placeholder="Ex. : Membre d'une association agréée, règlement par chèque accepté." hint="Imprimé en bas de chaque devis et facture PDF (300 caractères maximum)." />
        </div>
      </SettingsCard>

      {isAdmin ? (
        <>
          <EinvoicingCard form={einvoicing} />
          <AccountingCard form={accounting} />
        </>
      ) : (
        <Restricted title="Facturation électronique et comptabilité" description="Ces réglages sont réservés aux administrateurs." />
      )}

      <SaveBar forms={[billing, company, einvoicing, accounting]} />
    </div>
  );
}

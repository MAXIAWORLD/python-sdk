import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Building2, Calculator, CheckCircle2, CircleDashed, Fingerprint, ImageUp, Landmark, MapPin, ScrollText, Sparkles, Trash2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Badge, Ring, Spinner } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/fields";
import { useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { toastError } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { ColorPicker, FieldGroup, FormGrid, isHexColor, ReadOnlyNotice, SaveBar, SETTINGS_KEY, SettingsCard, TabHeader, TextField, useHashScroll, useSectionForm, type FormErrors } from "./shared";
import { COMMERCIAL_FORMS, readiness } from "./readiness";
import type { BrandingSettings, CompanySettings } from "./types";
import { checkVat, compact, formatIban, formatSiren, isApe, isEmail, isUrl, isValidBic, isValidIban, isValidSiren, isValidSiret, onlyDigits, vatFromSiren } from "./validators";

const LEGAL_FORMS = ["SAS", "SASU", "SARL", "EURL", "SA", "SNC", "SCOP", "SELARL", "SELAS", "EI", "Micro-entreprise", "Association", "Autre"];

const COUNTRIES = [
  { value: "FR", label: "France" },
  { value: "BE", label: "Belgique" },
  { value: "LU", label: "Luxembourg" },
  { value: "CH", label: "Suisse" },
  { value: "MC", label: "Monaco" },
  { value: "DE", label: "Allemagne" },
  { value: "ES", label: "Espagne" },
  { value: "IT", label: "Italie" },
  { value: "NL", label: "Pays-Bas" },
  { value: "PT", label: "Portugal" },
  { value: "IE", label: "Irlande" },
  { value: "GB", label: "Royaume-Uni" },
  { value: "US", label: "États-Unis" },
  { value: "CA", label: "Canada" },
];

function validateCompany(v: CompanySettings): FormErrors<CompanySettings> {
  const e: FormErrors<CompanySettings> = {};
  if (!(v.legal_name || "").trim() && !(v.name || "").trim()) e.legal_name = "La raison sociale est obligatoire sur vos factures.";
  if (v.siren && !isValidSiren(v.siren)) e.siren = "SIREN invalide : 9 chiffres avec clé de contrôle.";
  if (v.siret) {
    if (!isValidSiret(v.siret)) e.siret = "SIRET invalide : 14 chiffres avec clé de contrôle.";
    else if (isValidSiren(v.siren) && !compact(v.siret).startsWith(compact(v.siren))) e.siret = "Le SIRET doit commencer par votre SIREN.";
  }
  const vat = checkVat(v.vat_number || "", v.siren);
  if (vat?.level === "error") e.vat_number = vat.message;
  if (v.iban && !isValidIban(v.iban)) e.iban = "IBAN invalide : vérifiez le pays, la clé et la longueur.";
  if (v.bic && !isValidBic(v.bic)) e.bic = "BIC invalide : 8 ou 11 caractères (ex. AGRIFRPP).";
  if (v.email && !isEmail(v.email)) e.email = "Adresse email invalide.";
  if (v.website && !isUrl(v.website)) e.website = "Adresse de site invalide.";
  if (v.ape && !isApe(v.ape)) e.ape = "Code APE/NAF invalide (ex. 6201Z).";
  if (v.zip && (v.country_code || "FR") === "FR" && !/^\d{5}$/.test(v.zip.trim())) e.zip = "Code postal à 5 chiffres.";
  if (v.capital && !/^[\d\s.,]+$/.test(v.capital)) e.capital = "Indiquez uniquement le montant (ex. 10 000).";
  return e;
}

function validateBranding(v: BrandingSettings): FormErrors<BrandingSettings> {
  const e: FormErrors<BrandingSettings> = {};
  if (!(v.app_name || "").trim()) e.app_name = "Nom requis.";
  if (v.accent && !isHexColor(v.accent)) e.accent = "Couleur hexadécimale attendue (ex. #5B6CFF).";
  return e;
}

/* -------------------------------------------------------------------------- */
/* Readiness (« Prêt à facturer »)                                             */
/* -------------------------------------------------------------------------- */

function scrollToCard(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ReadinessCard({ values }: { values: CompanySettings }) {
  const items = useMemo(() => readiness(values), [values]);
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  const missingRequired = items.filter((i) => i.required && !i.ok);
  const missingOptional = items.filter((i) => !i.required && !i.ok);
  const ready = missingRequired.length === 0;
  const color = ready ? (missingOptional.length ? "#ff9f0a" : "#30d158") : "#ff453a";
  return (
    <motion.div layout className="glass relative overflow-hidden rounded-[22px]" data-glow="">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full opacity-30 blur-3xl" style={{ background: color }} />
      <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="flex items-center gap-4">
          <Ring value={pct} size={76} stroke={7} color={color}>
            <span className="text-[16px] font-semibold tabular">{pct} %</span>
          </Ring>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{ready ? "Prêt à facturer" : "Informations manquantes"}</h3>
              {ready ? (
                <Badge tone={missingOptional.length ? "yellow" : "green"} dot>
                  {missingOptional.length ? `${missingOptional.length} recommandation${missingOptional.length > 1 ? "s" : ""}` : "Complet"}
                </Badge>
              ) : (
                <Badge tone="red" dot>
                  {missingRequired.length} mention{missingRequired.length > 1 ? "s" : ""} obligatoire{missingRequired.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
              {ready
                ? "Les mentions obligatoires de vos factures sont renseignées. Elles sont figées sur chaque facture au moment de son émission."
                : "Ces informations sont exigées sur toute facture (art. L441-9 du Code de commerce) : l'émission est bloquée tant qu'elles manquent."}
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.label}>
              <button type="button" onClick={() => scrollToCard(item.anchor)} className="flex w-full items-center gap-2 rounded-[11px] px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                {item.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : item.required ? (
                  <XCircle className="size-4 shrink-0 text-red-500" />
                ) : (
                  <CircleDashed className="size-4 shrink-0 text-amber-500" />
                )}
                <span className={cn("truncate", item.ok ? "text-fg-2" : "font-medium text-fg")}>{item.label}</span>
                {!item.ok && !item.required && <span className="ml-auto shrink-0 text-[11px] text-fg-3">conseillé</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Branding (logo, app name, accent)                                          */
/* -------------------------------------------------------------------------- */

function LogoUploader({ logoUrl, canEdit }: { logoUrl?: string | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const setAuth = useAuth((s) => s.set);
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const updateBranding = (url: string) => {
    setAuth({ branding: { ...useAuth.getState().branding, logo_url: url || null } });
    qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    qc.invalidateQueries({ queryKey: ["public-branding"] });
  };

  const upload = async (file?: File | null) => {
    if (!file) return;
    if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) return toast.error("Format non pris en charge", { description: "Utilisez un fichier PNG, JPG, WebP ou SVG." });
    if (file.size > 3 * 1024 * 1024) return toast.error("Logo trop volumineux", { description: "3 Mo maximum." });
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    try {
      const res = await api.post<{ url: string }>("/branding/logo", body);
      updateBranding(res.url);
      toast.success("Logo mis à jour", { description: "Il apparaît sur vos devis, factures et pages publiques." });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Retirer le logo ?", description: "Vos prochains documents seront édités sans logo. Les factures déjà émises ne sont pas modifiées.", confirmLabel: "Retirer", danger: true }))) return;
    setBusy(true);
    try {
      await api.patch("/settings/company", { logo_url: "" });
      await api.patch("/settings/branding", { logo_url: "" });
      updateBranding("");
      toast.success("Logo retiré");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (canEdit) upload(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <button
        type="button"
        disabled={!canEdit || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative flex h-[112px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed transition sm:w-[180px]",
          over ? "border-[var(--accent)] bg-accent-soft" : "border-[var(--hairline-strong)] bg-black/[0.02] hover:border-[color-mix(in_oklab,var(--accent)_50%,transparent)] dark:bg-white/[0.03]",
          !canEdit && "cursor-default",
        )}
        aria-label="Téléverser un logo"
      >
        {busy ? (
          <Spinner className="size-6 text-accent" />
        ) : logoUrl ? (
          <img src={logoUrl} alt="Logo de l'entreprise" className="max-h-[84px] max-w-[150px] object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-fg-3">
            <ImageUp className="size-6" />
            <span className="text-[12px] font-medium">Déposer un logo</span>
          </span>
        )}
      </button>
      <div className="min-w-0 space-y-2">
        <p className="text-[13px] leading-relaxed text-fg-2">Glissez-déposez votre logo ou choisissez un fichier. PNG, JPG, WebP ou SVG, 3 Mo maximum — idéalement sur fond transparent.</p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="glass" icon={<ImageUp className="size-3.5" />} onClick={() => input.current?.click()} disabled={busy}>
              {logoUrl ? "Remplacer" : "Choisir un fichier"}
            </Button>
            {logoUrl && (
              <Button size="sm" variant="ghost" className="text-red-500" icon={<Trash2 className="size-3.5" />} onClick={remove} disabled={busy}>
                Retirer
              </Button>
            )}
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function BrandPreview({ name, accent, logoUrl, company }: { name: string; accent: string; logoUrl?: string | null; company?: string }) {
  return (
    <div className="glass-inset relative self-start overflow-hidden rounded-[18px] p-4">
      <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full opacity-40 blur-3xl" style={{ background: accent }} />
      <div className="relative flex items-center gap-2.5">
        <LogoMark size={30} />
        <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">{name || "Prisme"}</span>
      </div>
      <div className="relative mt-4 rounded-[14px] bg-white/70 p-3 shadow-[0_8px_24px_-14px_rgba(0,0,0,.35)] dark:bg-white/[0.06]">
        <div className="flex items-center justify-between gap-2">
          {logoUrl ? <img src={logoUrl} alt="" className="h-6 max-w-[90px] object-contain" /> : <span className="text-[12px] font-semibold">{company || "Votre entreprise"}</span>}
          <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
            Facture
          </span>
        </div>
        <div className="mt-2.5 space-y-1">
          <span className="block h-1.5 w-3/4 rounded-full bg-black/10 dark:bg-white/10" />
          <span className="block h-1.5 w-1/2 rounded-full bg-black/10 dark:bg-white/10" />
        </div>
        <span className="mt-3 inline-flex h-7 items-center rounded-[9px] px-2.5 text-[11.5px] font-semibold text-white" style={{ background: accent }}>
          Payer la facture
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab                                                                        */
/* -------------------------------------------------------------------------- */

export default function CompanyTab() {
  const setAuth = useAuth((s) => s.set);
  const company = useSectionForm("company", { validate: validateCompany });
  const branding = useSectionForm("branding", {
    validate: validateBranding,
    onSaved: (b) => setAuth({ branding: { ...useAuth.getState().branding, app_name: b.app_name || "Prisme", accent: b.accent, logo_url: b.logo_url || useAuth.getState().branding.logo_url } }),
  });
  const c = company.values;

  // Live accent preview, restored to the saved value when leaving the tab.
  const liveAccent = branding.values.accent;
  const savedAccent = useRef<string | undefined>(undefined);
  const serverAccent = branding.server?.accent;
  useEffect(() => {
    savedAccent.current = serverAccent;
  }, [serverAccent]);
  useEffect(() => {
    if (isHexColor(liveAccent)) document.documentElement.style.setProperty("--accent", liveAccent);
  }, [liveAccent]);
  useEffect(
    () => () => {
      if (savedAccent.current) document.documentElement.style.setProperty("--accent", savedAccent.current);
    },
    [],
  );

  useHashScroll(company.ready);
  const vatId = useId();

  const vatCheck = checkVat(c.vat_number || "", c.siren);
  const franchise = c.vat_regime === "franchise";
  const suggestedVat = isValidSiren(c.siren || "") ? vatFromSiren(c.siren) : null;

  if (!company.ready) return <CompanySkeleton />;

  return (
    <div className="space-y-5">
      <TabHeader title="Entreprise" description="Identité légale de votre organisation : elle figure sur vos devis, factures, avoirs et pages publiques." />
      {!company.canEdit && <ReadOnlyNotice />}

      <ReadinessCard values={c} />

      <SettingsCard id="identity" title="Identité légale" description="Telle qu'elle apparaît au registre (Kbis, avis de situation INSEE)." icon={<Building2 className="size-4" />}>
        <FormGrid>
          <TextField form={company} name="legal_name" label="Raison sociale" required placeholder="Nova Studio SAS" hint="Dénomination officielle de la société." />
          <TextField form={company} name="name" label="Nom commercial" placeholder="Nova Studio" hint="Nom d'usage affiché sur les documents et pages publiques." />
          <Field label="Forme juridique">
            <Select options={LEGAL_FORMS} value={c.legal_form ?? ""} onChange={(v) => company.set("legal_form", v)} placeholder="Choisir…" disabled={!company.canEdit} />
          </Field>
          <TextField form={company} name="capital" label="Capital social" suffix="€" placeholder="10 000" inputMode="decimal" hint={COMMERCIAL_FORMS.has((c.legal_form || "").toUpperCase()) ? "Mention obligatoire pour les sociétés." : undefined} />
          <TextField form={company} name="rcs_city" label="Ville d'immatriculation (RCS)" placeholder="Paris" hint="Mention « RCS Paris 123 456 789 »." />
          <TextField form={company} name="ape" label="Code APE / NAF" placeholder="6201Z" maxLength={6} normalize={(v) => v.toUpperCase().replace(/\s/g, "")} />
          <TextField form={company} name="rm" label="Répertoire des métiers" placeholder="Pour les artisans uniquement" className="sm:col-span-2" />
        </FormGrid>
      </SettingsCard>

      <SettingsCard id="fiscal" title="Identifiants" description="Vérifiés automatiquement : clé de Luhn pour le SIREN et le SIRET, clé de TVA calculée depuis le SIREN." icon={<Fingerprint className="size-4" />}>
        <FormGrid>
          <TextField
            form={company}
            name="siren"
            label="SIREN"
            required
            placeholder="123 456 789"
            inputMode="numeric"
            maxLength={9}
            normalize={(v) => onlyDigits(v).slice(0, 9)}
            hint={isValidSiren(c.siren || "") ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><BadgeCheck className="size-3.5" />SIREN valide · {formatSiren(c.siren)}</span> : "9 chiffres, figurant sur votre Kbis ou avis INSEE."}
          />
          <TextField form={company} name="siret" label="SIRET du siège" placeholder="123 456 789 00012" inputMode="numeric" maxLength={14} normalize={(v) => onlyDigits(v).slice(0, 14)} hint="14 chiffres : SIREN + NIC de l'établissement." />
          <FieldGroup
            label="N° de TVA intracommunautaire"
            htmlFor={vatId}
            className="sm:col-span-2"
            error={company.errors.vat_number}
            hint={
              vatCheck?.level === "warning" ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3.5" />{vatCheck.message}</span>
              ) : franchise ? (
                "Franchise en base : le numéro reste utile si vous en disposez (achats intracommunautaires)."
              ) : (
                "Obligatoire sur vos factures, sauf franchise en base de TVA (art. 293 B du CGI)."
              )
            }
            action={
              suggestedVat && compact(c.vat_number || "") !== suggestedVat && company.canEdit ? (
                <button type="button" onClick={() => company.set("vat_number", suggestedVat)} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                  <Calculator className="size-3.5" /> Calculer depuis le SIREN
                </button>
              ) : undefined
            }
          >
            <Input id={vatId} value={c.vat_number ?? ""} onChange={(e) => company.set("vat_number", compact(e.target.value))} placeholder="FR12 123456789" disabled={!company.canEdit} maxLength={15} aria-invalid={!!company.errors.vat_number} />
          </FieldGroup>
        </FormGrid>
      </SettingsCard>

      <SettingsCard id="address" title="Siège social & contact" description="Adresse du siège et coordonnées affichées sur vos documents." icon={<MapPin className="size-4" />}>
        <FormGrid>
          <TextField form={company} name="address" label="Adresse" required placeholder="18 rue du Faubourg Saint-Antoine" className="sm:col-span-2" autoComplete="street-address" />
          <TextField form={company} name="zip" label="Code postal" required placeholder="75011" inputMode="numeric" maxLength={10} autoComplete="postal-code" />
          <TextField form={company} name="city" label="Ville" required placeholder="Paris" autoComplete="address-level2" />
          <Field label="Pays">
            <Select
              options={COUNTRIES}
              value={c.country_code || "FR"}
              onChange={(code) => {
                company.set("country_code", code);
                company.set("country", COUNTRIES.find((x) => x.value === code)?.label ?? code);
              }}
              disabled={!company.canEdit}
            />
          </Field>
          <TextField form={company} name="phone" label="Téléphone" placeholder="01 84 60 00 00" inputMode="tel" autoComplete="tel" />
          <TextField form={company} name="email" label="Email de facturation" type="email" placeholder="facturation@entreprise.fr" hint="Utilisé comme contact sur les factures et comme adresse de repli pour la facturation électronique." />
          <TextField form={company} name="website" label="Site web" placeholder="https://entreprise.fr" inputMode="url" />
        </FormGrid>
      </SettingsCard>

      <SettingsCard id="bank" title="Coordonnées bancaires" description="Imprimées sur vos factures pour faciliter les paiements par virement." icon={<Landmark className="size-4" />}>
        <FormGrid>
          <TextField
            form={company}
            name="iban"
            label="IBAN"
            placeholder="FR76 3000 6000 0112 3456 7890 189"
            normalize={formatIban}
            maxLength={42}
            className="sm:col-span-2"
            hint={isValidIban(c.iban || "") ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><BadgeCheck className="size-3.5" />IBAN valide</span> : "Clé de contrôle vérifiée automatiquement."}
          />
          <TextField form={company} name="bic" label="BIC / SWIFT" placeholder="AGRIFRPP" normalize={(v) => compact(v)} maxLength={11} />
          <TextField form={company} name="bank_name" label="Banque" placeholder="Crédit Agricole" />
        </FormGrid>
      </SettingsCard>

      <SettingsCard title="Mentions complémentaires" description="Selon votre activité et votre clientèle." icon={<ScrollText className="size-4" />}>
        <FormGrid>
          <TextField form={company} name="mediator" label="Médiateur de la consommation" placeholder="Nom et site du médiateur" hint="Obligatoire si vous vendez à des particuliers (art. L612-1 du Code de la consommation)." className="sm:col-span-2" />
          <TextField form={company} name="insurance" label="Assurance professionnelle" placeholder="Assureur, n° de contrat, couverture géographique" hint="Mention obligatoire pour certaines professions (artisans du bâtiment, professions réglementées…)." className="sm:col-span-2" />
          <TextField form={company} name="einvoicing_address" label="Adresse de facturation électronique" placeholder={c.siren ? `${c.siren} (SIREN par défaut)` : "Votre SIREN par défaut"} hint="Identifiant de réception dans l'annuaire de la facturation électronique. Laissez vide pour utiliser votre SIREN." className="sm:col-span-2" />
        </FormGrid>
      </SettingsCard>

      <SettingsCard id="branding" title="Image de marque" description="Logo, nom de l'application et couleur d'accent de votre espace Prisme." icon={<Sparkles className="size-4" />}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <LogoUploader logoUrl={branding.values.logo_url || c.logo_url} canEdit={branding.canEdit} />
            <FormGrid>
              <TextField form={branding} name="app_name" label="Nom de l'application" placeholder="Prisme" maxLength={40} hint="Affiché dans le menu, l'onglet du navigateur et les emails." />
              <FieldGroup label="Couleur d'accent" error={branding.errors.accent} hint="Aperçu en direct dans toute l'interface." className="sm:col-span-2">
                <ColorPicker value={branding.values.accent} onChange={(v) => branding.set("accent", v)} disabled={!branding.canEdit} withHex />
              </FieldGroup>
            </FormGrid>
          </div>
          <BrandPreview name={branding.values.app_name} accent={isHexColor(liveAccent) ? liveAccent : "#5b6cff"} logoUrl={branding.values.logo_url || c.logo_url} company={c.name || c.legal_name} />
        </div>
      </SettingsCard>

      <SaveBar forms={[company, branding]} />
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-12 w-72 rounded-[14px]" />
      <div className="skeleton h-[150px] rounded-[22px]" />
      <div className="skeleton h-[320px] rounded-[22px]" />
    </div>
  );
}

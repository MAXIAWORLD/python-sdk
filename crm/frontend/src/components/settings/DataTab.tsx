import { ArrowLeft, ArrowRight, Building2, CalendarRange, Check, CheckCircle2, Database, Download, FileDown, FileSpreadsheet, FileUp, HardDriveDownload, Layers, Package, RotateCcw, ShieldAlert, TriangleAlert, Upload, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { FilterChip } from "@/components/data/blocks";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/fields";
import { api, download } from "@/lib/api";
import { fileSize, isoDate, number } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import { cn, downloadBlob } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { Callout, ChoiceCards, Restricted, SettingsCard, TabHeader, useHashScroll, useSettings } from "./shared";

type Entity = "contacts" | "companies" | "products";

const ENTITIES: Record<Entity, { label: string; description: string; icon: typeof Users; path: string; required: string[][]; fields: Record<string, string> }> = {
  contacts: {
    label: "Contacts",
    description: "Personnes, avec création automatique des entreprises citées.",
    icon: Users,
    path: "/contacts",
    required: [["first_name", "last_name", "email"]],
    fields: { first_name: "Prénom", last_name: "Nom", email: "Email", phone: "Téléphone", mobile: "Mobile", job_title: "Poste", company: "Entreprise", city: "Ville", country: "Pays", source: "Source", lifecycle: "Cycle de vie", linkedin: "LinkedIn", tags: "Tags", notes: "Notes" },
  },
  companies: {
    label: "Entreprises",
    description: "Comptes clients, prospects et partenaires.",
    icon: Building2,
    path: "/companies",
    required: [["name"]],
    fields: { name: "Raison sociale", website: "Site web", industry: "Secteur", siren: "SIREN", siret: "SIRET", vat_number: "N° de TVA", address: "Adresse", zip: "Code postal", city: "Ville", country: "Pays", phone: "Téléphone", email: "Email", type: "Type", employees: "Effectif", tags: "Tags" },
  },
  products: {
    label: "Produits",
    description: "Catalogue de produits et services.",
    icon: Package,
    path: "/products",
    required: [["name"]],
    fields: { name: "Désignation", sku: "Référence", unit_price: "Prix unitaire HT", unit: "Unité", vat_rate: "Taux de TVA", category: "Catégorie", description: "Description" },
  },
};

const ENTITY_OPTIONS = (Object.keys(ENTITIES) as Entity[]).map((value) => {
  const { label, description, icon: Icon } = ENTITIES[value];
  return { value, label, description, icon: <Icon className="size-4" /> };
});

interface Preview {
  headers: string[];
  rows: Record<string, string>[];
  total: number;
  mapping: Record<string, string>;
  fields: string[];
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
  error_count: number;
}

const STEPS = ["Fichier", "Correspondance", "Résultat"];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition", i < step ? "bg-emerald-500 text-white" : i === step ? "btn-primary" : "bg-black/5 text-fg-3 dark:bg-white/10")}>{i < step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
          <span className={cn("hidden text-[12.5px] font-medium sm:block", i === step ? "text-fg" : "text-fg-3")}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--hairline-strong)]" />}
        </div>
      ))}
    </div>
  );
}

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Server guess, completed with the French labels used in our templates (« Prix unitaire HT », « N° de TVA »…). */
function completeMapping(preview: Preview, entity: Entity) {
  const mapping = { ...preview.mapping };
  const used = new Set(Object.values(mapping));
  const labels = ENTITIES[entity].fields;
  for (const header of preview.headers) {
    if (mapping[header]) continue;
    const field = Object.keys(labels).find((f) => !used.has(f) && (normalize(labels[f]) === normalize(header) || f === normalize(header)));
    if (field) {
      mapping[header] = field;
      used.add(field);
    }
  }
  return mapping;
}

function templateCsv(entity: Entity) {
  const headers = Object.values(ENTITIES[entity].fields);
  return new Blob(["﻿" + headers.join(";") + "\r\n"], { type: "text/csv;charset=utf-8" });
}

function ImportWizard({ initialEntity }: { initialEntity: Entity }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const input = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<Entity>(initialEntity);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const meta = ENTITIES[entity];

  const analyse = async (f?: File | null) => {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) return toast.error("Format non pris en charge", { description: "Exportez votre fichier au format CSV (séparateur ; ou ,)." });
    if (f.size > 20 * 1024 * 1024) return toast.error("Fichier trop volumineux", { description: "20 Mo maximum." });
    const body = new FormData();
    body.append("file", f);
    setBusy(true);
    try {
      const res = await api.post<Preview>(`/import/${entity}/preview`, body);
      if (!res.headers.length || !res.total) return toast.error("Fichier vide", { description: "Aucune ligne de données n'a été trouvée." });
      setFile(f);
      setPreview(res);
      setMapping(completeMapping(res, entity));
      setStep(1);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("mapping", JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v))));
    setBusy(true);
    try {
      const res = await api.post<ImportResult>(`/import/${entity}`, body);
      setResult(res);
      setStep(2);
      invalidate(entity, entity === "contacts" ? "companies" : entity);
      if (res.created + res.updated > 0) toast.success("Import terminé", { description: `${res.created} créé(s), ${res.updated} mis à jour.` });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep(0);
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
  };

  const mapped = Object.values(mapping).filter(Boolean);
  const duplicates = mapped.filter((v, i) => mapped.indexOf(v) !== i);
  const missingRequired = meta.required.filter((group) => !group.some((f) => mapped.includes(f)));
  const samples = (header: string) =>
    (preview?.rows ?? [])
      .map((r) => r[header])
      .filter(Boolean)
      .slice(0, 3);
  const fieldOptions = useMemo(() => [{ value: "", label: "— Ignorer cette colonne —" }, ...(preview?.fields ?? Object.keys(meta.fields)).map((f) => ({ value: f, label: meta.fields[f] ?? f }))], [preview, meta]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    analyse(e.dataTransfer.files?.[0]);
  };

  return (
    <SettingsCard title="Importer un fichier CSV" description="Depuis un tableur, un ancien CRM ou un export de votre messagerie." icon={<FileUp className="size-4" />}>
      <div className="space-y-5">
        <Stepper step={step} />
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="file" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-4">
              <ChoiceCards value={entity} onChange={setEntity} className="grid-cols-1 sm:grid-cols-3" options={ENTITY_OPTIONS} />
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
                disabled={busy}
                className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed px-6 py-10 text-center transition", over ? "border-[var(--accent)] bg-accent-soft" : "border-[var(--hairline-strong)] hover:border-[color-mix(in_oklab,var(--accent)_50%,transparent)] hover:bg-black/[0.02] dark:hover:bg-white/[0.03]")}
              >
                {busy ? <Spinner className="size-7 text-accent" /> : <FileSpreadsheet className="size-8 text-accent" />}
                <span className="text-[14px] font-semibold">{busy ? "Analyse du fichier…" : `Déposez votre fichier de ${meta.label.toLowerCase()} ici`}</span>
                <span className="text-[12.5px] text-fg-3">ou cliquez pour le choisir · CSV encodé en UTF-8, séparateur « ; » ou « , » · 20 000 lignes maximum</span>
              </button>
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv,.txt"
                className="hidden"
                onChange={(e) => {
                  analyse(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12.5px] text-fg-3">Les doublons sont mis à jour : contacts par email, entreprises par raison sociale.</p>
                <Button size="sm" variant="ghost" icon={<FileDown className="size-3.5" />} onClick={() => downloadBlob(templateCsv(entity), `modele-import-${entity}.csv`)}>
                  Télécharger un modèle
                </Button>
              </div>
              {entity === "contacts" && (
                <Callout tone="info" icon={<ShieldAlert className="size-4" />}>
                  RGPD : n'importez que des contacts collectés licitement. Sans consentement prouvé, les contacts ne sont pas marqués « opt-in » ; la prospection B2B reste possible sur la base de l'intérêt légitime, avec un lien de désinscription.
                </Callout>
              )}
            </motion.div>
          )}

          {step === 1 && preview && (
            <motion.div key="mapping" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone="blue">
                  <FileSpreadsheet className="size-3" /> {file?.name}
                </Badge>
                <span className="text-fg-3">
                  {number(preview.total)} ligne{preview.total > 1 ? "s" : ""} · {preview.headers.length} colonnes · {fileSize(file?.size)}
                </span>
                <span className="ml-auto text-fg-3">
                  {mapped.length}/{preview.headers.length} colonnes associées
                </span>
              </div>
              <div className="overflow-hidden rounded-[18px] ring-1 ring-inset ring-[var(--hairline)]">
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_24px_minmax(0,1fr)] gap-3 border-b border-[var(--hairline)] bg-black/[0.02] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3 sm:grid dark:bg-white/[0.03]">
                  <span>Colonne du fichier</span>
                  <span>Exemples</span>
                  <span />
                  <span>Champ Prisme</span>
                </div>
                <div className="max-h-[440px] divide-y divide-[var(--hairline)] overflow-y-auto">
                  {preview.headers.map((h) => {
                    const target = mapping[h] ?? "";
                    return (
                      <div key={h} className={cn("grid grid-cols-1 gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_24px_minmax(0,1fr)] sm:items-center sm:gap-3", !target && "opacity-70")}>
                        <span className="truncate text-[13px] font-medium" title={h}>
                          {h || <span className="text-fg-3">(sans titre)</span>}
                        </span>
                        <span className="truncate text-[12px] text-fg-3" title={samples(h).join(" · ")}>
                          {samples(h).join(" · ") || "—"}
                        </span>
                        <ArrowRight className={cn("hidden size-4 sm:block", target ? "text-accent" : "text-fg-3")} />
                        <Select value={target} onChange={(v) => setMapping({ ...mapping, [h]: v })} options={fieldOptions} className={cn("[&_select]:h-9", duplicates.includes(target) && target && "[&_select]:ring-amber-500/60")} aria-label={`Champ pour ${h}`} />
                      </div>
                    );
                  })}
                </div>
              </div>
              {missingRequired.length > 0 && (
                <Callout tone="warn" icon={<TriangleAlert className="size-4" />}>
                  Associez au moins une colonne à : {missingRequired.map((g) => g.map((f) => meta.fields[f]).join(" ou ")).join(", ")}.
                </Callout>
              )}
              {duplicates.length > 0 && (
                <Callout tone="warn" icon={<TriangleAlert className="size-4" />}>
                  Plusieurs colonnes alimentent le même champ ({Array.from(new Set(duplicates)).map((d) => meta.fields[d] ?? d).join(", ")}) : seule la dernière sera conservée.
                </Callout>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={restart}>
                  Changer de fichier
                </Button>
                <Button variant="primary" icon={<Upload className="size-4" />} loading={busy} disabled={missingRequired.length > 0 || mapped.length === 0} onClick={run}>
                  Importer {number(preview.total)} ligne{preview.total > 1 ? "s" : ""}
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && result && (
            <motion.div key="result" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Créés", value: result.created, tone: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Mis à jour", value: result.updated, tone: "text-accent" },
                  { label: "Erreurs", value: result.error_count, tone: result.error_count ? "text-red-500" : "text-fg-3" },
                ].map((s) => (
                  <div key={s.label} className="glass-inset rounded-[16px] p-4 text-center">
                    <div className={cn("text-[28px] font-semibold tracking-[-0.03em] tabular", s.tone)}>{number(s.value)}</div>
                    <div className="text-[12.5px] text-fg-3">{s.label}</div>
                  </div>
                ))}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-[16px] bg-red-500/[0.06] p-3.5 ring-1 ring-inset ring-red-500/15">
                  <div className="mb-1.5 text-[12.5px] font-semibold text-red-700 dark:text-red-300">Lignes ignorées{result.error_count > result.errors.length ? ` (50 premières sur ${result.error_count})` : ""}</div>
                  <ul className="max-h-[200px] space-y-0.5 overflow-y-auto font-mono text-[12px] text-fg-2">
                    {result.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.created + result.updated > 0 && result.error_count === 0 && (
                <Callout tone="success" icon={<CheckCircle2 className="size-4" />}>
                  Toutes les lignes ont été importées.
                </Callout>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={restart}>
                  Nouvel import
                </Button>
                <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={() => navigate(meta.path)}>
                  Voir les {meta.label.toLowerCase()}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

const EXPORTS: { resource: string; label: string }[] = [
  { resource: "contacts", label: "Contacts" },
  { resource: "companies", label: "Entreprises" },
  { resource: "deals", label: "Opportunités" },
  { resource: "quotes", label: "Devis" },
  { resource: "invoices", label: "Factures" },
  { resource: "payments", label: "Paiements" },
  { resource: "subscriptions", label: "Abonnements" },
  { resource: "products", label: "Catalogue" },
  { resource: "projects", label: "Projets" },
  { resource: "tasks", label: "Tâches" },
  { resource: "time-entries", label: "Temps passé" },
  { resource: "tickets", label: "Tickets" },
  { resource: "events", label: "Agenda" },
  { resource: "campaigns", label: "Campagnes" },
];

function ExportsCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (resource: string) => {
    setBusy(resource);
    try {
      await download(`/export/${resource}.csv`, `${resource}-${isoDate()}.csv`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <SettingsCard title="Exports CSV" description="Fichiers compatibles Excel, Numbers et Google Sheets (séparateur « ; », UTF-8). Chaque export est tracé dans le journal d'audit." icon={<Download className="size-4" />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {EXPORTS.map((e) => (
          <button key={e.resource} type="button" disabled={!!busy} onClick={() => run(e.resource)} className="group flex items-center justify-between gap-2 rounded-[14px] px-3.5 py-2.5 text-left ring-1 ring-inset ring-[var(--hairline-strong)] transition hover:bg-black/[0.03] disabled:opacity-60 dark:hover:bg-white/[0.04]">
            <span className="truncate text-[13px] font-medium">{e.label}</span>
            {busy === e.resource ? <Spinner className="size-4 text-accent" /> : <Download className="size-4 shrink-0 text-fg-3 transition group-hover:text-accent" />}
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}

function periodPresets() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const q = Math.floor(m / 3);
  return [
    { label: "Exercice en cours", start: new Date(y, 0, 1), end: today },
    { label: `Année ${y - 1}`, start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31) },
    { label: "Trimestre précédent", start: new Date(q === 0 ? y - 1 : y, q === 0 ? 9 : (q - 1) * 3, 1), end: new Date(q === 0 ? y - 1 : y, q === 0 ? 12 : q * 3, 0) },
    { label: "Mois précédent", start: new Date(y, m - 1, 1), end: new Date(y, m, 0) },
  ].map((p) => ({ label: p.label, start: isoDate(p.start), end: isoDate(p.end) }));
}

function FecCard() {
  const { data } = useSettings();
  const presets = useMemo(periodPresets, []);
  const [start, setStart] = useState(presets[0].start);
  const [end, setEnd] = useState(presets[0].end);
  const [busy, setBusy] = useState(false);
  const invalid = !start || !end || start > end;
  const siren = (data?.company.siren || "000000000").replace(/\s/g, "");

  const run = async () => {
    setBusy(true);
    try {
      await download("/export/fec", `${siren}FEC${end.replace(/-/g, "")}.txt`, { start, end });
      toast.success("FEC généré", { description: "Transmettez-le à votre expert-comptable ou conservez-le pour un contrôle fiscal." });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard id="fec" title="Fichier des écritures comptables (FEC)" description="Journal des ventes (factures et avoirs émis) et des encaissements, au format de l'article A47 A-1 du Livre des procédures fiscales." icon={<CalendarRange className="size-4" />}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <FilterChip
              key={p.label}
              active={start === p.start && end === p.end}
              onClick={() => {
                setStart(p.start);
                setEnd(p.end);
              }}
            >
              {p.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Du" className="sm:w-[180px]">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Au" className="sm:w-[180px]" error={start && end && start > end ? "La fin précède le début." : null}>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Button variant="primary" icon={<FileDown className="size-4" />} loading={busy} disabled={invalid} onClick={run} className="sm:ml-auto">
            Générer le FEC
          </Button>
        </div>
        <p className="text-[12px] text-fg-3">
          Nom du fichier : <span className="font-mono">{siren}FEC{end.replace(/-/g, "")}.txt</span> · comptes et journaux réglables dans Facturation › Comptabilité.
        </p>
      </div>
    </SettingsCard>
  );
}

function BackupCard() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await download("/export/backup", `prisme-sauvegarde-${isoDate()}.json`);
      toast.success("Sauvegarde téléchargée");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsCard title="Sauvegarde complète" description="Toutes les données de Prisme dans un fichier JSON : contacts, ventes, factures, projets, réglages…" icon={<HardDriveDownload className="size-4" />}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Callout tone="warn" icon={<ShieldAlert className="size-4" />} className="flex-1">
          Le fichier contient des données personnelles et commerciales : stockez-le chiffré, hors de portée de tiers. Les mots de passe et clés API n'y figurent jamais en clair.
        </Callout>
        <Button variant="glass" icon={<Database className="size-4" />} loading={busy} onClick={run} className="shrink-0">
          Télécharger la sauvegarde
        </Button>
      </div>
    </SettingsCard>
  );
}

export default function DataTab() {
  const me = useAuth((s) => s.user);
  const [params] = useSearchParams();
  const requested = params.get("entity");
  const initialEntity: Entity = requested && requested in ENTITIES ? (requested as Entity) : "contacts";
  useHashScroll();

  if (!can(me, "member")) return <Restricted title="Import et export réservés aux membres de l'équipe" description="Votre rôle « Lecteur » permet uniquement la consultation." />;

  return (
    <div className="space-y-5">
      <TabHeader title="Import / export" description="Faites entrer vos données dans Prisme et récupérez-les à tout moment : vos données vous appartiennent." badge={<Badge tone="blue"><Layers className="size-3" /> Portabilité</Badge>} />
      <ImportWizard initialEntity={initialEntity} />
      <ExportsCard />
      {can(me, "manager") && <FecCard />}
      {can(me, "admin") && <BackupCard />}
    </div>
  );
}

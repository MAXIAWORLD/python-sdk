import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookLock, ChevronDown, Clock, Download, Eraser, FileText, History, Pencil, Plus, ShieldCheck, Trash2, UserRoundCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { LIFECYCLE } from "@/lib/constants";
import { date, isoDate, relative } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import { cn, downloadBlob } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { AuditLog } from "./AuditLog";
import { Callout, FormGrid, NumberField, ReadOnlyNotice, Restricted, SaveBar, SettingsCard, SwitchField, TabHeader, TextareaField, TextField, useSectionForm, useSettings, type FormErrors, type SectionForm } from "./shared";
import type { RegisterEntry, RgpdSettings } from "./types";
import { isEmail, isUrl } from "./validators";

const REGISTER_FIELDS: { key: keyof RegisterEntry; label: string; multiline?: boolean; placeholder?: string }[] = [
  { key: "name", label: "Traitement", placeholder: "Ex. : Gestion des prospects" },
  { key: "purpose", label: "Finalité", multiline: true, placeholder: "Pourquoi les données sont-elles traitées ?" },
  { key: "legal_basis", label: "Base légale", placeholder: "Consentement, contrat, obligation légale, intérêt légitime…" },
  { key: "data", label: "Catégories de données", multiline: true },
  { key: "people", label: "Personnes concernées" },
  { key: "recipients", label: "Destinataires", multiline: true },
  { key: "retention", label: "Durée de conservation" },
  { key: "security", label: "Mesures de sécurité", multiline: true },
];

const LEGAL_BASES = ["Consentement", "Exécution du contrat", "Obligation légale", "Intérêt légitime", "Mission d'intérêt public", "Sauvegarde des intérêts vitaux"];

const EMPTY_ENTRY: RegisterEntry = { name: "", purpose: "", legal_basis: "", data: "", people: "", recipients: "", retention: "", security: "" };

function validateRgpd(v: RgpdSettings): FormErrors<RgpdSettings> {
  const e: FormErrors<RgpdSettings> = {};
  if (v.dpo_email && !isEmail(v.dpo_email)) e.dpo_email = "Adresse email invalide.";
  if (v.privacy_url && !isUrl(v.privacy_url)) e.privacy_url = "Adresse invalide.";
  if (v.prospect_retention_years < 1 || v.prospect_retention_years > 10) e.prospect_retention_years = "Entre 1 et 10 ans.";
  if (v.customer_retention_years < 1 || v.customer_retention_years > 10) e.customer_retention_years = "Entre 1 et 10 ans.";
  return e;
}

function csvCell(value: string) {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/* -------------------------------------------------------------------------- */
/* Register                                                                   */
/* -------------------------------------------------------------------------- */

function EntryDialog({ entry, onClose, onSave }: { entry: { index: number | null; value: RegisterEntry } | null; onClose: () => void; onSave: (value: RegisterEntry, index: number | null) => void }) {
  const [value, setValue] = useState<RegisterEntry>(EMPTY_ENTRY);
  const [lastEntry, setLastEntry] = useState(entry);
  if (entry !== lastEntry) {
    setLastEntry(entry);
    if (entry) setValue(entry.value);
  }
  return (
    <Dialog
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      icon={<BookLock className="size-5" />}
      title={entry?.index === null ? "Nouveau traitement" : "Modifier le traitement"}
      description="Fiche du registre des activités de traitement (RGPD, article 30)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" disabled={!value.name.trim() || !value.purpose.trim()} onClick={() => entry && onSave({ ...value, name: value.name.trim() }, entry.index)}>
            {entry?.index === null ? "Ajouter au registre" : "Mettre à jour"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REGISTER_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} required={f.key === "name" || f.key === "purpose"} className={cn(f.multiline && "sm:col-span-2")}>
            {f.multiline ? (
              <Textarea rows={2} value={value[f.key]} onChange={(e) => setValue({ ...value, [f.key]: e.target.value })} placeholder={f.placeholder} />
            ) : (
              <Input value={value[f.key]} onChange={(e) => setValue({ ...value, [f.key]: e.target.value })} placeholder={f.placeholder} list={f.key === "legal_basis" ? "rgpd-legal-bases" : undefined} />
            )}
          </Field>
        ))}
        <datalist id="rgpd-legal-bases">
          {LEGAL_BASES.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
    </Dialog>
  );
}

function RegisterCard({ form }: { form: SectionForm<RgpdSettings> }) {
  const register = form.values.register ?? [];
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ index: number | null; value: RegisterEntry } | null>(null);

  const save = (value: RegisterEntry, index: number | null) => {
    const next = [...register];
    if (index === null) next.push(value);
    else next[index] = value;
    form.set("register", next);
    setEditing(null);
  };
  const remove = (index: number) => {
    form.set(
      "register",
      register.filter((_, i) => i !== index),
    );
    setExpanded(null);
  };
  const exportCsv = () => {
    const header = REGISTER_FIELDS.map((f) => f.label).join(";");
    const rows = register.map((r) => REGISTER_FIELDS.map((f) => csvCell(r[f.key] ?? "")).join(";"));
    downloadBlob(new Blob(["﻿" + [header, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" }), `registre-traitements-${isoDate()}.csv`);
  };

  return (
    <SettingsCard
      title="Registre des traitements"
      description="Obligatoire (art. 30 du RGPD) : il recense les traitements de données personnelles réalisés avec Prisme. Complétez-le avec vos propres traitements."
      icon={<BookLock className="size-4" />}
      actions={
        <>
          <Button size="sm" variant="glass" icon={<Download className="size-3.5" />} onClick={exportCsv} disabled={!register.length}>
            Exporter
          </Button>
          {form.canEdit && (
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ index: null, value: EMPTY_ENTRY })}>
              Ajouter
            </Button>
          )}
        </>
      }
    >
      {register.length === 0 ? (
        <EmptyState icon={<BookLock className="size-6" />} title="Registre vide" description="Ajoutez vos traitements de données personnelles." className="py-8" />
      ) : (
        <ul className="space-y-2">
          {register.map((r, i) => {
            const open = expanded === i;
            return (
              <li key={`${r.name}-${i}`} className="overflow-hidden rounded-[16px] bg-black/[0.025] ring-1 ring-inset ring-[var(--hairline)] dark:bg-white/[0.035]">
                <button type="button" onClick={() => setExpanded(open ? null : i)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-[12px] font-semibold text-accent tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{r.name || "Sans nom"}</span>
                    <span className="block truncate text-[12px] text-fg-3">{r.legal_basis || "Base légale à préciser"} · {r.retention || "durée à préciser"}</span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="border-t border-[var(--hairline)] px-4 py-3">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[12.5px] sm:grid-cols-2">
                          {REGISTER_FIELDS.slice(1).map((f) => (
                            <div key={f.key}>
                              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{f.label}</dt>
                              <dd className="mt-0.5 text-fg-2">{r[f.key] || "—"}</dd>
                            </div>
                          ))}
                        </dl>
                        {form.canEdit && (
                          <div className="mt-3 flex justify-end gap-2">
                            <Button size="xs" variant="ghost" className="text-red-500" icon={<Trash2 className="size-3.5" />} onClick={() => remove(i)}>
                              Retirer
                            </Button>
                            <Button size="xs" variant="glass" icon={<Pencil className="size-3.5" />} onClick={() => setEditing({ index: i, value: r })}>
                              Modifier
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
      <EntryDialog entry={editing} onClose={() => setEditing(null)} onSave={save} />
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Retention purge                                                            */
/* -------------------------------------------------------------------------- */

interface Candidate {
  id: number;
  name: string;
  email?: string | null;
  lifecycle: string;
  last_contacted_at?: string | null;
  updated_at?: string | null;
}

function PurgeCard({ canPurge }: { canPurge: boolean }) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const { data, isLoading } = useQuery({ queryKey: ["rgpd-retention"], queryFn: () => api.get<{ years: number; items: Candidate[] }>("/rgpd/retention") });
  const [selected, setSelected] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => data?.items ?? [], [data]);

  const purge = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ anonymized: number }>("/rgpd/retention/purge", { ids: selected });
      toast.success(`${res.anonymized} contact${res.anonymized > 1 ? "s" : ""} anonymisé${res.anonymized > 1 ? "s" : ""}`, { description: "Les données personnelles ont été définitivement effacées ; les factures sont conservées." });
      setSelected([]);
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["rgpd-retention"] });
      invalidate("contacts", "audit-logs");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Candidate>[] = [
    {
      key: "name",
      header: "Contact",
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{c.name}</div>
          <div className="truncate text-[12px] text-fg-3">{c.email ?? "—"}</div>
        </div>
      ),
    },
    { key: "lifecycle", header: "Cycle de vie", hideOnMobile: true, cell: (c) => <StatusBadge options={LIFECYCLE} value={c.lifecycle} size="xs" /> },
    { key: "last", header: "Dernier contact", align: "right", cell: (c) => <span className="whitespace-nowrap text-[12.5px] text-fg-3">{c.last_contacted_at ? date(c.last_contacted_at) : "Jamais"}</span> },
    { key: "updated", header: "Dernière modification", align: "right", hideOnMobile: true, cell: (c) => <span className="whitespace-nowrap text-[12.5px] text-fg-3">{c.updated_at ? relative(c.updated_at) : "—"}</span> },
  ];

  return (
    <SettingsCard
      title="Purge des données expirées"
      description={`Prospects sans échange depuis plus de ${data?.years ?? 3} ans : la CNIL recommande de supprimer ou d'anonymiser leurs données.`}
      icon={<Eraser className="size-4" />}
      actions={
        canPurge && selected.length > 0 ? (
          <Button size="sm" variant="danger" icon={<Eraser className="size-3.5" />} onClick={() => setConfirming(true)}>
            Anonymiser ({selected.length})
          </Button>
        ) : undefined
      }
      bodyClassName="px-0 py-0 sm:px-0"
    >
      {isLoading ? (
        <div className="p-5">
          <Skeleton className="h-24 rounded-[14px]" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<UserRoundCheck className="size-6" />} title="Rien à purger" description={`Aucun prospect n'a dépassé la durée de conservation de ${data?.years ?? 3} ans. Votre base est à jour.`} className="py-10" />
      ) : (
        <DataTable columns={columns} rows={items} selectable={canPurge} selected={selected} onSelectedChange={setSelected} dense />
      )}
      <Dialog
        open={confirming}
        onOpenChange={(o) => {
          setConfirming(o);
          if (!o) setTyped("");
        }}
        size="sm"
        icon={<Eraser className="size-5" />}
        title={`Anonymiser ${selected.length} contact${selected.length > 1 ? "s" : ""} ?`}
        description="Noms, emails, téléphones, notes et messages sont remplacés définitivement. Cette action est irréversible ; les factures restent conservées (obligation légale de 10 ans)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={busy} disabled={typed.trim().toUpperCase() !== "ANONYMISER"} onClick={purge}>
              Anonymiser définitivement
            </Button>
          </>
        }
      >
        <Field label={<span>Tapez <b className="font-mono">ANONYMISER</b> pour confirmer</span>}>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ANONYMISER" className="font-mono" />
        </Field>
      </Dialog>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab                                                                        */
/* -------------------------------------------------------------------------- */

export default function RgpdTab() {
  const me = useAuth((s) => s.user);
  const isAdmin = can(me, "admin");
  const isManager = can(me, "manager");
  const form = useSectionForm("rgpd", { validate: validateRgpd });
  const { data: settings } = useSettings();
  const v = form.values;

  if (!form.ready)
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-[300px] rounded-[22px]" />
      </div>
    );

  const company = settings?.company;
  const controller = v.controller_name || company?.legal_name || company?.name || "l'entreprise";
  const contact = v.dpo_email || company?.email || "notre service client";
  const noticePreview = (v.form_notice || "").replace(/\{company\}/g, controller).replace(/\{contact\}/g, contact);

  return (
    <div className="space-y-5">
      <TabHeader
        title="Conformité RGPD"
        description="Responsabilités, durées de conservation, information des personnes, registre et traçabilité."
        badge={
          <Badge tone="green" dot>
            <ShieldCheck className="size-3" /> Journalisation active
          </Badge>
        }
      />
      {!form.canEdit && <ReadOnlyNotice />}

      <SettingsCard title="Responsable du traitement" description="Affiché dans les mentions d'information et sur vos pages publiques." icon={<ShieldCheck className="size-4" />}>
        <FormGrid>
          <TextField form={form} name="controller_name" label="Responsable du traitement" placeholder={company?.legal_name || company?.name || "Raison sociale"} hint="Par défaut : la raison sociale de l'entreprise." />
          <TextField form={form} name="privacy_url" label="Politique de confidentialité (URL)" placeholder="https://entreprise.fr/confidentialite" inputMode="url" />
          <TextField form={form} name="dpo_name" label="Délégué à la protection des données (DPO)" placeholder="Nom ou organisme" hint="Obligatoire uniquement dans certains cas (art. 37) ; sinon, un référent." />
          <TextField form={form} name="dpo_email" label="Contact pour l'exercice des droits" type="email" placeholder="dpo@entreprise.fr" />
        </FormGrid>
      </SettingsCard>

      <SettingsCard title="Durées de conservation" description="Au-delà, les données doivent être supprimées ou anonymisées." icon={<Clock className="size-4" />}>
        <div className="space-y-4">
          <FormGrid>
            <NumberField
              form={form}
              name="prospect_retention_years"
              label="Prospects (après le dernier contact)"
              suffix="ans"
              min={1}
              hint={v.prospect_retention_years > 3 ? <span className="text-amber-600 dark:text-amber-400">La CNIL recommande 3 ans maximum pour les prospects.</span> : "Recommandation CNIL : 3 ans à compter du dernier contact."}
            />
            <NumberField form={form} name="customer_retention_years" label="Clients (après la fin de la relation)" suffix="ans" min={1} hint="Hors pièces comptables, conservées 10 ans (art. L123-22 du Code de commerce)." />
          </FormGrid>
          <SwitchField form={form} name="auto_anonymize" label="Anonymisation automatique" description="Chaque jour, les prospects ayant dépassé la durée de conservation sont anonymisés sans intervention." />
          <SwitchField form={form} name="require_explicit_consent" label="Exiger un consentement explicite, y compris en B2B" description="Par défaut, la prospection B2B par email est permise sur la base de l'intérêt légitime (avec droit d'opposition). Activez pour n'écrire qu'aux contacts ayant consenti." />
        </div>
      </SettingsCard>

      <SettingsCard title="Mention d'information des formulaires" description="Texte affiché sous vos formulaires publics de collecte de leads (art. 13 du RGPD)." icon={<FileText className="size-4" />}>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextareaField form={form} name="form_notice" label="Texte" rows={6} hint={<span>Variables : <code className="text-[11.5px]">{"{company}"}</code> (responsable) et <code className="text-[11.5px]">{"{contact}"}</code> (contact RGPD).</span>} />
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Aperçu</div>
            <div className="glass-inset rounded-[16px] p-4 text-[12.5px] leading-relaxed text-fg-2">{noticePreview || <span className="text-fg-3">Aucune mention : ajoutez un texte d'information.</span>}</div>
          </div>
        </div>
      </SettingsCard>

      <RegisterCard form={form} />

      {isManager ? <PurgeCard canPurge={isAdmin} /> : null}

      {isAdmin ? (
        <SettingsCard title="Journal d'audit" description="Toutes les actions sensibles (connexions, créations, modifications, exports, anonymisations, actions de l'IA) sont tracées (art. 32 du RGPD)." icon={<History className="size-4" />}>
          <AuditLog />
        </SettingsCard>
      ) : (
        <Restricted title="Journal d'audit réservé aux administrateurs" description="Il retrace les connexions, modifications et exports réalisés dans Prisme." />
      )}

      <Callout tone="neutral" icon={<ShieldCheck className="size-4" />}>
        Droits des personnes : depuis chaque fiche contact, exportez ses données (accès et portabilité) ou anonymisez-la (effacement). Prisme vous aide à respecter vos obligations ; vous restez responsable de vos traitements.
      </Callout>

      <SaveBar forms={[form]} />
    </div>
  );
}

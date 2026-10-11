import { useQueryClient } from "@tanstack/react-query";
import { Bell, Briefcase, Check, Eye, ListChecks, PenLine, Send, Settings2, Share2, Inbox, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePublicBranding } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { Field, Input, Select, Switch, TagInput, Textarea } from "@/components/ui/fields";
import { Sheet, useConfirm } from "@/components/ui/overlay";
import { Segmented, Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { LIFECYCLE } from "@/lib/constants";
import { keys, toastError, useInvalidate, useItem } from "@/lib/hooks";
import { cleanFields, formNotice, publicFormUrl, safeRedirect, toDraftFields, type DraftField, type FormRecord } from "./form-utils";
import { FormFieldsEditor } from "./FormFieldsEditor";
import { FormPreview } from "./FormPreview";
import { FormShare, FormSubmissions, SLUG_RE } from "./FormShare";
import { Callout, SectionTitle } from "./ui";
import { useMarketingSettings } from "./useCampaignDraft";
import { can, useAuth } from "@/stores/auth";

type Tab = "fields" | "settings" | "share" | "responses";

interface FormDraft {
  name: string;
  slug: string;
  title: string;
  description: string;
  fields: DraftField[];
  submit_label: string;
  success_message: string;
  redirect_url: string;
  active: boolean;
  lifecycle: string;
  tags_to_add: string[];
  owner_id: number | null;
  create_deal: boolean;
  pipeline_id: number | null;
  stage_id: number | null;
  notify: boolean;
}

function toDraft(f: FormRecord): FormDraft {
  return {
    name: f.name,
    slug: f.slug,
    title: f.title ?? "",
    description: f.description ?? "",
    fields: toDraftFields(f.fields),
    submit_label: f.submit_label,
    success_message: f.success_message,
    redirect_url: f.redirect_url ?? "",
    active: f.active,
    lifecycle: f.lifecycle,
    tags_to_add: f.tags_to_add ?? [],
    owner_id: f.owner_id ?? null,
    create_deal: f.create_deal,
    pipeline_id: f.pipeline_id ?? null,
    stage_id: f.stage_id ?? null,
    notify: f.notify,
  };
}

const fingerprint = (d: FormDraft) => JSON.stringify({ ...d, fields: cleanFields(d.fields) });

function problems(d: FormDraft) {
  const out: string[] = [];
  if (!d.name.trim()) out.push("Donnez un nom au formulaire.");
  if (!SLUG_RE.test(d.slug)) out.push("L'adresse du formulaire est invalide.");
  if (!d.fields.some((f) => f.map_to === "email")) out.push("Ajoutez un champ enregistré dans « Email » : il est indispensable pour créer le contact.");
  if (d.fields.some((f) => !f.label.trim())) out.push("Chaque champ doit avoir un libellé.");
  if (d.fields.some((f) => f.type === "select" && !(f.options ?? []).some((o) => o.trim()))) out.push("Les listes déroulantes doivent proposer au moins une option.");
  if (d.redirect_url.trim() && !safeRedirect(d.redirect_url.trim())) out.push("L'URL de redirection doit commencer par https://.");
  return out;
}

/** Wide side panel: form editor on the left, live preview on the right. */
export function FormBuilderSheet({ formId, open, onOpenChange, initialTab = "fields" }: { formId: number | null; open: boolean; onOpenChange: (o: boolean) => void; initialTab?: Tab }) {
  const { data: form } = useItem<FormRecord>("forms", formId);
  const { data: settings } = useMarketingSettings();
  const { data: brand } = usePublicBranding();
  const writable = can(useAuth((s) => s.user), "member");
  const qc = useQueryClient();
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [initial, setInitial] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState<{ open: boolean; id?: number }>({ open: false });

  // Reset the draft whenever the sheet opens on a form (reset-on-prop-change pattern).
  if (open && form && (!loaded.open || loaded.id !== form.id)) {
    const d = toDraft(form);
    setLoaded({ open: true, id: form.id });
    setDraft(d);
    setInitial(fingerprint(d));
    setTab(initialTab);
    setPane("edit");
  } else if (!open && loaded.open) setLoaded({ open: false, id: loaded.id });

  const set = (p: Partial<FormDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const dirty = !!draft && fingerprint(draft) !== initial;
  const issues = draft ? problems(draft) : [];
  const notice = useMemo(() => formNotice(settings), [settings]);
  const previewForm = useMemo(() => (draft ? { title: draft.title || draft.name, description: draft.description, fields: cleanFields(draft.fields), submit_label: draft.submit_label, notice } : null), [draft, notice]);

  const close = async () => {
    if (dirty && !(await confirm({ title: "Quitter sans enregistrer ?", description: "Les modifications apportées au formulaire seront perdues.", confirmLabel: "Quitter", danger: true }))) return;
    onOpenChange(false);
  };

  const save = async () => {
    if (!draft || !form) return;
    if (issues.length) return toast.error("Le formulaire ne peut pas être enregistré", { description: issues.join("\n") });
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        slug: draft.slug,
        title: draft.title.trim() || null,
        description: draft.description.trim() || null,
        fields: cleanFields(draft.fields),
        submit_label: draft.submit_label.trim() || "Envoyer",
        success_message: draft.success_message.trim() || "Merci ! Nous revenons vers vous très vite.",
        redirect_url: draft.redirect_url.trim() || null,
        active: draft.active,
        lifecycle: draft.lifecycle,
        tags_to_add: draft.tags_to_add,
        owner_id: draft.owner_id,
        create_deal: draft.create_deal,
        pipeline_id: draft.create_deal ? draft.pipeline_id : null,
        stage_id: draft.create_deal ? draft.stage_id : null,
        notify: draft.notify,
      };
      if (payload.slug !== form.slug) {
        const taken = await api.get<{ total: number }>("/forms", { slug: payload.slug, limit: 1, expand: 0 });
        if (taken.total > 0) throw new Error("Cette adresse est déjà utilisée par un autre formulaire.");
      }
      const updated = await api.patch<FormRecord>(`/forms/${form.id}`, payload);
      qc.setQueryData(keys.item("forms", form.id), updated);
      invalidate("forms");
      const d = toDraft(updated);
      setDraft(d);
      setInitial(fingerprint(d));
      toast.success("Formulaire enregistré", { description: updated.active ? "Les modifications sont en ligne." : "Le formulaire est désactivé." });
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const editor = draft && form && (
    <div className="min-w-0">
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "fields", label: "Contenu", icon: <ListChecks className="size-3.5" /> },
          { value: "settings", label: "Après l'envoi", icon: <Settings2 className="size-3.5" /> },
          { value: "share", label: "Partage", icon: <Share2 className="size-3.5" /> },
          { value: "responses", label: "Réponses", icon: <Inbox className="size-3.5" />, count: form.submissions },
        ]}
      />

      {tab === "fields" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <Field label="Nom interne" required hint="Visible uniquement dans Prisme.">
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Titre affiché">
              <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={draft.name} />
            </Field>
            <Field label="Introduction">
              <Textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex. : Un expert vous rappelle sous 24 h." />
            </Field>
          </section>
          <section>
            <SectionTitle hint="Glissez-déposez pour réordonner. Chaque réponse est enregistrée dans la fiche du contact.">Champs</SectionTitle>
            <FormFieldsEditor fields={draft.fields} onChange={(fields) => set({ fields })} />
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Texte du bouton">
              <Input value={draft.submit_label} onChange={(e) => set({ submit_label: e.target.value })} placeholder="Envoyer" />
            </Field>
            <Field label="Message de confirmation">
              <Input value={draft.success_message} onChange={(e) => set({ success_message: e.target.value })} />
            </Field>
          </section>
          <Callout tone="privacy">La case de consentement marketing (non pré-cochée) et la mention d'information RGPD sont ajoutées automatiquement sous vos champs.</Callout>
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionTitle hint="Appliqué au contact créé ou mis à jour.">Dans le CRM</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Cycle de vie attribué">
                <Select options={LIFECYCLE.filter((l) => l.value !== "lost")} value={draft.lifecycle} onChange={(lifecycle) => set({ lifecycle })} />
              </Field>
              <Field label="Responsable">
                <EntitySelect resource="users" value={draft.owner_id} initialLabel={draft.owner_id === form.owner_id ? form.owner?.name : undefined} onChange={(owner_id) => set({ owner_id })} placeholder="Aucun" />
              </Field>
            </div>
            <Field label="Tags ajoutés" hint="Pratique pour créer un segment de ces contacts.">
              <TagInput value={draft.tags_to_add} onChange={(tags_to_add) => set({ tags_to_add })} placeholder="ex. webinar-novembre" />
            </Field>
          </section>
          <section className="space-y-3 rounded-[18px] bg-black/[0.025] p-4 dark:bg-white/[0.035]">
            <Switch checked={draft.create_deal} onChange={(create_deal) => set({ create_deal })} label={<span className="flex items-center gap-2"><Briefcase className="size-4 text-fg-3" />Créer une opportunité</span>} description="Une affaire est ouverte à chaque réponse, rattachée au contact." />
            {draft.create_deal && (
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <Field label="Pipeline">
                  <EntitySelect resource="pipelines" value={draft.pipeline_id} initialLabel={draft.pipeline_id === form.pipeline_id ? form.pipeline?.name : undefined} onChange={(pipeline_id) => set({ pipeline_id, stage_id: null })} placeholder="Pipeline par défaut" />
                </Field>
                <Field label="Étape" hint="Par défaut : la première étape.">
                  <EntitySelect resource="stages" params={draft.pipeline_id ? { pipeline_id: draft.pipeline_id, sort: "position" } : undefined} value={draft.stage_id} initialLabel={draft.stage_id === form.stage_id ? form.stage?.name : undefined} onChange={(stage_id) => set({ stage_id })} placeholder="Première étape" disabled={!draft.pipeline_id} />
                </Field>
              </div>
            )}
          </section>
          <section className="space-y-4">
            <Switch checked={draft.notify} onChange={(notify) => set({ notify })} label={<span className="flex items-center gap-2"><Bell className="size-4 text-fg-3" />Notifier l'équipe</span>} description="Le responsable (ou, à défaut, toute l'équipe) est prévenu à chaque nouvelle réponse." />
            <Switch checked={draft.active} onChange={(active) => set({ active })} label={<span className="flex items-center gap-2"><Send className="size-4 text-fg-3" />Formulaire actif</span>} description="Désactivé, le lien public n'accepte plus de réponses." />
          </section>
          <section>
            <Field label="Redirection après l'envoi" hint="Facultatif : sinon le message de confirmation s'affiche.">
              <Input type="url" value={draft.redirect_url} onChange={(e) => set({ redirect_url: e.target.value })} placeholder="https://www.votresite.fr/merci" />
            </Field>
          </section>
        </div>
      )}

      {tab === "share" && <FormShare form={form} slug={draft.slug} active={draft.active} onSlug={(slug) => set({ slug })} onActivate={() => set({ active: true })} />}
      {tab === "responses" && <FormSubmissions form={form} fields={form.fields} />}
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      width={1320}
      title={
        <span className="flex items-center gap-2.5">
          <PenLine className="size-4 text-accent" />
          {draft?.name || form?.name || "Formulaire"}
          {draft && !draft.active && <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-fg-3 dark:bg-white/10">Désactivé</span>}
        </span>
      }
      footer={
        <>
          {issues.length > 0 && dirty ? (
            <span className="mr-auto hidden min-w-0 items-center gap-1.5 truncate text-[12.5px] text-amber-600 sm:flex dark:text-amber-300">
              <TriangleAlert className="size-4 shrink-0" /> {issues[0]}
            </span>
          ) : (
            <span className="mr-auto hidden text-[12.5px] text-fg-3 sm:block">{dirty ? "Modifications non enregistrées" : "Tout est enregistré"}</span>
          )}
          <Button variant="ghost" onClick={close}>
            {dirty ? "Annuler" : "Fermer"}
          </Button>
          {writable && (
            <Button variant="primary" icon={<Check className="size-4" />} loading={saving} disabled={!dirty} onClick={save}>
              Enregistrer
            </Button>
          )}
        </>
      }
    >
      {!draft || !form || !previewForm ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[520px] rounded-[22px]" />
          <Skeleton className="h-[520px] rounded-[22px]" />
        </div>
      ) : (
        <>
          <div className="mb-4 lg:hidden">
            <Segmented
              value={pane}
              onChange={setPane}
              options={[
                { value: "edit", label: <span className="flex items-center gap-1.5"><PenLine className="size-3.5" />Éditer</span> },
                { value: "preview", label: <span className="flex items-center gap-1.5"><Eye className="size-3.5" />Aperçu</span> },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
            <div className={pane === "preview" ? "hidden lg:block" : undefined}>{editor}</div>
            <div className={pane === "edit" ? "hidden lg:block" : undefined}>
              <div className="lg:sticky lg:top-0">
                <FormPreview form={previewForm} privacy={{ privacyUrl: brand?.privacy_url, dpoEmail: brand?.dpo_email }} url={publicFormUrl(draft.slug)} company={brand?.company} successMessage={draft.success_message} />
              </div>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}

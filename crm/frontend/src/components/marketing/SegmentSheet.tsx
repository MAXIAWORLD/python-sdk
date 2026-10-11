import { Building2, Check, Megaphone, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Sheet, useConfirm } from "@/components/ui/overlay";
import { Segmented, Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toastError, useApi, useInvalidate } from "@/lib/hooks";
import type { Campaign, Paginated, Segment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";
import { fieldsFor, cleanRule, findField, isComplete, SEGMENT_COLORS, type SegmentEntity, type SegmentFieldsResponse } from "./segment-fields";
import { SegmentLivePreview, SegmentMembers } from "./SegmentPanels";
import { SegmentRuleBuilder, toDraftRules, type DraftRule, type Match } from "./SegmentRuleBuilder";
import { SectionTitle } from "./ui";

interface Draft {
  name: string;
  description: string;
  color: string;
  entity: SegmentEntity;
  match: Match;
  conditions: DraftRule[];
}

function toDraft(segment?: Segment | null): Draft {
  return {
    name: segment?.name ?? "",
    description: segment?.description ?? "",
    color: segment?.color ?? SEGMENT_COLORS[0],
    entity: (segment?.entity as SegmentEntity) ?? "contacts",
    match: segment?.rules?.match === "any" ? "any" : "all",
    conditions: toDraftRules(segment?.rules?.conditions),
  };
}

function fingerprint(d: Draft) {
  return JSON.stringify({ ...d, conditions: d.conditions.map(({ id: _id, ...c }) => c) });
}

export function useSegmentFields() {
  return useApi<SegmentFieldsResponse>(["segment-fields"], "/segments/fields", undefined, { staleTime: Infinity });
}

/** Moves conditions to the other entity (contact "company.x" ↔ company "x") when the target changes. */
function convertConditions(conditions: DraftRule[], to: SegmentEntity, api?: SegmentFieldsResponse | null) {
  const target = fieldsFor(to, api).map((f) => f.key);
  return conditions
    .map((c) => {
      const field = to === "companies" ? (c.field.startsWith("company.") ? c.field.slice(8) : null) : `company.${c.field}`;
      return field && target.includes(field) ? { ...c, field } : null;
    })
    .filter((c): c is DraftRule => c !== null);
}

/** Actions shared by the segment cards and the builder (delete with usage check, campaign, duplicate). */
export function useSegmentActions() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const invalidate = useInvalidate();

  const remove = async (segment: Segment) => {
    let usage = 0;
    try {
      usage = (await api.get<Paginated<Campaign>>("/campaigns", { segment_id: segment.id, status__in: "draft,scheduled,paused", limit: 1, expand: 0 })).total;
    } catch {
      usage = 0;
    }
    const plural = usage > 1;
    const ok = await confirm({
      title: `Supprimer « ${segment.name} » ?`,
      description: usage
        ? `Ce segment est l'audience de ${usage} campagne${plural ? "s" : ""} non envoyée${plural ? "s" : ""}, qui n'aur${plural ? "ont" : "a"} plus de destinataires. Les contacts eux-mêmes ne sont pas supprimés.`
        : "Les contacts et entreprises du segment ne sont pas supprimés : seule la règle de regroupement disparaît.",
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return false;
    try {
      await api.delete(`/segments/${segment.id}`);
      toast.success("Segment supprimé");
      invalidate("segments", "campaigns");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  const createCampaign = async (segment: Segment) => {
    try {
      const c = await api.post<Campaign>("/campaigns", { name: `Campagne — ${segment.name}`, channel: "email", segment_id: segment.id });
      invalidate("campaigns");
      navigate(`/campaigns/${c.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const duplicate = async (segment: Segment) => {
    try {
      const copy = await api.post<Segment>("/segments", { name: `${segment.name} (copie)`, description: segment.description, entity: segment.entity, color: segment.color, rules: segment.rules });
      toast.success("Segment dupliqué", { description: copy.name });
      invalidate("segments");
      return copy;
    } catch (e) {
      toastError(e);
      return null;
    }
  };

  return { remove, createCampaign, duplicate };
}

/** Large side panel to create or edit a segment, with live preview and the member list. */
export function SegmentSheet({ open, onOpenChange, segment, initialTab = "rules", onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; segment?: Segment | null; initialTab?: "rules" | "members"; onSaved?: (s: Segment) => void }) {
  const user = useAuth((s) => s.user);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const actions = useSegmentActions();
  const { data: fieldsApi } = useSegmentFields();
  const [draft, setDraft] = useState<Draft>(() => toDraft(segment));
  const [initial, setInitial] = useState(() => fingerprint(toDraft(segment)));
  const [tab, setTab] = useState<"rules" | "members">(initialTab);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<{ open: boolean; id?: number }>({ open: false });

  // Reset the draft each time the sheet opens on a (possibly different) segment.
  if (opened.open !== open || opened.id !== segment?.id) {
    setOpened({ open, id: segment?.id });
    if (open) {
      const d = toDraft(segment);
      setDraft(d);
      setInitial(fingerprint(d));
      setTab(initialTab);
    }
  }

  const fields = useMemo(() => fieldsFor(draft.entity, fieldsApi), [draft.entity, fieldsApi]);
  const complete = draft.conditions.filter(isComplete);
  const rules = useMemo(() => ({ match: draft.match, conditions: draft.conditions.filter(isComplete).map((c) => cleanRule(findField(fields, c.field), c)) }), [draft.match, draft.conditions, fields]);
  const dirty = fingerprint(draft) !== initial;
  const writable = can(user, "member");

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const close = async () => {
    if (dirty && !(await confirm({ title: "Abandonner les modifications ?", description: "Les changements apportés à ce segment ne seront pas enregistrés.", confirmLabel: "Abandonner", danger: true }))) return;
    onOpenChange(false);
  };

  const switchEntity = (entity: SegmentEntity) => {
    if (entity === draft.entity) return;
    const converted = convertConditions(draft.conditions, entity, fieldsApi);
    const dropped = draft.conditions.length - converted.length;
    if (dropped > 0) toast.info(`${dropped} condition${dropped > 1 ? "s" : ""} retirée${dropped > 1 ? "s" : ""} : champ indisponible pour les ${entity === "contacts" ? "contacts" : "entreprises"}.`);
    set({ entity, conditions: converted });
  };

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Donnez un nom au segment.");
    if (complete.length !== draft.conditions.length) return toast.error("Complétez ou retirez les conditions incomplètes avant d'enregistrer.");
    setSaving(true);
    try {
      const payload = { name: draft.name.trim(), description: draft.description.trim() || null, color: draft.color, entity: draft.entity, rules };
      const saved = segment ? await api.patch<Segment>(`/segments/${segment.id}`, payload) : await api.post<Segment>("/segments", payload);
      toast.success(segment ? "Segment mis à jour" : "Segment créé", { description: saved.name });
      invalidate("segments", "campaigns");
      setInitial(fingerprint(draft));
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (segment && (await actions.remove(segment))) onOpenChange(false);
  };

  const createCampaign = async () => {
    if (!segment) return;
    onOpenChange(false);
    await actions.createCampaign(segment);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      width={1120}
      title={
        <span className="flex items-center gap-2.5">
          <span className="size-3 rounded-full" style={{ background: draft.color, boxShadow: `0 0 12px ${draft.color}` }} />
          {segment ? draft.name || "Segment" : "Nouveau segment"}
        </span>
      }
      footer={
        <>
          {segment && writable && (
            <Button variant="ghost" className="mr-auto text-red-500" icon={<Trash2 className="size-4" />} onClick={remove}>
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          )}
          {segment && writable && draft.entity === "contacts" && !dirty && (
            <Button variant="glass" icon={<Megaphone className="size-4" />} onClick={createCampaign}>
              <span className="hidden sm:inline">Créer une campagne</span>
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            {dirty ? "Annuler" : "Fermer"}
          </Button>
          {writable && (
            <Button variant="primary" icon={<Check className="size-4" />} loading={saving} onClick={save} disabled={!dirty && !!segment}>
              Enregistrer
            </Button>
          )}
        </>
      }
    >
      {segment && (
        <Tabs
          className="mb-5"
          value={tab}
          onChange={setTab}
          items={[
            { value: "rules", label: "Règles" },
            { value: "members", label: "Membres" },
          ]}
        />
      )}
      {tab === "members" && segment ? (
        <SegmentMembers segmentId={segment.id} entity={segment.entity as SegmentEntity} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Field label="Nom du segment" required>
                <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. : Décideurs SaaS en Île-de-France" autoFocus={!segment} />
              </Field>
              <Field label="Cible">
                <Segmented
                  value={draft.entity}
                  onChange={switchEntity}
                  options={[
                    { value: "contacts", label: <span className="flex items-center gap-1.5"><Users className="size-3.5" />Contacts</span> },
                    { value: "companies", label: <span className="flex items-center gap-1.5"><Building2 className="size-3.5" />Entreprises</span> },
                  ]}
                />
              </Field>
            </div>
            <Field label="Description" hint="Visible par l'équipe : à quoi sert ce segment ?">
              <Input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex. : prospects chauds à relancer avant la fin du trimestre" />
            </Field>
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Couleur</div>
              <div className="flex flex-wrap items-center gap-2">
                {SEGMENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ color: c })}
                    aria-label={`Couleur ${c}`}
                    aria-pressed={draft.color === c}
                    className={cn("flex size-8 items-center justify-center rounded-full transition hover:scale-110", draft.color === c && "ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-[var(--bg-2)]")}
                    style={{ background: `linear-gradient(140deg, ${c}, color-mix(in oklab, ${c} 60%, #000))`, boxShadow: `0 6px 14px -6px ${c}` }}
                  >
                    {draft.color === c && <Check className="size-4 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-[var(--hairline)]" />
            <div>
              <SectionTitle hint="Les membres sont recalculés en temps réel : un contact entre ou sort du segment dès que ses données changent.">Conditions</SectionTitle>
              <SegmentRuleBuilder entity={draft.entity} match={draft.match} conditions={draft.conditions} fields={fields} api={fieldsApi} onMatchChange={(match) => set({ match })} onChange={(conditions) => set({ conditions })} />
            </div>
          </div>
          <div className="lg:sticky lg:top-0 lg:self-start">
            <SegmentLivePreview entity={draft.entity} rules={rules} ignored={draft.conditions.length - complete.length} color={draft.color} />
          </div>
        </div>
      )}
    </Sheet>
  );
}

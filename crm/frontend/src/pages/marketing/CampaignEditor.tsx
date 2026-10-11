import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BarChart3, Check, CircleAlert, Cloud, Copy, FlaskConical, Mail, Megaphone, MoreHorizontal, PenLine, Send, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { DetailHeader, NotFoundRecord } from "@/components/entity/EntityBlocks";
import { AudienceStep } from "@/components/marketing/campaign/AudienceStep";
import { ContentStep } from "@/components/marketing/campaign/ContentStep";
import { preflight, type StepKey } from "@/components/marketing/campaign/Preflight";
import { ResultsStep } from "@/components/marketing/campaign/ResultsStep";
import { SendStep } from "@/components/marketing/campaign/SendStep";
import { TestStep } from "@/components/marketing/campaign/TestStep";
import { FICTIVE_CONTACT, isSent, type Audience, type SampleContact } from "@/components/marketing/campaign-utils";
import { CampaignStepper, type StepDef } from "@/components/marketing/CampaignStepper";
import { SegmentSheet } from "@/components/marketing/SegmentSheet";
import { defaultSender, emailOrg, isEditable, smtpConfigured, useCampaignDraft, useMarketingSettings, type SaveState } from "@/components/marketing/useCampaignDraft";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton, Spinner, StatusBadge } from "@/components/ui/display";
import { Menu, useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { date, dateTime, number, relative } from "@/lib/format";
import { toastError, useInvalidate, useItem } from "@/lib/hooks";
import type { Campaign, Contact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can, useAuth } from "@/stores/auth";

const ORDER: StepKey[] = ["audience", "content", "test", "send", "results"];

function initialStep(c: Campaign): StepKey {
  if (isSent(c)) return "results";
  if (!c.segment_id) return "audience";
  if (!c.subject || !c.body) return "content";
  return "test";
}

function SaveIndicator({ state, savedAt, onSave }: { state: SaveState; savedAt: Date | null; onSave: () => void }) {
  const content = {
    idle: { icon: <Cloud className="size-3.5" />, text: "Enregistrement automatique", tone: "text-fg-3" },
    dirty: { icon: <span className="size-1.5 rounded-full bg-amber-500" />, text: "Modifications en attente…", tone: "text-fg-3" },
    saving: { icon: <Spinner className="size-3.5" />, text: "Enregistrement…", tone: "text-fg-2" },
    saved: { icon: <Check className="size-3.5 text-emerald-500" />, text: `Enregistré ${savedAt ? relative(savedAt) : ""}`, tone: "text-fg-2" },
    error: { icon: <CircleAlert className="size-3.5 text-red-500" />, text: "Échec de l'enregistrement", tone: "text-red-500" },
  }[state];
  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }} className={cn("hidden items-center gap-1.5 text-[12.5px] font-medium sm:inline-flex", content.tone)}>
          {content.icon}
          {content.text}
        </motion.span>
      </AnimatePresence>
      {(state === "dirty" || state === "error") && (
        <Button size="sm" variant="glass" onClick={onSave}>
          {state === "error" ? "Réessayer" : "Enregistrer"}
        </Button>
      )}
    </div>
  );
}

export default function CampaignEditor() {
  const { id } = useParams();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const [params, setParams] = useSearchParams();
  const { data: campaign, isLoading, error } = useItem<Campaign>("campaigns", campaignId);
  const { draft, patch, save, discard, state, savedAt } = useCampaignDraft(campaign);
  const { data: settings } = useMarketingSettings();
  const org = emailOrg(settings);
  const sender = defaultSender(settings);
  const smtp = smtpConfigured(settings);
  const canEdit = can(user, "member");
  const editable = isEditable(campaign) && canEdit;
  const sent = isSent(campaign);
  const [tested, setTested] = useState<string | null>(null);
  const [segmentSheet, setSegmentSheet] = useState(false);
  const [step, setStep] = useState<StepKey | null>(() => (ORDER.includes(params.get("step") as StepKey) ? (params.get("step") as StepKey) : null));
  const [sampleId, setSampleId] = useState<number | null>(null);

  if (campaign && step === null) setStep(initialStep(campaign));

  const audienceQ = useQuery({
    queryKey: ["campaigns", "audience", campaignId, campaign?.segment_id ?? null],
    queryFn: () => api.get<Audience>(`/campaigns/${campaignId}/audience`),
    enabled: !!campaign?.segment_id && !sent,
    retry: false,
  });
  const audience = audienceQ.data;
  const segmentPending = !!draft && draft.segment_id !== (campaign?.segment_id ?? null);

  // Preview personalised with a real recipient of the audience (falls back to a fictive contact).
  const previewId = sampleId ?? audience?.sample[0]?.id ?? null;
  const { data: previewContact } = useItem<Contact>("contacts", previewId);
  const sample: SampleContact = previewContact
    ? { id: previewContact.id, first_name: previewContact.first_name, last_name: previewContact.last_name, full_name: previewContact.full_name, email: previewContact.email ?? "", job_title: previewContact.job_title ?? "" }
    : FICTIVE_CONTACT;

  const checks = useMemo(() => (draft ? preflight({ draft, audience: segmentPending ? null : audience, tested, smtp }) : []), [draft, audience, segmentPending, tested, smtp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save().then((ok) => ok && toast.success("Campagne enregistrée"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const go = (s: StepKey) => {
    setStep(s);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("step", s);
        return next;
      },
      { replace: true },
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error) return <NotFoundRecord label="Campagne" back="/campaigns" />;

  const duplicate = async () => {
    if (!campaign || !draft) return;
    try {
      await save();
      const copy = await api.post<Campaign>("/campaigns", { name: `${draft.name} (copie)`, channel: campaign.channel, segment_id: draft.segment_id, subject: draft.subject, preheader: draft.preheader, body: draft.body, from_name: draft.from_name || null, from_email: draft.from_email || null, tags: campaign.tags });
      invalidate("campaigns");
      toast.success("Campagne dupliquée", { description: copy.name });
      navigate(`/campaigns/${copy.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async () => {
    if (!campaign) return;
    if (!(await confirm({ title: `Supprimer « ${campaign.name} » ?`, description: "Le brouillon et son contenu seront définitivement supprimés.", danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      discard();
      await api.delete(`/campaigns/${campaign.id}`);
      navigate("/campaigns");
      toast.success("Campagne supprimée");
      invalidate("campaigns");
    } catch (e) {
      toastError(e);
    }
  };

  const index = step ? ORDER.indexOf(step) : 0;
  const contentDone = !!draft && !!draft.subject.trim() && draft.body.trim().length >= 20;
  const steps: StepDef<StepKey>[] = [
    { key: "audience", label: "Audience", icon: Users, hint: segmentPending ? "Mise à jour…" : audience && !sent ? `${number(audience.count)} destinataire${audience.count > 1 ? "s" : ""}` : (campaign?.segment?.name ?? "À définir"), done: !!draft?.segment_id && (sent || (audience?.count ?? 0) > 0) },
    { key: "content", label: "Contenu", icon: PenLine, hint: contentDone ? "Objet et message prêts" : "À rédiger", done: contentDone },
    { key: "test", label: "Test", icon: FlaskConical, hint: tested ? "Test envoyé" : sent ? "Facultatif" : "Recommandé", done: !!tested },
    { key: "send", label: "Envoi", icon: Send, hint: sent ? `Le ${date(campaign?.sent_at, "d MMM")}` : campaign?.status === "scheduled" ? `Programmée ${date(campaign.scheduled_at, "d MMM HH:mm")}` : checks.some((c) => c.level === "error") ? "À compléter" : "Prête", done: sent || campaign?.status === "scheduled" },
    { key: "results", label: "Résultats", icon: BarChart3, hint: sent ? `${number(Number(campaign?.stats?.sent ?? 0))} envoyés` : "Après l'envoi", disabled: !sent },
  ];

  return (
    <div>
      <DetailHeader
        back="/campaigns"
        backLabel="Campagnes"
        loading={isLoading || !draft}
        visual={
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[18px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_14px_30px_-12px_rgba(91,108,255,.7)]" style={{ background: sent ? "linear-gradient(135deg,#1baf7a,#22d3ee)" : "linear-gradient(135deg,var(--accent),var(--accent-2))" }}>
            <Megaphone className="size-6" />
          </span>
        }
        title={
          draft && (
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              readOnly={!canEdit}
              aria-label="Nom de la campagne"
              className="-mx-1.5 w-full min-w-0 max-w-[720px] rounded-[10px] bg-transparent px-1.5 outline-none transition hover:bg-black/[0.035] focus:bg-[var(--field)] focus:ring-2 focus:ring-inset focus:ring-[color-mix(in_oklab,var(--accent)_55%,transparent)] dark:hover:bg-white/[0.05]"
            />
          )
        }
        subtitle={
          campaign && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" /> Email
              </span>
              {campaign.segment && <span>· {campaign.segment.name}</span>}
              {campaign.sent_at && <span>· envoyée le {dateTime(campaign.sent_at)}</span>}
              {campaign.status === "scheduled" && campaign.scheduled_at && <span>· programmée le {dateTime(campaign.scheduled_at)}</span>}
              {campaign.owner && <span className="text-fg-3">· {campaign.owner.name}</span>}
            </>
          )
        }
        badges={
          campaign && (
            <>
              <StatusBadge options={CAMPAIGN_STATUS} value={campaign.status} />
              {sent ? <Badge tone="gray">Lecture seule — contenu figé après l'envoi</Badge> : !canEdit && <Badge tone="gray">Lecture seule</Badge>}
            </>
          )
        }
        actions={
          campaign && (
            <>
              <SaveIndicator state={state} savedAt={savedAt} onSave={() => void save()} />
              <Menu
                trigger={
                  <Button variant="glass" aria-label="Plus d'actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
                items={[
                  { label: "Envoyer un test", icon: <FlaskConical className="size-4" />, onSelect: () => go("test") },
                  { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: duplicate, disabled: !canEdit },
                  ...(!sent ? [{ separator: true, label: "" }, { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: remove, disabled: !canEdit }] : []),
                ]}
              />
            </>
          )
        }
      />

      {!campaign || !draft || !step ? (
        <div className="space-y-4">
          <Skeleton className="h-[74px] rounded-[22px]" />
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-[420px] rounded-[22px]" />
            <Skeleton className="h-[420px] rounded-[22px]" />
          </div>
        </div>
      ) : (
        <>
          <CampaignStepper steps={steps} value={step} onChange={go} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="mt-4">
              {step === "audience" && (
                <AudienceStep
                  campaign={campaign}
                  segmentId={draft.segment_id}
                  editable={editable}
                  explicitConsent={settings?.rgpd?.require_explicit_consent}
                  audience={{ data: audience, isLoading: audienceQ.isLoading, error: audienceQ.error, pending: segmentPending }}
                  onSegment={(segment_id) => {
                    setSampleId(null);
                    patch({ segment_id });
                  }}
                  onNewSegment={() => setSegmentSheet(true)}
                />
              )}
              {step === "content" && (
                <ContentStep
                  draft={draft}
                  editable={editable}
                  patch={patch}
                  sample={sample}
                  org={org}
                  sender={sender}
                  audienceHint={campaign.segment?.name ?? ""}
                  samples={audience?.sample.slice(0, 12)}
                  onSampleChange={setSampleId}
                />
              )}
              {step === "test" && <TestStep campaignId={campaign.id} defaultTo={user?.email ?? ""} smtp={smtp} checks={checks} tested={tested} canTest={canEdit} flush={save} onTested={setTested} onGo={go} />}
              {step === "send" && <SendStep campaign={campaign} draft={draft} audience={segmentPending ? null : audience} checks={checks} canSend={can(user, "manager")} smtp={smtp} sender={sender} flush={save} onGo={go} />}
              {step === "results" && <ResultsStep campaign={campaign} />}
            </motion.div>
          </AnimatePresence>

          {step !== "results" && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={index === 0} onClick={() => go(ORDER[index - 1])}>
                Précédent
              </Button>
              {index < ORDER.length - 2 && (
                <Button variant="glass" iconRight={<ArrowRight className="size-4" />} onClick={() => go(ORDER[index + 1])}>
                  {ORDER[index + 1] === "content" ? "Rédiger le contenu" : ORDER[index + 1] === "test" ? "Tester" : "Passer à l'envoi"}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <SegmentSheet
        open={segmentSheet}
        onOpenChange={setSegmentSheet}
        onSaved={(s) => {
          if (s.entity !== "contacts") return toast.error("Une campagne email cible un segment de contacts.");
          setSampleId(null);
          patch({ segment_id: s.id });
        }}
      />
    </div>
  );
}

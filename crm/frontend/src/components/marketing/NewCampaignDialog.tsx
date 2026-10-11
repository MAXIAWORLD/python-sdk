import { CalendarHeart, FileText, Megaphone, Newspaper, RefreshCw, Rocket, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Field, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CAMPAIGN_PRESETS } from "./campaign-utils";

const ICONS: Record<string, LucideIcon> = { blank: FileText, newsletter: Newspaper, launch: Rocket, event: CalendarHeart, reactivation: RefreshCw };

/** « Nouvelle campagne » : name, optional starting template and audience, then opens the editor. */
export function NewCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("blank");
  const [segmentId, setSegmentId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setPreset("blank");
      setSegmentId(null);
    }
  }

  const pick = (key: string) => {
    const current = CAMPAIGN_PRESETS.find((p) => p.key === preset);
    const next = CAMPAIGN_PRESETS.find((p) => p.key === key);
    if (!name.trim() || name === current?.name) setName(next?.name ?? "");
    setPreset(key);
  };

  const create = async () => {
    if (!name.trim()) return;
    const p = CAMPAIGN_PRESETS.find((x) => x.key === preset);
    setBusy(true);
    try {
      const c = await api.post<Campaign>("/campaigns", { name: name.trim(), channel: "email", segment_id: segmentId, subject: p?.subject || null, preheader: p?.preheader || null, body: p?.body || null });
      invalidate("campaigns");
      onOpenChange(false);
      navigate(`/campaigns/${c.id}?step=${segmentId ? "content" : "audience"}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Nouvelle campagne"
      description="Donnez-lui un nom, choisissez un point de départ : vous affinerez l'audience et le contenu à l'étape suivante."
      icon={<Megaphone className="size-5" />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>
            Créer et continuer
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nom de la campagne" required hint="Usage interne : vos contacts ne le voient pas.">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Ex. : Newsletter de novembre" autoFocus />
        </Field>
        <div>
          <div className="mb-2 text-[12.5px] font-medium text-fg-2">Point de départ</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modèle">
            {CAMPAIGN_PRESETS.map((p) => {
              const Icon = ICONS[p.key] ?? FileText;
              const active = preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pick(p.key)}
                  className={cn("flex flex-col items-start gap-2 rounded-[16px] p-3 text-left ring-1 ring-inset transition", active ? "bg-accent-soft ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]" : "ring-[var(--hairline-strong)] hover:bg-black/[0.025] dark:hover:bg-white/[0.04]")}
                >
                  <span className={cn("flex size-8 items-center justify-center rounded-[10px]", active ? "btn-primary" : "bg-black/[0.05] text-fg-2 dark:bg-white/[0.07]")}>
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold">{p.label}</span>
                    <span className="block text-[11.5px] leading-snug text-fg-3">{p.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Audience (facultatif)" hint="Un segment de contacts : vous pourrez le changer ensuite.">
          <EntitySelect resource="segments" params={{ entity: "contacts" }} value={segmentId} onChange={(id) => setSegmentId(id)} placeholder="Choisir un segment…" />
        </Field>
      </div>
    </Dialog>
  );
}

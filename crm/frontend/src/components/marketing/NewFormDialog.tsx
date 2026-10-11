import { CalendarHeart, ClipboardList, MessageSquareText, Newspaper, Presentation, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { LeadForm } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FORM_TEMPLATES } from "./form-utils";

const ICONS: Record<string, LucideIcon> = { contact: MessageSquareText, demo: Presentation, newsletter: Newspaper, event: CalendarHeart };

/** « Nouveau formulaire » : name + template, then the builder opens on the created form. */
export function NewFormDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (f: LeadForm) => void }) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(FORM_TEMPLATES[0].key);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setTemplate(FORM_TEMPLATES[0].key);
    }
  }

  const create = async () => {
    const t = FORM_TEMPLATES.find((x) => x.key === template) ?? FORM_TEMPLATES[0];
    const finalName = name.trim() || t.label;
    setBusy(true);
    try {
      const form = await api.post<LeadForm>("/forms", { name: finalName, title: t.title, description: t.intro, fields: t.fields, submit_label: t.submit_label, success_message: t.success_message, lifecycle: t.lifecycle, tags_to_add: t.tags, active: true, notify: true });
      invalidate("forms");
      onOpenChange(false);
      onCreated(form);
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
      title="Nouveau formulaire"
      description="Choisissez un modèle : champs, textes et règles CRM sont préremplis, vous pourrez tout personnaliser."
      icon={<ClipboardList className="size-5" />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            Créer et personnaliser
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modèle">
          {FORM_TEMPLATES.map((t) => {
            const Icon = ICONS[t.key] ?? ClipboardList;
            const active = template === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTemplate(t.key)}
                className={cn("flex items-start gap-3 rounded-[16px] p-3.5 text-left ring-1 ring-inset transition", active ? "bg-accent-soft ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]" : "ring-[var(--hairline-strong)] hover:bg-black/[0.025] dark:hover:bg-white/[0.04]")}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[11px]", active ? "btn-primary" : "bg-black/[0.05] text-fg-2 dark:bg-white/[0.07]")}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{t.label}</span>
                  <span className="block text-[12px] leading-snug text-fg-3">{t.description}</span>
                  <span className="mt-1 block text-[11.5px] text-fg-3">{t.fields.length} champs</span>
                </span>
              </button>
            );
          })}
        </div>
        <Field label="Nom interne" hint="Laissez vide pour reprendre le nom du modèle. L'adresse publique est générée à partir de ce nom.">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={FORM_TEMPLATES.find((t) => t.key === template)?.label} autoFocus />
        </Field>
      </div>
    </Dialog>
  );
}

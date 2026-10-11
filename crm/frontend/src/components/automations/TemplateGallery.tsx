import { ArrowRight, LibraryBig } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { FilterChip } from "@/components/data/blocks";
import { TiltCard } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { actionVisual, conditionFields, conditionLabel, triggerVisual, type AutomationCatalog } from "./catalog";
import { IconTile, triggerConfigLabel } from "./parts";
import { TEMPLATE_CATEGORIES, TEMPLATES, type AutomationTemplate } from "./templates";

function TemplateCard({ template, catalog, canEdit, onUse, index }: { template: AutomationTemplate; catalog?: AutomationCatalog; canEdit: boolean; onUse: () => void; index: number }) {
  const t = triggerVisual(catalog, template.trigger.type);
  const groups = conditionFields(template.trigger.type, t.entity);
  const when = `${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}${triggerConfigLabel(template.trigger.type, template.trigger.config) ? ` ${triggerConfigLabel(template.trigger.type, template.trigger.config)}` : ""}`;
  const condition = template.conditions
    .map((c) => {
      const l = conditionLabel(groups, c);
      return `${l.field.toLowerCase()} ${l.op} ${l.value.toLowerCase()}`.trim();
    })
    .join(" et ");
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.3 }} className="h-full">
      <TiltCard className="flex h-full flex-col p-4" onClick={canEdit ? onUse : undefined} max={4}>
        <div className="flex items-center gap-1.5">
          <IconTile icon={t.icon} accent={t.accent} size={34} />
          <ArrowRight className="size-3.5 shrink-0 text-fg-3" />
          {template.actions.map((a, i) => {
            const v = actionVisual(catalog, a.type);
            return <IconTile key={i} icon={v.icon} accent={v.accent} size={28} />;
          })}
          <Badge tone={template.category === "IA" ? "violet" : "gray"} size="xs" className="ml-auto">
            {template.category}
          </Badge>
        </div>
        <h3 className="mt-3.5 text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">{template.name}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{template.description}</p>
        <p className="mt-3 rounded-[12px] bg-black/[0.03] px-2.5 py-2 text-[12px] leading-relaxed text-fg-2 dark:bg-white/[0.04]">
          <span className="font-semibold text-fg">Quand</span> {when}
          {condition && (
            <>
              {" "}
              <span className="text-fg-3">→</span> <span className="font-semibold text-fg">si</span> {condition}
            </>
          )}{" "}
          <span className="text-fg-3">→</span> <span className="font-semibold text-fg">alors</span> {template.actions.map((a) => actionVisual(catalog, a.type).label.toLowerCase()).join(", ")}
        </p>
        <div className="mt-auto pt-4">
          <Button
            size="sm"
            variant="subtle"
            className="w-full"
            iconRight={<ArrowRight className="size-3.5" />}
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
          >
            Utiliser ce modèle
          </Button>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export function TemplateGallery({ catalog, canEdit, onUse }: { catalog?: AutomationCatalog; canEdit: boolean; onUse: (t: AutomationTemplate) => void }) {
  const [category, setCategory] = useState("");
  const available = TEMPLATES.filter((t) => !catalog || catalog.triggers.some((x) => x.type === t.trigger.type));
  const list = available.filter((t) => !category || t.category === category);
  return (
    <section id="modeles" className="scroll-mt-24">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="glass hidden size-11 shrink-0 items-center justify-center rounded-[15px] text-accent sm:flex">
            <LibraryBig className="size-5" />
          </div>
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Modèles prêts à l'emploi</h2>
            <p className="text-[13.5px] text-fg-2">Des scénarios éprouvés, à personnaliser avant de les activer.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={!category} onClick={() => setCategory("")} count={available.length}>
            Tous
          </FilterChip>
          {TEMPLATE_CATEGORIES.filter((c) => available.some((t) => t.category === c)).map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(category === c ? "" : c)}>
              {c}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map((t, i) => (
          <TemplateCard key={t.id} template={t} catalog={catalog} canEdit={canEdit} onUse={() => onUse(t)} index={i} />
        ))}
      </div>
    </section>
  );
}

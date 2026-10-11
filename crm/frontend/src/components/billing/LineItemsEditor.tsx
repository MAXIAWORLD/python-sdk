import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Copy, GripVertical, Heading2, ListPlus, MoreHorizontal, Percent, Plus, Sparkles, Text, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EntitySelect } from "@/components/ui/entity-select";
import { Menu, type MenuItem } from "@/components/ui/overlay";
import { VAT_RATES } from "@/lib/constants";
import { money } from "@/lib/format";
import type { LineItem } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { AiLinesDialog } from "./AiLinesDialog";
import { AutoTextarea, CellSelect, ghostBase, NumField } from "./fields";
import { blankLine, formatDecimal, lineFromProduct, lineKind, normalizeLine, round2, sectionSubtotals, unitOptions, vatLabel, type LineKind, type ProductLike, type TotalsOptions } from "./lib";
import { ProductPicker } from "./ProductPicker";

/** Columns shared by the header and the rows; single-line layout once the editor is ≥ 42rem wide. */
const ROW_GRID = "grid grid-cols-[14px_minmax(0,1fr)_28px] items-start gap-x-1.5 gap-y-2 @2xl:grid-cols-[14px_minmax(0,1fr)_54px_82px_98px_66px_98px_26px]";

const restrictToVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const SR_INSTRUCTIONS = {
  draggable: "Pour déplacer une ligne : Espace ou Entrée pour la saisir, flèches haut et bas pour la déplacer, Espace ou Entrée pour la déposer, Échap pour annuler.",
};

function vatOptions(current?: number | null) {
  const rates = current !== null && current !== undefined && !VAT_RATES.includes(current) ? [...VAT_RATES, current] : VAT_RATES;
  return rates.map((r) => ({ value: String(r), label: vatLabel(r) }));
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

interface RowProps {
  line: LineItem;
  opts: TotalsOptions;
  currency: string;
  fresh: boolean;
  subtotal?: number;
  onPatch: (patch: Partial<LineItem>) => void;
  onInsert: (type: LineKind) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function RowMenu({ items, className }: { items: MenuItem[]; className?: string }) {
  return (
    <div className={className}>
      <Menu
        width={230}
        trigger={
          <button type="button" aria-label="Actions de la ligne" className="mt-1 flex size-7 items-center justify-center rounded-[9px] text-fg-3 transition hover:bg-black/[0.05] hover:text-fg data-[state=open]:bg-black/[0.05] dark:hover:bg-white/[0.08] dark:data-[state=open]:bg-white/[0.08]">
            <MoreHorizontal className="size-4" />
          </button>
        }
        items={items}
      />
    </div>
  );
}

function commonItems({ onDuplicate, onInsert, onRemove }: Pick<RowProps, "onDuplicate" | "onInsert" | "onRemove">): MenuItem[] {
  return [
    { label: "Dupliquer", icon: <Copy className="size-4" />, onSelect: onDuplicate },
    { label: "Insérer une ligne dessous", icon: <Plus className="size-4" />, onSelect: () => onInsert("item") },
    { label: "Insérer une section dessous", icon: <Heading2 className="size-4" />, onSelect: () => onInsert("section") },
    { separator: true, label: "" },
    { label: "Supprimer", icon: <Trash2 className="size-4" />, danger: true, onSelect: onRemove },
  ];
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("mb-1 block px-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-3 @2xl:hidden", className)}>{children}</span>;
}

function ItemRow({ line, opts, currency, fresh, onPatch, onInsert, onDuplicate, onRemove }: RowProps) {
  const normalized = normalizeLine(line, opts);
  const discount = line.discount ?? 0;
  const [discountOpen, setDiscountOpen] = useState(false);
  const showDiscount = discountOpen || discount !== 0;
  const showDetails = line.details !== null && line.details !== undefined;
  const gross = round2((normalized.quantity ?? 1) * (normalized.unit_price ?? 0));

  const items: MenuItem[] = [
    showDetails
      ? { label: "Retirer le détail", icon: <Text className="size-4" />, onSelect: () => onPatch({ details: null }) }
      : { label: "Ajouter un détail", icon: <Text className="size-4" />, onSelect: () => onPatch({ details: "" }) },
    showDiscount
      ? {
          label: "Retirer la remise",
          icon: <Percent className="size-4" />,
          onSelect: () => {
            setDiscountOpen(false);
            onPatch({ discount: 0 });
          },
        }
      : { label: "Appliquer une remise", icon: <Percent className="size-4" />, onSelect: () => setDiscountOpen(true) },
    { separator: true, label: "" },
    ...commonItems({ onDuplicate, onInsert, onRemove }),
  ];

  return (
    <>
      <div className="min-w-0">
        <div className="flex items-start gap-1">
          <ProductPicker productId={line.product_id} onPick={(p) => onPatch(lineFromProduct(p, opts.defaultVat))} onUnlink={() => onPatch({ product_id: null })} />
          <AutoTextarea
            autoFocus={fresh}
            value={line.description ?? ""}
            onChange={(v) => onPatch({ description: v.replace(/\n/g, " ") })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onInsert("item");
              }
            }}
            placeholder="Désignation"
            aria-label="Désignation"
            className="min-h-9 text-[14px] font-medium"
          />
        </div>
        {showDetails && (
          <AutoTextarea value={line.details ?? ""} onChange={(v) => onPatch({ details: v })} placeholder="Détail : périmètre, livrables, période…" aria-label="Détail de la ligne" className="ml-8 mt-0.5 w-[calc(100%-2rem)] text-[12.5px] text-fg-2" />
        )}
        {showDiscount && (
          <div className="ml-8 mt-1 flex items-center gap-2 text-[12px] text-fg-2">
            <Percent className="size-3.5 text-fg-3" />
            Remise sur la ligne
            <NumField value={discount} onChange={(v) => onPatch({ discount: Math.min(100, Math.max(0, v ?? 0)) })} suffix="%" decimals={2} aria-label="Remise de la ligne" className="w-[84px]" />
          </div>
        )}
      </div>

      <div className="col-span-2 col-start-2 grid grid-cols-2 gap-1.5 @md:grid-cols-4 @2xl:contents">
        <div>
          <Label>Qté</Label>
          <NumField value={line.quantity ?? null} onChange={(v) => onPatch({ quantity: v ?? undefined })} placeholder="1" decimals={3} aria-label="Quantité" />
        </div>
        <div>
          <Label>Unité</Label>
          <CellSelect label="Unité" value={line.unit || "unité"} onChange={(v) => onPatch({ unit: v })} options={unitOptions(line.unit).map((u) => ({ value: u, label: u }))} />
        </div>
        <div>
          <Label>Prix unit. HT</Label>
          <NumField value={line.unit_price ?? null} onChange={(v) => onPatch({ unit_price: v ?? 0 })} placeholder="0,00" suffix="€" money aria-label="Prix unitaire HT" />
        </div>
        <div>
          <Label>TVA</Label>
          {opts.franchise ? (
            <span className="flex h-9 items-center px-2.5 text-[13px] text-fg-3" title="TVA non applicable (franchise en base)">
              —
            </span>
          ) : (
            <CellSelect label="Taux de TVA" value={String(line.vat_rate ?? opts.defaultVat ?? 20)} onChange={(v) => onPatch({ vat_rate: Number(v) })} options={vatOptions(line.vat_rate)} />
          )}
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--hairline)] pt-1.5 @md:col-span-4 @2xl:col-span-1 @2xl:block @2xl:border-0 @2xl:pt-0">
          <Label className="mb-0">Total HT</Label>
          <div className="flex min-h-9 flex-col items-end justify-center pr-1 text-right">
            {discount !== 0 && <span className="text-[11px] text-fg-3 line-through tabular">{money(gross, currency)}</span>}
            <span className={cn("text-[13.5px] font-semibold tabular", (normalized.total ?? 0) < 0 && "text-orange-600 dark:text-orange-400")}>{money(normalized.total, currency)}</span>
          </div>
        </div>
      </div>

      <RowMenu items={items} className="col-start-3 row-start-1 @2xl:col-start-auto @2xl:row-start-auto" />
    </>
  );
}

function SectionRow({ line, currency, subtotal, fresh, onPatch, onInsert, onDuplicate, onRemove }: RowProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-3 @2xl:col-span-6">
        <input
          autoFocus={fresh}
          value={line.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="Titre de section (ex. Phase 1 — Conception)"
          aria-label="Titre de section"
          className={cn(ghostBase, "h-10 min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em]")}
        />
        <span className="shrink-0 pr-1 text-[12px] text-fg-3">
          Sous-total <b className="font-semibold text-fg-2 tabular">{money(subtotal ?? 0, currency)}</b>
        </span>
      </div>
      <RowMenu items={commonItems({ onDuplicate, onInsert, onRemove })} className="col-start-3 row-start-1 @2xl:col-start-auto @2xl:row-start-auto" />
    </>
  );
}

function TextRow({ line, fresh, onPatch, onInsert, onDuplicate, onRemove }: RowProps) {
  return (
    <>
      <div className="min-w-0 @2xl:col-span-6">
        <AutoTextarea autoFocus={fresh} value={line.description ?? ""} onChange={(v) => onPatch({ description: v })} placeholder="Texte libre : remarque, conditions particulières, planning…" aria-label="Texte libre" className="text-[13px] italic text-fg-2" />
      </div>
      <RowMenu items={commonItems({ onDuplicate, onInsert, onRemove })} className="col-start-3 row-start-1 @2xl:col-start-auto @2xl:row-start-auto" />
    </>
  );
}

function SortableLine(props: RowProps) {
  const { line, fresh } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: line.id ?? "" });
  const kind = lineKind(line);
  const Row = kind === "section" ? SectionRow : kind === "text" ? TextRow : ItemRow;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative", isDragging && "z-20")}>
      <motion.div
        initial={fresh ? { opacity: 0, y: -6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        className={cn(
          "group/row rounded-[16px] px-1.5 py-1.5 transition-[background-color,box-shadow]",
          ROW_GRID,
          kind === "section" ? "bg-accent-soft/70 mt-2" : "hover:bg-black/[0.02] dark:hover:bg-white/[0.025]",
          isDragging && "bg-[var(--glass-solid)] shadow-[var(--glass-shadow-lg)] ring-1 ring-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Réordonner la ligne"
          className={cn("mt-2 flex h-6 w-3.5 cursor-grab touch-none items-center justify-center rounded-[6px] text-fg-3 opacity-50 transition hover:bg-black/5 hover:opacity-100 active:cursor-grabbing group-hover/row:opacity-100 dark:hover:bg-white/10", kind === "section" && "mt-2.5")}
        >
          <GripVertical className="size-3.5" />
        </button>
        <Row {...props} />
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

export interface LineItemsEditorProps {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  franchise?: boolean;
  defaultVat: number;
  currency?: string;
  /** Enables « ✨ Proposer des lignes » with this default brief. */
  aiBrief?: string | null;
}

/** Editable, sortable lines of a quote or an invoice (items, sections, free text). */
export function LineItemsEditor({ lines, onChange, franchise = false, defaultVat, currency = "EUR", aiBrief }: LineItemsEditorProps) {
  const opts = useMemo<TotalsOptions>(() => ({ franchise, defaultVat }), [franchise, defaultVat]);
  const subtotals = useMemo(() => sectionSubtotals(lines, opts), [lines, opts]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = lines.map((l) => l.id ?? "");

  const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Ligne ${position(active.id)} saisie.`,
    onDragOver: ({ over }) => (over ? `Position ${position(over.id)}.` : "Hors de la liste."),
    onDragEnd: ({ over }) => (over ? `Ligne déposée en position ${position(over.id)}.` : "Ligne déposée."),
    onDragCancel: () => "Déplacement annulé.",
  };

  const patch = (id: string, p: Partial<LineItem>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const insert = (line: LineItem, afterId?: string) => {
    const next = [...lines];
    const index = afterId ? next.findIndex((l) => l.id === afterId) : -1;
    next.splice(index >= 0 ? index + 1 : next.length, 0, line);
    setFresh(line.id ?? null);
    onChange(next);
  };
  const add = (type: LineKind, afterId?: string) => insert(blankLine(type, defaultVat), afterId);
  const addProduct = (row: ProductLike) => insert({ ...blankLine("item", defaultVat), ...lineFromProduct(row, defaultVat) });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(lines, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <div className="@container">
      <div className={cn(ROW_GRID, "hidden px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3 @2xl:grid")}>
        <span />
        <span className="pl-10">Désignation</span>
        <span className="pr-2.5 text-right">Qté</span>
        <span className="pl-2.5">Unité</span>
        <span className="pr-2.5 text-right">P.U. HT</span>
        <span className="pl-2.5">TVA</span>
        <span className="pr-1 text-right">Total HT</span>
        <span />
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center rounded-[20px] border border-dashed border-[var(--hairline-strong)] px-6 py-10 text-center">
          <div className="glass mb-3 flex size-12 items-center justify-center rounded-[16px] text-accent">
            <ListPlus className="size-5" />
          </div>
          <p className="text-[14.5px] font-semibold">Aucune ligne pour l'instant</p>
          <p className="mt-1 max-w-sm text-[12.5px] text-fg-2">Ajoutez une prestation, choisissez un produit du catalogue{aiBrief !== undefined && aiBrief !== null ? " ou laissez Iris proposer des lignes à partir du besoin client" : ""}.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVertical]} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: SR_INSTRUCTIONS }}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {lines.map((line) => {
                const id = line.id ?? "";
                return (
                  <SortableLine
                    key={id}
                    line={line}
                    opts={opts}
                    currency={currency}
                    fresh={fresh === id}
                    subtotal={subtotals[id]}
                    onPatch={(p) => patch(id, p)}
                    onInsert={(type) => add(type, id)}
                    onDuplicate={() => insert({ ...line, id: uid() }, id)}
                    onRemove={() => onChange(lines.filter((l) => l.id !== id))}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-[var(--hairline-strong)] pt-3">
        <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => add("item")}>
          Ligne
        </Button>
        <Button size="sm" variant="ghost" icon={<Heading2 className="size-4" />} onClick={() => add("section")}>
          Section
        </Button>
        <Button size="sm" variant="ghost" icon={<AlignLeft className="size-4" />} onClick={() => add("text")}>
          Texte
        </Button>
        <div className="w-full sm:w-[220px]">
          <EntitySelect resource="products" value={null} params={{ active: true }} allowClear={false} placeholder="Ajouter depuis le catalogue…" onChange={(_, row) => row && addProduct(row)} className="h-8 text-[13px]" />
        </div>
        {aiBrief !== undefined && aiBrief !== null && (
          <Button size="sm" variant="ai" className="sm:ml-auto" icon={<Sparkles className="size-3.5" />} onClick={() => setAiOpen(true)}>
            Proposer des lignes
          </Button>
        )}
      </div>

      {aiBrief !== undefined && aiBrief !== null && (
        <AiLinesDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          defaultBrief={aiBrief}
          defaultVat={defaultVat}
          franchise={franchise}
          onAdd={(added) => {
            setFresh(added[0]?.id ?? null);
            onChange([...lines, ...added]);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Read-only                                                                  */
/* -------------------------------------------------------------------------- */

const RO_GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 @xl:grid-cols-[minmax(0,1fr)_92px_112px_64px_116px]";

/** Lines of an issued / signed document, laid out like the PDF. */
export function LinesReadOnly({ lines, currency = "EUR", franchise = false, defaultVat = 20 }: { lines: LineItem[]; currency?: string; franchise?: boolean; defaultVat?: number }) {
  const opts = { franchise, defaultVat };
  const normalized = lines.map((l) => normalizeLine(l, opts));
  const subtotals = sectionSubtotals(lines, opts);
  if (!lines.length) return <p className="rounded-[16px] border border-dashed border-[var(--hairline-strong)] px-4 py-6 text-center text-[13px] text-fg-3">Aucune ligne.</p>;
  return (
    <div className="@container">
      <div className={cn(RO_GRID, "hidden border-b border-[var(--hairline)] px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3 @xl:grid")}>
        <span>Désignation</span>
        <span className="text-right">Qté</span>
        <span className="text-right">P.U. HT</span>
        <span className="text-right">TVA</span>
        <span className="text-right">Total HT</span>
      </div>
      <div className="divide-y divide-[var(--hairline)]">
        {normalized.map((line) => {
          const kind = lineKind(line);
          if (kind === "section")
            return (
              <div key={line.id} className="flex items-baseline justify-between gap-3 bg-accent-soft/60 px-2 pb-2 pt-3">
                <span className="text-[14px] font-semibold">{line.description}</span>
                <span className="text-[12px] text-fg-3 tabular">{money(subtotals[line.id ?? ""] ?? 0, currency)}</span>
              </div>
            );
          if (kind === "text")
            return (
              <p key={line.id} className="whitespace-pre-line px-2 py-2.5 text-[13px] italic text-fg-2">
                {line.description}
              </p>
            );
          return (
            <div key={line.id} className={cn(RO_GRID, "px-2 py-2.5 text-[13.5px]")}>
              <div className="min-w-0">
                <div className="font-medium">{line.description}</div>
                {line.details && <div className="mt-0.5 whitespace-pre-line text-[12.5px] text-fg-2">{line.details}</div>}
                <div className="mt-0.5 text-[12px] text-fg-3 tabular @xl:hidden">
                  {formatDecimal(line.quantity ?? 1, 3)} {line.unit} × {money(line.unit_price, currency)}
                  {line.discount ? ` · remise ${formatDecimal(line.discount)} %` : ""}
                  {franchise ? "" : ` · TVA ${vatLabel(line.vat_rate ?? 0)}`}
                </div>
              </div>
              <span className="hidden text-right tabular text-fg-2 @xl:block">
                {formatDecimal(line.quantity ?? 1, 3)} <span className="text-[11.5px] text-fg-3">{line.unit}</span>
              </span>
              <span className="hidden text-right tabular text-fg-2 @xl:block">
                {money(line.unit_price, currency)}
                {line.discount ? <span className="block text-[11px] text-fg-3">− {formatDecimal(line.discount)} %</span> : null}
              </span>
              <span className="hidden text-right tabular text-fg-2 @xl:block">{franchise ? "—" : vatLabel(line.vat_rate ?? 0)}</span>
              <span className="text-right font-semibold tabular">{money(line.total, currency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

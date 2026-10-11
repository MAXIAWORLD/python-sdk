import { ChevronDown } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { fieldBase } from "@/components/ui/fields";
import { cn } from "@/lib/utils";
import { formatDecimal, parseDecimal } from "./lib";

/** Compact cell used inside the line editor: discreet at rest, a real field on hover/focus. */
export const cellBase =
  "h-9 w-full rounded-[10px] bg-black/[0.025] px-2.5 text-[13.5px] text-fg outline-none ring-1 ring-inset ring-[var(--hairline)] transition-[background-color,box-shadow] duration-150 placeholder:text-fg-3 hover:bg-[var(--field)] focus:bg-[var(--field-hover)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)] disabled:opacity-60 dark:bg-white/[0.035]";

/** Document-like text cell (no chrome until hovered). */
export const ghostBase =
  "w-full rounded-[10px] bg-transparent px-2.5 text-fg outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-150 placeholder:text-fg-3 hover:bg-[var(--field)] hover:ring-[var(--hairline)] focus:bg-[var(--field-hover)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_60%,transparent)]";

type NumFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  decimals?: number;
  /** Money: show cents ("1 150,50") as soon as the value is not a whole number. */
  money?: boolean;
  suffix?: ReactNode;
  size?: "cell" | "field";
};

/**
 * Decimal input that accepts French typing ("1 234,50") and shows a formatted
 * value at rest. Emits `null` when emptied.
 */
export const NumField = forwardRef<HTMLInputElement, NumFieldProps>(function NumField({ value, onChange, decimals = 2, money = false, suffix, size = "cell", className, onFocus, onBlur, ...rest }, ref) {
  const [text, setText] = useState<string | null>(null);
  const display = text ?? (value === null || value === undefined ? "" : formatDecimal(value, decimals, money && !Number.isInteger(value) ? 2 : 0));
  const input = (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onFocus={(e) => {
        setText(value === null || value === undefined ? "" : String(value).replace(".", ","));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
        onFocus?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseDecimal(e.target.value);
        if (parsed !== null || e.target.value.trim() === "") onChange(parsed);
      }}
      onBlur={(e) => {
        setText(null);
        onBlur?.(e);
      }}
      className={cn(size === "cell" ? cellBase : cn(fieldBase, "h-10"), "text-right tabular", suffix ? (size === "cell" ? "pr-6" : "pr-9") : null, !suffix && className)}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div className={cn("relative", className)}>
      {input}
      <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-3", size === "cell" ? "right-2 text-[12px]" : "right-3 text-[13px]")}>{suffix}</span>
    </div>
  );
});

/** Native select styled as a compact cell. */
export function CellSelect({ value, onChange, options, className, disabled, label }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; className?: string; disabled?: boolean; label: string }) {
  return (
    <div className={cn("relative", className)}>
      <select aria-label={label} title={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(cellBase, "appearance-none pr-6")}>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--glass-solid)] text-fg">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

/** Compact native date input (keeps the calendar icon readable in dark mode). */
export function DateField({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: string | null | undefined; onChange: (value: string | null) => void }) {
  return <input type="date" value={(value ?? "").slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} className={cn(cellBase, "tabular [color-scheme:light] dark:[color-scheme:dark]", className)} {...rest} />;
}

/** Auto-growing textarea (descriptions, details, notes). */
export function AutoTextarea({ value, onChange, placeholder, className, minRows = 1, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & { value: string; onChange: (value: string) => void; minRows?: number }) {
  return (
    <textarea
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(ghostBase, "block resize-none py-2 leading-relaxed [field-sizing:content]", className)}
      {...rest}
    />
  );
}

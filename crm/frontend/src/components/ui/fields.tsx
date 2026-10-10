import { Check, ChevronDown, Search, X } from "lucide-react";
import { Checkbox as RCheckbox, Switch as RSwitch } from "radix-ui";
import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { Option } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full rounded-[12px] bg-[var(--field)] px-3 text-[14px] text-fg placeholder:text-fg-3 outline-none ring-1 ring-inset ring-[var(--hairline-strong)] transition-[box-shadow,background-color] duration-150 hover:bg-[var(--field-hover)] focus:bg-[var(--field-hover)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_65%,transparent)] disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; suffix?: ReactNode }>(function Input({ className, icon, suffix, ...rest }, ref) {
  if (!icon && !suffix) return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...rest} />;
  return (
    <div className={cn("relative", className)}>
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3">{icon}</span>}
      <input ref={ref} className={cn(fieldBase, "h-10", icon && "pl-9", suffix && "pr-10")} {...rest} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-fg-3">{suffix}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(fieldBase, "resize-y py-2.5 leading-relaxed", className)} {...rest} />;
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  options: (Option | string)[];
  placeholder?: string;
  onChange?: (value: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, placeholder, className, value, onChange, ...rest }, ref) {
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(fieldBase, "h-10 appearance-none pr-9", !value && "text-fg-3")}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const o = typeof opt === "string" ? { value: opt, label: opt } : opt;
          return (
            <option key={o.value} value={o.value} className="bg-[var(--glass-solid)] text-fg">
              {o.label}
            </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  );
});

export function Field({ label, hint, error, children, className, required, action }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean; action?: ReactNode }) {
  return (
    <label className={cn("block", className)}>
      {(label || action) && (
        <span className="mb-1.5 flex items-center justify-between gap-2">
          {label && (
            <span className="text-[12.5px] font-medium text-fg-2">
              {label}
              {required && <span className="ml-0.5 text-[var(--accent)]">*</span>}
            </span>
          )}
          {action}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-[12px] text-red-500">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-fg-3">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled, size = "md" }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; size?: "sm" | "md" }) {
  const control = (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
        size === "sm" ? "h-[22px] w-[38px]" : "h-[28px] w-[48px]",
        checked ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] shadow-[0_4px_14px_-4px_var(--accent)]" : "bg-black/15 dark:bg-white/15",
      )}
    >
      <RSwitch.Thumb
        className={cn(
          "block rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.25),inset_0_-1px_0_rgba(0,0,0,.06)] transition-transform duration-200 will-change-transform",
          size === "sm" ? "size-[18px] translate-x-[2px] data-[state=checked]:translate-x-[18px]" : "size-[24px] translate-x-[2px] data-[state=checked]:translate-x-[22px]",
        )}
      />
    </RSwitch.Root>
  );
  if (!label) return control;
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] text-fg-2">{description}</span>}
      </span>
      {control}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-[13.5px]", className)}>
      <RCheckbox.Root
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[6px] ring-1 ring-inset transition-colors",
          checked ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] ring-transparent" : "bg-[var(--field)] ring-[var(--hairline-strong)]",
        )}
      >
        <RCheckbox.Indicator>
          <Check className="size-3.5 text-white" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = "Rechercher…", className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(fieldBase, "h-10 pl-9 pr-8")} />
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-fg-3 hover:text-fg" aria-label="Effacer">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function NumberInput({ value, onChange, suffix, step = "any", min, className, placeholder }: { value: number | string | null | undefined; onChange: (v: number | null) => void; suffix?: ReactNode; step?: string | number; min?: number; className?: string; placeholder?: string }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value === null || value === undefined ? "" : value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      suffix={suffix}
      className={cn("tabular", className)}
    />
  );
}

export function TagInput({ value, onChange, placeholder = "Ajouter un tag…", suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const tag = t.trim().replace(/^#/, "");
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  const remaining = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase())).slice(0, 6);
  return (
    <div>
      <div className={cn(fieldBase, "flex min-h-10 flex-wrap items-center gap-1.5 py-1.5")}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-[8px] bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Retirer ${t}`} className="opacity-70 hover:opacity-100">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)} placeholder={value.length ? "" : placeholder} className="min-w-[90px] flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3" />
      </div>
      {draft && remaining.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {remaining.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-[8px] bg-black/5 px-2 py-0.5 text-[12px] text-fg-2 hover:text-fg dark:bg-white/10">
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

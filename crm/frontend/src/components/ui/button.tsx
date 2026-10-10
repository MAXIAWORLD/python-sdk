import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./display";

type Variant = "primary" | "glass" | "ghost" | "subtle" | "danger" | "ai" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  asChild?: boolean;
}

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[-0.005em] transition-[transform,filter,background-color,box-shadow,opacity] duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "btn-primary",
  glass: "glass-flat text-fg hover:bg-white/60 dark:hover:bg-white/10",
  ghost: "text-fg-2 hover:text-fg hover:bg-black/[0.045] dark:hover:bg-white/[0.07]",
  subtle: "bg-accent-soft text-accent hover:bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]",
  danger: "bg-red-500/90 text-white shadow-[0_8px_20px_-8px_rgba(239,68,68,.7)] hover:bg-red-500",
  ai: "ai-gradient text-white shadow-[0_10px_28px_-10px_rgba(178,107,255,.85)] hover:brightness-110",
  outline: "text-fg ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[12px] rounded-[10px]",
  sm: "h-8 px-3 text-[13px] rounded-[11px]",
  md: "h-10 px-4 text-[14px] rounded-[13px]",
  lg: "h-12 px-6 text-[15px] rounded-[16px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "glass", size = "md", loading, icon, iconRight, className, children, asChild, disabled, ...rest },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp ref={ref} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner className="size-4" /> : icon}
          {children}
          {iconRight}
        </>
      )}
    </Comp>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "xs" | "sm" | "md" | "lg";
  label: string;
  active?: boolean;
}

const iconSizes = { xs: "size-7 rounded-[9px]", sm: "size-8 rounded-[10px]", md: "size-10 rounded-[13px]", lg: "size-12 rounded-[16px]" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ variant = "ghost", size = "md", label, active, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], "px-0", active && "bg-accent-soft text-accent", className)}
      {...rest}
    >
      {children}
    </button>
  );
});

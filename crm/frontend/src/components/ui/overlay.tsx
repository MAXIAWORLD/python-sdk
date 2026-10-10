import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as RDialog, DropdownMenu, Popover as RPopover, Tooltip as RTooltip } from "radix-ui";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
}) {
  const widths = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[1040px]" };
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[6px] dark:bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </RDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
              <RDialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 24, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.96, y: 12, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className={cn("glass glass-strong pointer-events-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] shadow-[var(--glass-shadow-lg)] sm:rounded-[28px]", widths[size])}
                >
                  {(title || description) && (
                    <div className="flex items-start gap-3 px-6 pb-2 pt-6">
                      {icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-accent-soft text-accent">{icon}</div>}
                      <div className="min-w-0 flex-1">
                        {title && <RDialog.Title className="text-[18px] font-semibold tracking-[-0.01em]">{title}</RDialog.Title>}
                        {description ? <RDialog.Description className="mt-1 text-[13.5px] text-fg-2">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{typeof title === "string" ? title : "Fenêtre"}</RDialog.Description>}
                      </div>
                      <RDialog.Close className="-mr-2 -mt-1 rounded-full p-2 text-fg-3 transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Fermer">
                        <X className="size-4" />
                      </RDialog.Close>
                    </div>
                  )}
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
                  {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--hairline)] px-6 py-4">{footer}</div>}
                </motion.div>
              </RDialog.Content>
            </div>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet (side panel)                                                         */
/* -------------------------------------------------------------------------- */

export function Sheet({ open, onOpenChange, title, children, width = 520, footer, side = "right" }: { open: boolean; onOpenChange: (o: boolean) => void; title?: ReactNode; children: ReactNode; width?: number; footer?: ReactNode; side?: "right" | "left" }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[3px] dark:bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount>
              <motion.div
                initial={{ x: side === "right" ? "105%" : "-105%" }}
                animate={{ x: 0 }}
                exit={{ x: side === "right" ? "105%" : "-105%" }}
                transition={{ type: "spring", stiffness: 340, damping: 36 }}
                style={{ width: `min(${width}px, calc(100vw - 16px))` }}
                className={cn("glass glass-strong fixed bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-[26px] shadow-[var(--glass-shadow-lg)]", side === "right" ? "right-2" : "left-2")}
              >
                <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
                  <RDialog.Title className="truncate text-[16px] font-semibold">{title}</RDialog.Title>
                  <RDialog.Description className="sr-only">Panneau latéral</RDialog.Description>
                  <RDialog.Close className="rounded-full p-2 text-fg-3 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="Fermer">
                    <X className="size-4" />
                  </RDialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
                {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] px-5 py-3.5">{footer}</div>}
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirm                                                                    */
/* -------------------------------------------------------------------------- */

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const confirm = useCallback((o: ConfirmOptions) => {
    setState(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (v: boolean) => {
    resolver.current(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onOpenChange={(o) => !o && close(false)}
        size="sm"
        title={state?.title}
        description={state?.description}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.cancelLabel ?? "Annuler"}
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Confirmer"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

/* -------------------------------------------------------------------------- */
/* Menus, popovers, tooltips                                                  */
/* -------------------------------------------------------------------------- */

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  shortcut?: string;
}

export function Menu({ trigger, items, align = "end", width = 220 }: { trigger: ReactNode; items: MenuItem[]; align?: "start" | "end" | "center"; width?: number }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={8} style={{ minWidth: width }} className="glass glass-strong z-[60] rounded-[16px] p-1.5 shadow-[var(--glass-shadow-lg)] data-[state=open]:animate-[fadeIn_.15s_ease-out]">
          {items.map((item, i) =>
            item.separator ? (
              <DropdownMenu.Separator key={i} className="my-1 h-px bg-[var(--hairline)]" />
            ) : (
              <DropdownMenu.Item
                key={i}
                disabled={item.disabled}
                onSelect={() => item.onSelect?.()}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] outline-none transition-colors data-[disabled]:opacity-40 data-[highlighted]:bg-black/[0.05] dark:data-[highlighted]:bg-white/[0.08]",
                  item.danger && "text-red-500",
                )}
              >
                {item.icon && <span className="flex size-4 items-center justify-center opacity-80">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <span className="text-[11px] text-fg-3">{item.shortcut}</span>}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Popover({ trigger, children, align = "end", width = 320, open, onOpenChange }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" | "center"; width?: number; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align={align} sideOffset={10} style={{ width }} className="glass glass-strong z-[60] rounded-[20px] p-0 shadow-[var(--glass-shadow-lg)] outline-none">
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={8} className="z-[70] max-w-[260px] rounded-[10px] bg-[#0b0e1a]/90 px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg backdrop-blur-md dark:bg-white/90 dark:text-black">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const TooltipProvider = RTooltip.Provider;

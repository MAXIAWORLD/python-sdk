import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { forwardRef, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";

type Variant = "default" | "strong" | "solid" | "flat" | "inset";

export interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  glow?: boolean;
  liquid?: boolean;
  radius?: "sm" | "md" | "lg" | "xl" | "full";
  children?: ReactNode;
}

const RADIUS = { sm: "rounded-[14px]", md: "rounded-[18px]", lg: "rounded-[22px]", xl: "rounded-[28px]", full: "rounded-full" };
const VARIANT: Record<Variant, string> = { default: "glass", strong: "glass glass-strong", solid: "glass glass-solid", flat: "glass-flat", inset: "glass-inset" };

/** The base Liquid Glass surface. */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass({ variant = "default", glow = false, liquid = false, radius = "lg", className, children, ...rest }, ref) {
  return (
    <div ref={ref} data-glow={glow ? "" : undefined} className={cn(VARIANT[variant], RADIUS[radius], liquid && "liquid", className)} {...rest}>
      {children}
    </div>
  );
});

/** Card that tilts in 3D toward the pointer, with a moving specular highlight. */
export function TiltCard({ children, className, max = 7, glow = true, variant = "default", radius = "lg", onClick }: { children: ReactNode; className?: string; max?: number; glow?: boolean; variant?: Variant; radius?: GlassProps["radius"]; onClick?: () => void }) {
  const effects = useUI((s) => s.effects);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 22, mass: 0.6 });
  const sry = useSpring(ry, { stiffness: 220, damping: 22, mass: 0.6 });
  const transform = useMotionTemplate`perspective(1100px) rotateX(${srx}deg) rotateY(${sry}deg)`;
  const enabled = effects === "max";

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ry.set(px * max * 2);
    rx.set(-py * max * 2);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      style={enabled ? { transform, transformStyle: "preserve-3d" } : undefined}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onClick={onClick}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      data-glow={glow ? "" : undefined}
      className={cn(VARIANT[variant], RADIUS[radius ?? "lg"], "will-change-transform", onClick && "cursor-pointer", className)}
    >
      {children}
    </motion.div>
  );
}

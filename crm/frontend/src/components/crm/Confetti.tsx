import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Particle {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  size: number;
  round: boolean;
}

const COLORS = ["#5b6cff", "#8b5cf6", "#22d3ee", "#f472b6", "#fbbf24", "#34d399"];

function makeBurst(id: number): Particle[] {
  return Array.from({ length: 38 }, (_, i) => ({
    id: `${id}-${i}`,
    x: (Math.random() - 0.5) * 900,
    y: -Math.random() * 520 - 140,
    r: Math.random() * 720 - 360,
    color: COLORS[i % COLORS.length],
    size: 6 + Math.random() * 8,
    round: Math.random() > 0.5,
  }));
}

/**
 * Light confetti burst for won deals. `fire()` launches it, `element` must be rendered once in the page.
 * Portaled to <body>: the page transition wrapper keeps a CSS filter, which would trap `position: fixed`.
 */
export function useConfetti() {
  const reduced = useReducedMotion();
  const [burst, setBurst] = useState<{ id: number; particles: Particle[] } | null>(null);

  const fire = useCallback(() => {
    if (reduced) return;
    const id = Date.now();
    setBurst({ id, particles: makeBurst(id) });
  }, [reduced]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 2600);
    return () => clearTimeout(t);
  }, [burst]);

  const element = createPortal(
    <AnimatePresence>
      {burst && (
        <div key={burst.id} className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center" aria-hidden>
          {burst.particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: [0, p.y, p.y + 700], opacity: [1, 1, 0], rotate: p.r }}
              transition={{ duration: 2.2, ease: [0.15, 0.7, 0.4, 1], times: [0, 0.45, 1] }}
              className="absolute bottom-10"
              style={{ width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? 999 : 2 }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );

  return { fire, element };
}

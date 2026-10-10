import { useEffect } from "react";

/** One global listener: glass surfaces marked `data-glow` get a pointer-following specular sheen. */
export function useGlobalGlow() {
  useEffect(() => {
    let frame = 0;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-glow]") as HTMLElement | null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (last && last !== target) last.classList.remove("glow-on");
        if (!target) {
          last = null;
          return;
        }
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        target.style.setProperty("--my", `${e.clientY - rect.top}px`);
        target.classList.add("glow-on");
        last = target;
      });
    };
    const onLeave = () => {
      last?.classList.remove("glow-on");
      last = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);
}

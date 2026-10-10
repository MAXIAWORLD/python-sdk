import { useEffect, useRef } from "react";
import { useUI } from "@/stores/ui";

/** Living background: drifting color fields that the glass refracts. */
export function Backdrop({ variant = "app" }: { variant?: "app" | "auth" | "public" }) {
  const ref = useRef<HTMLDivElement>(null);
  const effects = useUI((s) => s.effects);

  useEffect(() => {
    if (effects === "low") return;
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [effects]);

  const big = variant !== "app";
  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ ["--px" as string]: 0, ["--py" as string]: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 10% 0%, var(--bg-2) 0%, var(--bg) 55%)" }} />
      <div className="absolute inset-0" style={{ transform: "translate3d(calc(var(--px) * -18px), calc(var(--py) * -14px), 0)", transition: "transform 0.6s cubic-bezier(.2,.8,.2,1)" }}>
        <div className="blob" style={{ background: "var(--blob-1)", width: big ? "58vw" : "46vw", height: big ? "58vw" : "46vw", left: "-12vw", top: "-18vw", animation: "drift-1 26s ease-in-out infinite" }} />
        <div className="blob" style={{ background: "var(--blob-2)", width: "38vw", height: "38vw", right: "-8vw", top: "-6vw", animation: "drift-2 32s ease-in-out infinite" }} />
        <div className="blob" style={{ background: "var(--blob-3)", width: "42vw", height: "42vw", right: "8vw", bottom: "-22vw", animation: "drift-3 30s ease-in-out infinite" }} />
        <div className="blob" style={{ background: "var(--blob-4)", width: "30vw", height: "30vw", left: "22vw", bottom: "-12vw", animation: "drift-2 36s ease-in-out infinite reverse" }} />
        <div className="blob" style={{ background: "var(--blob-5)", width: "24vw", height: "24vw", left: "48vw", top: "18vh", opacity: "calc(var(--blob-opacity) * 0.7)", animation: "drift-1 40s ease-in-out infinite reverse" }} />
      </div>
      <div className="grid-lines absolute inset-0 opacity-60" />
      <div className="noise absolute inset-0" />
    </div>
  );
}

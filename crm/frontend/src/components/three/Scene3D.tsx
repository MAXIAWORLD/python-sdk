import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { IrisOrb } from "@/components/ai/ChatView";
import { useUI } from "@/stores/ui";

const GlassScene = lazy(() => import("./GlassScene"));

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** 3D liquid glass scene, with graceful fallbacks (low effects, no WebGL, reduced motion). */
export function Scene3D({ className }: { className?: string }) {
  const effects = useUI((s) => s.effects);
  const dark = useDark();
  const [ok] = useState(() => webglAvailable() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const fallback = (
    <div className={className}>
      <div className="flex h-full items-center justify-center">
        <IrisOrb size={140} />
      </div>
    </div>
  );
  if (effects === "low" || !ok) return fallback;
  return (
    <SceneBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlassScene dark={dark} className={className} />
      </Suspense>
    </SceneBoundary>
  );
}

import { useEffect, useState } from "react";

/**
 * Validated categorical palette (OKLab ΔE checks, light & dark surfaces):
 * slot order is fixed and must never be cycled.
 */
export const SERIES_LIGHT = ["#5b6cff", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const SERIES_DARK = ["#7181f7", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function useChartTheme() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return {
    dark,
    series: dark ? SERIES_DARK : SERIES_LIGHT,
    accent: dark ? "#7181f7" : "#5b6cff",
    muted: dark ? "rgba(243,245,255,0.28)" : "rgba(11,16,32,0.22)",
    grid: dark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.07)",
    axis: dark ? "rgba(243,245,255,0.5)" : "rgba(11,16,32,0.5)",
    surface: dark ? "#141629" : "#f3f4fa",
    cursor: dark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.14)",
  };
}

export const axisTick = { fontSize: 11, fontFamily: "Inter Variable, Inter, sans-serif" };

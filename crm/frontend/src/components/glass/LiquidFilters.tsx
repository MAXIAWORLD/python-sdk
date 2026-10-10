import { useEffect } from "react";

/**
 * SVG filters used by `.liquid` surfaces. Chromium applies SVG filters inside
 * `backdrop-filter`, which bends whatever sits behind the glass like a lens.
 * Other engines fall back to the regular frosted blur.
 */
export function LiquidFilters() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
    document.documentElement.classList.toggle("supports-liquid", chromium);
  }, []);

  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
      <defs>
        <filter id="liquid-refraction" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.016" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2.4" result="softNoise" />
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="46" xChannelSelector="R" yChannelSelector="G" result="bent" />
          <feColorMatrix in="bent" type="saturate" values="1.25" />
        </filter>
        <filter id="liquid-soft" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="1" seed="3" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="3" result="softNoise" />
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="22" xChannelSelector="R" yChannelSelector="B" />
        </filter>
      </defs>
    </svg>
  );
}

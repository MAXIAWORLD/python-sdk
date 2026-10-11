import { useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { cn } from "@/lib/utils";

interface Point {
  x: number;
  y: number;
  w: number;
  t: number;
}
type Stroke = Point[];

export interface SignaturePadHandle {
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
  /** Tight PNG (transparent background, dark ink) suitable for the PDF, or null when empty. */
  toDataURL: () => string | null;
}

const MIN_W = 1.1;
const MAX_W = 3.4;
const EXPORT_INK = "#0b1020";
const EXPORT_MAX_WIDTH = 1100;

const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Pen pressure when available, otherwise thinner strokes when the hand moves faster. */
function strokeWidth(prev: Point | undefined, x: number, y: number, t: number, pressure: number, pen: boolean) {
  if (pen && pressure > 0) return MIN_W + (MAX_W - MIN_W) * Math.min(1, pressure * 1.15);
  if (!prev) return (MIN_W + MAX_W) / 2;
  const velocity = Math.hypot(x - prev.x, y - prev.y) / Math.max(t - prev.t, 1);
  const target = Math.max(MIN_W, Math.min(MAX_W, MAX_W - velocity * 1.4));
  return prev.w * 0.6 + target * 0.4;
}

function dot(ctx: CanvasRenderingContext2D, p: Point) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, width: number) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** Quadratic segment between the midpoints of (a, b) and (b, c), controlled by b. */
function curve(ctx: CanvasRenderingContext2D, a: Point, b: Point, c: Point) {
  const m1 = mid(a, b);
  const m2 = mid(b, c);
  ctx.lineWidth = (a.w + 2 * b.w + c.w) / 4;
  ctx.beginPath();
  ctx.moveTo(m1.x, m1.y);
  ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.length === 1) return dot(ctx, s[0]);
  line(ctx, s[0], mid(s[0], s[1]), s[0].w);
  for (let i = 1; i < s.length - 1; i++) curve(ctx, s[i - 1], s[i], s[i + 1]);
  const n = s.length;
  line(ctx, mid(s[n - 2], s[n - 1]), s[n - 1], s[n - 1].w);
}

function prepare(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
}

/**
 * Hand-written signature pad: pointer events (mouse, touch, pen) with coalesced
 * samples, midpoint quadratic smoothing and pressure / velocity based width.
 */
export function SignaturePad({ ref, onChange, disabled, className, label = "Zone de signature" }: { ref?: Ref<SignaturePadHandle>; onChange?: (hasInk: boolean) => void; disabled?: boolean; className?: string; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const rect = useRef<DOMRect | null>(null);

  const context = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    prepare(ctx, getComputedStyle(canvas).color || EXPORT_INK);
    return ctx;
  }, []);

  /** Resize the backing store to the CSS size × devicePixelRatio and repaint every stroke. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const { width, height } = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = context();
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const s of strokes.current) drawStroke(ctx, s);
  }, [context]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    repaint();
    const resize = new ResizeObserver(() => repaint());
    resize.observe(canvas);
    // Ink follows the theme (light ink on dark glass); the export always uses dark ink.
    const theme = new MutationObserver(() => repaint());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, [repaint]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokes.current = [];
        repaint();
        onChange?.(false);
      },
      undo: () => {
        strokes.current = strokes.current.slice(0, -1);
        repaint();
        onChange?.(strokes.current.length > 0);
      },
      isEmpty: () => strokes.current.length === 0,
      toDataURL: () => {
        const points = strokes.current.flat();
        if (!points.length) return null;
        const pad = MAX_W + 10;
        const minX = Math.min(...points.map((p) => p.x)) - pad;
        const minY = Math.min(...points.map((p) => p.y)) - pad;
        const width = Math.max(...points.map((p) => p.x)) + pad - minX;
        const height = Math.max(...points.map((p) => p.y)) + pad - minY;
        const scale = Math.min(2.5, EXPORT_MAX_WIDTH / width);
        const out = document.createElement("canvas");
        out.width = Math.ceil(width * scale);
        out.height = Math.ceil(height * scale);
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        prepare(ctx, EXPORT_INK);
        ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
        for (const s of strokes.current) drawStroke(ctx, s);
        return out.toDataURL("image/png");
      },
    }),
    [repaint, onChange],
  );

  const sample = (ev: PointerEvent, r: DOMRect, prev?: Point): Point => {
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    return { x, y, t: ev.timeStamp, w: strokeWidth(prev, x, y, ev.timeStamp, ev.pressure, ev.pointerType === "pen") };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rect.current = e.currentTarget.getBoundingClientRect();
    const p = sample(e.nativeEvent, rect.current);
    current.current = [p];
    const ctx = context();
    if (ctx) dot(ctx, p);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    const r = rect.current;
    if (!stroke || !r) return;
    const ctx = context();
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const last = stroke[stroke.length - 1];
      const p = sample(ev, r, last);
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.75) continue;
      stroke.push(p);
      if (!ctx) continue;
      const n = stroke.length;
      if (n === 2) line(ctx, stroke[0], mid(stroke[0], stroke[1]), stroke[0].w);
      else curve(ctx, stroke[n - 3], stroke[n - 2], stroke[n - 1]);
    }
  };

  const finish = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    if (!stroke) return;
    current.current = null;
    rect.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const n = stroke.length;
    const ctx = context();
    if (ctx && n > 1) line(ctx, mid(stroke[n - 2], stroke[n - 1]), stroke[n - 1], stroke[n - 1].w);
    strokes.current = [...strokes.current, stroke];
    onChange?.(true);
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      className={cn("block h-full w-full touch-none select-none text-fg", disabled ? "cursor-not-allowed" : "cursor-crosshair", className)}
    />
  );
}

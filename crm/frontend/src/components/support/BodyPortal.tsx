import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render fixed-position UI (drop zone, floating bars) at the document root: the page transition
 * wrapper of the shell keeps a CSS `filter`, which would otherwise trap `position: fixed` children.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

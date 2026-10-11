import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { slugify } from "./kb";

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children);
      return "";
    })
    .join("");
}

/**
 * Markdown for long-form help articles: headings get stable anchors (table of contents),
 * internal links stay in the app, external links open in a new tab. Raw HTML is never rendered.
 */
export function ArticleMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-glass", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children: c }) => (
            <h2 id={slugify(textOf(c))} className="scroll-mt-28">
              {c}
            </h2>
          ),
          h3: ({ children: c }) => (
            <h3 id={slugify(textOf(c))} className="scroll-mt-28">
              {c}
            </h3>
          ),
          a: ({ href, children: c }) =>
            href && href.startsWith("/") ? (
              <Link to={href} className="font-medium">
                {c}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {c}
              </a>
            ),
          img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" className="my-2 rounded-[14px] shadow-[var(--glass-shadow)]" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

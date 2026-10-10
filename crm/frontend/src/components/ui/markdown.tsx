import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Markdown with internal CRM links (/contacts/12…) routed client-side. */
export function Markdown({ children, className, streaming }: { children: string; className?: string; streaming?: boolean }) {
  return (
    <div className={cn("prose-glass", streaming && "streaming-caret", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) =>
            href && href.startsWith("/") ? (
              <Link to={href} className="font-medium">
                {c}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {c}
              </a>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

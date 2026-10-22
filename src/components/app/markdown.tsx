import { ExternalLink, ImageOff } from "lucide-react";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
  type UrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollRegion } from "@/components/a11y/scroll-region";
import { VisuallyHidden } from "@/components/a11y/visually-hidden";
import { isAllowedImageSrc, isHttpUrl } from "@/lib/markdown/external-content";
import { cn } from "@/lib/utils";
import { HighlightedCode } from "./highlighted-code";

const NEW_TAB = " (opent in een nieuw tabblad)";

/**
 * react-markdown's default URL filter, with one narrow exception: base64
 * data: images (png/jpeg/gif/webp/svg) may stay in an <img src>, so images
 * pasted into a question still show without contacting anyone. Links and
 * every other attribute go through the default filter unchanged.
 */
const urlTransform: UrlTransform = (url, key, node) =>
  key === "src" && node.tagName === "img" && isAllowedImageSrc(url)
    ? url
    : defaultUrlTransform(url);

const components: Components = {
  h1: ({ node: _node, className, ...props }) => (
    <h2
      className={cn(
        "mt-6 mb-3 text-xl font-semibold tracking-tight first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h3
      className={cn(
        "mt-6 mb-2.5 text-lg font-semibold tracking-tight first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h4
      className={cn("mt-5 mb-2 text-base font-semibold first:mt-0", className)}
      {...props}
    />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h5
      className={cn("mt-4 mb-2 text-sm font-semibold first:mt-0", className)}
      {...props}
    />
  ),
  h5: ({ node: _node, className, ...props }) => (
    <h6
      className={cn("mt-4 mb-1.5 text-sm font-semibold first:mt-0", className)}
      {...props}
    />
  ),
  h6: ({ node: _node, className, ...props }) => (
    <h6
      className={cn(
        "mt-4 mb-1.5 text-sm font-medium text-muted-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ node: _node, className, ...props }) => (
    <p
      className={cn("my-3 leading-7 first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  a: ({ node: _node, className, href, children, ...props }) => {
    const external = isHttpUrl(href);
    return (
      <a
        href={href}
        className={cn(
          "font-medium text-primary underline decoration-primary/40 underline-offset-[3px] transition-colors hover:decoration-primary",
          className,
        )}
        {...(external
          ? {
              target: "_blank",
              rel: "noopener noreferrer",
              referrerPolicy: "no-referrer",
            }
          : {})}
        {...props}
      >
        {children}
        {external ? (
          <>
            <ExternalLink
              className="ml-0.5 inline size-[0.85em] -translate-y-px"
              aria-hidden="true"
            />
            <VisuallyHidden>{NEW_TAB}</VisuallyHidden>
          </>
        ) : null}
      </a>
    );
  },
  ul: ({ node: _node, className, ...props }) => (
    <ul
      className={cn(
        "my-3 ml-5 list-disc space-y-1.5 marker:text-primary/70 [&_ul]:my-1.5 [&.contains-task-list]:ml-0 [&.contains-task-list]:list-none",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol
      className={cn(
        "my-3 ml-5 list-decimal space-y-1.5 marker:font-medium marker:text-muted-foreground [&_ol]:my-1.5",
        className,
      )}
      {...props}
    />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li className={cn("pl-1 leading-7 [&>p]:my-1", className)} {...props} />
  ),
  input: ({ node: _node, className, ...props }) => (
    <input
      className={cn("mr-2 size-3.5 translate-y-0.5 accent-primary", className)}
      {...props}
      disabled
    />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn(
        "my-4 rounded-r-md border-l-[3px] border-primary/50 bg-primary/[0.04] py-2 pr-3 pl-4 text-muted-foreground [&>p]:my-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cn("my-6 border-border", className)} {...props} />
  ),
  img: ({ node: _node, className, alt, src }) => {
    const source = typeof src === "string" ? src : "";
    if (isAllowedImageSrc(source)) {
      return (
        // biome-ignore lint/performance/noImgElement: user-authored Markdown images have unknown sizes
        <img
          src={source}
          alt={alt ?? ""}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className={cn("my-4 max-w-full rounded-lg border", className)}
        />
      );
    }
    // Privacy: never let a student's browser fetch a third-party image just
    // by opening the page. Nothing is requested unless the link is clicked.
    const label = `Externe afbeelding (niet automatisch geladen)${alt ? `: ${alt}` : ""}`;
    const body = (
      <>
        <ImageOff className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </>
    );
    const chip =
      "inline-flex items-center gap-1.5 rounded-md border border-dashed bg-muted/50 px-2 py-1 text-sm text-muted-foreground";
    return isHttpUrl(source) ? (
      <a
        href={source}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className={cn(
          chip,
          "underline-offset-[3px] hover:text-foreground hover:underline",
        )}
      >
        {body}
        <VisuallyHidden>{NEW_TAB}</VisuallyHidden>
      </a>
    ) : (
      <span className={chip}>{body}</span>
    );
  },
  table: ({ node: _node, className, ...props }) => (
    <ScrollRegion label="Tabel" className="my-4 w-full rounded-lg border">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </ScrollRegion>
  ),
  thead: ({ node: _node, className, ...props }) => (
    <thead className={cn("bg-muted/60", className)} {...props} />
  ),
  tr: ({ node: _node, className, ...props }) => (
    <tr className={cn("border-b last:border-0", className)} {...props} />
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      className={cn(
        "px-3 py-2 text-left font-semibold whitespace-nowrap",
        className,
      )}
      {...props}
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn("px-3 py-2 align-top", className)} {...props} />
  ),
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
      const language =
        /language-([\w+#-]+)/.exec(child.props.className ?? "")?.[1] ?? null;
      const code = String(child.props.children ?? "");
      return (
        <HighlightedCode code={code} language={language} className="my-4" />
      );
    }
    return (
      <pre
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable code must be reachable by keyboard
        tabIndex={0}
        translate="no"
        className="my-4 overflow-x-auto rounded-lg border p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </pre>
    );
  },
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        "rounded-[0.3rem] border border-border/60 bg-muted/70 px-[0.35em] py-[0.1em] font-mono text-[0.86em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
};

export interface MarkdownProps {
  /** Markdown source (GFM: tables, task lists, strikethrough). Raw HTML is ignored. */
  children: string;
  className?: string;
}

/** Renders teacher-authored Markdown with Pensuma typography and highlighted code blocks. */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "markdown text-[0.95rem] leading-7 break-words text-foreground [&_strong]:font-semibold",
        className,
      )}
    >
      {/*
        Security: raw HTML is skipped (skipHtml) and urlTransform is the
        default filter (strips javascript:/data: links) plus data: images in
        <img src> only. Never add rehype-raw or a more permissive
        urlTransform: Markdown comes from teachers but is shown to every
        student.
      */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={urlTransform}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

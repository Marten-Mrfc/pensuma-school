import { cn } from "@/lib/utils";

/** Renders Dutch feedback text; `backtick` parts are shown as inline code. */
export function FeedbackText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(/(`[^`]*`)/g);
  return (
    <span className={cn("leading-relaxed", className)}>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? (
          <code
            // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
            key={i}
            className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-[0.85em] break-all whitespace-pre-wrap"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </span>
  );
}

"use client";

import { ScrollRegion } from "@/components/a11y/scroll-region";
import { cn } from "@/lib/utils";

/**
 * Line-numbered code with the matched lines marked. The mark is not colour
 * alone: a bar in the gutter and the screen-reader text "(komt overeen)".
 */
export function CodeWithMatches({
  code,
  matched,
  label,
}: {
  code: string;
  matched: readonly number[];
  label: string;
}) {
  const lines = code.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const set = new Set(matched);
  return (
    <ScrollRegion
      label={label}
      className="relative max-h-[60dvh] rounded-lg border bg-muted/30"
    >
      <pre
        translate="no"
        className="min-w-full py-2 font-mono text-[13px] leading-6"
      >
        <code>
          {lines.map((line, i) => {
            const n = i + 1;
            const hit = set.has(n);
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                key={i}
                className={cn(
                  "flex border-l-[3px] border-transparent pr-4",
                  hit && "border-warning bg-warning/15",
                )}
              >
                <span
                  className="w-10 shrink-0 pr-3 text-right text-muted-foreground select-none"
                  aria-hidden="true"
                >
                  {n}
                </span>
                <span className="whitespace-pre">
                  {line || " "}
                  {hit ? (
                    <span className="sr-only"> (komt overeen)</span>
                  ) : null}
                </span>
              </span>
            );
          })}
        </code>
      </pre>
    </ScrollRegion>
  );
}

/** Two code blocks next to each other (stacked on phones). */
export function SideBySideCode({
  left,
  right,
}: {
  left: {
    title: React.ReactNode;
    code: string;
    matched: number[];
    label: string;
  };
  right: {
    title: React.ReactNode;
    code: string;
    matched: number[];
    label: string;
  };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[left, right].map((side) => (
        <div key={side.label} className="flex min-w-0 flex-col gap-2">
          <div className="text-sm">{side.title}</div>
          <CodeWithMatches
            code={side.code}
            matched={side.matched}
            label={side.label}
          />
        </div>
      ))}
    </div>
  );
}

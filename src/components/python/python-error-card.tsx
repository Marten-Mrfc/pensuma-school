"use client";

import {
  ChevronRight,
  CircleAlert,
  Clock,
  CornerDownRight,
  Lightbulb,
  OctagonX,
  ServerCrash,
} from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { explainError } from "@/lib/python/explain";
import type { PythonError } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { FeedbackText } from "./feedback-text";

export type PythonErrorCardProps = {
  error: PythonError;
  /** Smaller variant (inside a test result). */
  compact?: boolean;
  className?: string;
  /**
   * Shows a "Ga naar regel {n}" button when the error has a line number.
   * Move the editor's cursor to that line and focus it.
   */
  onGoToLine?: (line: number) => void;
  /** Heading level of the card title. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /**
   * Announce the card as an alert when it appears. Default true; pass false
   * when the surrounding component already announces the outcome (a run
   * summary, a test result), so screen readers do not hear it twice.
   */
  announce?: boolean;
};

const TONE_STYLES = {
  error: {
    box: "border-destructive/30 bg-destructive/5",
    icon: "text-destructive-ink",
    Icon: CircleAlert,
  },
  timeout: {
    box: "border-warning/40 bg-warning/5",
    icon: "text-warning-ink",
    Icon: Clock,
  },
  stopped: {
    box: "border-border bg-muted/40",
    icon: "text-muted-foreground",
    Icon: OctagonX,
  },
  internal: {
    box: "border-border bg-muted/40",
    icon: "text-muted-foreground",
    Icon: ServerCrash,
  },
} as const;

/** Friendly Dutch explanation of a Python error, with a collapsible traceback. */
export function PythonErrorCard({
  error,
  compact = false,
  className,
  onGoToLine,
  headingLevel = 3,
  announce = true,
}: PythonErrorCardProps) {
  const info = explainError(error);
  const tone = TONE_STYLES[info.tone];
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const showRaw = !info.messageIsDutch && (error.message || error.type);
  const hasTraceback = error.traceback.trim().length > 0;
  const Heading = `h${headingLevel}` as const;
  // A real Python exception gets its type name ("Foutmelding: NameError"),
  // with the Dutch title below it; timeouts, stops and internal problems
  // only have the Dutch title.
  const isException = info.tone === "error";
  const headingText = isException
    ? `Foutmelding: ${error.type || info.title}`
    : info.title;

  return (
    // A named group, not a <section>: a labelled section is a landmark, and a
    // results list with several failing tests would flood the landmark menu.
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is "alert" or "group"; both support aria-labelledby
    <div
      aria-labelledby={headingId}
      role={announce ? "alert" : "group"}
      className={cn(
        "rounded-lg border",
        tone.box,
        compact ? "p-3 text-sm" : "p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <tone.Icon
          className={cn("mt-0.5 size-5 shrink-0", tone.icon)}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Heading
              id={headingId}
              className={cn("font-semibold", compact ? "text-sm" : "text-base")}
            >
              {headingText}
            </Heading>
            {error.line ? (
              <Badge variant="outline" className="font-mono">
                Regel {error.line}
              </Badge>
            ) : null}
          </div>
          {isException && error.type && info.title !== error.type ? (
            <p className="font-medium">{info.title}</p>
          ) : null}
          <p className="text-foreground/90">
            <FeedbackText text={info.explanation} />
          </p>
          {showRaw ? (
            <p
              lang="en"
              translate="no"
              className="bg-background/60 text-foreground rounded-md border px-2 py-1 font-mono text-xs break-words whitespace-pre-wrap"
            >
              {error.type}
              {error.message ? `: ${error.message}` : ""}
            </p>
          ) : null}
          {info.tip ? (
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <Lightbulb
                className="text-warning-ink mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                <span className="sr-only">Tip: </span>
                <FeedbackText text={info.tip} />
              </span>
            </p>
          ) : null}
          {onGoToLine && error.line ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onGoToLine(error.line as number)}
            >
              <CornerDownRight aria-hidden="true" />
              Ga naar regel {error.line}
            </Button>
          ) : null}
          {hasTraceback ? (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-6 items-center gap-1 rounded text-xs font-medium outline-none focus-visible:ring-2">
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform motion-reduce:transition-none",
                    open && "rotate-90",
                  )}
                  aria-hidden="true"
                />
                Technische details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre
                  lang="en"
                  translate="no"
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (WCAG 2.1.1)
                  tabIndex={0}
                  className="bg-background/80 text-foreground focus-visible:ring-ring mt-2 max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre outline-none focus-visible:ring-2"
                >
                  {error.traceback}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </div>
    </div>
  );
}

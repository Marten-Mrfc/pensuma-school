"use client";

import {
  ChevronRight,
  CircleAlert,
  Clock,
  Lightbulb,
  OctagonX,
  ServerCrash,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
};

const TONE_STYLES = {
  error: {
    box: "border-destructive/30 bg-destructive/5",
    icon: "text-destructive",
    Icon: CircleAlert,
  },
  timeout: {
    box: "border-warning/40 bg-warning/5",
    icon: "text-warning",
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
}: PythonErrorCardProps) {
  const info = explainError(error);
  const tone = TONE_STYLES[info.tone];
  const [open, setOpen] = useState(false);
  const showRaw = !info.messageIsDutch && (error.message || error.type);
  const hasTraceback = error.traceback.trim().length > 0;

  return (
    <div
      role="alert"
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
            <p className="font-semibold">{info.title}</p>
            {error.line ? (
              <Badge variant="outline" className="font-mono">
                Regel {error.line}
              </Badge>
            ) : null}
          </div>
          <p className="text-foreground/90">
            <FeedbackText text={info.explanation} />
          </p>
          {showRaw ? (
            <p className="bg-background/60 text-foreground rounded-md border px-2 py-1 font-mono text-xs break-words whitespace-pre-wrap">
              {error.type}
              {error.message ? `: ${error.message}` : ""}
            </p>
          ) : null}
          {info.tip ? (
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <Lightbulb
                className="text-warning mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <FeedbackText text={info.tip} />
            </p>
          ) : null}
          {hasTraceback ? (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded text-xs font-medium outline-none focus-visible:ring-2">
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    open && "rotate-90",
                  )}
                  aria-hidden="true"
                />
                Technische details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="bg-background/80 text-foreground mt-2 max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre">
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

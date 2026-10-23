"use client";

import { Check, CircleAlert, CloudOff, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AutosaveState } from "./use-autosave";

/** "Opgeslagen ✓ / Opslaan… / Fout" status for the builder. */
export function SaveIndicator({
  state,
  onRetry,
  className,
}: {
  state: AutosaveState;
  onRetry?: () => void;
  className?: string;
}) {
  const base =
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap";

  let content: React.ReactNode;
  switch (state.status) {
    case "pending":
    case "saving":
      content = (
        <span className={cn(base, "text-muted-foreground")}>
          <Loader2
            className="size-3.5 motion-safe:animate-spin"
            aria-hidden="true"
          />
          Opslaan…
        </span>
      );
      break;
    case "error":
      content = (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                base,
                "bg-destructive/10 text-destructive-ink outline-none hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <CloudOff className="size-3.5" aria-hidden="true" />
              Fout bij opslaan
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {state.message ?? "Opslaan lukte niet."} Klik om het opnieuw te
            proberen.
          </TooltipContent>
        </Tooltip>
      );
      break;
    case "invalid":
      content = (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                base,
                "bg-warning/15 text-warning-ink outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Niet opgeslagen</span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{state.message}</TooltipContent>
        </Tooltip>
      );
      break;
    case "saved":
      content = (
        <span className={cn(base, "text-success-ink")}>
          <Check className="size-3.5" aria-hidden="true" />
          Opgeslagen
        </span>
      );
      break;
    default:
      content = (
        <span className={cn(base, "text-muted-foreground")}>
          <Check className="size-3.5" aria-hidden="true" />
          Alles opgeslagen
        </span>
      );
  }

  return (
    <output
      aria-live="polite"
      className={cn("flex min-w-0 items-center", className)}
    >
      {content}
    </output>
  );
}

"use client";

import { Check, CircleAlert, CloudOff, Loader2, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

  let content: React.ReactNode;
  switch (state.status) {
    case "pending":
    case "saving":
      content = (
        <span className={cn(base, "text-muted-foreground")}>
          <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
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
                "bg-destructive/10 text-destructive-ink ring-1 ring-destructive/25 ring-inset outline-none hover:bg-destructive/15 focus-visible:ring-2",
              )}
            >
              <CloudOff className="size-3.5" aria-hidden="true" />
              Fout bij opslaan
              <RotateCcw className="size-3" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {state.message ?? "Opslaan lukte niet."} Klik om het opnieuw te proberen.
          </TooltipContent>
        </Tooltip>
      );
      break;
    case "invalid":
      content = (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={cn(base, "bg-warning/12 text-warning-ink ring-1 ring-warning/30 ring-inset")}
            >
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Niet opgeslagen</span>
            </span>
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
    <div role="status" aria-live="polite" className={cn("flex min-w-0 items-center", className)}>
      {content}
    </div>
  );
}

"use client";

import { CheckCircle2, CloudOff, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaverSnapshot } from "./answer-saver";

/** "Alles opgeslagen ✓" / "Opslaan…" / "Offline: we proberen het opnieuw". */
export function SaveIndicator({ snapshot, className }: { snapshot: SaverSnapshot; className?: string }) {
  const { state } = snapshot;
  let icon = <CheckCircle2 className="size-4" aria-hidden="true" />;
  let label = "Alles opgeslagen";
  let short = "Opgeslagen";
  let tone = "text-success-ink";
  if (state === "dirty" || state === "saving") {
    icon = <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
    label = "Opslaan…";
    short = "Opslaan…";
    tone = "text-muted-foreground";
  } else if (state === "offline") {
    icon = <CloudOff className="size-4" aria-hidden="true" />;
    label = "Offline: we proberen het opnieuw";
    short = "Offline";
    tone = "text-warning-ink";
  } else if (state === "locked") {
    icon = <Lock className="size-4" aria-hidden="true" />;
    label = "Ingeleverd";
    short = "Ingeleverd";
    tone = "text-muted-foreground";
  }
  return (
    <span
      role="status"
      aria-live="polite"
      title={label}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-medium whitespace-nowrap",
        state === "offline" && "bg-warning/12 px-3",
        tone,
        className,
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      <span className="sr-only lg:hidden">{label}</span>
      <span aria-hidden="true" className="hidden sm:inline lg:hidden">
        {short}
      </span>
    </span>
  );
}

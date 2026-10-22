import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown above the event log: a focus loss is not proof of cheating. */
export function FocusLossCaveat({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <Info
        className="mt-0.5 size-3.5 shrink-0 text-foreground/70"
        aria-hidden="true"
      />
      <span>
        Een focusverlies kan ook ontstaan door een melding, een pop-up of een
        trage computer.
      </span>
    </p>
  );
}

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown with an exam score that is not final yet. */
export function ProvisionalScoreNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm leading-6 text-info-ink",
        className,
      )}
    >
      <Info className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <span>
        Deze score is automatisch berekend en kan nog veranderen als je docent
        je werk nakijkt.
      </span>
    </p>
  );
}

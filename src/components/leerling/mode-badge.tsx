import { Dumbbell, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Toets" (exam) or "Oefenen" (practice) pill. */
export function ModeBadge({
  mode,
  className,
}: {
  mode: "exam" | "practice";
  className?: string;
}) {
  const exam = mode === "exam";
  const Icon = exam ? GraduationCap : Dumbbell;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        exam
          ? "bg-primary/10 text-primary ring-primary/20"
          : "bg-info/10 text-info-ink ring-info/25",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {exam ? "Toets" : "Oefenen"}
    </span>
  );
}

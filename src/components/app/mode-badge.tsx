import { cn } from "@/lib/utils";

/** "Toets" (exam) or "Oefenen" (practice) tag. */
export function ModeBadge({
  mode,
  className,
}: {
  mode: "exam" | "practice";
  className?: string;
}) {
  const exam = mode === "exam";
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center rounded-sm px-2 text-xs font-medium whitespace-nowrap",
        exam
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {exam ? "Toets" : "Oefenen"}
    </span>
  );
}

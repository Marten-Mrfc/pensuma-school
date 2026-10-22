import { cn } from "@/lib/utils";

/** Pill: Actief / Gedeactiveerd. */
export function StudentStatus({ banned, className }: { banned: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        banned
          ? "bg-destructive/10 text-destructive-ink ring-destructive/25"
          : "bg-success/10 text-success-ink ring-success/25",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", banned ? "bg-destructive" : "bg-success")} />
      {banned ? "Gedeactiveerd" : "Actief"}
    </span>
  );
}

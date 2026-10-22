"use client";

import { Dumbbell, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssignmentMode } from "./defaults";

/** "Toets" / "Oefenen" pill. */
export function ModeBadge({ mode, className }: { mode: AssignmentMode; className?: string }) {
  const exam = mode === "exam";
  const Icon = exam ? FileCheck2 : Dumbbell;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        exam ? "bg-primary/10 text-primary ring-primary/20" : "bg-info/10 text-info-ink ring-info/25",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {exam ? "Toets" : "Oefenen"}
    </span>
  );
}

export type ProgressCounts = {
  students: number;
  started: number;
  inProgress: number;
  submitted: number;
};

/**
 * Stacked progress bar: submitted (green) + busy (amber) out of all students,
 * with a short legend underneath.
 */
export function AssignmentProgress({
  counts,
  showLegend = true,
  size = "md",
  className,
}: {
  counts: ProgressCounts;
  showLegend?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const total = Math.max(counts.students, counts.started, 1);
  const submittedPct = (counts.submitted / total) * 100;
  const busyPct = (counts.inProgress / total) * 100;
  const notStarted = Math.max(0, counts.students - counts.started);
  const height = { sm: "h-1.5", md: "h-2", lg: "h-3" }[size];
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div
        className={cn("flex w-full overflow-hidden rounded-full bg-muted", height)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={counts.submitted}
        aria-label={`${counts.submitted} van ${counts.students} ingeleverd, ${counts.inProgress} bezig`}
      >
        <div
          className="h-full bg-success transition-[width] duration-500"
          style={{ width: `${submittedPct}%` }}
        />
        <div
          className={cn(
            "h-full bg-warning transition-[width] duration-500",
            submittedPct > 0 && busyPct > 0 && "border-l-2 border-card",
          )}
          style={{ width: `${busyPct}%` }}
        />
      </div>
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            {counts.submitted} ingeleverd
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
            {counts.inProgress} bezig
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            {notStarted} niet begonnen
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Small label/value pair used in info strips. */
export function InfoItem({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

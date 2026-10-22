"use client";

import { BarChart3, Dumbbell, FileCheck2, NotebookPen, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { routes } from "@/lib/routes";
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

/** Current time, re-rendering every `intervalMs` (for live countdowns). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Links between the three views of one afname. */
export function AssignmentNav({
  assignmentId,
  active,
  needsReview,
}: {
  assignmentId: string;
  active: "monitor" | "results" | "grading";
  needsReview?: number;
}) {
  const items = [
    { key: "monitor", label: "Live overzicht", href: routes.docent.assignment(assignmentId), icon: Radio },
    { key: "results", label: "Resultaten", href: routes.docent.assignmentResults(assignmentId), icon: BarChart3 },
    { key: "grading", label: "Nakijken", href: routes.docent.assignmentGrading(assignmentId), icon: NotebookPen },
  ] as const;
  return (
    <nav aria-label="Onderdelen van deze afname" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex w-max min-w-full gap-1 border-b">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
                {item.key === "grading" && needsReview ? (
                  <span className="min-w-5 rounded-full bg-warning/15 px-1.5 text-center text-[11px] leading-5 font-semibold text-warning-ink tabular-nums">
                    {needsReview}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

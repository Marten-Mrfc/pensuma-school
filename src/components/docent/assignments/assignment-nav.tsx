"use client";

import {
  BarChart3,
  ChartNoAxesColumn,
  NotebookPen,
  Radio,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Current time, re-rendering every `intervalMs` (for live countdowns). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Links between the views of one afname. */
export function AssignmentNav({
  assignmentId,
  active,
  needsReview,
}: {
  assignmentId: string;
  active: "monitor" | "results" | "grading" | "analysis" | "similarity";
  needsReview?: number;
}) {
  const items = [
    {
      key: "monitor",
      label: "Live overzicht",
      href: routes.docent.assignment(assignmentId),
      icon: Radio,
    },
    {
      key: "results",
      label: "Resultaten",
      href: routes.docent.assignmentResults(assignmentId),
      icon: BarChart3,
    },
    {
      key: "grading",
      label: "Nakijken",
      href: routes.docent.assignmentGrading(assignmentId),
      icon: NotebookPen,
    },
    {
      key: "analysis",
      label: "Analyse",
      href: routes.docent.assignmentAnalysis(assignmentId),
      icon: ChartNoAxesColumn,
    },
    {
      key: "similarity",
      label: "Vergelijken",
      href: routes.docent.assignmentSimilarity(assignmentId),
      icon: ScanSearch,
    },
  ] as const;
  return (
    <nav
      aria-label="Onderdelen van deze afname"
      className="relative -mx-1 overflow-x-auto px-1"
    >
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
                  "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
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
                    <span className="sr-only"> nog na te kijken</span>
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

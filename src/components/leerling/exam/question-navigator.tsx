"use client";

import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExamQuestion } from "./types";

export interface QuestionNavigatorProps {
  questions: ExamQuestion[];
  currentIndex: number;
  answered: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
  onSelect: (index: number) => void;
  className?: string;
}

const TYPE_LABEL: Record<ExamQuestion["type"], string> = {
  code: "programmeervraag",
  multiple_choice: "meerkeuzevraag",
  open: "open vraag",
};

/** Numbered squares: unanswered / answered / flagged / current. */
export function QuestionNavigator({
  questions,
  currentIndex,
  answered,
  flagged,
  onSelect,
  className,
}: QuestionNavigatorProps) {
  const answeredCount = questions.filter((q) => answered.has(q.id)).length;
  const pct = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  return (
    <nav aria-label="Vragen" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Voortgang</span>
          <span className="text-muted-foreground tabular-nums">
            {answeredCount}/{questions.length}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answeredCount}
          aria-label={`${answeredCount} van ${questions.length} vragen beantwoord`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="grid grid-cols-5 gap-1.5">
        {questions.map((q, index) => {
          const isCurrent = index === currentIndex;
          const isAnswered = answered.has(q.id);
          const isFlagged = flagged.has(q.id);
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Vraag ${index + 1}, ${TYPE_LABEL[q.type]}: ${q.title}. ${
                  isAnswered ? "Beantwoord" : "Nog niet beantwoord"
                }${isFlagged ? ", gemarkeerd" : ""}`}
                title={q.title}
                className={cn(
                  "relative grid aspect-square w-full place-items-center rounded-lg border text-sm font-semibold tabular-nums transition-[background-color,border-color,box-shadow,transform] outline-none hover:-translate-y-px focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isAnswered
                    ? "border-primary/30 bg-primary/12 text-primary hover:bg-primary/18"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  isFlagged &&
                    "border-warning/60 bg-warning/12 text-warning-ink",
                  isCurrent &&
                    "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/25 ring-offset-1 ring-offset-background hover:bg-primary",
                )}
              >
                {index + 1}
                {isFlagged ? (
                  <Flag
                    className={cn(
                      "absolute -top-1 -right-1 size-3.5 rounded-full bg-warning p-[2px] text-white shadow-xs",
                    )}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-[4px] border border-primary/30 bg-primary/12"
            aria-hidden="true"
          />
          Beantwoord
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-[4px] border bg-card"
            aria-hidden="true"
          />
          Open
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-[4px] border border-warning/60 bg-warning/12"
            aria-hidden="true"
          />
          Gemarkeerd
        </li>
      </ul>
    </nav>
  );
}

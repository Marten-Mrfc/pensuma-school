"use client";

import { Flag, LayoutGrid, Lightbulb, TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExamQuestion } from "./types";

const AFTER_HAND_IN =
  "Na het inleveren kun je je antwoorden niet meer veranderen.";

function unansweredText(count: number): string {
  return count === 1
    ? "1 vraag is nog niet beantwoord"
    : `${count} vragen zijn nog niet beantwoord`;
}

function rejectedText(count: number): string {
  return count === 1
    ? "1 antwoord is niet opgeslagen"
    : `${count} antwoorden zijn niet opgeslagen`;
}

/**
 * The hand-in dialog's description (its aria-describedby). Focus opens on a
 * button in the dialog body, so the warnings a screen-reader user must hear
 * before an irreversible hand-in are part of the description itself; they
 * are visually hidden because the body shows them right below.
 */
export function handInDescription({
  unanswered,
  rejected = 0,
}: {
  unanswered: number;
  rejected?: number;
}): ReactNode {
  return (
    <>
      {rejected > 0 ? (
        <span className="sr-only">{`${rejectedText(rejected)}. `}</span>
      ) : null}
      {unanswered > 0 ? (
        <span className="sr-only">{`${unansweredText(unanswered)}. `}</span>
      ) : null}
      {AFTER_HAND_IN}
    </>
  );
}

/** Buttons that jump to a question, labelled by the heading above them. */
function JumpGroup({
  title,
  icon,
  questions,
  allQuestions,
  onJump,
  className,
  titleClassName,
  footnote,
}: {
  title: string;
  icon?: ReactNode;
  questions: readonly ExamQuestion[];
  allQuestions: readonly ExamQuestion[];
  onJump: (index: number) => void;
  className?: string;
  titleClassName?: string;
  footnote?: ReactNode;
}) {
  const headingId = useId();
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", className)}>
      <p
        id={headingId}
        className={cn("flex items-center gap-1.5 font-medium", titleClassName)}
      >
        {icon}
        {title}
      </p>
      <fieldset
        aria-labelledby={headingId}
        className="flex min-w-0 flex-wrap gap-1.5"
      >
        {questions.map((q) => {
          const i = allQuestions.indexOf(q);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Naar vraag ${i + 1}: ${q.title}`}
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border bg-card px-2 text-sm font-semibold text-foreground tabular-nums transition-colors outline-none hover:border-primary/50 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
              title={q.title}
            >
              {i + 1}
            </button>
          );
        })}
      </fieldset>
      {footnote ? <p className="text-xs">{footnote}</p> : null}
    </div>
  );
}

export interface HandInSummaryProps {
  questions: readonly ExamQuestion[];
  unanswered: readonly ExamQuestion[];
  /** Code questions with code tips worth a second look. */
  withTips: readonly ExamQuestion[];
  flagged: readonly ExamQuestion[];
  /** Questions whose latest answer the server refused (not saved). */
  rejected: readonly ExamQuestion[];
  offline: boolean;
  onJump: (index: number) => void;
}

/** Body of the "Toets inleveren?" dialog. */
export function HandInSummary({
  questions,
  unanswered,
  withTips,
  flagged,
  rejected,
  offline,
  onJump,
}: HandInSummaryProps) {
  return (
    <div className="flex flex-col gap-3">
      {rejected.length ? (
        <JumpGroup
          title={`${rejectedText(rejected.length)}:`}
          icon={<TriangleAlert className="size-4" aria-hidden="true" />}
          questions={rejected}
          allQuestions={questions}
          onJump={onJump}
          className="border-destructive/30 bg-destructive/8 text-destructive-ink"
          footnote="Ga naar de vraag om te zien wat er mis is. Lever je nu in, dan telt de laatst opgeslagen versie."
        />
      ) : null}
      {unanswered.length ? (
        <JumpGroup
          title={`${unansweredText(unanswered.length)}:`}
          questions={unanswered}
          allQuestions={questions}
          onJump={onJump}
          className="border-warning/30 bg-warning/8"
          titleClassName="text-warning-ink"
        />
      ) : (
        <p className="rounded-lg bg-success/10 p-3 font-medium text-success-ink">
          Je hebt alle {questions.length} vragen beantwoord.
        </p>
      )}
      {withTips.length ? (
        <JumpGroup
          title="Misschien wil je dit nog nakijken:"
          icon={
            <Lightbulb className="size-4 text-warning-ink" aria-hidden="true" />
          }
          questions={withTips}
          allQuestions={questions}
          onJump={onJump}
        />
      ) : null}
      {flagged.length ? (
        <JumpGroup
          title="Gemarkeerd voor later:"
          icon={<Flag className="size-4 text-warning-ink" aria-hidden="true" />}
          questions={flagged}
          allQuestions={questions}
          onJump={onJump}
        />
      ) : null}
      {offline ? (
        <p className="text-sm text-warning-ink">
          Let op: je bent offline. We proberen je antwoorden eerst op te slaan.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Footer button that opens the question overview (below 1280px). Its
 * accessible name contains the visible "3/12" as one piece (WCAG 2.5.3),
 * so speech-input users can say what they see.
 */
export function QuestionOverviewButton({
  index,
  total,
  onClick,
  className,
}: {
  index: number;
  total: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button variant="ghost" className={className} onClick={onClick}>
      <LayoutGrid aria-hidden="true" />
      <span className="sr-only">Vragenoverzicht, vraag </span>
      <span className="tabular-nums">{`${index + 1}/${total}`}</span>
    </Button>
  );
}

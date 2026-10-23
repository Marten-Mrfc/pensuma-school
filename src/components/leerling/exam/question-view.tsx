"use client";

import { Flag, TriangleAlert } from "lucide-react";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import type { AnswerResponse } from "@/lib/questions/schema";
import { QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { formatPoints } from "../format";
import type { ClientEventType, EventDetails } from "./activity-logger";
import { ChoiceQuestion } from "./choice-question";
import { CodeQuestion } from "./code-question";
import { OpenQuestion } from "./open-question";
import {
  choiceData,
  type ExamQuestion,
  type ExamSettings,
  openData,
} from "./types";

export interface QuestionViewProps {
  attemptId: string;
  question: ExamQuestion;
  number: number;
  total: number;
  /**
   * Id for the question's h2 (from the runner's useId), focused on every
   * question change.
   */
  headingId: string;
  response: AnswerResponse | undefined;
  onChange: (response: AnswerResponse) => void;
  flagged: boolean;
  onToggleFlag: () => void;
  settings: ExamSettings;
  onLog: (type: ClientEventType, details?: EventDetails) => void;
  disabled?: boolean;
  /** The server refused this answer as it is (e.g. too long): why. */
  saveProblem?: string | null;
}

export function QuestionHeader({
  question,
  number,
  total,
  headingId,
  flagged,
  onToggleFlag,
  saveProblem,
  className,
}: Pick<
  QuestionViewProps,
  | "question"
  | "number"
  | "total"
  | "headingId"
  | "flagged"
  | "onToggleFlag"
  | "saveProblem"
> & {
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-muted-foreground">
          {/* The exam header shows "Vraag x van y" too on small screens. */}
          <span aria-hidden="true" className="max-sm:hidden">
            Vraag {number} van {total} ·{" "}
          </span>
          {QUESTION_TYPE_LABELS[question.type]} ·{" "}
          <span className="tabular-nums">{formatPoints(question.points)}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className={cn(
            "ml-auto h-8 text-muted-foreground",
            flagged &&
              "bg-warning/12 text-warning-ink hover:bg-warning/20 hover:text-warning-ink",
          )}
        >
          <Flag className={cn(flagged && "fill-current")} aria-hidden="true" />
          <span className="max-sm:hidden">
            {flagged ? "Gemarkeerd" : "Markeren voor later"}
          </span>
          <span className="sm:hidden">
            {flagged ? "Gemarkeerd" : "Markeren"}
          </span>
        </Button>
      </div>
      <h2
        id={headingId}
        tabIndex={-1}
        className="scroll-mt-4 rounded-md font-display text-xl leading-snug font-bold tracking-tight text-balance outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:text-2xl"
      >
        <span className="sr-only">
          Vraag {number} van {total}:{" "}
        </span>
        {question.title}
      </h2>
      {saveProblem ? (
        <p className="mt-1.5 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive-ink">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>{saveProblem}</span>
        </p>
      ) : null}
    </div>
  );
}

export function QuestionView(props: QuestionViewProps) {
  const { question, number, response, onChange, settings, onLog, disabled } =
    props;

  if (question.type === "code") {
    return <CodeQuestion {...props} />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <QuestionHeader {...props} />
        {question.prompt.trim() ? (
          <div className="text-[0.95rem]">
            <Markdown>{question.prompt}</Markdown>
          </div>
        ) : null}
        {question.type === "multiple_choice" ? (
          <ChoiceQuestion
            number={number}
            data={choiceData(question)}
            selected={
              response && "selected" in response ? response.selected : []
            }
            onChange={(selected) => onChange({ selected })}
            disabled={disabled}
          />
        ) : (
          <OpenQuestion
            value={response && "text" in response ? response.text : ""}
            onChange={(text) => onChange({ text })}
            maxLength={openData(question).maxLength}
            blockPaste={settings.blockPaste}
            onPaste={(length) =>
              onLog("paste", {
                questionId: question.id,
                length,
                blocked: settings.blockPaste,
              })
            }
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

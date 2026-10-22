"use client";

import { Flag } from "lucide-react";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import type { AnswerResponse } from "@/lib/questions/schema";
import { QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { formatPoints } from "../format";
import type { ClientEventType } from "./activity-logger";
import { ChoiceQuestion } from "./choice-question";
import { CodeQuestion } from "./code-question";
import { OpenQuestion } from "./open-question";
import { choiceData, type ExamQuestion, type ExamSettings, openData } from "./types";

export interface QuestionViewProps {
  question: ExamQuestion;
  number: number;
  total: number;
  response: AnswerResponse | undefined;
  onChange: (response: AnswerResponse) => void;
  flagged: boolean;
  onToggleFlag: () => void;
  settings: ExamSettings;
  onLog: (type: ClientEventType, details?: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function QuestionHeader({
  question,
  number,
  flagged,
  onToggleFlag,
  className,
}: Pick<QuestionViewProps, "question" | "number" | "flagged" | "onToggleFlag"> & {
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-semibold tracking-wide text-primary uppercase">
          Vraag {number} · {QUESTION_TYPE_LABELS[question.type]}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {formatPoints(question.points)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className={cn(
            "ml-auto h-8 text-muted-foreground",
            flagged && "bg-warning/12 text-warning-ink hover:bg-warning/20 hover:text-warning-ink",
          )}
        >
          <Flag className={cn(flagged && "fill-current")} aria-hidden="true" />
          {flagged ? "Gemarkeerd" : "Markeren voor later"}
        </Button>
      </div>
      <h2 className="font-display text-xl leading-snug font-bold tracking-tight text-balance sm:text-2xl">
        {question.title}
      </h2>
    </div>
  );
}

export function QuestionView(props: QuestionViewProps) {
  const { question, response, onChange, settings, onLog, disabled } = props;

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
            data={choiceData(question)}
            selected={response && "selected" in response ? response.selected : []}
            onChange={(selected) => onChange({ selected })}
            disabled={disabled}
          />
        ) : (
          <OpenQuestion
            value={response && "text" in response ? response.text : ""}
            onChange={(text) => onChange({ text })}
            maxLength={openData(question).maxLength}
            blockPaste={settings.blockPaste}
            onPaste={() => onLog("paste", { questionId: question.id, blocked: settings.blockPaste })}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

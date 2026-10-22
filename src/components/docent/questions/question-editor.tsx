"use client";

import { FileText } from "lucide-react";
import { type ReactNode, useId } from "react";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import { Input } from "@/components/ui/input";
import {
  type CodeQuestionData,
  type MultipleChoiceData,
  type OpenQuestionData,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@/lib/questions/schema";
import {
  MAX_POINTS_PER_QUESTION,
  type QuestionIssue,
  type SolutionCheck,
} from "@/lib/questions/validate";
import { cn } from "@/lib/utils";
import { CodeQuestionEditor } from "./code-question-editor";
import {
  EditorSection,
  FieldLabel,
  NumberInput,
  PromptImageWarning,
} from "./fields";
import { IssueList } from "./issue-list";
import { MultipleChoiceEditor } from "./multiple-choice-editor";
import { OpenQuestionEditor } from "./open-question-editor";
import { QUESTION_TYPE_ICONS, QUESTION_TYPE_TONE } from "./question-icons";
import { TopicTagsField } from "./topic-tags-field";

/** Editable fields of a question (what autosave sends). */
export type QuestionDraft = {
  title: string;
  prompt: string;
  points: number;
  /** Question bank topics (normalised). */
  tags: string[];
  data: Record<string, unknown>;
};

export type EditableQuestion = QuestionDraft & {
  id: string;
  type: QuestionType;
  solutionCheck: SolutionCheck | null;
};

export interface QuestionEditorProps {
  question: EditableQuestion;
  number: number;
  total: number;
  issues: readonly QuestionIssue[];
  onChange: (patch: Partial<QuestionDraft>) => void;
  onFlush: () => Promise<boolean>;
  onSolutionChecked: (check: SolutionCheck) => void;
  /** Buttons for the header (dupliceren, verwijderen, …). */
  actions?: ReactNode;
  /** Save status, shown in the header. */
  status?: ReactNode;
  /** Topics used elsewhere, offered as suggestions. */
  tagSuggestions?: string[];
}

export function QuestionEditor({
  question,
  number,
  total,
  issues,
  onChange,
  onFlush,
  onSolutionChecked,
  actions,
  status,
  tagSuggestions,
}: QuestionEditorProps) {
  const id = useId();
  const TypeIcon = QUESTION_TYPE_ICONS[question.type];
  const dataIssues = issues.filter((i) => i.target?.field === "data");
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const titleIssue = issues.some((i) => i.target?.field === "title");
  // Only errors colour the prompt red; warnings (alt text) show below it.
  const promptIssue = issues.some(
    (i) => i.target?.field === "prompt" && i.severity === "error",
  );
  const promptWarnings = issues.filter(
    (i) => i.target?.field === "prompt" && i.severity === "warning",
  );
  const pointsIssue = issues.some((i) => i.target?.field === "points");

  return (
    <div className="flex flex-col gap-5">
      <div className="z-10 flex lg:sticky lg:top-[4.25rem] flex-col gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-xs backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              QUESTION_TYPE_TONE[question.type],
            )}
          >
            <TypeIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-medium text-muted-foreground">
              Vraag {number} van {total} · {QUESTION_TYPE_LABELS[question.type]}
            </span>
            <span className="truncate font-semibold">
              {question.title || "Naamloze vraag"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {status}
          {actions}
        </div>
      </div>

      {issues.length > 0 ? (
        <section
          className="flex flex-col gap-1.5"
          aria-label="Aandachtspunten bij deze vraag"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {errorCount > 0
              ? `${errorCount} ${errorCount === 1 ? "probleem" : "problemen"} om op te lossen voor publiceren`
              : ""}
            {errorCount > 0 && warningCount > 0 ? " · " : ""}
            {warningCount > 0
              ? `${warningCount} ${warningCount === 1 ? "aandachtspunt" : "aandachtspunten"}`
              : ""}
          </p>
          <IssueList issues={issues} />
        </section>
      ) : null}

      <EditorSection title="Vraag" icon={<FileText />}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${id}-title`}>Titel</FieldLabel>
            <Input
              id={`${id}-title`}
              value={question.title}
              onChange={(e) => onChange({ title: e.target.value })}
              maxLength={300}
              placeholder="bijv. Begroeting"
              status={titleIssue ? "error" : undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${id}-points`}>Punten</FieldLabel>
            <NumberInput
              id={`${id}-points`}
              value={question.points}
              min={0}
              max={MAX_POINTS_PER_QUESTION}
              step={0.5}
              onChange={(points) =>
                points !== undefined && onChange({ points })
              }
              aria-invalid={pointsIssue || undefined}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-prompt`}>Opdracht</FieldLabel>
          <MarkdownEditor
            id={`${id}-prompt`}
            value={question.prompt}
            onChange={(prompt) => onChange({ prompt })}
            minRows={6}
            placeholder={
              question.type === "code"
                ? "Beschrijf wat het programma moet doen. Geef een voorbeeld van invoer en uitvoer."
                : "Schrijf hier de vraag…"
            }
            className={promptIssue ? "border-destructive/50" : undefined}
          />
          <PromptImageWarning prompt={question.prompt} />
          <IssueList issues={promptWarnings} compact />
        </div>
        <TopicTagsField
          value={question.tags}
          onChange={(tags) => onChange({ tags })}
          extraSuggestions={tagSuggestions}
        />
      </EditorSection>

      <IssueList issues={dataIssues} />

      {question.type === "code" ? (
        <CodeQuestionEditor
          questionId={question.id}
          data={question.data as CodeQuestionData}
          onChange={(data) => onChange({ data })}
          issues={issues}
          solutionCheck={question.solutionCheck}
          onFlush={onFlush}
          onSolutionChecked={onSolutionChecked}
        />
      ) : question.type === "multiple_choice" ? (
        <MultipleChoiceEditor
          data={question.data as MultipleChoiceData}
          onChange={(data) => onChange({ data })}
          issues={issues}
          prompt={question.prompt}
        />
      ) : (
        <OpenQuestionEditor
          data={question.data as OpenQuestionData}
          onChange={(data) => onChange({ data })}
          issues={issues}
          points={question.points}
        />
      )}
    </div>
  );
}

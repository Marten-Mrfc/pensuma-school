"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { CodeEditor } from "@/components/app/code-editor";
import { Markdown } from "@/components/app/markdown";
import {
  type ChoiceOption,
  type CodeQuestionData,
  type MultipleChoiceData,
  type OpenQuestionData,
  type QuestionType,
  questionDataSchemas,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { CodeRunPanel, SelfTestButton } from "./python";

/* -------------------------------------------------------------------------- */
/*                              Choice options view                           */
/* -------------------------------------------------------------------------- */

export function ChoiceOptionsView({
  options,
  multiple,
  selected,
  onSelectedChange,
  reveal = false,
}: {
  options: Pick<ChoiceOption, "id" | "text" | "correct">[];
  multiple: boolean;
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  /** Teacher view: highlight the correct options. */
  reveal?: boolean;
}) {
  function toggle(id: string) {
    if (multiple) {
      onSelectedChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onSelectedChange([id]);
    }
  }

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label="Antwoordopties"
      className="flex flex-col gap-2"
    >
      {multiple ? (
        <p className="text-xs font-medium text-muted-foreground">Je mag meerdere antwoorden kiezen.</p>
      ) : null}
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          // biome-ignore lint/a11y/useSemanticElements: custom radio/checkbox card with markdown content
          <div
            key={option.id}
            role={multiple ? "checkbox" : "radio"}
            aria-checked={isSelected}
            tabIndex={0}
            onClick={() => toggle(option.id)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                toggle(option.id);
              }
            }}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3.5 py-3 text-sm transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50",
              isSelected && "border-primary bg-primary/[0.06] ring-1 ring-primary/30",
              reveal && option.correct && "border-success/60 bg-success/[0.07]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-[1.125rem] shrink-0 place-items-center border-2 transition-colors",
                multiple ? "rounded-[5px]" : "rounded-full",
                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {isSelected ? (
                multiple ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  <span className="size-1.5 rounded-full bg-primary-foreground" />
                )
              ) : null}
            </span>
            <div className="min-w-0 flex-1 [&_p]:my-0">
              {option.text.trim() ? (
                <Markdown>{option.text}</Markdown>
              ) : (
                <span className="text-muted-foreground italic">(lege optie)</span>
              )}
            </div>
            {reveal && option.correct ? (
              <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[0.68rem] font-medium text-success-ink">
                goed
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Student question preview                         */
/* -------------------------------------------------------------------------- */

export type PreviewQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  prompt: string;
  points: number;
  data: unknown;
};

function formatPoints(points: number) {
  const text = Number.isInteger(points) ? String(points) : points.toLocaleString("nl-NL");
  return `${text} ${points === 1 ? "punt" : "punten"}`;
}

/**
 * The question exactly as a student sees it (prompt, editor, run/test
 * buttons, options, text field). Purely local: nothing is saved.
 */
export function StudentQuestionPreview({
  question,
  number,
  total,
}: {
  question: PreviewQuestion;
  number: number;
  total: number;
}) {
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>
            Vraag {number} van {total}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatPoints(question.points)}</span>
        </div>
        <h2 className="font-display text-xl leading-tight font-bold tracking-tight sm:text-2xl">
          {question.title || "Naamloze vraag"}
        </h2>
      </header>
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        {question.prompt.trim() ? (
          <Markdown>{question.prompt}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nog geen opdrachttekst.</p>
        )}
      </div>
      <PreviewAnswer key={question.id} question={question} />
    </article>
  );
}

function PreviewAnswer({ question }: { question: PreviewQuestion }) {
  const parsed = questionDataSchemas[question.type].safeParse(question.data ?? {});
  if (!parsed.success) {
    return <p className="text-sm text-destructive-ink">De instellingen van deze vraag zijn ongeldig.</p>;
  }
  switch (question.type) {
    case "code":
      return <CodeAnswerPreview data={parsed.data as CodeQuestionData} />;
    case "multiple_choice":
      return <ChoiceAnswerPreview data={parsed.data as MultipleChoiceData} />;
    case "open":
      return <OpenAnswerPreview data={parsed.data as OpenQuestionData} />;
  }
}

function CodeAnswerPreview({ data }: { data: CodeQuestionData }) {
  const [code, setCode] = useState(data.starterCode);
  // Students only ever receive the visible tests.
  const visibleTests = data.tests.filter((t) => !t.hidden);
  const hiddenCount = data.tests.length - visibleTests.length;
  return (
    <div className="flex flex-col gap-4">
      <CodeEditor
        aria-label="Jouw code"
        value={code}
        onChange={setCode}
        minHeight={220}
        maxHeight={560}
        autocomplete
      />
      <CodeRunPanel code={code} timeLimitMs={data.timeLimitMs} />
      <div className="flex flex-col gap-2">
        <SelfTestButton
          code={code}
          tests={visibleTests}
          checks={data.checks}
          timeLimitMs={data.timeLimitMs}
          disabled={visibleTests.length === 0 && data.checks.length === 0}
        />
        <p className="text-xs text-muted-foreground">
          {visibleTests.length === 1 ? "1 zichtbare test" : `${visibleTests.length} zichtbare tests`}
          {hiddenCount > 0
            ? ` · ${hiddenCount} verborgen ${hiddenCount === 1 ? "test telt" : "tests tellen"} alleen mee bij het nakijken`
            : ""}
        </p>
      </div>
    </div>
  );
}

function ChoiceAnswerPreview({ data }: { data: MultipleChoiceData }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ChoiceOptionsView
      options={data.options}
      multiple={data.multiple}
      selected={selected}
      onSelectedChange={setSelected}
    />
  );
}

function OpenAnswerPreview({ data }: { data: OpenQuestionData }) {
  const [text, setText] = useState("");
  const max = data.maxLength;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="preview-open" className="text-sm font-medium">
        Jouw antwoord
      </label>
      <textarea
        id="preview-open"
        value={text}
        maxLength={max}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Typ hier je antwoord…"
        className="w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-sm leading-6 shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <p className="text-right text-xs text-muted-foreground tabular-nums">
        {max ? `${text.length} / ${max} tekens` : `${text.length} tekens`}
      </p>
    </div>
  );
}

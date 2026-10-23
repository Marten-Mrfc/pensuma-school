"use client";

import { useId } from "react";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import type {
  OpenQuestionData,
  QuestionDataByType,
} from "@/lib/questions/schema";
import type { QuestionIssue } from "@/lib/questions/validate";
import { EditorSection, FieldLabel, NumberInput } from "./fields";
import { IssueList } from "./issue-list";
import { RubricItemsEditor } from "./rubric-items-editor";
import { OPEN_QUESTION_VISIBILITY_NOTE } from "./visibility-notes";

export function OpenQuestionEditor({
  data,
  onChange,
  issues,
  points,
}: {
  data: OpenQuestionData;
  onChange: (data: QuestionDataByType["open"]) => void;
  issues: readonly QuestionIssue[];
  /** The question's points (criteria should add up to this). */
  points: number;
}) {
  const id = useId();
  const set = (patch: Partial<OpenQuestionData>) =>
    onChange({ ...data, ...patch });

  return (
    <EditorSection title="Nakijken" description={OPEN_QUESTION_VISIBILITY_NOTE}>
      <IssueList
        issues={issues.filter((i) => i.target?.field === "modelAnswer")}
      />
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={`${id}-model`}>Modelantwoord</FieldLabel>
        <MarkdownEditor
          id={`${id}-model`}
          value={data.modelAnswer}
          onChange={(modelAnswer) => set({ modelAnswer })}
          placeholder="Een goed antwoord bevat…"
          minRows={4}
        />
      </div>
      <RubricItemsEditor
        items={data.rubricItems}
        onChange={(rubricItems) => set({ rubricItems })}
        points={points}
      />
      <IssueList
        issues={issues.filter((i) => i.target?.field === "rubricItem")}
        compact
      />
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={`${id}-rubric`}>
          Toelichting voor het nakijken
        </FieldLabel>
        <MarkdownEditor
          id={`${id}-rubric`}
          value={data.rubric}
          onChange={(rubric) => set({ rubric })}
          placeholder="Bijvoorbeeld: halve punten als de uitleg klopt maar het voorbeeld ontbreekt."
          minRows={3}
        />
      </div>
      <div className="flex flex-col gap-2 sm:max-w-xs">
        <FieldLabel htmlFor={`${id}-max`}>Max. aantal tekens</FieldLabel>
        <NumberInput
          id={`${id}-max`}
          value={data.maxLength}
          allowEmpty
          min={1}
          max={20_000}
          step={100}
          placeholder="Geen limiet"
          onChange={(maxLength) =>
            set({
              maxLength:
                maxLength === undefined ? undefined : Math.round(maxLength),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          Leeg laten voor geen limiet (maximaal 20.000).
        </p>
      </div>
    </EditorSection>
  );
}

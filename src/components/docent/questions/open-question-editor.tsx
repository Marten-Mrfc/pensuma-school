"use client";

import { ClipboardCheck } from "lucide-react";
import { useId } from "react";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import type { OpenQuestionData, QuestionDataByType } from "@/lib/questions/schema";
import type { QuestionIssue } from "@/lib/questions/validate";
import { EditorSection, FieldLabel, NumberInput } from "./fields";
import { IssueList } from "./issue-list";

export function OpenQuestionEditor({
  data,
  onChange,
  issues,
}: {
  data: OpenQuestionData;
  onChange: (data: QuestionDataByType["open"]) => void;
  issues: readonly QuestionIssue[];
}) {
  const id = useId();
  const set = (patch: Partial<OpenQuestionData>) => onChange({ ...data, ...patch });

  return (
    <EditorSection
      title="Nakijken"
      description="Open vragen kijk je zelf na. Het modelantwoord en de rubric zie jij tijdens het nakijken; leerlingen zien ze nooit."
      icon={<ClipboardCheck />}
    >
      <IssueList issues={issues} />
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
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={`${id}-rubric`}>Beoordelingsrubric</FieldLabel>
        <MarkdownEditor
          id={`${id}-rubric`}
          value={data.rubric}
          onChange={(rubric) => set({ rubric })}
          placeholder={"- 1 punt: juiste uitleg\n- 1 punt: passend voorbeeld"}
          minRows={4}
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
            set({ maxLength: maxLength === undefined ? undefined : Math.round(maxLength) })
          }
        />
        <p className="text-xs text-muted-foreground">Leeg laten voor geen limiet (maximaal 20.000).</p>
      </div>
    </EditorSection>
  );
}

"use client";

import { Settings2 } from "lucide-react";
import { type Ref, useId } from "react";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import {
  EditorSection,
  FieldLabel,
} from "@/components/docent/questions/fields";
import { Input } from "@/components/ui/input";

export type TestSettingsDraft = {
  title: string;
  topic: string;
  description: string;
};

export function TestSettingsEditor({
  value,
  onChange,
  status,
  headingRef,
}: {
  value: TestSettingsDraft;
  onChange: (patch: Partial<TestSettingsDraft>) => void;
  status?: React.ReactNode;
  /** The section heading (focus target after the last question is deleted). */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const id = useId();
  const titleMissing = !value.title.trim();
  return (
    <EditorSection
      title="Toetsinstellingen"
      description="De titel en beschrijving zien leerlingen voordat ze aan de toets beginnen."
      icon={<Settings2 />}
      actions={status}
      headingRef={headingRef}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-title`}>Titel</FieldLabel>
          <Input
            id={`${id}-title`}
            value={value.title}
            maxLength={200}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="bijv. Toets H3 – lussen"
            status={titleMissing ? "error" : undefined}
          />
          {titleMissing ? (
            <p className="text-xs font-medium text-destructive-ink">
              Geef de toets een titel.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-topic`}>Onderwerp</FieldLabel>
          <Input
            id={`${id}-topic`}
            value={value.topic}
            maxLength={200}
            onChange={(e) => onChange({ topic: e.target.value })}
            placeholder="bijv. Python – lussen"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={`${id}-description`}>
          Beschrijving voor leerlingen
        </FieldLabel>
        <MarkdownEditor
          id={`${id}-description`}
          value={value.description}
          onChange={(description) => onChange({ description })}
          placeholder="Wat moeten leerlingen weten voordat ze beginnen? Bijvoorbeeld welke onderwerpen erin zitten of welke hulpmiddelen zijn toegestaan."
          minRows={5}
        />
      </div>
    </EditorSection>
  );
}

"use client";

import { Lightbulb, Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { ReorderButtons } from "@/components/a11y/reorder-buttons";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import type { CodeHint } from "@/lib/questions/schema";
import { createLocalId } from "@/lib/questions/templates";
import {
  hintPenaltyTotal,
  QUESTION_INPUT_LIMITS,
  type QuestionIssue,
} from "@/lib/questions/validate";
import { EditorSection } from "./fields";
import { IssueList } from "./issue-list";

const MAX_HINTS = QUESTION_INPUT_LIMITS.hints;

/** Penalty choices: fraction of the question's points. */
const PENALTIES = [
  { value: 0, label: "Geen" },
  { value: 0.1, label: "10% van de punten" },
  { value: 0.25, label: "25% van de punten" },
  { value: 0.5, label: "50% van de punten" },
];

function percent(fraction: number) {
  return `${Math.round(fraction * 1000) / 10}%`.replace(".", ",");
}

/**
 * “Hints” for a code question: up to 5, revealed one by one (when the
 * assignment allows hints), each with an optional point penalty.
 */
export function HintsEditor({
  hints,
  onChange,
  issues,
}: {
  hints: CodeHint[];
  onChange: (hints: CodeHint[]) => void;
  issues: readonly QuestionIssue[];
}) {
  const id = useId();
  const total = hintPenaltyTotal(hints);

  function update(index: number, patch: Partial<CodeHint>) {
    onChange(hints.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  function move(from: number, to: number) {
    const next = [...hints];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <EditorSection
      title="Hints"
      description="Leerlingen zien hints alleen als je ze bij de afname toestaat. Hints worden in volgorde vrijgegeven."
      icon={<Lightbulb />}
    >
      <IssueList issues={issues.filter((i) => i.target?.field === "hints")} />
      {hints.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          Nog geen hints. Een hint helpt een leerling op weg zonder het antwoord
          weg te geven, bijvoorbeeld: “Gebruik een for-lus met range()”.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {hints.map((hint, index) => {
            const n = index + 1;
            const hintIssues = issues.filter(
              (i) => i.target?.field === "hint" && i.target.id === hint.id,
            );
            const known = PENALTIES.some(
              (p) => Math.abs(p.value - hint.penalty) < 1e-9,
            );
            return (
              <li
                key={hint.id}
                className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={`${id}-${hint.id}-text`}
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-6 place-items-center rounded-full bg-warning/15 text-xs text-warning-ink tabular-nums"
                    >
                      {n}
                    </span>
                    Hint {n}
                  </label>
                  <div className="flex items-center gap-1">
                    <ReorderButtons
                      index={index}
                      count={hints.length}
                      itemLabel={`Hint ${n}`}
                      itemKey={hint.id}
                      onMove={move}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Hint ${n} verwijderen`}
                      onClick={() =>
                        onChange(hints.filter((h) => h.id !== hint.id))
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <MarkdownEditor
                  id={`${id}-${hint.id}-text`}
                  value={hint.text}
                  onChange={(text) => update(index, { text })}
                  minRows={2}
                  placeholder="Bijvoorbeeld: Gebruik int() om de invoer om te zetten naar een getal."
                />
                <IssueList issues={hintIssues} compact />
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <label
                    htmlFor={`${id}-${hint.id}-penalty`}
                    className="text-sm font-medium"
                  >
                    Puntaftrek
                  </label>
                  <NativeSelect
                    id={`${id}-${hint.id}-penalty`}
                    className="sm:w-56"
                    value={String(hint.penalty)}
                    onChange={(e) =>
                      update(index, { penalty: Number(e.target.value) })
                    }
                  >
                    {PENALTIES.map((p) => (
                      <option key={p.value} value={String(p.value)}>
                        {p.label}
                      </option>
                    ))}
                    {!known ? (
                      <option value={String(hint.penalty)}>
                        {percent(hint.penalty)} van de punten
                      </option>
                    ) : null}
                  </NativeSelect>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={hints.length >= MAX_HINTS}
          onClick={() =>
            onChange([
              ...hints,
              { id: createLocalId("h"), text: "", penalty: 0 },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Hint toevoegen
        </Button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {hints.length >= MAX_HINTS
            ? `Maximaal ${MAX_HINTS} hints.`
            : hints.length > 0 && total > 0
              ? `Alle hints samen kosten ${percent(Math.min(total, 9.99))} van de punten.`
              : null}
        </p>
      </div>
    </EditorSection>
  );
}

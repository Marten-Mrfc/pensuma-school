"use client";

import { ListChecks, TextQuote } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type RubricCriterion, rubricScore } from "@/lib/grading/rubric";

function formatPoints(n: number) {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

/**
 * “Criteria”: tick the rubric criteria of an open question; the score
 * follows (sum of the ticked points, at most the maximum).
 */
export function RubricChecklist({
  items,
  checked,
  onCheckedChange,
  max,
  onApplyToFeedback,
  disabled,
}: {
  items: readonly RubricCriterion[];
  checked: readonly string[];
  onCheckedChange: (checked: string[]) => void;
  max: number;
  /** “Criteria in feedback zetten”. */
  onApplyToFeedback?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (items.length === 0) return null;
  const score = rubricScore(items, checked, max);

  function toggle(itemId: string, on: boolean) {
    const set = new Set(checked);
    if (on) set.add(itemId);
    else set.delete(itemId);
    // Keep the order of the criteria.
    onCheckedChange(items.filter((i) => set.has(i.id)).map((i) => i.id));
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
        <ListChecks
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        Criteria
      </legend>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const inputId = `${id}-${item.id}`;
          return (
            <li key={item.id} className="flex items-start gap-2.5">
              <Checkbox
                id={inputId}
                checked={checked.includes(item.id)}
                disabled={disabled}
                onCheckedChange={(value) => toggle(item.id, value === true)}
                className="mt-0.5"
              />
              <label
                htmlFor={inputId}
                className="cursor-pointer text-sm leading-snug"
              >
                {item.label.trim() || "Criterium"}{" "}
                <span className="text-muted-foreground tabular-nums">
                  ({formatPoints(item.points)} pt)
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          Volgens de criteria: {formatPoints(score)} / {formatPoints(max)}
        </span>
        {onApplyToFeedback ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onApplyToFeedback}
            disabled={disabled}
          >
            <TextQuote aria-hidden="true" />
            Criteria in feedback zetten
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

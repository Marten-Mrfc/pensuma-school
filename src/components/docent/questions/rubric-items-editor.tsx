"use client";

import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { ReorderButtons } from "@/components/a11y/reorder-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RubricItem } from "@/lib/questions/schema";
import { createLocalId } from "@/lib/questions/templates";
import {
  formatDutchNumber,
  QUESTION_INPUT_LIMITS,
  rubricSumMismatch,
} from "@/lib/questions/validate";
import { NumberInput } from "./fields";

const MAX_ITEMS = QUESTION_INPUT_LIMITS.rubricItems;

/**
 * “Beoordelingscriteria” of an open question: label + points. While
 * grading, the teacher ticks criteria and the score follows.
 */
export function RubricItemsEditor({
  items,
  onChange,
  points,
}: {
  items: RubricItem[];
  onChange: (items: RubricItem[]) => void;
  /** The question's points (the criteria should add up to this). */
  points: number;
}) {
  const id = useId();
  const mismatch = rubricSumMismatch(items, points);
  const sum = items.reduce((s, i) => s + i.points, 0);

  function update(index: number, patch: Partial<RubricItem>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function move(from: number, to: number) {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <ListChecks
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        Beoordelingscriteria
      </legend>
      <p className="-mt-1 text-xs text-muted-foreground">
        Optioneel. Bij het nakijken vink je de criteria aan en wordt de score
        automatisch berekend.
      </p>
      {items.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => {
            const n = index + 1;
            return (
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-lg border bg-background p-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
              >
                <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                  <label
                    htmlFor={`${id}-${item.id}-label`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Criterium {n}
                  </label>
                  <Input
                    id={`${id}-${item.id}-label`}
                    value={item.label}
                    maxLength={300}
                    placeholder="bijv. Juiste uitleg met een voorbeeld"
                    onChange={(e) => update(index, { label: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${id}-${item.id}-points`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Punten
                  </label>
                  <NumberInput
                    id={`${id}-${item.id}-points`}
                    value={item.points}
                    min={0}
                    max={1000}
                    step={0.5}
                    onChange={(value) =>
                      value !== undefined && update(index, { points: value })
                    }
                  />
                </div>
                <div className="flex items-center gap-0.5 pb-0.5">
                  <ReorderButtons
                    index={index}
                    count={items.length}
                    itemLabel={`Criterium ${n}`}
                    itemKey={item.id}
                    onMove={move}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Criterium ${n} verwijderen`}
                    onClick={() =>
                      onChange(items.filter((i) => i.id !== item.id))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {mismatch ? (
        <output className="block rounded-md bg-warning/10 px-2.5 py-1.5 text-[0.8rem] text-warning-ink">
          {mismatch}
        </output>
      ) : items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Samen {formatDutchNumber(sum)} punten, gelijk aan de punten van de
          vraag.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={items.length >= MAX_ITEMS}
        onClick={() =>
          onChange([...items, { id: createLocalId("r"), label: "", points: 1 }])
        }
      >
        <Plus aria-hidden="true" />
        Criterium toevoegen
      </Button>
    </fieldset>
  );
}

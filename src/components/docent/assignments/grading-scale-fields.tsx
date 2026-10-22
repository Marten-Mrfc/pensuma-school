"use client";

import { Calculator } from "lucide-react";
import { useId } from "react";
import { NumberField } from "@/components/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { gradeTable } from "@/lib/grading/grade-scale";
import {
  type AssignmentSettings,
  GRADING_METHOD_LABELS,
  type GradingMethod,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { formatGrade } from "./format";

type Scale = AssignmentSettings["grading"];

const METHOD_HELP: Record<GradingMethod, string> = {
  linear: "Elke procent van de punten telt even zwaar.",
  cesuur:
    "Je kiest zelf bij welk percentage van de punten een leerling een 5,5 haalt.",
  nterm:
    "Zoals bij de centrale examens: met een hogere N-term worden de cijfers hoger.",
};

const decimalNl = (value: number | undefined, digits: number) =>
  value == null || Number.isNaN(value)
    ? ""
    : value.toLocaleString("nl-NL", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const parseNl = (text: string): number | undefined => {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** "Cijferberekening": method, cesuur percentage / N-term and a live preview. */
export function GradingScaleFields({
  value,
  onChange,
  disabled,
}: {
  value: Scale;
  onChange: (next: Scale) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const middle = value.method === "cesuur" ? value.passPercentage : 50;
  const preview = gradeTable(value, [0, middle, 100]);
  const methods = Object.keys(GRADING_METHOD_LABELS) as GradingMethod[];

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Calculator className="size-3.5" aria-hidden="true" />
        Cijferberekening
      </legend>
      <RadioGroup
        value={value.method}
        onValueChange={(m) =>
          onChange({ ...value, method: m as GradingMethod })
        }
        aria-label="Cijferberekening"
        className="grid gap-2 sm:grid-cols-3"
      >
        {methods.map((m) => {
          const itemId = `${id}-${m}`;
          const active = value.method === m;
          return (
            <label
              key={m}
              htmlFor={itemId}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background/50 p-3 transition-colors hover:bg-accent/40",
                active && "border-primary/40 bg-primary/[0.04]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <RadioGroupItem id={itemId} value={m} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {GRADING_METHOD_LABELS[m]}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {METHOD_HELP[m]}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {value.method === "cesuur" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-pass`} className="text-sm font-medium">
              Percentage voor een 5,5
            </label>
            <NumberField
              id={`${id}-pass`}
              value={value.passPercentage}
              min={10}
              max={90}
              step={1}
              suffix="%"
              disabled={disabled}
              className="w-40"
              formatter={(v) => decimalNl(v, 0)}
              parser={parseNl}
              onValueChange={(v) =>
                v != null &&
                onChange({
                  ...value,
                  passPercentage: Math.min(90, Math.max(10, Math.round(v))),
                })
              }
            />
          </div>
        ) : null}
        {value.method === "nterm" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-nterm`} className="text-sm font-medium">
              N-term
            </label>
            <NumberField
              id={`${id}-nterm`}
              value={value.nTerm}
              min={0}
              max={3}
              step={0.1}
              precision={1}
              disabled={disabled}
              className="w-40"
              formatter={(v) => decimalNl(v, 1)}
              parser={parseNl}
              onValueChange={(v) =>
                v != null &&
                onChange({
                  ...value,
                  nTerm: Math.min(3, Math.max(0, Math.round(v * 10) / 10)),
                })
              }
            />
          </div>
        ) : null}
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm tabular-nums"
          aria-live="off"
        >
          <span className="sr-only">Voorbeeld:</span>
          {preview.map((row, i) => (
            <span
              key={row.percentage}
              className="inline-flex items-center gap-1.5"
            >
              {i > 0 ? (
                <span className="text-muted-foreground" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <span className="text-muted-foreground">
                {decimalNl(row.percentage, 0)}%
              </span>
              <span aria-hidden="true">→</span>
              <span className="sr-only">geeft</span>
              <span className="font-semibold">{formatGrade(row.grade)}</span>
            </span>
          ))}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Je kunt dit ook na afloop nog veranderen; cijfers worden opnieuw
        berekend.
      </p>
    </fieldset>
  );
}

"use client";

import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  EyeOff,
  ListChecks,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { normalizeLines } from "@/lib/grading/compare";
import { type DiffLine, diffLines } from "@/lib/grading/diff";
import type {
  CheckResult,
  CodeGradingResult,
  TestResult,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { FeedbackText } from "./feedback-text";
import { PythonErrorCard } from "./python-error-card";

export type TestResultsListProps = {
  result: CodeGradingResult;
  /** Denser layout, all tests collapsed (e.g. in a side panel or table row). */
  compact?: boolean;
  /**
   * "student" (default): hidden tests show only "Verborgen test – geslaagd /
   * niet geslaagd". "teacher": hidden tests are shown in full (input,
   * expected, actual, feedback, error) with a "verborgen" badge.
   */
  audience?: "student" | "teacher";
  className?: string;
};

const STATUS_LABEL: Partial<
  Record<
    CodeGradingResult["status"],
    { text: string; variant: "destructive" | "warning" | "secondary" }
  >
> = {
  syntax_error: { text: "Syntaxfout", variant: "destructive" },
  timeout: { text: "Tijdslimiet bereikt", variant: "warning" },
  runtime_error: { text: "Foutmelding", variant: "warning" },
  internal_error: { text: "Niet nagekeken", variant: "secondary" },
};

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function TestIcon({ test }: { test: TestResult }) {
  if (test.passed)
    return (
      <CircleCheck
        className="text-success size-5 shrink-0"
        aria-hidden="true"
      />
    );
  if (test.timedOut)
    return (
      <Clock className="text-warning size-5 shrink-0" aria-hidden="true" />
    );
  return (
    <CircleX className="text-destructive size-5 shrink-0" aria-hidden="true" />
  );
}

function OutputBlock({
  label,
  lines,
  empty,
  highlight,
}: {
  label: string;
  lines: DiffLine[] | string[];
  empty: string;
  highlight?: "missing" | "extra";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div className="bg-muted/40 max-h-56 min-h-[2.25rem] overflow-auto rounded-md border px-2 py-1.5 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <span className="text-muted-foreground font-sans italic">
            {empty}
          </span>
        ) : (
          lines.map((l, i) => {
            const line =
              typeof l === "string" ? { text: l, status: "same" as const } : l;
            const changed = highlight && line.status === "changed";
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: lines of a static text
                key={i}
                className={cn(
                  "-mx-1 rounded-sm px-1 break-words whitespace-pre-wrap",
                  changed &&
                    highlight === "missing" &&
                    "bg-success/15 text-foreground",
                  changed &&
                    highlight === "extra" &&
                    "bg-destructive/15 text-foreground",
                )}
              >
                {line.text === "" ? " " : line.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function IoDetails({ test }: { test: TestResult }) {
  const expected = normalizeLines(test.expected ?? "");
  const actual = normalizeLines(test.actual ?? "");
  const diff = test.passed ? null : diffLines(expected, actual);
  const stdinLines = normalizeLines(test.stdin ?? "");
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <OutputBlock label="Invoer" lines={stdinLines} empty="geen invoer" />
      <OutputBlock
        label="Verwachte uitvoer"
        lines={diff ? diff.expected : expected}
        empty="geen uitvoer"
        highlight={diff ? "missing" : undefined}
      />
      <OutputBlock
        label="Jouw uitvoer"
        lines={diff ? diff.actual : actual}
        empty={
          test.timedOut
            ? "geen uitvoer (gestopt)"
            : "je programma printte niets"
        }
        highlight={diff ? "extra" : undefined}
      />
    </div>
  );
}

function FunctionDetails({ test }: { test: TestResult }) {
  const printed = normalizeLines(test.stdout ?? "");
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <OutputBlock
        label="Aanroep"
        lines={test.call ? [test.call] : []}
        empty="–"
      />
      <OutputBlock
        label="Verwachte waarde"
        lines={test.expected ? [test.expected] : []}
        empty="–"
      />
      <OutputBlock
        label="Jouw waarde"
        lines={test.actual !== undefined ? [test.actual] : []}
        empty={test.error ? "fout (zie hieronder)" : "–"}
        highlight={test.passed ? undefined : "extra"}
      />
      {printed.length > 0 ? (
        <div className="sm:col-span-3">
          <OutputBlock
            label="Geprint door je programma"
            lines={printed}
            empty=""
          />
        </div>
      ) : null}
    </div>
  );
}

function TestRow({
  test,
  index,
  defaultOpen,
  compact,
  audience,
}: {
  test: TestResult;
  index: number;
  defaultOpen: boolean;
  compact: boolean;
  audience: "student" | "teacher";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const name = test.name?.trim() || `Test ${index + 1}`;
  const statusText = test.passed
    ? "geslaagd"
    : test.timedOut
      ? "tijdslimiet"
      : "niet geslaagd";

  if (test.hidden && audience === "student") {
    return (
      <li
        className={cn(
          "flex items-center gap-3 rounded-lg border",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <TestIcon test={test} />
        <EyeOff
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
        <span className="text-sm">
          Verborgen test –{" "}
          <span className={test.passed ? "text-success" : "text-destructive"}>
            {test.passed ? "geslaagd" : "niet geslaagd"}
          </span>
        </span>
      </li>
    );
  }

  return (
    <li className="rounded-lg border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            "hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2",
            compact ? "px-3 py-2" : "px-4 py-3",
          )}
        >
          <TestIcon test={test} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            {!open && !test.passed && test.feedback && !compact ? (
              <span className="text-muted-foreground block truncate text-xs">
                <FeedbackText text={test.feedback} />
              </span>
            ) : null}
          </span>
          {test.hidden ? (
            <Badge variant="secondary" className="gap-1">
              <EyeOff aria-hidden="true" />
              verborgen
            </Badge>
          ) : null}
          {test.kind === "function" ? (
            <Badge variant="outline" className="hidden sm:inline-flex">
              functie
            </Badge>
          ) : null}
          <span className="sr-only">{statusText}</span>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className={cn(
              "flex flex-col gap-3 border-t",
              compact ? "p-3" : "p-4",
            )}
          >
            {test.kind === "io" ? (
              <IoDetails test={test} />
            ) : (
              <FunctionDetails test={test} />
            )}
            {test.feedback ? (
              <p
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  test.passed
                    ? "bg-muted/50 text-muted-foreground"
                    : "bg-destructive/5 text-foreground",
                )}
              >
                <FeedbackText text={test.feedback} />
              </p>
            ) : null}
            {test.error ? <PythonErrorCard error={test.error} compact /> : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {check.passed ? (
        <CircleCheck
          className="text-success mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <CircleX
          className="text-destructive mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      )}
      <span>
        <FeedbackText text={check.message} />
        <span className="sr-only">
          {check.passed ? " (in orde)" : " (niet in orde)"}
        </span>
      </span>
    </li>
  );
}

/** Summary + per-test results (collapsible) + static checks. */
export function TestResultsList({
  result,
  compact = false,
  audience = "student",
  className,
}: TestResultsListProps) {
  const total = result.tests.length;
  const passed = result.tests.filter((t) => t.passed).length;
  const firstFailed = result.tests.findIndex(
    (t) => !t.passed && (!t.hidden || audience === "teacher"),
  );
  const label = STATUS_LABEL[result.status];

  return (
    <div
      className={cn("flex flex-col", compact ? "gap-3" : "gap-4", className)}
    >
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border",
          compact ? "p-3" : "p-4",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
            {total === 0
              ? "Geen tests"
              : `${passed} van ${total} ${total === 1 ? "test" : "tests"} geslaagd`}
          </p>
          {label ? <Badge variant={label.variant}>{label.text}</Badge> : null}
          <span className="text-muted-foreground ml-auto text-sm tabular-nums">
            Score {formatPercent(result.fraction)}
          </span>
        </div>
        <Progress
          value={total ? (passed / total) * 100 : 0}
          aria-label={`${passed} van ${total} tests geslaagd`}
          className={cn(
            passed === total && total > 0
              ? "[&>[data-slot=progress-indicator]]:bg-success"
              : "",
          )}
        />
      </div>

      {result.error ? (
        <PythonErrorCard error={result.error} compact={compact} />
      ) : null}

      {total > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Testresultaten">
          {result.tests.map((t, i) => (
            <TestRow
              key={t.testId}
              test={t}
              index={i}
              compact={compact}
              audience={audience}
              defaultOpen={
                !compact &&
                i === firstFailed &&
                result.status !== "syntax_error"
              }
            />
          ))}
        </ul>
      ) : null}

      {result.checks.length > 0 ? (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg border",
            compact ? "p-3" : "p-4",
          )}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <ListChecks
              className="text-muted-foreground size-4"
              aria-hidden="true"
            />
            Eisen aan je code
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.checks.map((c) => (
              <CheckRow key={c.checkId} check={c} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

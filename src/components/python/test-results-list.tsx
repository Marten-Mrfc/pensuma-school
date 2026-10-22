"use client";

import {
  ChevronDown,
  CircleCheck,
  CircleX,
  EyeOff,
  ListChecks,
  Timer,
} from "lucide-react";
import { useId, useState } from "react";
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
import { testsSummary } from "./announcements";
import { FeedbackText } from "./feedback-text";
import { PythonErrorCard } from "./python-error-card";
import {
  markWhitespace,
  needsWhitespaceLegend,
  WHITESPACE_LEGEND,
} from "./whitespace";

type HeadingLevel = 2 | 3 | 4 | 5;

export type TestResultsListProps = {
  result: CodeGradingResult;
  /** Denser layout, all tests collapsed (e.g. in a side panel or table row). */
  compact?: boolean;
  /**
   * "student" (default): hidden tests show only "Verborgen test 2: goed /
   * fout". "teacher": hidden tests are shown in full (input, expected,
   * actual, feedback, error) with a "verborgen" badge.
   */
  audience?: "student" | "teacher";
  /** Level of the summary heading ("3 van 5 tests goed"). Default 3. */
  headingLevel?: HeadingLevel;
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

/** Lines above which an output box can scroll (so it must be focusable). */
const SCROLLABLE_LINES = 10;

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

type Outcome = "passed" | "slow" | "failed";

function outcomeOf(test: TestResult): Outcome {
  if (test.passed) return "passed";
  if (test.timedOut) return "slow";
  return "failed";
}

/** Icon plus a visible word: the result never depends on colour alone. */
const OUTCOME = {
  passed: { word: "Goed", Icon: CircleCheck, color: "text-success-ink" },
  slow: { word: "Te langzaam", Icon: Timer, color: "text-warning-ink" },
  failed: { word: "Fout", Icon: CircleX, color: "text-destructive-ink" },
} as const;

function OutcomeLabel({
  outcome,
  className,
}: {
  outcome: Outcome;
  className?: string;
}) {
  const { word, Icon, color } = OUTCOME[outcome];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold",
        color,
        className,
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {word}
    </span>
  );
}

function OutputBlock({
  label,
  lines,
  empty,
  highlight,
  className,
}: {
  label: string;
  lines: DiffLine[] | string[];
  empty: string;
  highlight?: "missing" | "extra";
  className?: string;
}) {
  const scrollable = lines.length > SCROLLABLE_LINES;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd
        translate="no"
        // Long output scrolls, so it must be reachable by keyboard (WCAG 2.1.1).
        tabIndex={scrollable ? 0 : undefined}
        className="bg-muted/40 focus-visible:ring-ring max-h-56 min-h-[2.25rem] overflow-auto rounded-md border px-2 py-1.5 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2"
      >
        {lines.length === 0 ? (
          <span
            translate="yes"
            className="text-muted-foreground font-sans italic"
          >
            {empty}
          </span>
        ) : (
          lines.map((l, i) => {
            const line =
              typeof l === "string" ? { text: l, status: "same" as const } : l;
            const changed = highlight && line.status === "changed";
            if (changed) {
              return (
                <mark
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines of a static text
                  key={i}
                  className={cn(
                    "text-foreground -mx-1 block rounded-sm px-1 break-words whitespace-pre-wrap",
                    highlight === "missing"
                      ? "bg-success/15"
                      : "bg-destructive/15",
                  )}
                >
                  {markWhitespace(line.text)}
                  <span className="sr-only"> (verschilt)</span>
                </mark>
              );
            }
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: lines of a static text
                key={i}
                className="-mx-1 rounded-sm px-1 break-words whitespace-pre-wrap"
              >
                {line.text === "" ? " " : line.text}
              </div>
            );
          })
        )}
      </dd>
    </div>
  );
}

function WhitespaceLegend({ show }: { show: boolean }) {
  return show ? <p className="sr-only">{WHITESPACE_LEGEND}</p> : null;
}

function IoDetails({ test }: { test: TestResult }) {
  const expected = normalizeLines(test.expected ?? "");
  const actual = normalizeLines(test.actual ?? "");
  const diff = test.passed ? null : diffLines(expected, actual);
  const stdinLines = normalizeLines(test.stdin ?? "");
  const legend = diff
    ? needsWhitespaceLegend(diff.expected) || needsWhitespaceLegend(diff.actual)
    : false;
  return (
    <>
      <WhitespaceLegend show={legend} />
      <dl className="grid gap-3 sm:grid-cols-3">
        <OutputBlock label="Invoer" lines={stdinLines} empty="geen invoer" />
        <OutputBlock
          label="Verwacht"
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
      </dl>
    </>
  );
}

function FunctionDetails({ test }: { test: TestResult }) {
  const printed = normalizeLines(test.stdout ?? "");
  const actualLines: DiffLine[] =
    test.actual !== undefined
      ? [{ text: test.actual, status: test.passed ? "same" : "changed" }]
      : [];
  return (
    <>
      <WhitespaceLegend show={needsWhitespaceLegend(actualLines)} />
      <dl className="grid gap-3 sm:grid-cols-3">
        <OutputBlock
          label="Aanroep"
          lines={test.call ? [test.call] : []}
          empty="–"
        />
        <OutputBlock
          label="Verwacht"
          lines={test.expected ? [test.expected] : []}
          empty="–"
        />
        <OutputBlock
          label="Jouw waarde"
          lines={actualLines}
          empty={test.error ? "fout (zie hieronder)" : "–"}
          highlight={test.passed ? undefined : "extra"}
        />
        {printed.length > 0 ? (
          <OutputBlock
            label="Geprint door je programma"
            lines={printed}
            empty=""
            className="sm:col-span-3"
          />
        ) : null}
      </dl>
    </>
  );
}

function TestRow({
  test,
  index,
  hiddenIndex,
  defaultOpen,
  compact,
  audience,
  headingLevel,
}: {
  test: TestResult;
  index: number;
  /** 1-based position among the hidden tests. */
  hiddenIndex: number;
  defaultOpen: boolean;
  compact: boolean;
  audience: "student" | "teacher";
  headingLevel: HeadingLevel;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const name = test.name?.trim() || `Test ${index + 1}`;
  const outcome = outcomeOf(test);

  if (test.hidden && audience === "student") {
    return (
      <li
        className={cn(
          "flex items-center gap-3 rounded-lg border",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <EyeOff
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 text-sm">
          Verborgen test {hiddenIndex}
          <span className="sr-only">: {test.passed ? "goed" : "fout"}</span>
        </span>
        <span aria-hidden="true">
          <OutcomeLabel outcome={test.passed ? "passed" : "failed"} />
        </span>
      </li>
    );
  }

  return (
    <li className="rounded-lg border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            "hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2",
            compact ? "px-3 py-2" : "px-4 py-3",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {name}
              <span className="sr-only">: {OUTCOME[outcome].word}</span>
            </span>
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
          <span aria-hidden="true">
            <OutcomeLabel outcome={outcome} />
          </span>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform motion-reduce:transition-none",
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
            {test.error ? (
              <PythonErrorCard
                error={test.error}
                compact
                announce={false}
                headingLevel={nextLevel(headingLevel)}
              />
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function nextLevel(level: HeadingLevel): 3 | 4 | 5 | 6 {
  return (level + 1) as 3 | 4 | 5 | 6;
}

function CheckRow({ check }: { check: CheckResult }) {
  const Icon = check.passed ? CircleCheck : CircleX;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          check.passed ? "text-success-ink" : "text-destructive-ink",
        )}
        aria-hidden="true"
      />
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
  headingLevel = 3,
  className,
}: TestResultsListProps) {
  const headingId = useId();
  const total = result.tests.length;
  const passed = result.tests.filter((t) => t.passed).length;
  const firstFailed = result.tests.findIndex(
    (t) => !t.passed && (!t.hidden || audience === "teacher"),
  );
  const label = STATUS_LABEL[result.status];
  const Heading = `h${headingLevel}` as const;
  const SubHeading = `h${nextLevel(headingLevel)}` as const;
  const hiddenIndexes = new Map<string, number>();
  for (const t of result.tests) {
    if (t.hidden) hiddenIndexes.set(t.testId, hiddenIndexes.size + 1);
  }

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
          <Heading
            id={headingId}
            className={cn("font-semibold", compact ? "text-sm" : "text-base")}
          >
            {testsSummary(passed, total)}
          </Heading>
          {label ? <Badge variant={label.variant}>{label.text}</Badge> : null}
          <span className="text-muted-foreground ml-auto text-sm tabular-nums">
            Score {formatPercent(result.fraction)}
          </span>
        </div>
        {total > 0 ? (
          <Progress
            value={(passed / total) * 100}
            aria-label="Tests goed"
            aria-valuetext={`${passed} van ${total}`}
            className={cn(
              passed === total
                ? "[&>[data-slot=progress-indicator]]:bg-success"
                : "",
            )}
          />
        ) : null}
      </div>

      {result.error ? (
        <PythonErrorCard
          error={result.error}
          compact={compact}
          announce={false}
          headingLevel={nextLevel(headingLevel)}
        />
      ) : null}

      {total > 0 ? (
        <ul className="flex flex-col gap-2" aria-labelledby={headingId}>
          {result.tests.map((t, i) => (
            <TestRow
              key={t.testId}
              test={t}
              index={i}
              hiddenIndex={hiddenIndexes.get(t.testId) ?? 0}
              compact={compact}
              audience={audience}
              headingLevel={headingLevel}
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
          <SubHeading className="flex items-center gap-2 text-sm font-medium">
            <ListChecks
              className="text-muted-foreground size-4"
              aria-hidden="true"
            />
            Eisen aan je code
          </SubHeading>
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

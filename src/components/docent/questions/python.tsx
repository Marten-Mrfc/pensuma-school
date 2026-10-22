"use client";

/**
 * Adapter for the shared Python components (src/components/python) so the
 * builder imports them from one place.
 * TEMPORARY fallbacks until the grader workstream lands its components.
 */
import { CircleCheck, CircleX, FlaskConical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PythonRunner } from "@/lib/python/types";
import type {
  CodeCheck,
  CodeGradingResult,
  CodeTest,
} from "@/lib/questions/schema";

export function usePythonRunner(): PythonRunner {
  const unavailable = async (): Promise<never> => {
    throw new Error("Python in de browser is nog niet beschikbaar.");
  };
  return {
    status: "idle",
    interactive: false,
    loadError: null,
    preload: () => {},
    run: unavailable,
    grade: unavailable,
    stop: () => {},
  };
}

export function CodeRunPanel(_props: {
  code: string;
  defaultStdin?: string;
  disabled?: boolean;
  timeLimitMs?: number;
}) {
  return (
    <div className="rounded-lg border bg-[var(--code-bg)] p-3">
      <Button size="sm" variant="secondary" disabled>
        <Play aria-hidden="true" />
        Uitvoeren
      </Button>
    </div>
  );
}

export function SelfTestButton(_props: {
  code: string;
  tests: CodeTest[];
  checks: CodeCheck[];
  timeLimitMs: number;
  disabled?: boolean;
  onResult?: (result: CodeGradingResult) => void;
}) {
  return (
    <Button size="sm" variant="outline" disabled>
      <FlaskConical aria-hidden="true" />
      Testen
    </Button>
  );
}

export function TestResultsList({
  result,
}: {
  result: CodeGradingResult;
  compact?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {result.tests.map((t) => (
        <li key={t.testId} className="flex items-center gap-2 text-sm">
          {t.passed ? (
            <CircleCheck
              className="size-4 text-success-ink"
              aria-hidden="true"
            />
          ) : (
            <CircleX
              className="size-4 text-destructive-ink"
              aria-hidden="true"
            />
          )}
          {t.name || t.testId}
          {t.feedback ? (
            <span className="text-muted-foreground">— {t.feedback}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

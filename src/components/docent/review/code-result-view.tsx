"use client";

import {
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  ShieldX,
  Timer,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { CodeGradingResult, TestResult } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<CodeGradingResult["status"], string> = {
  ok: "Uitgevoerd",
  syntax_error: "Syntaxfout",
  timeout: "Te lang bezig (time-out)",
  runtime_error: "Fout tijdens uitvoeren",
  internal_error: "Fout in de nakijker",
};

/**
 * Teacher view of a code grading result: every test (hidden ones included,
 * unredacted), the static checks and any error.
 */
export function CodeResultView({ result }: { result: CodeGradingResult }) {
  const passed = result.tests.filter((t) => t.passed).length;
  const total = result.tests.length;
  const allPassed =
    total > 0 && passed === total && result.checks.every((c) => c.passed);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold",
            allPassed
              ? "text-success-ink"
              : passed > 0
                ? "text-warning-ink"
                : "text-destructive-ink",
          )}
        >
          {allPassed ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <XCircle className="size-4" aria-hidden="true" />
          )}
          {total
            ? `${passed} van ${total} ${total === 1 ? "test" : "tests"} geslaagd`
            : "Geen tests"}
        </span>
        {result.status !== "ok" ? (
          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-sm bg-destructive/10 px-2 text-xs font-medium whitespace-nowrap text-destructive-ink">
            {STATUS_TEXT[result.status]}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(result.fraction * 100)}% van de punten
        </span>
      </div>

      {result.error ? <ErrorBlock error={result.error} /> : null}

      {result.tests.length ? (
        <ul className="flex flex-col gap-1.5">
          {result.tests.map((t, i) => (
            <TestRow key={t.testId || i} test={t} index={i} />
          ))}
        </ul>
      ) : null}

      {result.checks.length ? (
        <ul className="flex flex-col gap-1">
          {result.checks.map((c) => (
            <li
              key={c.checkId}
              className={cn(
                "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                c.passed
                  ? "bg-success/8 text-success-ink"
                  : "bg-destructive/8 text-destructive-ink",
              )}
            >
              {c.passed ? (
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <ShieldX
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span>
                {c.message ||
                  (c.passed ? "Controle geslaagd" : "Controle niet geslaagd")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TestRow({ test: t, index }: { test: TestResult; index: number }) {
  const [open, setOpen] = useState(!t.passed);
  return (
    <li
      className={cn(
        // The focus indicator is the row's own outline: overflow-hidden
        // would clip a ring on the button, and outlines also show in
        // forced-colors mode.
        "overflow-hidden rounded-lg border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        t.passed ? "border-success/25" : "border-destructive/25",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none",
          t.passed ? "bg-success/6" : "bg-destructive/6",
        )}
      >
        {t.passed ? (
          <CheckCircle2
            className="size-4 shrink-0 text-success"
            aria-label="Geslaagd"
          />
        ) : (
          <XCircle
            className="size-4 shrink-0 text-destructive"
            aria-label="Niet geslaagd"
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {t.name || `Test ${index + 1}`}
        </span>
        {t.hidden ? (
          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-sm bg-muted px-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
            Verborgen
          </span>
        ) : null}
        {t.timedOut ? (
          <Timer
            className="size-4 shrink-0 text-warning-ink"
            aria-label="Time-out"
          />
        ) : null}
        <span className="shrink-0 text-xs text-muted-foreground">
          {t.kind === "function" ? "functie" : "invoer/uitvoer"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="grid gap-2 border-t bg-card px-3 py-3 text-xs sm:grid-cols-2">
          {t.kind === "io" && t.stdin != null ? (
            <Pre label="Invoer" value={t.stdin || "(geen invoer)"} />
          ) : null}
          {t.expected != null ? (
            <Pre
              label={
                t.kind === "function"
                  ? "Aanroep → verwacht"
                  : "Verwachte uitvoer"
              }
              value={t.expected}
            />
          ) : null}
          {t.actual != null ? (
            <Pre
              label={
                t.kind === "function"
                  ? "Teruggegeven"
                  : "Uitvoer van de leerling"
              }
              value={t.actual || "(geen uitvoer)"}
              tone={t.passed ? undefined : "bad"}
            />
          ) : null}
          {t.kind === "function" && t.stdout ? (
            <Pre label="Geprint" value={t.stdout} />
          ) : null}
          {t.feedback ? (
            <p className="text-muted-foreground sm:col-span-2">{t.feedback}</p>
          ) : null}
          {t.error ? (
            <div className="sm:col-span-2">
              <ErrorBlock error={t.error} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Pre({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-medium text-muted-foreground">{label}</span>
      <pre
        className={cn(
          "max-h-48 overflow-auto rounded-md border bg-[var(--code-bg)] px-2.5 py-2 font-mono text-xs whitespace-pre-wrap",
          tone === "bad" && "border-destructive/30",
        )}
      >
        {value}
      </pre>
    </div>
  );
}

function ErrorBlock({
  error,
}: {
  error: NonNullable<CodeGradingResult["error"]>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/25 bg-destructive/[0.05] px-3 py-2 text-xs">
      <span className="font-semibold text-destructive-ink">
        {error.type}
        {error.line != null ? ` (regel ${error.line})` : ""}: {error.message}
      </span>
      {error.traceback ? (
        <pre className="max-h-40 overflow-auto font-mono whitespace-pre-wrap text-muted-foreground">
          {error.traceback}
        </pre>
      ) : null}
    </div>
  );
}

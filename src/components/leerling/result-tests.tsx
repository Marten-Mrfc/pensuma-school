"use client";

import { CheckCircle2, Lock, XCircle } from "lucide-react";
import type { CodeGradingResult, TestResult } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";

function Block({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "error";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <pre
        className={cn(
          "max-h-48 overflow-auto rounded-md border bg-[var(--code-bg)] px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--code-fg)]",
          tone === "error" && "border-destructive/30 text-destructive-ink",
        )}
      >
        {value || " "}
      </pre>
    </div>
  );
}

function TestRow({ test }: { test: TestResult }) {
  const Icon = test.passed ? CheckCircle2 : XCircle;
  const details = !test.hidden && !test.passed;
  return (
    <li className="rounded-lg border bg-card">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Icon
          className={cn(
            "size-[18px] shrink-0",
            test.passed ? "text-success-ink" : "text-destructive-ink",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {test.name || (test.kind === "function" ? "Functietest" : "Test")}
        </span>
        {test.hidden ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            verborgen
          </span>
        ) : null}
        <span className="sr-only">
          {test.passed ? "geslaagd" : "niet geslaagd"}
        </span>
        {test.timedOut ? (
          <span className="text-xs font-medium text-warning-ink">te traag</span>
        ) : null}
      </div>
      {details ? (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          {test.feedback ? <p className="text-sm">{test.feedback}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {test.stdin ? <Block label="Invoer" value={test.stdin} /> : null}
            {test.expected != null ? (
              <Block
                label={
                  test.kind === "function" ? "Verwacht" : "Verwachte uitvoer"
                }
                value={test.expected}
              />
            ) : null}
            {test.actual != null ? (
              <Block
                label={
                  test.kind === "function" ? "Jouw functie gaf" : "Jouw uitvoer"
                }
                value={test.actual}
              />
            ) : null}
          </div>
          {test.error ? (
            <Block
              label="Foutmelding"
              tone="error"
              value={`${test.error.type}: ${test.error.message}${test.error.line ? ` (regel ${test.error.line})` : ""}`}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Test results of a graded code answer (already redacted by the server). */
export function ResultTests({ result }: { result: CodeGradingResult }) {
  const passed = result.tests.filter((t) => t.passed).length;
  return (
    <div className="flex flex-col gap-2.5">
      {result.error && result.status === "syntax_error" ? (
        <Block
          label="Je code bevat een fout, daardoor kon geen enkele test draaien"
          tone="error"
          value={`${result.error.type}: ${result.error.message}${result.error.line ? ` (regel ${result.error.line})` : ""}`}
        />
      ) : null}
      {result.tests.length ? (
        <>
          <p className="text-sm text-muted-foreground">
            {passed} van de {result.tests.length} tests geslaagd
          </p>
          <ul className="flex flex-col gap-2">
            {result.tests.map((t) => (
              <TestRow key={t.testId} test={t} />
            ))}
          </ul>
        </>
      ) : null}
      {result.checks.length ? (
        <ul className="flex flex-col gap-1.5">
          {result.checks.map((c) => (
            <li key={c.checkId} className="flex items-center gap-2 text-sm">
              {c.passed ? (
                <CheckCircle2
                  className="size-4 text-success-ink"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="size-4 text-destructive-ink"
                  aria-hidden="true"
                />
              )}
              {c.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

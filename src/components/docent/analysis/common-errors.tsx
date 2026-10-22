"use client";

import { Bug, FlaskConical, ListChecks } from "lucide-react";
import type { RouterOutputs } from "@/trpc/react";
import { students } from "./format";

type CodeErrors = RouterOutputs["analysis"]["assignment"]["codeErrors"];

const MAX_TESTS = 5;

/** Common mistakes per code question (teachers only, hidden tests included). */
export function CommonErrors({ questions }: { questions: CodeErrors }) {
  const withFindings = questions.filter(
    (q) =>
      q.summary.errorTypes.length > 0 ||
      q.summary.tests.some((t) => t.failed > 0) ||
      q.summary.checks.some((c) => c.failed > 0),
  );
  if (!withFindings.length) {
    return (
      <p className="rounded-xl border border-dashed bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
        Geen veelgemaakte fouten bij de programmeervragen.
      </p>
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {withFindings.map((q) => {
        const tests = q.summary.tests
          .filter((t) => t.failed > 0)
          .sort((a, b) => b.rate - a.rate)
          .slice(0, MAX_TESTS);
        const checks = q.summary.checks.filter((c) => c.failed > 0);
        return (
          <li
            key={q.questionId}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs"
          >
            <h3 className="font-semibold">
              <span className="mr-2 text-xs text-muted-foreground tabular-nums">
                V{q.number}
              </span>
              {q.title}
            </h3>
            {q.summary.errorTypes.length ? (
              <div className="flex flex-col gap-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Bug className="size-3.5" aria-hidden="true" />
                  Foutmeldingen
                </h4>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {q.summary.errorTypes.map((e) => (
                    <li key={e.type} className="flex flex-col">
                      <span>
                        <span className="font-mono text-xs font-semibold">
                          {e.type}
                        </span>{" "}
                        – {e.explanation.replace(/\.$/, "")}:{" "}
                        <strong className="tabular-nums">
                          {students(e.count)}
                        </strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tests.length ? (
              <div className="flex flex-col gap-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <FlaskConical className="size-3.5" aria-hidden="true" />
                  Tests
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {tests.map((t) => (
                    <li key={t.testId}>
                      Test ‘{t.name}’{t.hidden ? " (verborgen)" : ""} mislukt
                      bij{" "}
                      <strong className="tabular-nums">
                        {t.failed} van {t.total}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {checks.length ? (
              <div className="flex flex-col gap-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <ListChecks className="size-3.5" aria-hidden="true" />
                  Eisen
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {checks.map((c) => (
                    <li key={c.checkId}>
                      Eis ‘{c.label}’ niet gehaald:{" "}
                      <strong className="tabular-nums">{c.failed}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

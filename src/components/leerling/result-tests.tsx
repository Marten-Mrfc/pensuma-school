"use client";

import type { CodeGradingResult } from "@/lib/questions/schema";

/** Test results of a graded code answer (already redacted by the server). */
export function ResultTests({ result }: { result: CodeGradingResult }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {result.tests.map((t) => (
        <li key={t.testId}>
          {t.passed ? "✓" : "✗"} {t.name}
        </li>
      ))}
    </ul>
  );
}

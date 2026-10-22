/**
 * Common mistakes per question, for the toetsanalyse (teachers only: hidden
 * tests are included). Pure module.
 */
import { explainError } from "@/lib/python/explain";
import {
  CODE_CONSTRUCT_LABELS,
  type CodeCheck,
  type CodeGradingResult,
  type CodeTest,
} from "@/lib/questions/schema";

export type CodeStatus = CodeGradingResult["status"];

export type ErrorTypeCount = {
  type: string;
  /** Dutch title, e.g. "Te weinig invoer". */
  title: string;
  /** Plain Dutch explanation. */
  explanation: string;
  /** Number of answers (students) that hit this error at least once. */
  count: number;
};

export type TestFailure = {
  testId: string;
  name: string;
  hidden: boolean;
  failed: number;
  total: number;
  rate: number;
};

export type CheckFailure = {
  checkId: string;
  label: string;
  failed: number;
  total: number;
  rate: number;
};

export type CodeErrorSummary = {
  /** Answers with a grading result. */
  graded: number;
  statusCounts: Record<CodeStatus, number>;
  errorTypes: ErrorTypeCount[];
  tests: TestFailure[];
  checks: CheckFailure[];
};

const STATUSES: CodeStatus[] = [
  "ok",
  "syntax_error",
  "timeout",
  "runtime_error",
  "internal_error",
];

/** Dutch label of a code check, e.g. "for-lus" or "geen while-lus". */
export function checkLabel(
  check: Pick<CodeCheck, "kind" | "construct" | "value" | "message">,
): string {
  const base = CODE_CONSTRUCT_LABELS[check.construct] ?? check.construct;
  const withValue = check.value ? `${base} ${check.value}` : base;
  return check.kind === "forbids" ? `geen ${withValue}` : withValue;
}

/** Fallback test name: "Test 3". */
function testName(test: Pick<CodeTest, "name"> | undefined, index: number) {
  return test?.name?.trim() || `Test ${index + 1}`;
}

/**
 * Aggregate the grading results of one code question. `data` (the
 * question's tests and checks) gives names and order; results for tests or
 * checks that no longer exist are still counted under their stored name.
 */
export function aggregateCodeResults(
  results: readonly (CodeGradingResult | null | undefined)[],
  data?: {
    tests?: readonly Pick<CodeTest, "id" | "name" | "hidden">[];
    checks?: readonly Pick<
      CodeCheck,
      "id" | "kind" | "construct" | "value" | "message"
    >[];
  },
  options: { topErrors?: number } = {},
): CodeErrorSummary {
  const statusCounts = Object.fromEntries(
    STATUSES.map((s) => [s, 0]),
  ) as Record<CodeStatus, number>;
  const errorCounts = new Map<string, number>();
  const tests = new Map<string, TestFailure>();
  const checks = new Map<string, CheckFailure>();

  (data?.tests ?? []).forEach((t, i) => {
    tests.set(t.id, {
      testId: t.id,
      name: testName(t, i),
      hidden: t.hidden,
      failed: 0,
      total: 0,
      rate: 0,
    });
  });
  for (const c of data?.checks ?? []) {
    checks.set(c.id, {
      checkId: c.id,
      label: checkLabel(c),
      failed: 0,
      total: 0,
      rate: 0,
    });
  }

  let graded = 0;
  for (const result of results) {
    if (!result || result.kind !== "code") continue;
    graded++;
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;

    const types = new Set<string>();
    if (result.error?.type) types.add(result.error.type);
    for (const t of result.tests) {
      if (t.error?.type) types.add(t.error.type);
      else if (t.timedOut) types.add("TimeoutError");
    }
    types.delete("InternalError");
    for (const type of types)
      errorCounts.set(type, (errorCounts.get(type) ?? 0) + 1);

    result.tests.forEach((t, i) => {
      const entry = tests.get(t.testId) ?? {
        testId: t.testId,
        name: t.name?.trim() || `Test ${i + 1}`,
        hidden: t.hidden,
        failed: 0,
        total: 0,
        rate: 0,
      };
      entry.total++;
      if (!t.passed) entry.failed++;
      tests.set(t.testId, entry);
    });
    for (const c of result.checks) {
      const entry = checks.get(c.checkId) ?? {
        checkId: c.checkId,
        label: c.message || c.checkId,
        failed: 0,
        total: 0,
        rate: 0,
      };
      entry.total++;
      if (!c.passed) entry.failed++;
      checks.set(c.checkId, entry);
    }
  }

  const errorTypes = [...errorCounts.entries()]
    .map(([type, count]) => {
      const explained = explainError({
        type,
        message: "",
        line: null,
        traceback: "",
      });
      return {
        type,
        title: explained.title,
        explanation: explained.explanation,
        count,
      };
    })
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .slice(0, options.topErrors ?? 5);

  const withRate = <T extends { failed: number; total: number; rate: number }>(
    x: T,
  ): T => ({ ...x, rate: x.total ? x.failed / x.total : 0 });

  return {
    graded,
    statusCounts,
    errorTypes,
    tests: [...tests.values()].filter((t) => t.total > 0).map(withRate),
    checks: [...checks.values()].filter((c) => c.total > 0).map(withRate),
  };
}

export type ChoiceCount = {
  id: string;
  text: string;
  correct: boolean;
  count: number;
  /** Share of the students who answered (0..1). */
  percentage: number;
};

export type ChoiceSummary = {
  /** Students who selected at least one option. */
  answered: number;
  /** Students without a selection. */
  blank: number;
  multiple: boolean;
  options: ChoiceCount[];
};

/**
 * How often each option was picked. `percentage` is relative to the
 * students who answered, so for single-answer questions the percentages
 * sum to 100%. Unknown option ids are ignored.
 */
export function aggregateChoices(
  options: readonly { id: string; text: string; correct: boolean }[],
  responses: readonly (readonly string[] | null | undefined)[],
  multiple = false,
): ChoiceSummary {
  const valid = new Set(options.map((o) => o.id));
  const counts = new Map(options.map((o) => [o.id, 0]));
  let answered = 0;
  let blank = 0;
  for (const response of responses) {
    const picked = new Set((response ?? []).filter((id) => valid.has(id)));
    if (picked.size === 0) {
      blank++;
      continue;
    }
    answered++;
    for (const id of picked) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    answered,
    blank,
    multiple,
    options: options.map((o) => {
      const count = counts.get(o.id) ?? 0;
      return {
        id: o.id,
        text: o.text,
        correct: o.correct,
        count,
        percentage: answered ? count / answered : 0,
      };
    }),
  };
}

/** A wrong option picked by more than 30% of the students. */
export function isPopularDistractor(option: ChoiceCount): boolean {
  return !option.correct && option.percentage > 0.3;
}

/**
 * Line diff (LCS) for showing expected vs actual output side by side.
 * Lines compare case-insensitively with collapsed whitespace by default.
 */

export type DiffLine = { text: string; status: "same" | "changed" };

const MAX_LINES = 600;

export function normalizeForDiff(line: string, ignoreCase = true): string {
  const s = line.replace(/\s+/g, " ").trim();
  return ignoreCase ? s.toLowerCase() : s;
}

/**
 * Mark which expected lines are missing from the actual output and which
 * actual lines are not in the expected output.
 */
export function diffLines(
  expected: string[],
  actual: string[],
  equal: (a: string, b: string) => boolean = (a, b) =>
    normalizeForDiff(a) === normalizeForDiff(b),
): { expected: DiffLine[]; actual: DiffLine[] } {
  if (expected.length > MAX_LINES || actual.length > MAX_LINES) {
    return {
      expected: expected.map((text, i) => ({
        text,
        status: equal(text, actual[i] ?? "\u0000") ? "same" : "changed",
      })),
      actual: actual.map((text, i) => ({
        text,
        status: equal(text, expected[i] ?? "\u0000") ? "same" : "changed",
      })),
    };
  }
  const n = expected.length;
  const m = actual.length;
  const W = m + 1;
  const lcs = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * W + j] = equal(expected[i], actual[j])
        ? lcs[(i + 1) * W + j + 1] + 1
        : Math.max(lcs[(i + 1) * W + j], lcs[i * W + j + 1]);
    }
  }
  const e: DiffLine[] = expected.map((text) => ({ text, status: "changed" }));
  const a: DiffLine[] = actual.map((text) => ({ text, status: "changed" }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (equal(expected[i], actual[j])) {
      e[i].status = "same";
      a[j].status = "same";
      i++;
      j++;
    } else if (lcs[(i + 1) * W + j] >= lcs[i * W + j + 1]) i++;
    else j++;
  }
  return { expected: e, actual: a };
}

/**
 * Dutch screen-reader messages for the Python run and test components.
 * Pure (no React, no DOM), so the wording is unit-tested.
 */

/** Seconds in Dutch notation: 5000 → "5", 2500 → "2,5", 120 → "0,12". */
export function formatSecondsNl(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  return seconds.toLocaleString("nl-NL", {
    maximumFractionDigits: seconds < 1 ? 2 : 1,
  });
}

/** Number of printed lines (a trailing newline does not start a new line). */
export function countOutputLines(stdout: string): number {
  if (stdout === "") return 0;
  const text = stdout.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return text.split("\n").length;
}

/** What the run announcement needs from a RunResult. */
export type RunSummary = {
  stdout: string;
  timedOut: boolean;
  durationMs: number;
  truncated?: boolean;
  error: { type: string; line?: number | null } | null;
};

/** The ONE polite message after a run has finished. */
export function runAnnouncement(
  result: RunSummary,
  timeLimitMs: number,
): string {
  if (result.timedOut) {
    return `Je programma duurde te lang en is na ${formatSecondsNl(timeLimitMs)} seconden gestopt.`;
  }
  if (result.truncated || result.error?.type === "OutputLimitExceeded") {
    return "De uitvoer was te lang en is afgekapt.";
  }
  if (result.error) {
    if (result.error.type === "Stopped") return "Je programma is gestopt.";
    return result.error.line
      ? `Je programma stopte met een fout op regel ${result.error.line}: ${result.error.type}.`
      : `Je programma stopte met een fout: ${result.error.type}.`;
  }
  const lines = countOutputLines(result.stdout);
  if (lines === 0) return "Klaar. Geen uitvoer.";
  return `Klaar in ${formatSecondsNl(result.durationMs)} seconden. ${lines} ${
    lines === 1 ? "regel" : "regels"
  } uitvoer.`;
}

/** Accessible name of the input() field: the prompt, or a generic label. */
export function inputLabel(prompt: string | null | undefined): string {
  const text = (prompt ?? "").trim();
  return text || "Invoer voor je programma";
}

/** Polite message when the program starts waiting for input(). */
export function inputAnnouncement(prompt: string | null | undefined): string {
  const text = (prompt ?? "").trim();
  return text
    ? `Je programma wacht op invoer: ${text}`
    : "Je programma wacht op invoer.";
}

/** Polite message after "Testen" finished. */
export function selfTestAnnouncement(passed: number, total: number): string {
  if (total === 0) return "Testen klaar.";
  return `Testen klaar: ${passed} van ${total} goed.`;
}

/** Summary heading of a test result list. */
export function testsSummary(passed: number, total: number): string {
  if (total === 0) return "Geen tests";
  return `${passed} van ${total} ${total === 1 ? "test" : "tests"} goed`;
}

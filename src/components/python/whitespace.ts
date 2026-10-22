/**
 * Visible whitespace for output lines that differ from the expected output,
 * so "Hallo  Mark" (two spaces) can be told apart from "Hallo Mark".
 * Pure helpers; the list shows a screen-reader legend next to the markers.
 */

export const SPACE_MARKER = "·";
export const EMPTY_LINE_MARKER = "↵";

/** Screen-reader legend shown wherever markers are used. */
export const WHITESPACE_LEGEND =
  "Een punt staat voor een spatie, ↵ voor een nieuwe regel.";

/**
 * Text of a differing line with markers: spaces become "·" and an empty line
 * becomes "↵" (otherwise it would be invisible).
 */
export function markWhitespace(line: string): string {
  if (line === "") return EMPTY_LINE_MARKER;
  return line.replace(/ /g, SPACE_MARKER);
}

/** True when at least one line in the list will be shown with markers. */
export function needsWhitespaceLegend(
  lines: readonly { text: string; status: "same" | "changed" }[],
): boolean {
  return lines.some(
    (l) => l.status === "changed" && (l.text === "" || l.text.includes(" ")),
  );
}

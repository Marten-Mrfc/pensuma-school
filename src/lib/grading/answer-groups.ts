/**
 * "Groeperen op gelijke antwoorden": a key per answer so identical answers
 * can be graded together. Pure module (no server or browser imports).
 *
 * The teacher sees one answer and may apply its score to every answer in
 * the group, so the key may only ignore what never changes the meaning:
 *  - open: extra spaces inside a line, blank lines, a shared indentation
 *    and a full stop / ! / ? after the last word ("code.") are ignored.
 *    Everything else is kept: case, operators, minus signs, brackets and
 *    punctuation inside the text ("4" ≠ "-4", "a < b" ≠ "a > b", "True" ≠
 *    "true", "if x: print(x)" ≠ "if x print(x)"), and line breaks with
 *    their indentation, because an answer may be a piece of code;
 *  - code: Python tokens (comments, blank lines and spacing ignored;
 *    variable names, strings and indentation structure kept);
 *  - multiple_choice: the chosen option ids, in any order.
 */
import type { QuestionType } from "@/lib/questions/schema";
import { normalizeCode } from "./code-normalize";

function normalizeText(text: string): string {
  const lines: { indent: string; rest: string }[] = [];
  // NFC only: NFKC would turn "x²" into "x2".
  for (const line of text.normalize("NFC").split(/\r\n?|\n/)) {
    const indent = /^\s*/u.exec(line)?.[0] ?? "";
    const rest = line.slice(indent.length).replace(/\s+/gu, " ").trimEnd();
    if (rest) lines.push({ indent, rest });
  }
  if (lines.length === 0) return "";
  // Remove the indentation all lines share; relative indentation stays.
  let shared = lines[0].indent;
  for (const { indent } of lines) {
    while (!indent.startsWith(shared)) shared = shared.slice(0, -1);
  }
  return (
    lines
      .map(({ indent, rest }) => indent.slice(shared.length) + rest)
      .join("\n")
      // A full stop / ! / ? after the last word ("Een lus herhaalt code.");
      // "x = 3." (a float) and "print(x)." keep theirs.
      .replace(/(?<=\p{L})[.!?]+$/u, "")
  );
}

/**
 * Grouping key for a response. Blank answers all get the same key (""),
 * so callers can leave them out.
 */
export function groupKey(type: QuestionType, response: unknown): string {
  const r =
    response && typeof response === "object"
      ? (response as Record<string, unknown>)
      : {};
  switch (type) {
    case "open":
      return typeof r.text === "string" ? normalizeText(r.text) : "";
    case "code":
      return typeof r.code === "string" ? normalizeCode(r.code) : "";
    case "multiple_choice":
      return Array.isArray(r.selected)
        ? [...new Set(r.selected.filter((x) => typeof x === "string"))]
            .sort()
            .join("|")
        : "";
  }
}

export type AnswerGroup<T> = { key: string; items: T[] };

/**
 * Group items by key, keeping the first-seen order of groups and items.
 * Items with a blank key each form their own group.
 */
export function groupAnswers<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): AnswerGroup<T>[] {
  const groups: AnswerGroup<T>[] = [];
  const byKey = new Map<string, AnswerGroup<T>>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) existing.items.push(item);
    else {
      const group = { key, items: [item] };
      groups.push(group);
      if (key) byKey.set(key, group);
    }
  }
  return groups;
}

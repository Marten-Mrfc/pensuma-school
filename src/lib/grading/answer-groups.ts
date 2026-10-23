/**
 * "Groeperen op gelijke antwoorden": a key per answer so identical answers
 * can be graded together. Pure module (no server or browser imports).
 *
 * The teacher sees one answer and may apply its score to every answer in
 * the group, so the key may only ignore what never changes the meaning:
 *  - open: whitespace and sentence punctuation after a word ("code." /
 *    "lus," / "klaar!") are ignored; case, operators, minus signs, brackets
 *    and other symbols are kept ("4" ≠ "-4", "a < b" ≠ "a > b", "True" ≠
 *    "true");
 *  - code: Python tokens (comments, blank lines and spacing ignored;
 *    variable names, strings and indentation structure kept);
 *  - multiple_choice: the chosen option ids, in any order.
 */
import type { QuestionType } from "@/lib/questions/schema";
import { normalizeCode } from "./code-normalize";

function normalizeText(text: string): string {
  return (
    text
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      // Sentence punctuation directly after a word, at a word end ("lus,"
      // "code." "klaar!"); "1, 2", "x[1:]" and "3.5" keep theirs.
      .replace(/(?<=\p{L})[.,;:!?]+(?=\s|$)/gu, "")
      // A full stop / ! / ? at the very end of the answer ("print(x).").
      .replace(/[.!?]+$/u, "")
      .replace(/\s+/gu, " ")
      .trim()
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

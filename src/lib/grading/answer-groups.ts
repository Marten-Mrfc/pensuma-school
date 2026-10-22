/**
 * "Groeperen op gelijke antwoorden": a key per answer so identical answers
 * can be graded together. Pure module (no server or browser imports).
 *
 *  - open: lower-case, whitespace collapsed, punctuation ignored;
 *  - code: Python tokens (comments, blank lines and spacing ignored;
 *    variable names, strings and indentation structure kept);
 *  - multiple_choice: the chosen option ids, in any order.
 */
import { tokenizePython } from "@/lib/python/tokenize";
import type { QuestionType } from "@/lib/questions/schema";

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("nl-NL")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(code: string): string {
  const { tokens } = tokenizePython(code.replace(/\r\n?/g, "\n"));
  const parts: string[] = [];
  for (const token of tokens) {
    switch (token.kind) {
      case "comment":
        break;
      case "newline":
        parts.push("⏎");
        break;
      case "indent":
        parts.push("→");
        break;
      case "dedent":
        parts.push("←");
        break;
      default:
        parts.push(token.value);
    }
  }
  // Trailing newline/dedent markers depend on how the file ends: ignore.
  while (parts.length > 0 && ["⏎", "←"].includes(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(" ");
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

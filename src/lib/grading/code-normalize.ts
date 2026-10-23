/**
 * Python code without what never changes its meaning: comments, blank lines
 * and spacing are dropped; names, strings, operators and the indentation
 * structure are kept. Pure (no server or browser imports).
 *
 * Used to group identical answers and to recognise "starter code plus a
 * comment" as a blank answer.
 */
import { tokenizePython } from "@/lib/python/tokenize";

export function normalizeCode(code: string): string {
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
  // Leading and trailing newline/dedent markers depend on how the file
  // starts and ends (comment-only lines, final newline): ignore them.
  while (parts.length > 0 && ["⏎", "←"].includes(parts[parts.length - 1])) {
    parts.pop();
  }
  while (parts.length > 0 && parts[0] === "⏎") parts.shift();
  return parts.join(" ");
}

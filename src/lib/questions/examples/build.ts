/**
 * Small builders for the example tests (pure data helpers).
 */
import type { z } from "zod";
import type { portableTestSchema } from "@/lib/questions/validate";

/** Authoring shape of a portable test (defaults are filled in on parse). */
export type PortableTestInput = z.input<typeof portableTestSchema>;
export type PortableQuestionInput = PortableTestInput["questions"][number];

/** An output test: feed `stdin`, compare printed output (flexible). */
export function io(
  id: string,
  stdin: string,
  expectedOutput: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    kind: "io" as const,
    name: stdin ? `Invoer: ${stdin.split("\n").join(", ")}` : "Uitvoer",
    stdin,
    expectedOutput,
    match: "flexible" as const,
    ...extra,
  };
}

/** A function test: compare the return value of `call` with `expected`. */
export function fn(
  id: string,
  call: string,
  expected: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    kind: "function" as const,
    name: `${call} → ${expected}`,
    call,
    expected,
    ...extra,
  };
}

/** Multiple choice options; the option ids are a, b, c, … */
export function options(texts: string[], correctIndex: number) {
  return texts.map((text, i) => ({
    id: String.fromCharCode(97 + i),
    text,
    correct: i === correctIndex,
  }));
}

/** Lines → markdown text. */
export const md = (...lines: string[]) => lines.join("\n");

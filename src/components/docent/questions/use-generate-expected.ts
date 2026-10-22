"use client";

import { useMutation } from "@tanstack/react-query";
import type { FunctionTest, IoTest, PythonError } from "@/lib/questions/schema";
import { useTRPC } from "@/trpc/react";

const VALUE_MARKER = "__PENSUMA_WAARDE__";

export type GeneratedValue =
  | { ok: true; value: string }
  | { ok: false; error: PythonError | null; message: string };

function errorMessage(error: PythonError | null, fallback: string) {
  if (!error) return fallback;
  return `${error.type}${error.line ? ` (regel ${error.line})` : ""}: ${error.message}`;
}

/** Strip trailing newlines/spaces per line, like the grader does. */
export function cleanOutput(stdout: string): string {
  return stdout
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Runs the model solution on the server (`code.generateExpected`) to fill in
 * expected outputs (io tests) or expected return values (function tests).
 */
export function useGenerateExpected() {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.code.generateExpected.mutationOptions());

  async function forIoTests(
    solution: string,
    tests: IoTest[],
    timeLimitMs: number,
  ): Promise<GeneratedValue[]> {
    const results = await mutation.mutateAsync({
      solution,
      stdins: tests.map((t) => t.stdin),
      timeLimitMs,
    });
    return tests.map((_, i) => {
      const r = results[i];
      if (!r) return { ok: false, error: null, message: "Geen resultaat ontvangen." };
      if (r.error) {
        return {
          ok: false,
          error: r.error,
          message: errorMessage(r.error, "De modeloplossing gaf een fout."),
        };
      }
      return { ok: true, value: cleanOutput(r.stdout) };
    });
  }

  async function forFunctionTests(
    solution: string,
    tests: FunctionTest[],
    timeLimitMs: number,
  ): Promise<GeneratedValue[]> {
    // One run per call: solution + print(repr(call)) after a marker line.
    const results = await Promise.all(
      tests.map((t) =>
        mutation.mutateAsync({
          solution: `${solution}\n\nprint("\\n${VALUE_MARKER}", repr(${t.call}), sep="")\n`,
          stdins: [""],
          timeLimitMs,
        }),
      ),
    );
    return results.map((list) => {
      const r = list[0];
      if (!r) return { ok: false, error: null, message: "Geen resultaat ontvangen." };
      if (r.error) {
        return {
          ok: false,
          error: r.error,
          message: errorMessage(r.error, "De aanroep gaf een fout."),
        };
      }
      const idx = r.stdout.lastIndexOf(VALUE_MARKER);
      if (idx < 0) return { ok: false, error: null, message: "Geen returnwaarde gevonden." };
      return { ok: true, value: r.stdout.slice(idx + VALUE_MARKER.length).trim() };
    });
  }

  return { forIoTests, forFunctionTests, isPending: mutation.isPending };
}

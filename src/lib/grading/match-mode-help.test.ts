/**
 * Regression (F04): the teacher help promised behaviour the grader doesn't
 * have ("hetzelfde aantal" getallen). Every example in the help must give
 * the result the help shows.
 */
import { describe, expect, test } from "bun:test";
import type { OutputMatchMode } from "@/lib/questions/schema";
import { compareOutput } from "./compare";
import { MATCH_MODE_HELP } from "./match-mode-help";

const MODES = Object.keys(MATCH_MODE_HELP) as OutputMatchMode[];

describe("MATCH_MODE_HELP examples agree with compareOutput", () => {
  for (const mode of MODES) {
    MATCH_MODE_HELP[mode].examples.forEach((example, index) => {
      const run = (output: string) =>
        compareOutput(output, example.expected, {
          match: mode,
          ignoreCase: true,
          tolerance: 0.01,
        }).passed;
      test(`${mode} #${index + 1}`, () => {
        for (const good of example.good) {
          expect({ output: good, passed: run(good) }).toEqual({
            output: good,
            passed: true,
          });
        }
        for (const bad of example.bad) {
          expect({ output: bad, passed: run(bad) }).toEqual({
            output: bad,
            passed: false,
          });
        }
      });
    });
  }

  test("the numbers help no longer claims 'hetzelfde aantal'", () => {
    expect(MATCH_MODE_HELP.numbers.summary).not.toContain("hetzelfde aantal");
  });
});

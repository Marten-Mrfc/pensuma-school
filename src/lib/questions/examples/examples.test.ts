import { describe, expect, test } from "bun:test";
import { normalizeTag } from "@/lib/questions/tags";
import {
  assertQuestionInputLimits,
  portableTestSchema,
  validateTest,
} from "@/lib/questions/validate";
import { basisExample } from "./basis";
import { functiesExample } from "./functies";
import { EXAMPLE_TESTS, getExampleTest } from "./index";
import { lussenLijstenExample } from "./lussen-lijsten";

describe("example tests", () => {
  test("there are three, with unique ids and titles", () => {
    expect(EXAMPLE_TESTS.map((e) => e.id)).toEqual([
      "basis",
      "lussen-lijsten",
      "functies",
    ]);
    expect(new Set(EXAMPLE_TESTS.map((e) => e.test.test.title)).size).toBe(3);
    expect(getExampleTest("functies")?.test.test.title).toBe("Functies");
    expect(getExampleTest("nope")).toBeUndefined();
  });

  test.each([
    ["basis", basisExample],
    ["lussen-lijsten", lussenLijstenExample],
    ["functies", functiesExample],
  ])("%s parses with portableTestSchema", (_id, source) => {
    expect(portableTestSchema.safeParse(source).success).toBe(true);
  });

  for (const example of EXAMPLE_TESTS) {
    describe(example.test.test.title, () => {
      test("validateTest reports no errors", () => {
        const validation = validateTest({
          title: example.test.test.title,
          questions: example.test.questions.map((q, i) => ({
            id: `q${i}`,
            ...q,
          })),
        });
        expect(validation.errors).toEqual([]);
        // Only "not checked yet" and "few questions" warnings are expected.
        const allowed = new Set([
          "code.solution_unchecked",
          "test.few_questions",
        ]);
        expect(validation.warnings.filter((w) => !allowed.has(w.code))).toEqual(
          [],
        );
      });

      test("fits the input limits", () => {
        for (const q of example.test.questions) {
          expect(
            assertQuestionInputLimits(q.type, q.data, {
              title: q.title,
              prompt: q.prompt,
            }),
          ).toEqual([]);
        }
      });

      test("every question has normalised tags", () => {
        for (const q of example.test.questions) {
          expect(q.tags?.length ?? 0).toBeGreaterThan(0);
          for (const tag of q.tags ?? []) expect(normalizeTag(tag)).toBe(tag);
        }
      });

      test("every code question has a hidden test, a solution and flexible output tests", () => {
        const code = example.test.questions.filter((q) => q.type === "code");
        expect(code.length).toBeGreaterThan(0);
        for (const q of code) {
          if (q.type !== "code") continue;
          expect(q.data.tests.some((t) => t.hidden)).toBe(true);
          expect(q.data.tests.some((t) => !t.hidden)).toBe(true);
          expect(q.data.solution.trim()).not.toBe("");
          for (const t of q.data.tests) {
            if (t.kind === "io") {
              expect(["flexible", "numbers"]).toContain(t.match);
            }
          }
        }
      });

      test("multiple choice questions have exactly one correct option", () => {
        for (const q of example.test.questions) {
          if (q.type !== "multiple_choice") continue;
          expect(q.data.options.filter((o) => o.correct)).toHaveLength(1);
        }
      });
    });
  }
});

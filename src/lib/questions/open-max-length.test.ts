/**
 * W06: an open question's `maxLength` never exceeds what a student can
 * actually save (openResponseSchema), and stored questions with a larger
 * value still parse.
 */
import { describe, expect, test } from "bun:test";
import {
  OPEN_ANSWER_MAX_LENGTH,
  openQuestionDataSchema,
  openResponseSchema,
  parseQuestionData,
  questionDataForStudent,
  questionDataSchemas,
  typedQuestionDataSchema,
} from "./schema";

describe("open question maxLength", () => {
  test("is the same limit as the answer schema", () => {
    expect(OPEN_ANSWER_MAX_LENGTH).toBe(20_000);
    const atLimit = "a".repeat(OPEN_ANSWER_MAX_LENGTH);
    expect(openResponseSchema.safeParse({ text: atLimit }).success).toBe(true);
    expect(openResponseSchema.safeParse({ text: `${atLimit}a` }).success).toBe(
      false,
    );
  });

  test("values within the limit are kept", () => {
    expect(openQuestionDataSchema.parse({ maxLength: 500 }).maxLength).toBe(
      500,
    );
    expect(
      openQuestionDataSchema.parse({ maxLength: OPEN_ANSWER_MAX_LENGTH })
        .maxLength,
    ).toBe(OPEN_ANSWER_MAX_LENGTH);
    expect(openQuestionDataSchema.parse({}).maxLength).toBeUndefined();
  });

  test("a larger stored value still parses, clamped to the answer limit", () => {
    // Existing rows (saved before the cap) must not fall back to defaults.
    const stored = {
      modelAnswer: "Een lus herhaalt code.",
      rubric: "",
      maxLength: 50_000,
      rubricItems: [{ id: "r1", label: "Noemt herhaling", points: 1 }],
    };
    const parsed = questionDataSchemas.open.safeParse(stored);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.maxLength).toBe(OPEN_ANSWER_MAX_LENGTH);
    expect(parsed.data?.modelAnswer).toBe("Een lus herhaalt code.");
    expect(parsed.data?.rubricItems).toHaveLength(1);

    expect(parseQuestionData("open", stored).maxLength).toBe(
      OPEN_ANSWER_MAX_LENGTH,
    );
    const typed = typedQuestionDataSchema.parse({ type: "open", data: stored });
    expect(typed.type === "open" && typed.data.maxLength).toBe(
      OPEN_ANSWER_MAX_LENGTH,
    );
  });

  test("students are never promised more than they can save", () => {
    const data = parseQuestionData("open", { maxLength: 1_000_000 });
    expect(questionDataForStudent({ type: "open", data })).toEqual({
      maxLength: OPEN_ANSWER_MAX_LENGTH,
    });
  });

  test("invalid values are still rejected", () => {
    expect(openQuestionDataSchema.safeParse({ maxLength: 0 }).success).toBe(
      false,
    );
    expect(openQuestionDataSchema.safeParse({ maxLength: -5 }).success).toBe(
      false,
    );
    expect(openQuestionDataSchema.safeParse({ maxLength: 1.5 }).success).toBe(
      false,
    );
  });
});

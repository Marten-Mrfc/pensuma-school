/**
 * Pure parts of the grading service. The scoring helpers live in
 * src/lib/grading/scoring.ts (re-exported by grading.ts) so they can be
 * tested without a database or the sandbox.
 */
import { describe, expect, test } from "bun:test";
import { applyHintPenalty } from "@/lib/grading/hint-penalty";
import {
  effectiveScore,
  isBlankResponse,
  neutralizedScores,
  round2,
  scoreMultipleChoice,
} from "@/lib/grading/scoring";
import type { MultipleChoiceData } from "@/lib/questions/schema";

const options = [
  { id: "a", text: "A", correct: true },
  { id: "b", text: "B", correct: false },
  { id: "c", text: "C", correct: true },
  { id: "d", text: "D", correct: false },
];

const mc = (over: Partial<MultipleChoiceData>): MultipleChoiceData => ({
  options,
  multiple: false,
  shuffle: false,
  scoring: "all_or_nothing",
  ...over,
});

describe("scoreMultipleChoice", () => {
  test("single answer: right or wrong", () => {
    const single = mc({
      options: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: false },
      ],
    });
    expect(scoreMultipleChoice(single, ["a"])).toEqual({
      correct: true,
      fraction: 1,
    });
    expect(scoreMultipleChoice(single, ["b"])).toEqual({
      correct: false,
      fraction: 0,
    });
    expect(scoreMultipleChoice(single, [])).toEqual({
      correct: false,
      fraction: 0,
    });
  });

  test("multiple, all-or-nothing", () => {
    const data = mc({ multiple: true });
    expect(scoreMultipleChoice(data, ["a", "c"]).fraction).toBe(1);
    expect(scoreMultipleChoice(data, ["c", "a"]).correct).toBe(true);
    expect(scoreMultipleChoice(data, ["a"]).fraction).toBe(0);
    expect(scoreMultipleChoice(data, ["a", "c", "b"]).fraction).toBe(0);
  });

  test("multiple, partial: right minus wrong, floored at 0", () => {
    const data = mc({ multiple: true, scoring: "partial" });
    expect(scoreMultipleChoice(data, ["a"]).fraction).toBe(0.5);
    expect(scoreMultipleChoice(data, ["a", "c"]).fraction).toBe(1);
    expect(scoreMultipleChoice(data, ["a", "b"]).fraction).toBe(0);
    expect(scoreMultipleChoice(data, ["b", "d"]).fraction).toBe(0);
    expect(scoreMultipleChoice(data, ["a", "c", "b"]).fraction).toBe(0.5);
  });

  test("unknown option ids are ignored", () => {
    const data = mc({ multiple: true, scoring: "partial" });
    expect(scoreMultipleChoice(data, ["a", "zzz"]).fraction).toBe(0.5);
    expect(scoreMultipleChoice(data, ["a", "c", "zzz"]).correct).toBe(true);
  });
});

describe("isBlankResponse", () => {
  test("code: empty or unchanged starter code", () => {
    expect(isBlankResponse("code", null)).toBe(true);
    expect(isBlankResponse("code", { code: "   \n" })).toBe(true);
    expect(
      isBlankResponse("code", { code: "# begin hier\n" }, "# begin hier"),
    ).toBe(true);
    expect(isBlankResponse("code", { code: "print(1)" }, "# begin")).toBe(
      false,
    );
  });

  test("multiple choice: nothing selected", () => {
    expect(isBlankResponse("multiple_choice", {})).toBe(true);
    expect(isBlankResponse("multiple_choice", { selected: [] })).toBe(true);
    expect(isBlankResponse("multiple_choice", { selected: ["a"] })).toBe(false);
  });

  test("open: whitespace only", () => {
    expect(isBlankResponse("open", { text: "  " })).toBe(true);
    expect(isBlankResponse("open", { text: 42 })).toBe(true);
    expect(isBlankResponse("open", { text: "Een antwoord" })).toBe(false);
  });
});

describe("effectiveScore", () => {
  test("the manual score wins, also when it is 0", () => {
    expect(effectiveScore({ autoScore: 3, manualScore: 0 })).toBe(0);
    expect(effectiveScore({ autoScore: 3, manualScore: 2.5 })).toBe(2.5);
  });

  test("falls back to the automatic score, then 0", () => {
    expect(effectiveScore({ autoScore: 3, manualScore: null })).toBe(3);
    expect(effectiveScore({ autoScore: null, manualScore: null })).toBe(0);
  });
});

describe("code score with hints", () => {
  test("a 25% hint with all tests passing gives 75% of the points", () => {
    const hints = [{ id: "h1", text: "Gebruik input()", penalty: 0.25 }];
    const used = [{ id: "h1", at: "2026-10-22T09:00:00.000Z" }];
    expect(round2(applyHintPenalty(1, hints, used) * 2)).toBe(1.5);
  });
});

describe("neutralizedScores", () => {
  test("drop: the question no longer counts", () => {
    expect(neutralizedScores("drop", 3)).toEqual({ maxScore: 0, autoScore: 0 });
  });

  test("full points: everybody gets the points", () => {
    expect(neutralizedScores("full_points", 3)).toEqual({
      maxScore: 3,
      autoScore: 3,
    });
  });

  test("not neutralised", () => {
    expect(neutralizedScores(undefined, 3)).toBeNull();
    expect(neutralizedScores(null, 3)).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import {
  clampIndex,
  focusWasLost,
  identicalAnswers,
  pendingReviewByQuestion,
  pendingReviewTotal,
  regradeCount,
  shouldMoveFocus,
} from "./grading-logic";

describe("pendingReviewTotal (A26: one count for Resultaten and Nakijken)", () => {
  test("sums the grading queue over all questions", () => {
    expect(
      pendingReviewTotal([
        { needsReview: 6 },
        { needsReview: 0 },
        { needsReview: 2 },
      ]),
    ).toBe(8);
    expect(pendingReviewTotal([])).toBe(0);
  });

  test("per question, keyed by id", () => {
    const map = pendingReviewByQuestion([
      { id: "q1", needsReview: 6 },
      { id: "q2", needsReview: 0 },
    ]);
    expect(map.get("q1")).toBe(6);
    expect(map.get("q2")).toBe(0);
    expect(map.get("q3")).toBeUndefined();
  });
});

describe("regradeCount (A40: the regrade dialog never undercounts)", () => {
  test("exact when every student has at most one attempt", () => {
    expect(regradeCount([{ attemptCount: 1 }, { attemptCount: 0 }], 1)).toBe(1);
  });

  test("unknown once a student started more than once", () => {
    expect(regradeCount([{ attemptCount: 3 }, { attemptCount: 1 }], 2)).toBe(
      null,
    );
  });
});

describe("identicalAnswers (X09: bulk grading never overwrites)", () => {
  const items = [
    { answerId: "a", manualScore: null },
    { answerId: "b", manualScore: 2 },
    { answerId: "c", manualScore: null },
    { answerId: "d", manualScore: 0 },
    { answerId: "e", manualScore: null },
  ];
  const keys: Record<string, string> = {
    a: "k1",
    b: "k1",
    c: "k1",
    d: "k1",
    e: "k2",
  };
  const keyOf = (id: string) => keys[id] ?? "";

  test("splits identical answers by whether they have a manual score", () => {
    expect(identicalAnswers(items, "a", keyOf)).toEqual({
      ungraded: ["c"],
      // A manual score of 0 is a score too.
      graded: ["b", "d"],
    });
  });

  test("the current answer itself is never in the list", () => {
    const res = identicalAnswers(items, "b", keyOf);
    expect(res.ungraded).toEqual(["a", "c"]);
    expect(res.graded).toEqual(["d"]);
  });

  test("no current answer or no group key: nothing to grade together", () => {
    expect(identicalAnswers(items, undefined, keyOf)).toEqual({
      ungraded: [],
      graded: [],
    });
    expect(identicalAnswers(items, "a", () => "")).toEqual({
      ungraded: [],
      graded: [],
    });
    expect(identicalAnswers(items, "e", keyOf)).toEqual({
      ungraded: [],
      graded: [],
    });
  });
});

describe("focus after moving to another student (A02)", () => {
  const body = { isConnected: true, matches: () => false };
  const button = (disabled = false) => ({
    isConnected: true,
    matches: (s: string) => s === ":disabled" && disabled,
  });
  const removed = { isConnected: false, matches: () => false };

  test("focus on <body>, nothing focused or a removed element is lost", () => {
    expect(focusWasLost(body, body)).toBe(true);
    expect(focusWasLost(null, body)).toBe(true);
    expect(focusWasLost(undefined, body)).toBe(true);
    // "Opslaan en volgende": the ScoreBox remounts after a save.
    expect(focusWasLost(removed, body)).toBe(true);
  });

  test("a control that became disabled has lost focus too", () => {
    // "Vorige leerling" on reaching the first student.
    expect(focusWasLost(button(true), body)).toBe(true);
    expect(focusWasLost(button(false), body)).toBe(false);
  });

  test("after a save or a shortcut, focus always moves to the student", () => {
    expect(shouldMoveFocus("always", button(), body)).toBe(true);
    expect(shouldMoveFocus("always", removed, body)).toBe(true);
  });

  test("the Vorige/Volgende buttons keep focus unless it was lost", () => {
    expect(shouldMoveFocus("if-lost", button(), body)).toBe(false);
    expect(shouldMoveFocus("if-lost", body, body)).toBe(true);
    expect(shouldMoveFocus("if-lost", button(true), body)).toBe(true);
  });

  test("without a navigation (e.g. a 30-second refetch) focus stays put", () => {
    expect(shouldMoveFocus(null, body, body)).toBe(false);
    expect(shouldMoveFocus(null, removed, body)).toBe(false);
  });

  test("the index stays between the first student and the done panel", () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(3, 5)).toBe(3);
    expect(clampIndex(5, 5)).toBe(5);
    expect(clampIndex(9, 5)).toBe(5);
  });
});

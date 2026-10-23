import { describe, expect, test } from "bun:test";
import { restoredManualScore } from "./neutralization";

const NEUTRALIZED_AT = new Date("2026-10-20T10:00:00Z");
const before = new Date("2026-10-20T09:00:00Z");
const after = new Date("2026-10-20T11:00:00Z");
const later = new Date("2026-10-20T12:00:00Z");

const full = { mode: "full_points" as const, createdAt: NEUTRALIZED_AT };
const drop = { mode: "drop" as const, createdAt: NEUTRALIZED_AT };

describe("restoredManualScore (undoing 'vraag laten vervallen')", () => {
  test("a review from before the neutralisation still stands: its score comes back", () => {
    const answer = {
      manualScore: 2,
      maxScore: 2,
      reviewedAt: before,
      savedAt: before,
    };
    expect(restoredManualScore(answer, 1.5, full)).toBe(1.5);
    expect(
      restoredManualScore({ ...answer, manualScore: null }, 1.5, drop),
    ).toBe(1.5);
    // Reopened, the same answer saved again: the review was kept, so still.
    expect(restoredManualScore({ ...answer, savedAt: after }, 1.5, full)).toBe(
      1.5,
    );
  });

  test("the student changed the answer (review cleared): the old score never comes back", () => {
    // portal.saveAnswer cleared manualScore and reviewedAt; the neutralised
    // full points may have been written again by a mode switch.
    for (const manualScore of [null, 2]) {
      expect(
        restoredManualScore(
          { manualScore, maxScore: 2, reviewedAt: null, savedAt: after },
          1.5,
          full,
        ),
      ).toBeNull();
    }
    expect(
      restoredManualScore(
        { manualScore: null, maxScore: 0, reviewedAt: null, savedAt: after },
        1.5,
        drop,
      ),
    ).toBeNull();
  });

  test("never reviewed: no manual score (undo the full points)", () => {
    expect(
      restoredManualScore(
        { manualScore: 2, maxScore: 2, reviewedAt: null, savedAt: before },
        null,
        full,
      ),
    ).toBeNull();
  });

  test("reviewed again after a changed answer: the newer review stays", () => {
    expect(
      restoredManualScore(
        { manualScore: 2, maxScore: 2, reviewedAt: later, savedAt: after },
        0.5,
        full,
      ),
    ).toBeUndefined();
    expect(
      restoredManualScore(
        { manualScore: 1, maxScore: 2, reviewedAt: later, savedAt: after },
        0.5,
        full,
      ),
    ).toBeUndefined();
  });

  test("same answer reviewed while it gave full points", () => {
    // A deliberately different score stays…
    expect(
      restoredManualScore(
        { manualScore: 1, maxScore: 2, reviewedAt: after, savedAt: before },
        0.5,
        full,
      ),
    ).toBeUndefined();
    // …only feedback added (still the full points): the saved score returns.
    expect(
      restoredManualScore(
        { manualScore: 2, maxScore: 2, reviewedAt: after, savedAt: before },
        0.5,
        full,
      ),
    ).toBe(0.5);
    // While it did not count (max 0) a review changes nothing.
    expect(
      restoredManualScore(
        { manualScore: 0, maxScore: 0, reviewedAt: after, savedAt: before },
        0.5,
        drop,
      ),
    ).toBe(0.5);
  });
});

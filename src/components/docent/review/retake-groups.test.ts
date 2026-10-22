import { describe, expect, test } from "bun:test";
import { retakeGroups } from "./retake-groups";

const row = (
  id: string,
  attempt: { status: string; grade: number | null } | null,
  inClass = true,
) => ({ student: { id, inClass }, attempt });

describe("retakeGroups", () => {
  test("onvoldoendes and who did not take part", () => {
    const res = retakeGroups([
      row("a", { status: "submitted", grade: 5.4 }),
      row("b", { status: "submitted", grade: 5.5 }),
      row("c", null),
      row("d", { status: "in_progress", grade: null }),
      row("e", { status: "submitted", grade: null }),
      row("f", null, false),
      row("g", { status: "submitted", grade: 3 }, false),
    ]);
    expect(res.failed).toEqual(["a"]);
    expect(res.missed).toEqual(["c", "d"]);
  });
});

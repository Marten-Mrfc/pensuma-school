/** V08: the countdown's spoken text agrees with the count ("1 minuut"). */
import { describe, expect, test } from "bun:test";
import { spokenRemaining } from "./countdown-timer";

describe("spoken remaining time", () => {
  test("an hour and one minute is '1 minuut', not '1 minuten'", () => {
    expect(spokenRemaining(61 * 60)).toBe("Nog 1 uur en 1 minuut");
    expect(spokenRemaining(62 * 60)).toBe("Nog 1 uur en 2 minuten");
    expect(spokenRemaining(60 * 60)).toBe("Nog 1 uur");
  });

  test("below an hour", () => {
    expect(spokenRemaining(10 * 60)).toBe("Nog 10 minuten");
    expect(spokenRemaining(30)).toBe("Nog minder dan 1 minuut");
    expect(spokenRemaining(0)).toBe("De tijd is om");
  });
});

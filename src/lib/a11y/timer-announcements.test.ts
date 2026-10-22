import { describe, expect, test } from "bun:test";
import {
  INITIAL_TIMER_STATE,
  nextTimerAnnouncements,
  spokenDuration,
  TIME_UP_DEDUPE_KEY,
  type TimerAnnouncement,
  type TimerAnnouncementState,
} from "./timer-announcements";

const MIN = 60_000;

/** Run a sequence of [deadline, remaining] ticks and collect the texts. */
function run(ticks: [number, number][]) {
  let state: TimerAnnouncementState = INITIAL_TIMER_STATE;
  const spoken: TimerAnnouncement[] = [];
  for (const [deadline, remaining] of ticks) {
    const result = nextTimerAnnouncements(state, deadline, remaining);
    state = result.state;
    spoken.push(...result.messages);
  }
  return { spoken, state };
}

describe("nextTimerAnnouncements", () => {
  test("announces 10, 5 and 1 minute once each, then the end", () => {
    const d = 1_000_000;
    const ticks: [number, number][] = [];
    for (let s = 12 * 60; s >= 0; s--) ticks.push([d, s * 1000]);
    // Repeat a few ticks to prove there are no duplicates.
    ticks.push([d, 0], [d, 0]);
    const { spoken } = run(ticks);
    expect(spoken).toEqual([
      { text: "Let op: je hebt nog 10 minuten.", politeness: "polite" },
      { text: "Let op: je hebt nog 5 minuten.", politeness: "polite" },
      { text: "Let op: je hebt nog 1 minuut.", politeness: "polite" },
      {
        text: "De tijd is om.",
        politeness: "assertive",
        dedupeKey: TIME_UP_DEDUPE_KEY,
      },
    ]);
  });

  test("no announcement for thresholds already passed at mount", () => {
    const d = 1_000_000;
    const { spoken } = run([
      [d, 4 * MIN],
      [d, 4 * MIN - 1000],
      [d, MIN + 1000],
      [d, MIN],
    ]);
    expect(spoken.map((m) => m.text)).toEqual([
      "Let op: je hebt nog 1 minuut.",
    ]);
  });

  test("silent when mounted after the deadline", () => {
    const d = 1_000_000;
    expect(
      run([
        [d, 0],
        [d, 0],
      ]).spoken,
    ).toEqual([]);
  });

  test("when several thresholds are crossed at once only the smallest is spoken", () => {
    const d = 1_000_000;
    const { spoken } = run([
      [d, 12 * MIN],
      [d, 4 * MIN],
      [d, 3 * MIN],
    ]);
    expect(spoken.map((m) => m.text)).toEqual([
      "Let op: je hebt nog 5 minuten.",
    ]);
  });

  test("extra time is announced and resets the thresholds above it", () => {
    const d = 1_000_000;
    const later = d + 10 * MIN;
    const { spoken } = run([
      [d, 6 * MIN],
      [d, 5 * MIN], // "5 minuten"
      [later, 15 * MIN], // teacher adds 10 minutes
      [later, 10 * MIN], // "10 minuten" again
      [later, 5 * MIN], // "5 minuten" again
    ]);
    expect(spoken.map((m) => m.text)).toEqual([
      "Let op: je hebt nog 5 minuten.",
      "Je docent heeft je extra tijd gegeven. Je hebt nu nog 15 minuten.",
      "Let op: je hebt nog 10 minuten.",
      "Let op: je hebt nog 5 minuten.",
    ]);
  });

  test("extra time after the end restarts the countdown", () => {
    const d = 1_000_000;
    const later = d + 3 * MIN;
    const { spoken } = run([
      [d, 1000],
      [d, 0],
      [later, 3 * MIN],
      [later, MIN],
    ]);
    expect(spoken.map((m) => m.text)).toEqual([
      "De tijd is om.",
      "Je docent heeft je extra tijd gegeven. Je hebt nu nog 3 minuten.",
      "Let op: je hebt nog 1 minuut.",
    ]);
  });

  test("small deadline corrections are not announced as extra time", () => {
    const d = 1_000_000;
    const { spoken } = run([
      [d, 20 * MIN],
      [d + 30_000, 20 * MIN + 30_000],
    ]);
    expect(spoken).toEqual([]);
  });
});

describe("spokenDuration", () => {
  test("Dutch durations", () => {
    expect(spokenDuration(30)).toBe("minder dan 1 minuut");
    expect(spokenDuration(60)).toBe("1 minuut");
    expect(spokenDuration(15 * 60 - 1)).toBe("15 minuten");
    expect(spokenDuration(60 * 60)).toBe("1 uur");
    expect(spokenDuration(65 * 60)).toBe("1 uur en 5 minuten");
    expect(spokenDuration(121 * 60)).toBe("2 uur en 1 minuut");
  });
});

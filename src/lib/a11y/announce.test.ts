import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DEDUPE_MS,
  type DedupeState,
  decideAnnouncement,
} from "./announce";

const empty: DedupeState = new Map();

describe("decideAnnouncement", () => {
  test("speaks a message without a dedupe key every time", () => {
    const a = decideAnnouncement(empty, "Opgeslagen", {}, 1000);
    const b = decideAnnouncement(a.state, "Opgeslagen", {}, 1001);
    expect(a.speak).toBe(true);
    expect(b.speak).toBe(true);
  });

  test("never speaks an empty message", () => {
    expect(decideAnnouncement(empty, "   ", {}, 0).speak).toBe(false);
  });

  test("drops a repeat of the same key within the window", () => {
    const first = decideAnnouncement(empty, "Offline", { dedupeKey: "net" }, 0);
    const repeat = decideAnnouncement(
      first.state,
      "Offline",
      { dedupeKey: "net" },
      DEFAULT_DEDUPE_MS - 1,
    );
    expect(first.speak).toBe(true);
    expect(repeat.speak).toBe(false);
  });

  test("speaks the key again after the window", () => {
    const first = decideAnnouncement(empty, "Offline", { dedupeKey: "net" }, 0);
    const later = decideAnnouncement(
      first.state,
      "Offline",
      { dedupeKey: "net" },
      DEFAULT_DEDUPE_MS,
    );
    expect(later.speak).toBe(true);
  });

  test("a dropped repeat doesn't extend the window", () => {
    let state = decideAnnouncement(empty, "x", { dedupeKey: "k" }, 0).state;
    state = decideAnnouncement(state, "x", { dedupeKey: "k" }, 2000).state;
    expect(decideAnnouncement(state, "x", { dedupeKey: "k" }, 3000).speak).toBe(
      true,
    );
  });

  test("respects a custom dedupeMs and separate keys", () => {
    const first = decideAnnouncement(
      empty,
      "a",
      { dedupeKey: "a", dedupeMs: 100 },
      0,
    );
    expect(
      decideAnnouncement(
        first.state,
        "a",
        { dedupeKey: "a", dedupeMs: 100 },
        99,
      ).speak,
    ).toBe(false);
    expect(
      decideAnnouncement(
        first.state,
        "a",
        { dedupeKey: "a", dedupeMs: 100 },
        100,
      ).speak,
    ).toBe(true);
    expect(
      decideAnnouncement(first.state, "b", { dedupeKey: "b" }, 1).speak,
    ).toBe(true);
  });

  test("does not mutate the previous state and prunes old keys", () => {
    const first = decideAnnouncement(empty, "a", { dedupeKey: "a" }, 0);
    expect(empty.size).toBe(0);
    const much = decideAnnouncement(
      first.state,
      "b",
      { dedupeKey: "b" },
      DEFAULT_DEDUPE_MS * 100,
    );
    expect(much.state.has("a")).toBe(false);
    expect(much.state.has("b")).toBe(true);
  });
});

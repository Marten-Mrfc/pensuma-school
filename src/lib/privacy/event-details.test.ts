import { describe, expect, test } from "bun:test";
import {
  isEventAllowed,
  MONITORING_EVENT_TYPES,
  type MonitoringSettings,
  sanitizeEventDetails,
} from "./event-details";

const questionId = "3f1c2a52-8a4e-4c4b-9a59-0c3b8f6f2d11";

/** Every combination of the three settings. */
const combos: MonitoringSettings[] = [];
for (const logFocusEvents of [false, true]) {
  for (const requireFullscreen of [false, true]) {
    for (const blockPaste of [false, true]) {
      combos.push({ logFocusEvents, requireFullscreen, blockPaste });
    }
  }
}

describe("isEventAllowed", () => {
  test("the full matrix", () => {
    const expected = (type: string, s: MonitoringSettings): boolean => {
      switch (type) {
        case "focus_lost":
        case "focus_gained":
        case "visibility_hidden":
        case "visibility_visible":
        case "copy":
          return s.logFocusEvents;
        case "fullscreen_enter":
        case "fullscreen_exit":
          return s.requireFullscreen;
        case "paste":
          return s.blockPaste || s.logFocusEvents;
        case "code_run":
        case "self_test":
          return true;
        default:
          return false;
      }
    };
    expect(combos).toHaveLength(8);
    for (const s of combos) {
      for (const type of MONITORING_EVENT_TYPES) {
        expect([type, s, isEventAllowed(type, s)]).toEqual([
          type,
          s,
          expected(type, s),
        ]);
      }
    }
  });

  test("spot checks", () => {
    const off = {
      logFocusEvents: false,
      requireFullscreen: false,
      blockPaste: false,
    };
    expect(isEventAllowed("focus_lost", off)).toBe(false);
    expect(isEventAllowed("paste", off)).toBe(false);
    expect(isEventAllowed("paste", { ...off, blockPaste: true })).toBe(true);
    expect(isEventAllowed("paste", { ...off, logFocusEvents: true })).toBe(
      true,
    );
    expect(isEventAllowed("copy", { ...off, blockPaste: true })).toBe(false);
    expect(
      isEventAllowed("fullscreen_exit", { ...off, requireFullscreen: true }),
    ).toBe(true);
    expect(isEventAllowed("code_run", off)).toBe(true);
    expect(isEventAllowed("self_test", off)).toBe(true);
  });

  test("other types are never allowed from the browser", () => {
    const on = {
      logFocusEvents: true,
      requireFullscreen: true,
      blockPaste: true,
    };
    for (const type of [
      "started",
      "submitted",
      "time_extended",
      "reopened",
      "hint_revealed",
      "anything",
    ]) {
      expect(isEventAllowed(type, on)).toBe(false);
    }
  });
});

describe("sanitizeEventDetails", () => {
  test("paste never keeps the text", () => {
    expect(
      sanitizeEventDetails("paste", { text: "geheim", length: 6 }),
    ).toEqual({ length: 6 });
    expect(
      sanitizeEventDetails("paste", {
        questionId,
        length: 12,
        blocked: true,
        text: "print('hoi')",
      }),
    ).toEqual({ questionId, length: 12, blocked: true });
    expect(sanitizeEventDetails("copy", { text: "geheim" })).toBeNull();
  });

  test("focus and visibility keep durationMs only", () => {
    expect(
      sanitizeEventDetails("focus_lost", { durationMs: 1500, url: "x" }),
    ).toEqual({ durationMs: 1500 });
    expect(
      sanitizeEventDetails("visibility_visible", { durationMs: -1 }),
    ).toBeNull();
    expect(
      sanitizeEventDetails("focus_gained", { durationMs: 86_400_001 }),
    ).toBeNull();
    expect(
      sanitizeEventDetails("focus_gained", { durationMs: 1.5 }),
    ).toBeNull();
  });

  test("fullscreen keeps afterEscapeKey", () => {
    expect(
      sanitizeEventDetails("fullscreen_exit", { afterEscapeKey: true, x: 1 }),
    ).toEqual({ afterEscapeKey: true });
    expect(
      sanitizeEventDetails("fullscreen_enter", { afterEscapeKey: "yes" }),
    ).toBeNull();
  });

  test("code_run and self_test", () => {
    expect(
      sanitizeEventDetails("code_run", {
        questionId,
        durationMs: 120,
        errorType: "NameError",
        code: "print(x)",
        stdout: "geheim",
      }),
    ).toEqual({ questionId, durationMs: 120, errorType: "NameError" });
    expect(
      sanitizeEventDetails("code_run", { errorType: "x".repeat(41) }),
    ).toBeNull();
    expect(
      sanitizeEventDetails("code_run", { errorType: "Fout: naam Mark" }),
    ).toBeNull();
    expect(
      sanitizeEventDetails("self_test", {
        questionId,
        passed: 2,
        total: 3,
        results: [],
      }),
    ).toEqual({ questionId, passed: 2, total: 3 });
    expect(
      sanitizeEventDetails("self_test", { questionId: "not-a-uuid" }),
    ).toBeNull();
  });

  test("unknown types, non-objects and empty results give null", () => {
    expect(sanitizeEventDetails("started", { durationMs: 5 })).toBeNull();
    expect(sanitizeEventDetails("__proto__", { durationMs: 5 })).toBeNull();
    expect(sanitizeEventDetails("focus_lost", null)).toBeNull();
    expect(sanitizeEventDetails("focus_lost", [1])).toBeNull();
    expect(sanitizeEventDetails("focus_lost", {})).toBeNull();
  });
});

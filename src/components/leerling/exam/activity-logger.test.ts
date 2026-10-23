import { describe, expect, jest, test } from "bun:test";
import type { MonitoringSettings } from "@/lib/privacy/event-details";
import {
  ActivityLogger,
  attachMonitoring,
  type ClientEventType,
  MAX_BATCH,
  type MonitoringTargets,
  type QueuedEvent,
} from "./activity-logger";

const OFF: MonitoringSettings = {
  logFocusEvents: false,
  requireFullscreen: false,
  blockPaste: false,
};
const ALL: MonitoringSettings = {
  logFocusEvents: true,
  requireFullscreen: true,
  blockPaste: true,
};

/** An EventTarget that records which listeners are attached. */
class FakeTarget {
  listeners = new Map<string, Set<(event: Event) => void>>();
  addEventListener(type: string, listener: (event: Event) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: Partial<KeyboardEvent> = {}) {
    for (const l of this.listeners.get(type) ?? []) l(event as Event);
  }
  types() {
    return [...this.listeners.entries()]
      .filter(([, set]) => set.size > 0)
      .map(([type]) => type)
      .sort();
  }
}

class FakeDocument extends FakeTarget {
  visibilityState: DocumentVisibilityState = "visible";
  fullscreenElement: Element | null = null;
}

function fakeTargets() {
  const win = new FakeTarget();
  const doc = new FakeDocument();
  return {
    win,
    doc,
    targets: { window: win, document: doc } as unknown as MonitoringTargets,
  };
}

describe("ActivityLogger", () => {
  test("sends at most 50 events per batch", async () => {
    const batches: QueuedEvent[][] = [];
    const logger = new ActivityLogger(async (events) => {
      batches.push(events);
    }, OFF);
    for (let i = 0; i < 120; i++) logger.log("code_run", { questionId: "q" });
    await logger.flush();
    await logger.flush();
    await logger.flush();
    await logger.flush();
    expect(MAX_BATCH).toBe(50);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
  });

  test("queues only the event types the settings allow", () => {
    const logger = new ActivityLogger(async () => {}, OFF);
    logger.log("focus_lost");
    logger.log("visibility_hidden");
    logger.log("fullscreen_exit", { afterEscapeKey: false });
    logger.log("paste", { questionId: "q", blocked: false });
    logger.log("code_run", { questionId: "q" });
    logger.log("self_test", { questionId: "q", passed: 1, total: 2 });
    expect(logger.pending.map((e) => e.type)).toEqual([
      "code_run",
      "self_test",
    ]);

    const strict = new ActivityLogger(async () => {}, ALL);
    strict.log("focus_lost");
    strict.log("paste", { questionId: "q", blocked: true });
    strict.log("fullscreen_exit", { afterEscapeKey: true });
    expect(strict.pending.map((e) => e.type)).toEqual([
      "focus_lost",
      "paste",
      "fullscreen_exit",
    ]);
  });

  test("copying is never queued, whatever the settings (not disclosed)", () => {
    const logger = new ActivityLogger(async () => {}, ALL);
    // An older client could still call this; the type no longer allows it.
    logger.log("copy" as ClientEventType);
    expect(logger.pending).toHaveLength(0);
  });

  test("a paste is logged when paste is blocked, even without focus logging", () => {
    const logger = new ActivityLogger(async () => {}, {
      ...OFF,
      blockPaste: true,
    });
    logger.log("paste", { questionId: "q", blocked: true });
    expect(logger.pending).toHaveLength(1);
  });

  test("keeps events after a failed send and stops on NOT_FOUND", async () => {
    let fail: unknown = new TypeError("offline");
    const send = jest.fn(async () => {
      if (fail) throw fail;
    });
    const logger = new ActivityLogger(send, OFF);
    logger.log("code_run", { questionId: "q" });
    await logger.flush();
    expect(logger.pending).toHaveLength(1);
    fail = { data: { code: "NOT_FOUND" } };
    await logger.flush();
    logger.log("code_run", { questionId: "q" });
    fail = null;
    await logger.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("drops a batch the server rejects (BAD_REQUEST)", async () => {
    let fail: unknown = { data: { code: "BAD_REQUEST" } };
    const send = jest.fn(async () => {
      if (fail) throw fail;
    });
    const logger = new ActivityLogger(send, OFF);
    logger.log("code_run", { questionId: "q" });
    await logger.flush();
    expect(logger.pending).toHaveLength(0);
    fail = null;
    logger.log("code_run", { questionId: "q" });
    await logger.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(logger.pending).toHaveLength(0);
  });
});

describe("attachMonitoring", () => {
  test("adds no listeners when nothing is monitored", () => {
    const { win, doc, targets } = fakeTargets();
    const logger = new ActivityLogger(async () => {}, OFF);
    attachMonitoring(logger, OFF, targets);
    expect(win.types()).toEqual([]);
    expect(doc.types()).toEqual([]);
  });

  test("no focus or visibility listeners when logFocusEvents is false", () => {
    const { win, doc, targets } = fakeTargets();
    const settings = { ...OFF, requireFullscreen: true };
    attachMonitoring(
      new ActivityLogger(async () => {}, settings),
      settings,
      targets,
    );
    expect(win.types()).toEqual(["keydown"]);
    expect(doc.types()).toEqual(["fullscreenchange"]);
  });

  test("focus logging: one loss per away episode, with its duration", () => {
    const { win, doc, targets } = fakeTargets();
    const settings = { ...OFF, logFocusEvents: true };
    const logger = new ActivityLogger(async () => {}, settings);
    let now = 1000;
    const detach = attachMonitoring(logger, settings, targets, {
      now: () => now,
    });
    expect(win.types()).toEqual(["blur", "focus"]);
    // No "copy" listener: copying is not monitored.
    expect(doc.types()).toEqual(["visibilitychange"]);

    win.dispatch("blur");
    doc.visibilityState = "hidden";
    doc.dispatch("visibilitychange");
    now = 4500;
    win.dispatch("focus");
    expect(logger.pending.map((e) => [e.type, e.details ?? null])).toEqual([
      ["focus_lost", null],
      ["focus_gained", { durationMs: 3500 }],
    ]);

    detach();
    expect(win.types()).toEqual([]);
    expect(doc.types()).toEqual([]);
  });

  test("fullscreen exit right after Escape is marked afterEscapeKey", () => {
    const { win, doc, targets } = fakeTargets();
    const settings = { ...OFF, requireFullscreen: true };
    const logger = new ActivityLogger(async () => {}, settings);
    let now = 0;
    doc.fullscreenElement = {} as Element;
    attachMonitoring(logger, settings, targets, { now: () => now });

    now = 10_000;
    win.dispatch("keydown", { key: "Escape" });
    now = 10_200;
    doc.fullscreenElement = null;
    doc.dispatch("fullscreenchange");

    now = 20_000;
    doc.fullscreenElement = {} as Element;
    doc.dispatch("fullscreenchange");

    now = 30_000;
    doc.fullscreenElement = null;
    doc.dispatch("fullscreenchange");

    expect(logger.pending.map((e) => [e.type, e.details])).toEqual([
      ["fullscreen_exit", { afterEscapeKey: true }],
      ["fullscreen_enter", { afterEscapeKey: false }],
      ["fullscreen_exit", { afterEscapeKey: false }],
    ]);
  });

  test("logs nothing while handing in", () => {
    const { win, targets } = fakeTargets();
    const settings = { ...OFF, logFocusEvents: true };
    const logger = new ActivityLogger(async () => {}, settings);
    attachMonitoring(logger, settings, targets, { isFinishing: () => true });
    win.dispatch("blur");
    expect(logger.pending).toHaveLength(0);
  });
});

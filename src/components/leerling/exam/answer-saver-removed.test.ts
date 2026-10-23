/**
 * AnswerSaver when the teacher deletes a question during the exam: the
 * server answers "removed" for that question only, and the saver must keep
 * saving the other questions and keep their local backup.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "bun:test";
import type { AnswerResponse } from "@/lib/questions/schema";
import { AnswerSaver, isLockedError, REMOVED_STATUS } from "./answer-saver";
import { storageKey } from "./types";

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const g = globalThis as unknown as { window?: unknown };
const originalWindow = g.window;
const storage = new MemoryStorage();

beforeEach(() => {
  storage.clear();
  g.window = { localStorage: storage };
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-22T10:00:00Z"));
});
afterEach(() => {
  jest.useRealTimers();
});
afterAll(() => {
  g.window = originalWindow;
});

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const ATTEMPT = "attempt-removed";
const text = (t: string): AnswerResponse => ({ text: t });

function backup(): Record<string, unknown> {
  const raw = storage.getItem(storageKey(ATTEMPT));
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

describe("AnswerSaver and a deleted question", () => {
  test("drops only that question; the others are saved and backed up", async () => {
    const saved: string[] = [];
    const save = jest.fn(async (questionId: string) => {
      if (questionId === "gone") return { status: REMOVED_STATUS };
      saved.push(questionId);
      return { status: "saved" };
    });
    const onLocked = jest.fn();
    const onSaved = jest.fn();
    const saver = new AnswerSaver(ATTEMPT, save, {
      serverOffsetMs: () => 0,
      onLocked,
      onSaved,
    });
    saver.update("gone", text("antwoord op een verwijderde vraag"));
    saver.update("q2", text("mijn uitleg"));
    saver.update("q3", text("nog een antwoord"));
    expect(Object.keys(backup()).sort()).toEqual(["gone", "q2", "q3"]);

    const done = saver.flush();
    await settle();
    expect(await done).toBe(true);
    expect(saved).toEqual(["q2", "q3"]);
    expect(onLocked).not.toHaveBeenCalled();
    expect(saver.isLocked).toBe(false);
    expect(saver.getSnapshot().state).toBe("saved");
    expect(onSaved).toHaveBeenCalledWith("gone", REMOVED_STATUS);
    // The backup keeps the other answers, only the removed one is gone.
    expect(Object.keys(backup()).sort()).toEqual(["q2", "q3"]);

    // Typing on the removed question (page not refreshed yet) is ignored.
    saver.update("gone", text("nog meer"));
    expect(saver.hasPending).toBe(false);
    expect(Object.keys(backup())).not.toContain("gone");
    saver.update("q2", text("verbeterd"));
    expect(await saver.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(4);
  });

  test("a closed attempt still locks everything", () => {
    expect(isLockedError({ data: { code: "PRECONDITION_FAILED" } })).toBe(true);
    expect(isLockedError({ data: { code: "NOT_FOUND" } })).toBe(true);
    expect(isLockedError({ data: { code: "BAD_REQUEST" } })).toBe(false);
    expect(isLockedError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

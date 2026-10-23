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
import { AnswerSaver, isRejectedError } from "./answer-saver";
import { storageKey } from "./types";

/* ------------------------- in-memory localStorage ------------------------ */

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

/** Let pending promise callbacks run. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  await settle();
}

const ATTEMPT = "attempt-1";
const code = (text: string): AnswerResponse => ({ code: text });

function makeSaver(
  save: (
    questionId: string,
    response: AnswerResponse,
  ) => Promise<{
    status: string;
  }>,
  onLocked?: (err: unknown) => void,
) {
  return new AnswerSaver(ATTEMPT, save, {
    serverOffsetMs: () => 0,
    onLocked,
  });
}

describe("AnswerSaver", () => {
  test("saves 1.5 s after the last change (debounce)", async () => {
    const save = jest.fn(async () => ({ status: "saved" }));
    const saver = makeSaver(save);
    saver.update("q1", code("a"));
    expect(saver.getSnapshot().state).toBe("dirty");
    await advance(1000);
    saver.update("q1", code("ab"));
    await advance(1499);
    expect(save).not.toHaveBeenCalled();
    await advance(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("q1", code("ab"));
    expect(saver.getSnapshot().state).toBe("saved");
  });

  test("saves at least every 10 s while typing", async () => {
    const save = jest.fn(async (_q: string, _r: AnswerResponse) => ({
      status: "saved",
    }));
    const saver = makeSaver(save);
    // A change every second: the debounce alone would never fire.
    for (let i = 0; i < 10; i++) {
      saver.update("q1", code(`v${i}`));
      await advance(1000);
    }
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toEqual(code("v9"));
  });

  test("flush() saves immediately and resolves true", async () => {
    const save = jest.fn(async () => ({ status: "saved" }));
    const saver = makeSaver(save);
    saver.update("q1", code("x"));
    saver.update("q2", code("y"));
    const done = saver.flush();
    await settle();
    expect(await done).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.hasPending).toBe(false);
    expect(await saver.flush()).toBe(true);
  });

  test("retries with backoff while offline, capped at 30 s", async () => {
    let fail = true;
    const save = jest.fn(async () => {
      if (fail) throw new TypeError("Failed to fetch");
      return { status: "saved" };
    });
    const saver = makeSaver(save);
    saver.update("q1", code("x"));
    await advance(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.getSnapshot().state).toBe("offline");

    // 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s (capped) between tries.
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const [i, delay] of delays.entries()) {
      await advance(delay - 1);
      expect(save).toHaveBeenCalledTimes(i + 1);
      await advance(1);
      expect(save).toHaveBeenCalledTimes(i + 2);
    }

    fail = false;
    await advance(30000);
    expect(saver.getSnapshot().state).toBe("saved");
  });

  test("PRECONDITION_FAILED locks the saver once and clears the backup", async () => {
    const onLocked = jest.fn();
    const save = jest.fn(async () => {
      throw { data: { code: "PRECONDITION_FAILED" } };
    });
    const saver = makeSaver(save, onLocked);
    saver.update("q1", code("x"));
    saver.update("q2", code("y"));
    expect(storage.getItem(storageKey(ATTEMPT))).not.toBeNull();
    expect(await saver.flush()).toBe(false);
    expect(saver.getSnapshot().state).toBe("locked");
    expect(saver.isLocked).toBe(true);
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(storage.getItem(storageKey(ATTEMPT))).toBeNull();

    // Locked: later changes are ignored, nothing is stored again.
    saver.update("q1", code("z"));
    await advance(20000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(storage.getItem(storageKey(ATTEMPT))).toBeNull();
  });

  test("keeps a local backup that a new saver can restore", async () => {
    const save = jest.fn(async () => {
      throw new TypeError("offline");
    });
    const saver = makeSaver(save);
    saver.update("q1", code("print(1)"));
    saver.dispose();

    const next = makeSaver(async () => ({ status: "saved" }));
    const backup = next.readBackup();
    expect(backup.q1?.response).toEqual(code("print(1)"));
    expect(backup.q1?.updatedAt).toBe(Date.now());
  });

  test("an update without backup leaves localStorage alone", () => {
    const saver = makeSaver(async () => ({ status: "saved" }));
    saver.update("q1", code("x"), { backup: false });
    expect(storage.getItem(storageKey(ATTEMPT))).toBeNull();
    saver.dispose();
  });

  test("clearBackup() removes the backup", () => {
    const saver = makeSaver(async () => ({ status: "saved" }));
    saver.update("q1", code("x"));
    expect(storage.getItem(storageKey(ATTEMPT))).not.toBeNull();
    saver.clearBackup();
    expect(storage.getItem(storageKey(ATTEMPT))).toBeNull();
    expect(saver.readBackup()).toEqual({});
    saver.dispose();
  });
});

/* -------------------- an answer the server refuses (A24) ------------------- */

const text = (t: string): AnswerResponse => ({ text: t });
/** What the tRPC client throws for a zod input error (e.g. 20.001 tekens). */
const badRequest = () => ({
  message: "Invalid input",
  data: { code: "BAD_REQUEST", httpStatus: 400 },
});

function backupKeys(): string[] {
  const raw = storage.getItem(storageKey(ATTEMPT));
  return raw ? Object.keys(JSON.parse(raw) as object).sort() : [];
}

describe("AnswerSaver and a refused answer", () => {
  test("a refused answer first in the queue does not block later answers and is not 'offline'", async () => {
    let refuseQ12 = true;
    const saved: string[] = [];
    const save = jest.fn(async (questionId: string, r: AnswerResponse) => {
      if (questionId === "q12" && refuseQ12) throw badRequest();
      saved.push(`${questionId}:${"text" in r ? r.text.length : "code"}`);
      return { status: "saved" };
    });
    const saver = makeSaver(save);
    saver.update("q12", text("x".repeat(20_001)));
    saver.update("q1", code('print("Hallo wereld!")'));

    expect(await saver.flush()).toBe(false);
    expect(saved).toEqual(["q1:code"]);
    expect(saver.getSnapshot().state).toBe("error");
    expect(saver.getSnapshot().rejected).toEqual(["q12"]);
    expect(saver.getSnapshot().pendingCount).toBe(0);
    expect(saver.hasPending).toBe(false);
    expect(saver.hasUnsaved).toBe(true);
    expect(saver.rejectionOf("q12")).toMatchObject({
      data: { code: "BAD_REQUEST" },
    });
    // The refused answer stays in the local backup (nothing is lost).
    expect(backupKeys()).toEqual(["q1", "q12"]);

    // Not retried in the background like an offline save.
    await advance(60_000);
    expect(save).toHaveBeenCalledTimes(2);

    // Other questions keep saving with the normal debounce.
    saver.update("q3", code("x = 1"));
    await advance(1500);
    expect(saved).toEqual(["q1:code", "q3:code"]);
    expect(saver.getSnapshot().state).toBe("error");

    // Changing the refused answer gives it a new chance.
    refuseQ12 = false;
    saver.update("q12", text("x".repeat(20_000)));
    expect(saver.getSnapshot().rejected).toEqual([]);
    expect(await saver.flush()).toBe(true);
    expect(saved).toEqual(["q1:code", "q3:code", "q12:20000"]);
    expect(saver.getSnapshot().state).toBe("saved");
    expect(saver.hasUnsaved).toBe(false);
  });

  test("a newer version typed while the refused one was being sent is still saved", async () => {
    let release: (() => void) | null = null;
    const save = jest.fn(async (_q: string, r: AnswerResponse) => {
      if ("text" in r && r.text === "te lang") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw badRequest();
      }
      return { status: "saved" };
    });
    const saver = makeSaver(save);
    saver.update("q1", text("te lang"));
    const done = saver.flush();
    await settle();
    saver.update("q1", text("korter"));
    (release as (() => void) | null)?.();
    expect(await done).toBe(true);
    expect(save).toHaveBeenLastCalledWith("q1", text("korter"));
    expect(saver.getSnapshot().rejected).toEqual([]);
    expect(saver.getSnapshot().state).toBe("saved");
  });

  test("only errors about the answer itself count as refused", () => {
    expect(isRejectedError(badRequest())).toBe(true);
    expect(isRejectedError({ data: { code: "PAYLOAD_TOO_LARGE" } })).toBe(true);
    expect(isRejectedError({ data: { code: "PARSE_ERROR" } })).toBe(true);
    // A proxy's 413 without a tRPC body.
    expect(isRejectedError({ meta: { response: { status: 413 } } })).toBe(true);
    // Retried, or handled elsewhere:
    expect(isRejectedError({ data: { code: "TOO_MANY_REQUESTS" } })).toBe(
      false,
    );
    expect(isRejectedError({ data: { code: "UNAUTHORIZED" } })).toBe(false);
    expect(isRejectedError({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(
      false,
    );
    expect(isRejectedError({ data: { code: "PRECONDITION_FAILED" } })).toBe(
      false,
    );
    expect(isRejectedError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRejectedError(null)).toBe(false);
  });

  test("the snapshot keeps the same rejected array while nothing changes", async () => {
    const save = jest.fn(async (questionId: string) => {
      if (questionId === "bad") throw badRequest();
      return { status: "saved" };
    });
    const saver = makeSaver(save);
    saver.update("bad", text("?"));
    await saver.flush();
    const first = saver.getSnapshot().rejected;
    saver.update("ok", text("!"));
    await saver.flush();
    expect(saver.getSnapshot().rejected).toBe(first);
  });
});

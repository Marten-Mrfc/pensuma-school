import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  claimLocalData,
  clearLocalUserData,
  LOCAL_DATA_OWNER_KEY,
  practiceCodeKey,
  pruneAttemptBackups,
  removeAttemptBackups,
} from "./local-data";

/** In-memory Storage stub (bun has no DOM storage by default). */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

type StorageGlobals = {
  localStorage?: Storage;
  sessionStorage?: Storage;
};

const g = globalThis as unknown as StorageGlobals;
const original = { local: g.localStorage, session: g.sessionStorage };

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: original.local,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: original.session,
    configurable: true,
    writable: true,
  });
});

describe("clearLocalUserData", () => {
  test("removes every pensuma: key from both storages", () => {
    const local = g.localStorage as Storage;
    const session = g.sessionStorage as Storage;
    local.setItem("pensuma:prefs:u1", "{}");
    local.setItem("pensuma:shortcuts", "off");
    local.setItem("pensuma:poging:abc", "print(1)");
    local.setItem("theme", "dark");
    local.setItem("other-app", "x");
    session.setItem("pensuma:draft", "x");
    session.setItem("keep", "y");

    expect(clearLocalUserData()).toBe(4);

    expect(local.getItem("pensuma:prefs:u1")).toBeNull();
    expect(local.getItem("pensuma:shortcuts")).toBeNull();
    expect(local.getItem("pensuma:poging:abc")).toBeNull();
    expect(session.getItem("pensuma:draft")).toBeNull();
    expect(local.getItem("theme")).toBe("dark");
    expect(local.getItem("other-app")).toBe("x");
    expect(session.getItem("keep")).toBe("y");
  });

  test("does nothing harmful when storage is empty", () => {
    expect(clearLocalUserData()).toBe(0);
  });

  test("never throws when storage access fails", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
      configurable: true,
    });
    (g.sessionStorage as Storage).setItem("pensuma:x", "1");
    expect(() => clearLocalUserData()).not.toThrow();
    expect((g.sessionStorage as Storage).getItem("pensuma:x")).toBeNull();
  });

  test("works when storage is missing entirely", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(clearLocalUserData()).toBe(0);
  });
});

describe("claimLocalData (shared computers, browser closed without signing out)", () => {
  const local = () => g.localStorage as Storage;
  const session = () => g.sessionStorage as Storage;

  test("another user's practice code and answer backups are gone before the next student reads them", () => {
    claimLocalData("student-a");
    local().setItem(practiceCodeKey("student-a"), JSON.stringify("# geheim"));
    local().setItem("pensuma:poging:att-1:answers", "{}");
    local().setItem("pensuma:prefs:student-a", "{}");
    session().setItem("pensuma:draft", "x");
    local().setItem("theme", "dark");

    // The browser was closed (session cookie gone); student B signs in.
    expect(claimLocalData("student-b")).toBe(true);
    expect(local().getItem(practiceCodeKey("student-a"))).toBeNull();
    expect(local().getItem("pensuma:poging:att-1:answers")).toBeNull();
    expect(local().getItem("pensuma:prefs:student-a")).toBeNull();
    expect(session().getItem("pensuma:draft")).toBeNull();
    expect(local().getItem("theme")).toBe("dark");
    expect(local().getItem(LOCAL_DATA_OWNER_KEY)).toBe("student-b");
  });

  test("the same user keeps their data (an unsaved backup survives reopening)", () => {
    claimLocalData("student-a");
    local().setItem("pensuma:poging:att-1:answers", "{}");
    expect(claimLocalData("student-a")).toBe(false);
    expect(local().getItem("pensuma:poging:att-1:answers")).toBe("{}");
  });

  test("keys without a known owner (stored before this check) are cleared", () => {
    local().setItem("pensuma:oefenen:code", JSON.stringify("# van iemand"));
    expect(claimLocalData("student-b")).toBe(true);
    expect(local().getItem("pensuma:oefenen:code")).toBeNull();
    expect(local().getItem(LOCAL_DATA_OWNER_KEY)).toBe("student-b");
  });

  test("answer backups without a known owner survive (a test running while Pensuma is updated)", () => {
    // Stored before the owner marker existed; may hold answers the server
    // never got. Only its own attempt restores it, and the dashboard prunes
    // backups that aren't this student's running attempts.
    local().setItem("pensuma:poging:att-1:answers", '{"q1":"print(1)"}');
    local().setItem("pensuma:shortcuts", "off");
    expect(claimLocalData("student-a")).toBe(true);
    expect(local().getItem("pensuma:poging:att-1:answers")).toBe(
      '{"q1":"print(1)"}',
    );
    expect(local().getItem("pensuma:shortcuts")).toBeNull();
    expect(local().getItem(LOCAL_DATA_OWNER_KEY)).toBe("student-a");
    // From now on the owner is known: the next student gets none of it.
    expect(claimLocalData("student-b")).toBe(true);
    expect(local().getItem("pensuma:poging:att-1:answers")).toBeNull();
  });

  test("the new user's own id-keyed keys, written before the claim, survive", () => {
    claimLocalData("student-a");
    local().setItem(practiceCodeKey("student-a"), JSON.stringify("# geheim"));
    local().setItem("pensuma:shortcuts", "off");
    // Student B's preferences mirror is written as soon as B's page mounts,
    // before a page claims the browser.
    local().setItem("pensuma:prefs:student-b", '{"fontScale":1.2}');
    local().setItem("pensuma:prefs:student-bb", "{}");
    expect(claimLocalData("student-b")).toBe(true);
    expect(local().getItem("pensuma:prefs:student-b")).toBe(
      '{"fontScale":1.2}',
    );
    // Not B's: another id that merely starts the same, unkeyed settings and
    // A's code.
    expect(local().getItem("pensuma:prefs:student-bb")).toBeNull();
    expect(local().getItem("pensuma:shortcuts")).toBeNull();
    expect(local().getItem(practiceCodeKey("student-a"))).toBeNull();
  });

  test("after a sign-out the next user's own keys are kept, nothing else is left", () => {
    local().setItem("pensuma:prefs:student-b", "{}");
    expect(claimLocalData("student-b")).toBe(false);
    expect(local().getItem("pensuma:prefs:student-b")).toBe("{}");
    expect(local().getItem(LOCAL_DATA_OWNER_KEY)).toBe("student-b");
  });

  test("an empty browser is just marked, nothing cleared", () => {
    local().setItem("theme", "light");
    expect(claimLocalData("student-a")).toBe(false);
    expect(local().getItem(LOCAL_DATA_OWNER_KEY)).toBe("student-a");
    expect(local().getItem("theme")).toBe("light");
  });

  test("signing out removes the owner marker too", () => {
    claimLocalData("student-a");
    clearLocalUserData();
    expect(local().getItem(LOCAL_DATA_OWNER_KEY)).toBeNull();
    expect(claimLocalData("student-b")).toBe(false);
  });

  test("practice code is keyed per user", () => {
    expect(practiceCodeKey("u1")).toBe("pensuma:oefenen:u1:code");
    expect(practiceCodeKey("u1")).not.toBe(practiceCodeKey("u2"));
  });

  test("never throws when storage access fails", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
      configurable: true,
    });
    expect(() => claimLocalData("student-a")).not.toThrow();
    expect(() => removeAttemptBackups(["x"])).not.toThrow();
    expect(() => pruneAttemptBackups([])).not.toThrow();
  });
});

describe("attempt backups", () => {
  const local = () => g.localStorage as Storage;

  test("removeAttemptBackups removes only those attempts", () => {
    local().setItem("pensuma:poging:a1:answers", "{}");
    local().setItem("pensuma:poging:a1:flags", "[]");
    local().setItem("pensuma:poging:a10:answers", "{}");
    local().setItem("pensuma:poging:a2:answers", "{}");
    expect(removeAttemptBackups(["a1"])).toBe(2);
    expect(local().getItem("pensuma:poging:a10:answers")).toBe("{}");
    expect(local().getItem("pensuma:poging:a2:answers")).toBe("{}");
  });

  test("pruneAttemptBackups keeps attempts still in progress", () => {
    local().setItem("pensuma:poging:busy:answers", "{}");
    local().setItem("pensuma:poging:done:answers", "{}");
    local().setItem("pensuma:poging:done:position", "3");
    local().setItem("pensuma:prefs:u1", "{}");
    expect(pruneAttemptBackups(["busy"])).toBe(2);
    expect(local().getItem("pensuma:poging:busy:answers")).toBe("{}");
    expect(local().getItem("pensuma:prefs:u1")).toBe("{}");
  });
});

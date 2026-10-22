import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clearLocalUserData } from "./local-data";

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

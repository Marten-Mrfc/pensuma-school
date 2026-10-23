import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LOCAL_DATA_OWNER_KEY, practiceCodeKey } from "@/lib/local-data";
import { completeSignIn } from "./complete-sign-in";

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

const g = globalThis as unknown as {
  localStorage?: Storage;
  sessionStorage?: Storage;
};
const original = { local: g.localStorage, session: g.sessionStorage };

function setStorage(local: Storage | undefined, session: Storage | undefined) {
  for (const [name, value] of [
    ["localStorage", local],
    ["sessionStorage", session],
  ] as const) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

beforeEach(() => setStorage(new MemoryStorage(), new MemoryStorage()));
afterEach(() => setStorage(original.local, original.session));

describe("completeSignIn", () => {
  test("clears the previous user's data before navigating", () => {
    const local = g.localStorage as Storage;
    local.setItem(LOCAL_DATA_OWNER_KEY, "user-a");
    local.setItem(practiceCodeKey("user-a"), JSON.stringify("print('a')"));
    local.setItem("pensuma:poging:att-1:answers", "{}");

    const seen: { url: string; owner: string | null; keys: number }[] = [];
    completeSignIn("user-b", "/leerling", (url) =>
      seen.push({
        url,
        owner: local.getItem(LOCAL_DATA_OWNER_KEY),
        keys: local.length,
      }),
    );

    // Claimed (only the owner marker left) by the time the page navigates.
    expect(seen).toEqual([{ url: "/leerling", owner: "user-b", keys: 1 }]);
  });

  test("keeps the same user's own data (an unsaved answer backup)", () => {
    const local = g.localStorage as Storage;
    local.setItem(LOCAL_DATA_OWNER_KEY, "user-a");
    local.setItem("pensuma:poging:att-1:answers", "{}");
    completeSignIn("user-a", "/leerling", () => {});
    expect(local.getItem("pensuma:poging:att-1:answers")).toBe("{}");
  });

  test("still navigates when storage is blocked", () => {
    setStorage(undefined, undefined);
    const urls: string[] = [];
    completeSignIn("user-b", "/docent", (url) => urls.push(url));
    expect(urls).toEqual(["/docent"]);
  });
});

describe("login form", () => {
  test("both sign-in handlers (leerling and docent) go through completeSignIn", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "login-form.tsx"),
      "utf8",
    );
    const calls = source.match(
      /completeSignIn\(data\.user\.id, targetFor\(role, next\)\)/g,
    );
    expect(calls).toHaveLength(2);
    // Navigating straight after sign-in would skip claiming the local data.
    expect(source).not.toMatch(
      /role \?\? ROLES\.\w+;\s*window\.location\.assign/,
    );
  });
});

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCAL_DATA_OWNER_KEY, practiceCodeKey } from "@/lib/local-data";

// PreferencesSync needs tRPC; it is not what this test is about.
mock.module("@/components/preferences/preferences-sync", () => ({
  PreferencesSync: () => null,
}));

const { CurrentUserProvider } = await import("./current-user");

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

const g = globalThis as Record<string, unknown>;
const original = {
  window: g.window,
  localStorage: g.localStorage,
  sessionStorage: g.sessionStorage,
};

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

let local: MemoryStorage;
beforeEach(() => {
  local = new MemoryStorage();
  define("localStorage", local);
  define("sessionStorage", new MemoryStorage());
  // A browser render (on the server nothing is claimed).
  define("window", globalThis);
});

afterAll(() => {
  for (const [name, value] of Object.entries(original)) define(name, value);
});

const user = (id: string) => ({
  id,
  name: "Test",
  email: `${id}@example.test`,
  role: "student",
  username: "17053",
});

/** A child that reads storage while rendering, like a state initialiser. */
function PracticeCode({ userId }: { userId: string }) {
  return <span>{local.getItem(practiceCodeKey(userId)) ?? "leeg"}</span>;
}
function Backup() {
  return <span>{local.getItem("pensuma:poging:att-1:answers") ?? "geen"}</span>;
}

describe("CurrentUserProvider claims the browser's data for the user", () => {
  test("another user's data is gone before any child reads storage", () => {
    local.setItem(LOCAL_DATA_OWNER_KEY, "user-a");
    local.setItem("pensuma:poging:att-1:answers", '{"q1":"van A"}');
    const html = renderToStaticMarkup(
      <CurrentUserProvider user={user("user-b")}>
        <Backup />
      </CurrentUserProvider>,
    );
    expect(html).toBe("<span>geen</span>");
    expect(local.getItem(LOCAL_DATA_OWNER_KEY)).toBe("user-b");
  });

  test("the same user's own data stays", () => {
    local.setItem(LOCAL_DATA_OWNER_KEY, "user-a");
    local.setItem(practiceCodeKey("user-a"), "print('a')");
    local.setItem("pensuma:poging:att-1:answers", '{"q1":"van A"}');
    const html = renderToStaticMarkup(
      <CurrentUserProvider user={user("user-a")}>
        <PracticeCode userId="user-a" />
        <Backup />
      </CurrentUserProvider>,
    );
    expect(html).toBe(
      `<span>print(&#x27;a&#x27;)</span><span>{&quot;q1&quot;:&quot;van A&quot;}</span>`,
    );
  });

  test("nothing is touched during a server render", () => {
    define("window", undefined);
    local.setItem(LOCAL_DATA_OWNER_KEY, "user-a");
    local.setItem("pensuma:poging:att-1:answers", "{}");
    renderToStaticMarkup(
      <CurrentUserProvider user={user("user-b")}>
        <Backup />
      </CurrentUserProvider>,
    );
    expect(local.getItem(LOCAL_DATA_OWNER_KEY)).toBe("user-a");
    expect(local.getItem("pensuma:poging:att-1:answers")).toBe("{}");
  });
});

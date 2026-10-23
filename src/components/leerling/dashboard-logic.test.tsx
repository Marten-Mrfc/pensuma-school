import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ATTEMPT_BACKUP_PREFIX, pruneAttemptBackups } from "@/lib/local-data";
import {
  backupKeepKey,
  finishedEmptyCopy,
  inProgressAttemptIds,
  keepKeyIds,
} from "./dashboard-logic";
import { ATTEMPT_STORAGE_PREFIX, storageKey } from "./exam/types";
import { hiddenResultLabel, hiddenResultReason } from "./format";

/** Minimal in-memory localStorage (bun has none). */
function installMemoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  const g = globalThis as Record<string, unknown>;
  const previous = Object.getOwnPropertyDescriptor(g, "localStorage");
  Object.defineProperty(g, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return {
    restore() {
      if (previous) Object.defineProperty(g, "localStorage", previous);
      else delete g.localStorage;
    },
  };
}

const item = (
  inProgress: string | null,
  lastAttempt: string | null = null,
) => ({
  inProgress: inProgress ? { attemptId: inProgress } : null,
  lastAttempt: lastAttempt ? { attemptId: lastAttempt } : null,
});

describe("hidden results (A28)", () => {
  test("'never' says the teacher discusses it, never 'Resultaat volgt'", () => {
    expect(hiddenResultReason({ hiddenReason: "never" })).toBe("never");
    expect(hiddenResultLabel({ hiddenReason: "never" })).toBe(
      "Je docent bespreekt het resultaat",
    );
  });

  test("waiting for the close or release (or no reason sent) still says it follows", () => {
    expect(hiddenResultLabel({ hiddenReason: "pending" })).toBe(
      "Resultaat volgt",
    );
    expect(hiddenResultLabel({ resultsVisible: false })).toBe(
      "Resultaat volgt",
    );
    expect(hiddenResultLabel({ hiddenReason: null })).toBe("Resultaat volgt");
  });
});

describe("empty 'Afgerond' section (A30)", () => {
  test("with hand-ins still under Open toetsen it points to Resultaten", () => {
    const copy = finishedEmptyCopy([item(null, "a1"), item(null)]);
    expect(copy.linkToResults).toBe(true);
    expect(copy.description).toContain("Resultaten");
    expect(copy.description).not.toContain("Toetsen die je hebt ingeleverd");
  });

  test("without any hand-in it no longer promises every hand-in appears here", () => {
    const copy = finishedEmptyCopy([item(null), item("busy")]);
    expect(copy.linkToResults).toBe(false);
    expect(copy.title).toBe("Nog niets afgerond");
    expect(copy.description).not.toContain("die je hebt ingeleverd");
  });
});

describe("stale answer backups are pruned on the dashboard (X04)", () => {
  let storage: ReturnType<typeof installMemoryStorage> | null = null;
  afterEach(() => {
    storage?.restore();
    storage = null;
  });

  test("only attempts still running keep their local copies", () => {
    storage = installMemoryStorage();
    // The exam keys and the prune use the same prefix.
    expect(ATTEMPT_STORAGE_PREFIX).toBe(ATTEMPT_BACKUP_PREFIX);
    for (const id of ["busy", "done", "deleted"]) {
      localStorage.setItem(storageKey(id), "{}");
      localStorage.setItem(storageKey(id, "flags"), "[]");
      localStorage.setItem(storageKey(id, "pos"), "0");
    }
    localStorage.setItem("pensuma:prefs:u1", "{}");

    const keep = inProgressAttemptIds([
      [item("busy", "old"), item(null, "done")],
      [],
      [item(null, "done")],
    ]);
    expect(keep).toEqual(["busy"]);
    expect(pruneAttemptBackups(keep)).toBe(6);
    expect(localStorage.getItem(storageKey("busy"))).toBe("{}");
    expect(localStorage.getItem(storageKey("busy", "flags"))).toBe("[]");
    expect(localStorage.getItem(storageKey("done"))).toBeNull();
    expect(localStorage.getItem(storageKey("deleted", "pos"))).toBeNull();
    expect(localStorage.getItem("pensuma:prefs:u1")).toBe("{}");
  });

  test("only fresh dashboard data decides what is pruned", () => {
    const data = {
      open: [item("b-busy"), item(null, "done")],
      upcoming: [],
      finished: [item("a-busy")],
    };
    // Cached data (from before this page opened) or no data: prune nothing.
    expect(backupKeepKey({ isFetchedAfterMount: false, data })).toBeNull();
    expect(backupKeepKey({ isFetchedAfterMount: true })).toBeNull();
    // Fresh data: keep the running attempts (stable order for the effect).
    const key = backupKeepKey({ isFetchedAfterMount: true, data });
    expect(key).toBe("a-busy,b-busy");
    expect(keepKeyIds(key as string)).toEqual(["a-busy", "b-busy"]);
    // Nothing running: every backup may go.
    const none = backupKeepKey({
      isFetchedAfterMount: true,
      data: { open: [item(null, "x")], upcoming: [], finished: [] },
    });
    expect(none).toBe("");
    expect(keepKeyIds(none as string)).toEqual([]);
  });

  test("the dashboard prunes with that key once its data is fresh", () => {
    const source = fs.readFileSync(
      path.join(import.meta.dir, "dashboard.tsx"),
      "utf8",
    );
    expect(source).toContain("claimLocalData(user.id)");
    expect(source).toContain("backupKeepKey(query)");
    expect(source).toContain("pruneAttemptBackups(keepKeyIds(keepKey))");
  });
});

describe("FinishedEmpty renders the right copy", () => {
  test("link to Resultaten only when there are hand-ins", async () => {
    const { FinishedEmpty } = await import("./dashboard");
    type Item = Parameters<typeof FinishedEmpty>[0]["open"][number];
    const withHandIn = renderToStaticMarkup(
      <FinishedEmpty open={[item(null, "a1") as unknown as Item]} />,
    );
    expect(withHandIn).toContain("Naar Resultaten");
    expect(withHandIn).toContain('href="/leerling/resultaten"');
    const without = renderToStaticMarkup(<FinishedEmpty open={[]} />);
    expect(without).not.toContain("Naar Resultaten");
  });
});

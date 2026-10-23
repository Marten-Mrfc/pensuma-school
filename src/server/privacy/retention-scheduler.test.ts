import { describe, expect, spyOn, test } from "bun:test";
import type { Pool } from "pg";
import { runLockedRetention } from "./retention-scheduler";

describe("runLockedRetention: the failure log line", () => {
  test("never carries the query parameters of a database error", async () => {
    const failing = {
      connect: async () => {
        throw new Error(
          'Failed query: update "user" set "name" = $1 where "id" = $2\nparams: Jan Jansen,17053',
        );
      },
    } as unknown as Pool;
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runLockedRetention(failing)).toBe("failed");
      const lines = spy.mock.calls.map((c) => String(c[0]));
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0] ?? "{}");
      expect(entry).toMatchObject({ level: "error", msg: "retention_failed" });
      expect(entry.error).toContain("params: [weggelaten]");
      expect(lines[0]).not.toContain("Jan Jansen");
      expect(lines[0]).not.toContain("17053");
    } finally {
      spy.mockRestore();
    }
  });
});

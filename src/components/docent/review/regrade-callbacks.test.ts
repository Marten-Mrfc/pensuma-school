/**
 * V10: after "Opnieuw nakijken" on one attempt fails partway (BAD_GATEWAY
 * "Opnieuw nagekeken, maar …"), the review is refreshed as well: some
 * answers did get a new score.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { regradeAttemptCallbacks } from "./regrade-callbacks";

function setup() {
  const calls: string[] = [];
  const callbacks = regradeAttemptCallbacks({
    refresh: async () => {
      calls.push("refresh");
    },
    onDone: () => calls.push("done"),
    onFailed: (message) => calls.push(`failed: ${message}`),
  });
  return { calls, callbacks };
}

describe("regradeAttempt callbacks (V10)", () => {
  test("an error still refreshes the review and assignment queries", async () => {
    const { calls, callbacks } = setup();
    const partial = Object.assign(
      new Error(
        "Opnieuw nagekeken, maar 1 antwoord kon niet worden nagekeken. Probeer het later opnieuw.",
      ),
      { data: { code: "BAD_GATEWAY" } },
    );
    await callbacks.onError(partial);
    expect(calls).toEqual([
      "failed: Opnieuw nagekeken, maar 1 antwoord kon niet worden nagekeken. Probeer het later opnieuw.",
      "refresh",
    ]);
  });

  test("success refreshes first, then confirms", async () => {
    const { calls, callbacks } = setup();
    await callbacks.onSuccess();
    expect(calls).toEqual(["refresh", "done"]);
  });

  test("the attempt review uses them", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "attempt-review.tsx"),
      "utf8",
    );
    expect(source).toMatch(
      /regradeAttempt\.mutationOptions\(\s*regradeAttemptCallbacks\(/,
    );
  });
});

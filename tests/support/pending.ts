/**
 * Tests for TARGET behaviour that another work package is still building.
 *
 * They are registered as `test.todo`: a normal run lists them without
 * running them. `bun test --todo <path>` runs them and reports every one
 * that now PASSES as a failure ("marked as todo but passes"): that is the
 * signal to turn it into a normal `test(...)`.
 */
import { test } from "bun:test";

export function pendingTest(
  owner: string,
  name: string,
  fn: () => void | Promise<unknown>,
  timeoutMs?: number,
): void {
  test.todo(`${name} [wacht op ${owner}]`, fn, timeoutMs);
}

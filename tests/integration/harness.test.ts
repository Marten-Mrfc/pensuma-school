/**
 * Smoke tests for the test harness itself (preload, database, callers,
 * factories, fake grader).
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { callerFor } from "../support/caller";
import { countRows, resetDatabase } from "../support/db";
import {
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";
import * as fakeGrader from "../support/fake-grader";

beforeEach(resetDatabase);

describe("test harness", () => {
  test("runs against a *_test database, never the dev database", () => {
    const name = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
    expect(name).toMatch(/_test$/);
  });

  test("an empty database needs setup", async () => {
    await expect(callerFor(null).setup.status()).resolves.toMatchObject({
      needsSetup: true,
    });
  });

  test("resetDatabase empties every table", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    await createClass("Klas X", [student.id]);
    await createTest({ createdById: teacher.id, questions: [q.mc()] });
    expect(await countRows("user")).toBe(2);
    await resetDatabase();
    for (const table of ["user", "class", "class_member", "test", "question"]) {
      expect(await countRows(table)).toBe(0);
    }
  });

  test("callerFor builds sessions with the right role", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    await expect(callerFor(teacher).class.list()).resolves.toBeDefined();
    await expect(callerFor(student).class.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(student).portal.dashboard()).resolves.toMatchObject({
      open: [],
    });
  });

  test("@/server/grader is the fake grader", async () => {
    const grader = await import("@/server/grader");
    const result = await grader.gradeCode({
      code: "print(1)",
      tests: [
        {
          id: "t1",
          kind: "io",
          name: "a",
          stdin: "",
          expectedOutput: "1",
          match: "flexible",
          ignoreCase: true,
          tolerance: 0.01,
          hidden: true,
          weight: 2,
        },
      ],
      checks: [],
      timeLimitMs: 1000,
    });
    expect(result.fraction).toBe(1);
    expect(result.tests[0]).toMatchObject({ hidden: true, weight: 2 });
    expect(fakeGrader.gradeCalls).toHaveLength(1);
  });

  test("the fake grader exports the same names as the real one", () => {
    const source = readFileSync(
      path.resolve(import.meta.dir, "../../src/server/grader/index.ts"),
      "utf8",
    );
    const block = /export\s*\{([^}]*)\}\s*from/.exec(source)?.[1] ?? "";
    const realNames = block
      .split(",")
      .map(
        (s) =>
          s
            .trim()
            .split(/\s+as\s+/)
            .pop() ?? "",
      )
      .filter(Boolean)
      .sort();
    expect(realNames.length).toBeGreaterThan(0);
    for (const name of realNames) {
      expect(typeof (fakeGrader as Record<string, unknown>)[name]).toBe(
        "function",
      );
    }
  });
});

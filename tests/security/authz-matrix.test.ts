/**
 * Authorization matrix: every tRPC procedure, every role.
 *
 * Auth middleware runs before input parsing, so calling with `{}` is enough
 * to see the access decision: anonymous → UNAUTHORIZED (unless public),
 * wrong role → FORBIDDEN, the allowed role → anything else (BAD_REQUEST for
 * the empty input is fine).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/server/api/root";
import { setupRouter } from "@/server/api/routers/setup";
import {
  createTRPCRouter,
  publicProcedure,
  type TRPCMeta,
} from "@/server/api/trpc";
import { type Caller, callerFor, type TestUser } from "../support/caller";
import { resetDatabase } from "../support/db";
import { insertStudent, insertTeacher } from "../support/factories";
import {
  type Access,
  classify,
  PENDING_PASSWORD_CHANGE_ALLOWED,
  staleExactEntries,
  stalePendingPasswordEntries,
  unclassifiedPaths,
} from "./access-policy";

const PATHS = Object.keys(appRouter._def.procedures).sort();

type Outcome = { code: string | null; message?: string };

type ProcedureWithMeta = { _def: { meta?: TRPCMeta } };

/** Procedures whose meta lets a teacher in with a temporary password. */
const PENDING_PASSWORD_META = PATHS.filter((path) => {
  // _def.procedures is the flat "a.b" → procedure map, typed as the router.
  const flat = appRouter._def.procedures as unknown as Record<
    string,
    ProcedureWithMeta | undefined
  >;
  return flat[path]?._def.meta?.allowWithPendingPasswordChange === true;
});

async function call(caller: Caller, path: string): Promise<Outcome> {
  let target: unknown = caller;
  for (const part of path.split(".")) {
    target = (target as Record<string, unknown>)[part];
  }
  if (typeof target !== "function") {
    throw new Error(`No caller function for ${path}`);
  }
  try {
    await (target as (input: unknown) => Promise<unknown>)({});
    return { code: null };
  } catch (err) {
    if (err instanceof TRPCError)
      return { code: err.code, message: err.message };
    return {
      code: "NON_TRPC_ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

const allows = (access: Access, role: "anon" | "admin" | "student") => {
  switch (access) {
    case "public":
      return true;
    case "authenticated":
      return role !== "anon";
    default:
      return access === role;
  }
};

describe("access policy", () => {
  test("every procedure has an access decision", () => {
    const missing = unclassifiedPaths(PATHS);
    if (missing.length > 0) {
      throw new Error(
        `Procedures without an entry in tests/security/access-policy.ts:\n  ${missing.join("\n  ")}`,
      );
    }
    expect(PATHS.length).toBeGreaterThan(50);
  });

  test("a new procedure without a policy entry fails the check", () => {
    const withDummy = createTRPCRouter({
      ...appRouter._def.record,
      unknownRouter: createTRPCRouter({
        secret: publicProcedure.query(() => "geheim"),
      }),
      setup: createTRPCRouter({
        ...setupRouter._def.record,
        newSetupStep: publicProcedure.query(() => "nieuw"),
      }),
    });
    expect(unclassifiedPaths(Object.keys(withDummy._def.procedures))).toEqual([
      "setup.newSetupStep",
      "unknownRouter.secret",
    ]);
  });

  test("exact entries point at existing procedures", () => {
    expect(staleExactEntries(PATHS)).toEqual([]);
    expect(stalePendingPasswordEntries(PATHS)).toEqual([]);
  });

  test("pending-password-change exemptions match the procedure meta", () => {
    expect(PENDING_PASSWORD_META).toEqual(
      [...PENDING_PASSWORD_CHANGE_ALLOWED].sort(),
    );
    for (const path of PENDING_PASSWORD_CHANGE_ALLOWED) {
      expect(classify(path)).toBe("admin");
    }
  });
});

describe("authorization matrix", () => {
  let teacher: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    await resetDatabase();
    teacher = await insertTeacher();
    student = await insertStudent();
  });

  test("anonymous callers are rejected (except public procedures)", async () => {
    const wrong: string[] = [];
    for (const path of PATHS) {
      const access = classify(path);
      if (!access) continue;
      const out = await call(callerFor(null), path);
      if (allows(access, "anon")) {
        if (out.code === "UNAUTHORIZED" || out.code === "FORBIDDEN")
          wrong.push(`${path}: public but got ${out.code}`);
      } else if (out.code !== "UNAUTHORIZED") {
        wrong.push(`${path}: expected UNAUTHORIZED, got ${out.code}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("students get FORBIDDEN on teacher procedures", async () => {
    const wrong: string[] = [];
    const caller = callerFor(student);
    for (const path of PATHS) {
      const access = classify(path);
      if (!access) continue;
      const out = await call(caller, path);
      if (allows(access, "student")) {
        if (out.code === "UNAUTHORIZED" || out.code === "FORBIDDEN")
          wrong.push(`${path}: allowed but got ${out.code} (${out.message})`);
      } else if (out.code !== "FORBIDDEN") {
        wrong.push(`${path}: expected FORBIDDEN, got ${out.code}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("a teacher with a temporary password only reaches the exempt procedures", async () => {
    const wrong: string[] = [];
    const caller = callerFor(teacher, undefined, {
      userOverrides: { passwordChangeRequired: true },
    });
    const exempt = new Set(PENDING_PASSWORD_CHANGE_ALLOWED);
    for (const path of PATHS) {
      if (classify(path) !== "admin") continue;
      const out = await call(caller, path);
      if (exempt.has(path)) {
        if (out.code === "UNAUTHORIZED" || out.code === "FORBIDDEN")
          wrong.push(`${path}: exempt but got ${out.code} (${out.message})`);
      } else if (
        out.code !== "FORBIDDEN" ||
        out.message !== "Wijzig eerst je tijdelijke wachtwoord."
      ) {
        wrong.push(
          `${path}: expected the password-change FORBIDDEN, got ${out.code} (${out.message})`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  test("teachers get FORBIDDEN on student procedures", async () => {
    const wrong: string[] = [];
    const caller = callerFor(teacher);
    for (const path of PATHS) {
      const access = classify(path);
      if (!access) continue;
      const out = await call(caller, path);
      if (allows(access, "admin")) {
        if (out.code === "UNAUTHORIZED" || out.code === "FORBIDDEN")
          wrong.push(`${path}: allowed but got ${out.code} (${out.message})`);
      } else if (out.code !== "FORBIDDEN") {
        wrong.push(`${path}: expected FORBIDDEN, got ${out.code}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

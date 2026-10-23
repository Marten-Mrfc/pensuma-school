/**
 * The server log line the tRPC route writes for an error (route.ts onError,
 * through the real route handler, a real session cookie and the database).
 *
 * Expected errors (a pupil calling something that is not theirs, a closed
 * afname, a rate limit) are routine for pupils: they log path and code only,
 * never the user id, so the container log is no activity trail per pupil.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { GET } from "@/app/api/trpc/[trpc]/route";
import { auth } from "@/server/auth";
import { testHeaders } from "../support/caller";
import { resetDatabase } from "../support/db";
import { createStudentLogin } from "../support/factories";

beforeEach(resetDatabase);

const spies: ReturnType<typeof spyOn>[] = [];
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

/** Everything the route writes to the console while `run` runs. */
async function captureLog(run: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  for (const method of ["info", "warn", "error", "log"] as const) {
    spies.push(
      spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      }),
    );
  }
  await run();
  for (const spy of spies.splice(0)) spy.mockRestore();
  return lines;
}

async function studentCookie() {
  const s = await createStudentLogin();
  const res = await auth.api.signInUsername({
    body: { username: s.number, password: s.pin, rememberMe: false },
    headers: testHeaders(),
    asResponse: true,
  });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { student: s, cookie };
}

describe("tRPC error log (route.ts)", () => {
  test("a pupil's FORBIDDEN call logs path and code, not the pupil", async () => {
    const { student, cookie } = await studentCookie();
    let status = 0;
    const lines = await captureLog(async () => {
      const res = await GET(
        new Request("http://localhost:3999/api/trpc/class.list", {
          headers: testHeaders({ cookie }),
        }),
      );
      status = res.status;
      await res.text();
    });
    expect(status).toBe(403);
    const logged = lines.filter((l) => l.includes('"trpc_error"'));
    expect(logged).toHaveLength(1);
    const line = JSON.parse(logged[0]) as Record<string, unknown>;
    expect(line).toMatchObject({
      level: "info",
      event: "trpc_error",
      path: "class.list",
      code: "FORBIDDEN",
    });
    expect(line).not.toHaveProperty("userId");
    expect(logged[0]).not.toContain(student.id);
    expect(logged[0]).not.toContain(student.number);
  });
});

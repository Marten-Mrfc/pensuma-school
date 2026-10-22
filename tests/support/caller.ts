/**
 * tRPC callers for tests, without HTTP:
 *
 *   const teacher = await insertTeacher();
 *   const out = await callerFor(teacher).class.list();
 *   await expect(callerFor(null).class.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
 *
 * The context is built with the app's own `createTRPCContext` (so any field
 * added there is present), then the session is replaced by a better-auth
 * shaped session for `user`. The user row must exist in the database (see
 * factories.ts). For the real cookie flow use `callerForCookie`.
 */
import { createCaller } from "@/server/api/root";
import { createTRPCContext, type TRPCContext } from "@/server/api/trpc";

export type TestUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "student";
  username: string | null;
};

export type CallerOptions = {
  /** Extra user fields (e.g. `{ passwordChangeRequired: true }`). */
  userOverrides?: Record<string, unknown>;
};

export type Caller = ReturnType<typeof createCaller>;

export function testHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "x-forwarded-for": "127.0.0.1",
    "user-agent": "bun-test",
    ...extra,
  });
}

/** A better-auth shaped `{ session, user }` for a test user. */
export function fakeSession(
  user: TestUser,
  opts: CallerOptions = {},
): NonNullable<TRPCContext["session"]> {
  const now = new Date();
  return {
    session: {
      id: `sess-${user.id}`,
      token: `tok-${user.id}`,
      userId: user.id,
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: "127.0.0.1",
      userAgent: "bun-test",
      impersonatedBy: null,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      username: user.username,
      displayUsername: user.username,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      banned: false,
      banReason: null,
      banExpires: null,
      passwordChangeRequired: false,
      ...opts.userOverrides,
    },
  } as unknown as NonNullable<TRPCContext["session"]>;
}

/** Caller acting as `user` (null = anonymous). */
export function callerFor(
  user: TestUser | null,
  headers: Headers = testHeaders(),
  opts: CallerOptions = {},
): Caller {
  return createCaller(async () => {
    const base = await createTRPCContext({ headers });
    return {
      ...base,
      session: user ? fakeSession(user, opts) : null,
    } as TRPCContext;
  });
}

/** Caller with the context the route handler would build for a cookie. */
export function callerForCookie(cookie: string): Caller {
  return createCaller(() =>
    createTRPCContext({ headers: testHeaders({ cookie }) }),
  );
}

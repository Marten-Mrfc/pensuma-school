import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ROLES, ROUTES } from "@/lib/auth-shared";
import { auth } from "@/server/auth";

/**
 * Data Access Layer for the current session (deduped per request).
 *
 * Reads the session from the database (no 60-second cookie cache), so a
 * deactivated student, a reset PIN or a removed teacher is signed out at
 * once.
 *
 * With `cacheComponents` enabled, anything that calls these reads request
 * data, so it must render inside a <Suspense> boundary.
 */
export const getSession = cache(async () =>
  auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  }),
);

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  username: string | null;
  impersonatedBy: string | null;
  /** Teacher signed in with a temporary password (see PasswordChangeGate). */
  passwordChangeRequired: boolean;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const u = session.user as typeof session.user & {
    role?: string | null;
    username?: string | null;
    passwordChangeRequired?: boolean | null;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? ROLES.student,
    username: u.username ?? null,
    impersonatedBy:
      (session.session as { impersonatedBy?: string | null }).impersonatedBy ??
      null,
    passwordChangeRequired: u.passwordChangeRequired === true,
  };
});

/** Redirects to the login page when not signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(ROUTES.login);
  return user;
}

/** Teachers only. Students are sent to their own dashboard. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== ROLES.admin) redirect(ROUTES.studentHome);
  return user;
}

/** Students only. Teachers are sent to their dashboard (unless impersonating). */
export async function requireStudent(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== ROLES.student) redirect(ROUTES.adminHome);
  return user;
}

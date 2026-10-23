/**
 * Who may call which tRPC procedure. tests/security/authz-matrix.test.ts
 * fails for every procedure this file does not classify, so a new procedure
 * can never ship without a deliberate access decision.
 *
 * - Single-role routers have a router-level default.
 * - Mixed routers (setup, privacy) need exact entries; privacy.* defaults
 *   to admin, setup.* has no default at all.
 * - A teacher with a temporary password (passwordChangeRequired) may only
 *   call the admin procedures in PENDING_PASSWORD_CHANGE_ALLOWED; the list
 *   must match the procedures' `allowWithPendingPasswordChange` meta.
 *
 * The matrix enumerates appRouter automatically and checks every decision
 * for real (anonymous, student, teacher), so a router default can never
 * hide a procedure that is more open than its router.
 */
export type Access =
  /** Anyone, signed in or not. */
  | "public"
  /** Teachers (role "admin"). */
  | "admin"
  /** Students (role "student"). */
  | "student"
  /** Any signed-in user. */
  | "authenticated";

/** Routers whose procedures all share one access level. */
export const ROUTER_DEFAULTS: Readonly<Record<string, Access>> = {
  class: "admin",
  student: "admin",
  staff: "admin",
  test: "admin",
  question: "admin",
  code: "admin",
  assignment: "admin",
  review: "admin",
  dashboard: "admin",
  accommodation: "admin",
  similarity: "admin",
  analysis: "admin",
  bank: "admin",
  feedback: "admin",
  portal: "student",
  help: "student",
  preferences: "authenticated",
};

/** Exact entries for mixed routers. They win over any default. */
export const EXACT_POLICY: Readonly<Record<string, Access>> = {
  "setup.status": "public",
  "setup.createFirstAdmin": "public",
  "setup.loadDemoData": "admin",
  "privacy.publicInfo": "public",
  "privacy.myData": "student",
  "privacy.exportMyData": "student",
};

/**
 * Admin procedures a teacher may still call while a password change is
 * pending (after a reset to a temporary password). Everything else under
 * adminProcedure answers FORBIDDEN until the password has been changed.
 */
export const PENDING_PASSWORD_CHANGE_ALLOWED: readonly string[] = [
  "staff.changeMyPassword",
  "staff.me",
];

/** Defaults for the remaining procedures of mixed routers. */
export const MIXED_ROUTER_DEFAULTS: Readonly<Record<string, Access>> = {
  privacy: "admin",
};

/** The access level of a procedure path, or null when unclassified. */
export function classify(path: string): Access | null {
  const exact = EXACT_POLICY[path];
  if (exact) return exact;
  const router = path.split(".")[0] ?? "";
  return ROUTER_DEFAULTS[router] ?? MIXED_ROUTER_DEFAULTS[router] ?? null;
}

/** Paths without an access decision (must be empty). */
export function unclassifiedPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => classify(p) === null).sort();
}

/** Exact entries that no longer match a procedure (stale policy). */
export function staleExactEntries(paths: readonly string[]): string[] {
  const known = new Set(paths);
  return Object.keys(EXACT_POLICY)
    .filter((p) => !known.has(p))
    .sort();
}

/** Pending-password-change exemptions that no longer match a procedure. */
export function stalePendingPasswordEntries(
  paths: readonly string[],
): string[] {
  const known = new Set(paths);
  return PENDING_PASSWORD_CHANGE_ALLOWED.filter((p) => !known.has(p)).sort();
}

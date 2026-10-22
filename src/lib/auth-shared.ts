/** Auth constants shared by server and client. */
export const ROLES = { admin: "admin", student: "student" } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Students have no real email; better-auth needs one, so we derive it. */
export const STUDENT_EMAIL_DOMAIN = "leerling.pensuma.local";

/** Student numbers: digits only, 3–12 long (e.g. 17053). */
export const STUDENT_NUMBER_REGEX = /^\d{3,12}$/;
/** Student PIN: exactly 6 digits. */
export const STUDENT_PIN_REGEX = /^\d{6}$/;
/** Minimum password length for teacher (admin) accounts. */
export const ADMIN_MIN_PASSWORD_LENGTH = 10;

export const ROUTES = {
  login: "/inloggen",
  setup: "/setup",
  adminHome: "/docent",
  studentHome: "/leerling",
} as const;

export function homeForRole(role: string | null | undefined): string {
  return role === ROLES.admin ? ROUTES.adminHome : ROUTES.studentHome;
}

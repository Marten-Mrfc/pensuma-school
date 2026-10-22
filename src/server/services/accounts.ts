import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ROLES } from "@/lib/auth-shared";
import { env } from "@/env";
import { auth, studentEmail } from "@/server/auth";
import { db } from "@/server/db";
import { account, session, studentPins, user } from "@/server/db/schema";

/**
 * Account helpers. Sign-up is disabled in better-auth, so all accounts are
 * created here, using better-auth's own password hashing so sign-in works.
 */

const WEAK_PINS = new Set(["000000", "111111", "123456", "654321", "123123", "112233"]);

/** Random 6-digit PIN (never a trivially guessable one). */
export function generatePin(): string {
  for (;;) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    if (!WEAK_PINS.has(pin) && !/^(\d)\1{5}$/.test(pin)) return pin;
  }
}

const pinKey = () =>
  createHash("sha256").update(`${env.BETTER_AUTH_SECRET}:student-pin`).digest();

export function encryptPin(pin: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pinKey(), iv);
  const enc = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptPin(payload: string): string | null {
  try {
    const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", pinKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function hashPassword(password: string) {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}

async function createCredentialUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  username?: string;
}) {
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({
    name: input.name,
    email: input.email.toLowerCase(),
    emailVerified: true,
    role: input.role,
    ...(input.username ? { username: input.username, displayUsername: input.username } : {}),
  }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await hashPassword(input.password),
  });
  return created;
}

/** Create a teacher (admin) account. */
export async function createAdminAccount(input: { name: string; email: string; password: string }) {
  return createCredentialUser({ ...input, role: ROLES.admin });
}

/**
 * Create a student account with a fresh PIN.
 * Returns the plaintext PIN so it can be shown / printed.
 */
export async function createStudentAccount(input: { studentNumber: string; name: string; pin?: string }) {
  const studentNumber = input.studentNumber.trim();
  const pin = input.pin ?? generatePin();
  const created = await createCredentialUser({
    name: input.name.trim(),
    email: studentEmail(studentNumber),
    password: pin,
    role: ROLES.student,
    username: studentNumber.toLowerCase(),
  });
  await db
    .insert(studentPins)
    .values({ userId: created.id, pinEncrypted: encryptPin(pin) })
    .onConflictDoUpdate({ target: studentPins.userId, set: { pinEncrypted: encryptPin(pin) } });
  return { user: created, pin };
}

/** Set a new password for any credential account and sign out its sessions. */
export async function setAccountPassword(userId: string, password: string) {
  const hash = await hashPassword(password);
  const updated = await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (updated.length === 0) {
    const ctx = await auth.$context;
    await ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: hash });
  }
  await db.delete(session).where(eq(session.userId, userId));
}

/** Give a student a new random PIN (signs them out). Returns the new PIN. */
export async function resetStudentPin(userId: string, pin = generatePin()) {
  await setAccountPassword(userId, pin);
  await db
    .insert(studentPins)
    .values({ userId, pinEncrypted: encryptPin(pin) })
    .onConflictDoUpdate({ target: studentPins.userId, set: { pinEncrypted: encryptPin(pin) } });
  return pin;
}

/** Current PIN of a student (decrypted), or null if unknown. */
export async function getStudentPin(userId: string): Promise<string | null> {
  const [row] = await db.select().from(studentPins).where(eq(studentPins.userId, userId));
  return row ? decryptPin(row.pinEncrypted) : null;
}

/** Find a user by student number. */
export async function findStudentByNumber(studentNumber: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(and(eq(user.username, studentNumber.trim().toLowerCase()), eq(user.role, ROLES.student)));
  return row ?? null;
}

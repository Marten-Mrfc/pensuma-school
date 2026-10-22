/**
 * Teacher (docent) password policy, used by the forms and the server.
 * Pure module (no server or browser imports).
 *
 * Follows NIST SP 800-63B / ASVS 2.1: a minimum length, a maximum that
 * allows passphrases, a blocklist of common passwords, no context words,
 * and no composition rules ("one capital, one digit …").
 */
import { z } from "zod";
import {
  ADMIN_MAX_PASSWORD_LENGTH,
  ADMIN_MIN_PASSWORD_LENGTH,
} from "@/lib/auth-shared";
import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MESSAGES = {
  tooShort: `Je wachtwoord moet minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens hebben.`,
  tooLong: `Je wachtwoord is te lang (maximaal ${ADMIN_MAX_PASSWORD_LENGTH} tekens).`,
  guessable:
    "Dit wachtwoord is te makkelijk te raden. Kies een langere zin of een combinatie van woorden.",
  personal:
    "Je wachtwoord mag niet je naam, e-mailadres of ‘Pensuma’ bevatten.",
} as const;

/** Shown next to every new-password field. */
export const PASSWORD_HELP =
  "Minstens 12 tekens. Een zin van een paar woorden is sterk en makkelijk te onthouden.";

export type PasswordContext = {
  email?: string | null;
  name?: string | null;
};

export type PasswordResult = { ok: true } | { ok: false; message: string };

export type PasswordChecks = {
  longEnough: boolean;
  notTooLong: boolean;
  notPersonal: boolean;
  notGuessable: boolean;
};

/** Runs of characters that are easy to type and easy to guess. */
const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "01234567890123456789",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertzuiopasdfghjklyxcvbnm",
  "azertyuiopqsdfghjklmwxcvbn",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
  "zaq1xsw2cde3vfr4bgt5nhy6mju7",
  "!@#$%^&*()_+",
];
const ALL_SEQUENCES = [
  ...SEQUENCES,
  ...SEQUENCES.map((s) => [...s].reverse().join("")),
];

const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "8": "b",
  "3": "e",
  "1": "i",
  "!": "i",
  "0": "o",
  $: "s",
  "5": "s",
  "7": "t",
  "+": "t",
  "2": "z",
};

const normalize = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

const lettersOnly = (value: string) => value.replace(/[^\p{L}]/gu, "");

function isSequence(chunk: string): boolean {
  return chunk.length >= 3 && ALL_SEQUENCES.some((s) => s.includes(chunk));
}

/** Common password, repeated pattern or keyboard/alphabet sequence. */
export function isGuessablePassword(password: string): boolean {
  const lower = normalize(password);
  if (COMMON_PASSWORDS.has(lower)) return true;

  // "Welkom01!" → "welkom"; "W@chtw00rd" → "wachtwoord".
  const letters = lettersOnly(lower);
  if (letters && COMMON_PASSWORDS.has(letters)) return true;
  // Leading and trailing digits/symbols are padding, not leetspeak.
  const core = lower.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  for (const source of [lower, core]) {
    for (const one of ["i", "l"]) {
      const deleet = lettersOnly(
        [...source].map((c) => (c === "1" ? one : (LEET[c] ?? c))).join(""),
      );
      if (deleet && COMMON_PASSWORDS.has(deleet)) return true;
    }
  }

  // "aaaaaaaaaaaa", "abcabcabcabc", "welkomwelkom".
  if (/^([\s\S]+?)\1+$/u.test(lower)) return true;

  // Made only of trivial pieces: sequences, repeats, short numbers
  // (years, "01") and at most one common word. "123456789abc",
  // "Voetbal2024!!", "1qaz2wsx3edc". Several words are a passphrase.
  const compact = lower.replace(/[\s._-]+/g, "");
  if (isSequence(compact)) return true;
  const chunks = lower.match(/\p{L}+|\p{N}+/gu) ?? [];
  if (chunks.length === 0) return true;
  let commonWords = 0;
  for (const chunk of chunks) {
    const isDigits = /^\p{N}+$/u.test(chunk);
    if (!isDigits && COMMON_PASSWORDS.has(chunk)) {
      commonWords += 1;
      continue;
    }
    const simple =
      isSequence(chunk) ||
      /^([\s\S])\1*$/u.test(chunk) ||
      (isDigits && chunk.length <= 4);
    if (!simple) return false;
  }
  return commonWords <= 1;
}

/** Contains "pensuma", the e-mail local part or a part of the name. */
export function containsPersonalInfo(
  password: string,
  context: PasswordContext = {},
): boolean {
  const lower = normalize(password);
  const compact = lower.replace(/[\s._-]+/g, "");
  const words = new Set<string>(["pensuma"]);
  const local = normalize(context.email ?? "")
    .split("@")[0]
    ?.trim();
  if (local) {
    if (local.length >= 4) words.add(local);
    for (const part of local.split(/[._+-]+/)) {
      if (part.length >= 4) words.add(part);
    }
  }
  for (const part of normalize(context.name ?? "").split(/[\s'’.-]+/)) {
    if (part.length >= 4) words.add(part);
  }
  for (const word of words) {
    if (lower.includes(word) || compact.includes(word)) return true;
  }
  return false;
}

/** Per-rule status, for a live checklist next to the field. */
export function checkPassword(
  password: string,
  context: PasswordContext = {},
): PasswordChecks {
  const tooLong = password.length > ADMIN_MAX_PASSWORD_LENGTH;
  return {
    longEnough: Array.from(password).length >= ADMIN_MIN_PASSWORD_LENGTH,
    notTooLong: !tooLong,
    // Skip the regex work on absurd input; the length rule reports it.
    notPersonal:
      password.length > 0 && !tooLong
        ? !containsPersonalInfo(password, context)
        : true,
    notGuessable:
      password.length > 0 && !tooLong ? !isGuessablePassword(password) : true,
  };
}

/** The first rule the password breaks, with a Dutch message. */
export function validateTeacherPassword(
  password: string,
  context: PasswordContext = {},
): PasswordResult {
  if (password.length > ADMIN_MAX_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_MESSAGES.tooLong };
  }
  if (Array.from(password).length < ADMIN_MIN_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_MESSAGES.tooShort };
  }
  if (containsPersonalInfo(password, context)) {
    return { ok: false, message: PASSWORD_MESSAGES.personal };
  }
  if (isGuessablePassword(password)) {
    return { ok: false, message: PASSWORD_MESSAGES.guessable };
  }
  return { ok: true };
}

/** Zod schema for a new teacher password (server inputs and forms). */
export function teacherPasswordSchema(context?: PasswordContext) {
  return z.string().superRefine((password, ctx) => {
    const result = validateTeacherPassword(password, context);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message });
  });
}

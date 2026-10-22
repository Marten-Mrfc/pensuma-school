/**
 * Keeps audit log details free of personal content: only ids, counts,
 * numbers, booleans, dates and short enum-like strings survive. Names,
 * PINs, passwords, code, answer text and nested objects are dropped.
 * Pure module.
 */

const ID_KEY = /^(id|[a-z][A-Za-z]*Id)$/;
const ID_LIST_KEY = /^(ids|[a-z][A-Za-z]*Ids)$/;
const MAX_ID_LENGTH = 64;
const MAX_ENUM_LENGTH = 40;
const MAX_ARRAY_LENGTH = 20;
const MAX_KEYS = 40;
const ENUM_LIKE = /^[a-z0-9_.:/-]+$/i;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Words that mark a key as personal or secret, whatever its value looks
 * like (e.g. `name: "Mark"` or `pin: "739838"` would pass as enum-like).
 */
const SENSITIVE_WORDS = new Set([
  "name",
  "pin",
  "pins",
  "password",
  "passwd",
  "secret",
  "token",
  "hash",
  "code",
  "text",
  "response",
  "answer",
  "content",
  "feedback",
  "comment",
  "message",
  "note",
  "reason",
  "email",
  "mail",
  "cookie",
  "ip",
  "address",
  "phone",
  "solution",
  "stdin",
  "stdout",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/** Key fragments (words joined) that identify a student, e.g. `studentNumber`. */
const SENSITIVE_PHRASES = ["studentnumber", "leerlingnummer", "username"];

/**
 * A number or boolean under a key ending in one of these words describes
 * sensitive data without containing it: `answerIdsCount`, `pinsCount`,
 * `codeLength`, `passwordChanged`.
 */
const QUANTITY_WORDS = new Set([
  "count",
  "total",
  "length",
  "size",
  "changed",
  "reset",
  "required",
]);

function isSensitiveKey(key: string, value: unknown): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const joined = words.join("");
  const sensitive =
    words.some((w) => SENSITIVE_WORDS.has(w)) ||
    SENSITIVE_PHRASES.some((p) => joined.includes(p));
  if (!sensitive) return false;
  const last = words[words.length - 1] ?? "";
  const isQuantity =
    (typeof value === "number" || typeof value === "boolean") &&
    QUANTITY_WORDS.has(last);
  return !isQuantity;
}

function isIdValue(value: unknown): value is string | number {
  return (
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_ID_LENGTH) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

/** Short identifier-like value such as "exam", "after_close" or "a.b:c". */
function isEnumLike(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ENUM_LENGTH &&
    ENUM_LIKE.test(value) &&
    // Digit-only strings (PINs, leerlingnummers) are never enum values.
    /[a-z]/i.test(value)
  );
}

/**
 * Ids from an input object: `id` and `<name>Id` keys with a string (≤64)
 * or number value. Arrays of ids become a count: `userIds` → `userIdsCount`.
 * Everything else is dropped.
 */
export function pickAuditIds(input: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!isPlainObject(input)) return out;
  for (const [key, value] of Object.entries(input).slice(0, 200)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (ID_KEY.test(key) && isIdValue(value)) {
      out[key] = value;
    } else if (
      (ID_KEY.test(key) || ID_LIST_KEY.test(key)) &&
      Array.isArray(value)
    ) {
      out[`${key}Count`] = value.length;
    }
  }
  return out;
}

/**
 * Details safe to store: numbers, booleans, null, ISO dates (Date objects
 * become ISO strings), short enum-like strings and arrays (≤20) of them,
 * plus the ids from `pickAuditIds`. Keys that name personal or secret data
 * (`name`, `pin`, `studentNumber`, …) are dropped, except numbers and
 * booleans that only count or flag such data (`pinsCount`,
 * `answerIdsCount`, `passwordChanged`). Returns null when nothing remains.
 */
export function sanitizeAuditDetails(
  details: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(details)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details).slice(0, 200)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (key.length > 64 || isSensitiveKey(key, value)) continue;
    if (value === null || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) out[key] = value.toISOString();
    } else if (typeof value === "string") {
      if (isIsoDate(value) || isEnumLike(value)) out[key] = value;
    } else if (Array.isArray(value)) {
      if (
        value.length <= MAX_ARRAY_LENGTH &&
        value.every((v) => typeof v === "string" && isEnumLike(v))
      ) {
        out[key] = value;
      }
    }
  }
  Object.assign(out, pickAuditIds(details));
  return Object.keys(out).length ? out : null;
}

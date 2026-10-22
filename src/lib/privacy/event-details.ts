/**
 * Which monitoring events a student's browser may log, and which details
 * of them are stored. Data minimisation (AVG art. 5 and 25): an event is
 * only stored when the assignment's settings ask for it, and its details
 * pass a per-type allowlist (never pasted or copied text).
 * Pure module, shared by the exam client and the portal router.
 */
import { z } from "zod";

/** Event types a student's browser may send (server-only types excluded). */
export const MONITORING_EVENT_TYPES = [
  "focus_lost",
  "focus_gained",
  "visibility_hidden",
  "visibility_visible",
  "fullscreen_enter",
  "fullscreen_exit",
  "paste",
  "copy",
  "code_run",
  "self_test",
] as const;
export type MonitoringEventType = (typeof MONITORING_EVENT_TYPES)[number];

export type MonitoringSettings = {
  logFocusEvents: boolean;
  requireFullscreen: boolean;
  blockPaste: boolean;
};

const FOCUS_EVENTS = new Set<string>([
  "focus_lost",
  "focus_gained",
  "visibility_hidden",
  "visibility_visible",
  "copy",
]);

/** Whether an event of this type may be stored under these settings. */
export function isEventAllowed(type: string, s: MonitoringSettings): boolean {
  if (FOCUS_EVENTS.has(type)) return s.logFocusEvents;
  switch (type) {
    case "fullscreen_enter":
    case "fullscreen_exit":
      return s.requireFullscreen;
    case "paste":
      return s.blockPaste || s.logFocusEvents;
    case "code_run":
    case "self_test":
      return true;
    default:
      return false;
  }
}

const durationMs = z.number().int().min(0).max(86_400_000);
const count = z.number().int().min(0).max(100_000);
const questionId = z.uuid();

const DETAIL_FIELDS: Record<string, Record<string, z.ZodType>> = {
  focus_lost: { durationMs },
  focus_gained: { durationMs },
  visibility_hidden: { durationMs },
  visibility_visible: { durationMs },
  fullscreen_enter: { afterEscapeKey: z.boolean() },
  fullscreen_exit: { afterEscapeKey: z.boolean() },
  paste: {
    questionId,
    length: z.number().int().min(0).max(1_000_000),
    blocked: z.boolean(),
  },
  copy: {
    questionId,
    length: z.number().int().min(0).max(1_000_000),
    blocked: z.boolean(),
  },
  code_run: {
    questionId,
    durationMs,
    // A Python exception name such as "NameError".
    errorType: z
      .string()
      .max(40)
      .regex(/^[A-Za-z_][A-Za-z0-9_.]*$/),
  },
  self_test: { questionId, passed: count, total: count },
};

/**
 * Keeps only the allowed, valid details of an event; null when nothing
 * remains. Unknown types keep nothing.
 */
export function sanitizeEventDetails(
  type: string,
  details: unknown,
): Record<string, unknown> | null {
  const fields = Object.hasOwn(DETAIL_FIELDS, type)
    ? DETAIL_FIELDS[type]
    : null;
  if (
    !fields ||
    typeof details !== "object" ||
    details === null ||
    Array.isArray(details)
  ) {
    return null;
  }
  const input = details as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(fields)) {
    if (!Object.hasOwn(input, key)) continue;
    const parsed = schema.safeParse(input[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return Object.keys(out).length ? out : null;
}

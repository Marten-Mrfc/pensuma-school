/**
 * The JSON a student (or their school, for an access request under AVG
 * art. 15) receives: everything Pensuma stores about one student, in a
 * stable, documented shape. Pure: the loader in
 * src/server/privacy/student-export.ts passes the database rows in.
 *
 * Every field is copied explicitly (never spread), so new columns never
 * leak into an export by accident. Never included: password hash, PIN,
 * session tokens, model solutions, hidden-test input or expected output,
 * teacher names.
 */
import { computeGrade, LINEAR_SCALE } from "@/lib/grading/grade-scale";
import {
  assignmentSettingsSchema,
  gradingResultSchema,
  redactCodeResultForStudent,
} from "@/lib/questions/schema";
import { resultsVisible } from "@/server/services/assignment-status";
import { AUDIT_ACTIONS } from "./audit-actions";
import { MONITORING_EVENT_TYPES, sanitizeEventDetails } from "./event-details";
import type { PrivacySettings } from "./settings";

export type ExportAudience = "admin" | "student";

/* --------------------------------- Input --------------------------------- */

export interface ExportAnswerRow {
  questionTitle: string;
  questionType: "code" | "multiple_choice" | "open";
  response: unknown;
  autoScore: number | null;
  manualScore: number | null;
  maxScore: number;
  feedback: string | null;
  result: unknown;
  /** Multiple choice: option id → option text (to show what was chosen). */
  optionTexts?: Record<string, string>;
}

export interface ExportEventRow {
  type: string;
  createdAt: Date;
  details: unknown;
}

export interface ExportAttemptRow {
  attemptNumber: number;
  status: "in_progress" | "submitted";
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  assignment: {
    title: string | null;
    mode: "exam" | "practice";
    status: "planned" | "open" | "closed";
    opensAt: Date | null;
    closesAt: Date | null;
    settings: unknown;
    resultsReleased: boolean;
  };
  testTitle: string;
  answers: ExportAnswerRow[];
  events: ExportEventRow[];
}

export interface StudentExportRows {
  settings: PrivacySettings;
  student: {
    name: string;
    studentNumber: string;
    createdAt: Date;
    banned: boolean | null;
    lastSignInAt: Date | null;
  };
  classes: {
    name: string;
    schoolYear: string | null;
    archived: boolean;
    joinedAt: Date;
  }[];
  accommodation: {
    extraTimePercent: number;
    allowPaste: boolean;
    ignoreFocusEvents: boolean;
  } | null;
  preferences: Record<string, unknown> | null;
  attempts: ExportAttemptRow[];
  accessLog: { createdAt: Date; action: string; actorRole: string }[];
}

/* --------------------------------- Output -------------------------------- */

export interface StudentExportAnswer {
  questionTitle: string;
  type: "code" | "multiple_choice" | "open";
  response:
    | { code: string }
    | { selected: string[]; selectedOptions: string[] }
    | { text: string }
    | null;
  autoScore: number | null;
  manualScore: number | null;
  maxScore: number;
  feedback: string | null;
  result: unknown;
}

export interface StudentExportAttempt {
  assignmentTitle: string;
  testTitle: string;
  mode: "exam" | "practice";
  attemptNumber: number;
  status: "in_progress" | "submitted";
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  grade: number | null;
  answers: StudentExportAnswer[];
  events: {
    type: string;
    at: string;
    details: Record<string, unknown> | null;
  }[];
}

export interface StudentExport {
  schemaVersion: 1;
  generatedAt: string;
  audience: ExportAudience;
  controller: {
    school: string;
    authority: string;
    privacyEmail: string;
    dpo: { name: string; email: string };
  };
  student: {
    name: string;
    studentNumber: string;
    createdAt: string;
    active: boolean;
    lastSignInAt: string | null;
  };
  classes: {
    name: string;
    schoolYear: string | null;
    archived: boolean;
    memberSince: string;
  }[];
  accommodation: {
    extraTimePercent: number;
    allowPaste: boolean;
    ignoreFocusEvents: boolean;
  } | null;
  preferences: Record<string, unknown> | null;
  attempts: StudentExportAttempt[];
  accessLog: { at: string; action: string; actorRole: string }[];
  retention: {
    attemptEventsDays: number;
    attemptsMonths: number;
    inactiveStudentMonths: number;
    auditLogMonths: number;
    backupDays: number;
    autoDeleteAttempts: boolean;
  };
}

/* -------------------------------- Helpers -------------------------------- */

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);
const MONITORING = new Set<string>(MONITORING_EVENT_TYPES);
const ACTOR_ROLES = new Set(["admin", "student", "system"]);

function gradingScale(settings: unknown) {
  const parsed = assignmentSettingsSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data.grading : LINEAR_SCALE;
}

function visibleToStudent(
  assignment: ExportAttemptRow["assignment"],
  now: Date,
): boolean {
  try {
    return resultsVisible(assignment, now);
  } catch {
    return false;
  }
}

function exportResponse(row: ExportAnswerRow): StudentExportAnswer["response"] {
  const r = row.response;
  if (typeof r !== "object" || r === null) return null;
  const obj = r as Record<string, unknown>;
  if (row.questionType === "code" && typeof obj.code === "string") {
    return { code: obj.code };
  }
  if (row.questionType === "multiple_choice" && Array.isArray(obj.selected)) {
    const selected = obj.selected.filter(
      (id): id is string => typeof id === "string",
    );
    return {
      selected,
      selectedOptions: selected.map((id) => row.optionTexts?.[id] ?? id),
    };
  }
  if (row.questionType === "open" && typeof obj.text === "string") {
    return { text: obj.text };
  }
  return null;
}

/** Grading result safe for anyone outside the teacher's grading screen. */
function exportResult(result: unknown): unknown {
  if (result == null) return null;
  const parsed = gradingResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.kind === "code") return redactCodeResultForStudent(r);
  if (r.kind === "multiple_choice") {
    return { kind: r.kind, correct: r.correct, fraction: r.fraction };
  }
  return { kind: r.kind, needsReview: r.needsReview };
}

/** Monitoring events: the allowlist; server events: numbers/booleans only. */
function exportEventDetails(
  type: string,
  details: unknown,
): Record<string, unknown> | null {
  if (MONITORING.has(type)) return sanitizeEventDetails(type, details);
  if (typeof details !== "object" || details === null) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : null;
}

function actionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTIONS, action)
    ? AUDIT_ACTIONS[action as keyof typeof AUDIT_ACTIONS].label
    : action;
}

/** Preferences: plain JSON values only (no functions, no nested secrets). */
function exportPreferences(
  prefs: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!prefs) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return out;
}

/* --------------------------------- Build --------------------------------- */

export function buildStudentExport(
  rows: StudentExportRows,
  options: { audience: ExportAudience; now?: Date },
): StudentExport {
  const now = options.now ?? new Date();
  const { settings, student } = rows;
  const forStudent = options.audience === "student";

  const attempts = rows.attempts
    .filter(
      (a) =>
        !forStudent ||
        (a.status === "submitted" && visibleToStudent(a.assignment, now)),
    )
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((a): StudentExportAttempt => {
      const grade =
        a.status === "submitted" && a.score != null && a.maxScore != null
          ? computeGrade(
              a.score,
              a.maxScore,
              gradingScale(a.assignment.settings),
            )
          : null;
      return {
        assignmentTitle: a.assignment.title?.trim() || a.testTitle,
        testTitle: a.testTitle,
        mode: a.assignment.mode,
        attemptNumber: a.attemptNumber,
        status: a.status,
        startedAt: iso(a.startedAt),
        submittedAt: isoOrNull(a.submittedAt),
        score: a.score,
        maxScore: a.maxScore,
        grade,
        answers: a.answers.map((ans) => ({
          questionTitle: ans.questionTitle,
          type: ans.questionType,
          response: exportResponse(ans),
          autoScore: ans.autoScore,
          manualScore: ans.manualScore,
          maxScore: ans.maxScore,
          feedback: ans.feedback,
          result: exportResult(ans.result),
        })),
        events: [...a.events]
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
          .map((e) => ({
            type: e.type,
            at: iso(e.createdAt),
            details: exportEventDetails(e.type, e.details),
          })),
      };
    });

  return {
    schemaVersion: 1,
    generatedAt: iso(now),
    audience: options.audience,
    controller: {
      school: settings.school.name,
      authority: settings.school.authority,
      privacyEmail: settings.school.privacyEmail,
      dpo: { name: settings.dpo.name, email: settings.dpo.email },
    },
    student: {
      name: student.name,
      studentNumber: student.studentNumber,
      createdAt: iso(student.createdAt),
      active: !student.banned,
      lastSignInAt: isoOrNull(student.lastSignInAt),
    },
    classes: rows.classes.map((c) => ({
      name: c.name,
      schoolYear: c.schoolYear,
      archived: c.archived,
      memberSince: iso(c.joinedAt),
    })),
    accommodation: rows.accommodation
      ? {
          extraTimePercent: rows.accommodation.extraTimePercent,
          allowPaste: rows.accommodation.allowPaste,
          ignoreFocusEvents: rows.accommodation.ignoreFocusEvents,
        }
      : null,
    preferences: exportPreferences(rows.preferences),
    attempts,
    accessLog: [...rows.accessLog]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({
        at: iso(e.createdAt),
        action: actionLabel(e.action),
        actorRole: ACTOR_ROLES.has(e.actorRole) ? e.actorRole : "system",
      })),
    retention: {
      attemptEventsDays: settings.retention.attemptEventsDays,
      attemptsMonths: settings.retention.attemptsMonths,
      inactiveStudentMonths: settings.retention.inactiveStudentMonths,
      auditLogMonths: settings.retention.auditLogMonths,
      backupDays: settings.processor.backupDays,
      autoDeleteAttempts:
        settings.retention.autoDeleteAttempts &&
        settings.retention.confirmedAt != null,
    },
  };
}

/** Local calendar date as yyyy-mm-dd. */
export function localDateStamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "pensuma-gegevens-17053-2026-10-22.json" */
export function exportFileName(studentNumber: string, now = new Date()) {
  const nr = studentNumber.replace(/[^A-Za-z0-9_-]/g, "") || "leerling";
  return `pensuma-gegevens-${nr}-${localDateStamp(now)}.json`;
}

/** "pensuma-mijn-gegevens-2026-10-22.json" */
export function myExportFileName(now = new Date()) {
  return `pensuma-mijn-gegevens-${localDateStamp(now)}.json`;
}

/**
 * The JSON a student (or their school, for an access request under AVG
 * art. 15) receives: everything Pensuma stores about one student, in a
 * stable, documented shape. Pure: the loader in
 * src/server/privacy/student-export.ts passes the database rows in.
 *
 * Every field is copied explicitly (never spread), so new columns never
 * leak into an export by accident. Never included: password hash, PIN,
 * session tokens, model solutions, hidden-test input or expected output,
 * hint texts, teacher names.
 *
 * schemaVersion 2 added: per answer the hints the student revealed and the
 * resulting penalty (hints lower the automatic score), retention holds on
 * the student (with their reason) or on an afname they took part in, and
 * the afnames that were set for this student only (inhaal, herkansing).
 *
 * schemaVersion 3 added `uitleg`: a Dutch explanation of every section and
 * of every code that can appear (mode, status, event types, …), so a
 * student of 14 can read the file. The field names and codes themselves
 * stay English and stable (data portability, AVG art. 20).
 */
import { computeGrade, LINEAR_SCALE } from "@/lib/grading/grade-scale";
import { hintPenaltyFraction } from "@/lib/grading/hint-penalty";
import {
  type ASSIGNMENT_EVENT_TYPES,
  assignmentSettingsSchema,
  gradingResultSchema,
  redactCodeResultForStudent,
} from "@/lib/questions/schema";
import { resultsVisible } from "@/server/services/assignment-status";
import { AUDIT_ACTIONS } from "./audit-actions";
import { MONITORING_EVENT_TYPES, sanitizeEventDetails } from "./event-details";
import { HOLD_KIND_LABELS, type RetentionHoldKind } from "./retention";
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
  /** Hints the student revealed (answer.hints_used). */
  hintsUsed?: readonly { id: string; at?: string | null }[] | null;
  /** Code questions: the question's hints in order, id + penalty (no text). */
  hints?: readonly { id: string; penalty: number }[];
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
    /**
     * Somebody (a classmate with verlengde tijd, a reopened attempt) is
     * still working on this afname: results that wait for the close stay
     * hidden from the student until everyone has handed in. Computed by
     * the loader (stillWorkingByAssignment); omitted = nobody.
     */
    othersWorking?: boolean;
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
  /** Retention holds on the student (with the reason teachers gave). */
  holds?: {
    kind: RetentionHoldKind;
    reason: string;
    until: Date | null;
    createdAt: Date;
  }[];
  /**
   * Holds on an afname the student has an attempt in. Their reason is about
   * the whole afname (it may concern other students) and is left out.
   */
  assignmentHolds?: {
    kind: RetentionHoldKind;
    until: Date | null;
    createdAt: Date;
    assignmentTitle: string | null;
    testTitle: string;
  }[];
  /** Afnames set for this student only (assignment_student). */
  targetedAssignments?: {
    assignmentTitle: string | null;
    testTitle: string;
    mode: "exam" | "practice";
    opensAt: Date | null;
    closesAt: Date | null;
  }[];
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
  /**
   * Hints revealed for this question: their number in the question, when,
   * and the fraction of the points each one costs.
   */
  hintsUsed: {
    hintNumber: number | null;
    at: string | null;
    penalty: number;
  }[];
  /** Total fraction of the points lost to hints (0..1). */
  hintPenalty: number;
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

/** The Dutch explanation at the top of the export (`uitleg`). */
export interface StudentExportGuide {
  /** What the file is and how to read it. */
  overDitBestand: string;
  /** Tijden: ISO 8601 in UTC. */
  tijden: string;
  /** Per section (by its field name): what it holds. */
  onderdelen: Record<string, string>;
  /** Per field that holds a code: what each code means. */
  codes: {
    audience: Record<ExportAudience, string>;
    mode: Record<StudentExportAttempt["mode"], string>;
    status: Record<StudentExportAttempt["status"], string>;
    answerType: Record<StudentExportAnswer["type"], string>;
    resultStatus: Record<string, string>;
    eventType: Record<(typeof ASSIGNMENT_EVENT_TYPES)[number], string>;
    actorRole: Record<"admin" | "student" | "system", string>;
    holdKind: Record<RetentionHoldKind, string>;
    holdAppliesTo: Record<"student" | "afname", string>;
  };
  /** Field names inside attempts[].events[].details. */
  eventDetails: Record<string, string>;
}

export interface StudentExport {
  schemaVersion: 3;
  generatedAt: string;
  audience: ExportAudience;
  /** Dutch explanation of the sections and codes (schemaVersion 3). */
  uitleg: StudentExportGuide;
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
  /** Data kept from automatic deletion, and why (bewaarblokkades). */
  holds: {
    appliesTo: "student" | "afname";
    kind: RetentionHoldKind;
    /** Null for a hold on a whole afname. */
    reason: string | null;
    /** The afname, for a hold on an afname. */
    afname: string | null;
    until: string | null;
    createdAt: string;
  }[];
  /** Afnames (inhaaltoets, herkansing) that were set for you only. */
  targetedAssignments: {
    title: string;
    testTitle: string;
    mode: "exam" | "practice";
    opensAt: string | null;
    closesAt: string | null;
  }[];
  retention: {
    attemptEventsDays: number;
    attemptsMonths: number;
    inactiveStudentMonths: number;
    auditLogMonths: number;
    backupDays: number;
    autoDeleteAttempts: boolean;
  };
}

/* --------------------------------- Uitleg -------------------------------- */

/**
 * The Dutch guide in every export. Written for the student (the school
 * hands its own export to the student or their parents too). Every code
 * that can appear in the file has an entry; export-format.test.ts checks
 * that against the code lists.
 */
export const EXPORT_GUIDE: StudentExportGuide = {
  overDitBestand:
    "Dit bestand bevat alle gegevens die Pensuma over jou bewaart. Het is een JSON-bestand: een vorm die vooral voor computers bedoeld is, zodat je je gegevens bijvoorbeeld in een ander programma kunt gebruiken. De namen van de onderdelen en de codes zijn Engels en veranderen niet. In dit onderdeel (uitleg) lees je wat elk onderdeel betekent en wat de codes betekenen. Op de pagina 'Mijn gegevens' in Pensuma zie je dezelfde gegevens in gewone taal.",
  tijden:
    "Datums en tijden staan in de vorm 2026-01-15T07:04:00.000Z. De Z betekent dat de tijd in UTC staat: in Nederland is het dan 1 uur later (wintertijd) of 2 uur later (zomertijd). Dit voorbeeld is dus 15 januari 2026 om 08:04.",
  onderdelen: {
    schemaVersion:
      "Versienummer van de opbouw van dit bestand. Verandert de opbouw, dan gaat dit nummer omhoog.",
    generatedAt: "Wanneer dit bestand is gemaakt.",
    audience:
      "Voor wie dit bestand is gemaakt (zie codes.audience). Een bestand dat jij zelf downloadt, bevat alleen ingeleverde toetsen waarvan je de resultaten al mag zien.",
    controller:
      "De school die verantwoordelijk is voor je gegevens, met het e-mailadres voor vragen over privacy en de functionaris gegevensbescherming (dpo): degene die binnen de school toeziet op je privacy.",
    student:
      "Je account: je naam, je leerlingnummer, wanneer het account is gemaakt, of het actief is (active) en wanneer je voor het laatst hebt ingelogd (lastSignInAt).",
    classes:
      "De klassen waar je in zit of zat. memberSince is de datum waarop je aan de klas bent toegevoegd, archived betekent dat de klas niet meer wordt gebruikt.",
    accommodation:
      "Je faciliteiten, als je die hebt: verlengde tijd in procenten (extraTimePercent), of je tekst mag plakken (allowPaste) en of het verlaten van het venster niet wordt bijgehouden (ignoreFocusEvents). Staat er null, dan heb je geen faciliteiten.",
    preferences:
      "Hoe je Pensuma hebt ingesteld, zoals licht of donker thema en de lettergrootte.",
    attempts:
      "Je pogingen bij toetsen en oefentoetsen: de toets (assignmentTitle, testTitle), het soort toets (mode), het nummer van de poging (attemptNumber), of hij is ingeleverd (status), wanneer je begon en inleverde, je score (score van maxScore), je cijfer (grade), je antwoorden (answers) en het logboek van de poging (events). Heeft je docent een poging gewist, dan wordt dat nummer niet opnieuw gebruikt: attemptNumber kan dan hoger zijn dan het nummer in Pensuma, waar je pogingen gewoon 1, 2, 3 enzovoort heten.",
    "attempts.answers":
      "Per vraag: de titel, het soort vraag (type), je antwoord (response), de punten die automatisch zijn gegeven (autoScore), de punten die je docent heeft gegeven als die zijn aangepast (manualScore), het maximum (maxScore), de feedback van je docent, de uitkomst van het nakijken (result) en de hints die je hebt bekeken (hintsUsed). hintPenalty is het deel van de punten dat de hints kostten (0,25 = een kwart).",
    "attempts.answers.result":
      "De uitkomst van het automatisch nakijken. Bij programmeervragen: per test of hij is gelukt (passed); bij verborgen tests zie je alleen of ze gelukt zijn. fraction is het deel van de punten dat je hebt gehaald (1 = alles goed). status staat uitgelegd bij codes.resultStatus.",
    "attempts.events":
      "Wat er tijdens het maken van de poging is vastgelegd, met het tijdstip (at). Wat elk type betekent, staat bij codes.eventType; de extra gegevens (details) staan uitgelegd bij eventDetails. Wat je typte of plakte staat er nooit in.",
    accessLog:
      "Wanneer jouw gegevens zijn bekeken of veranderd, en door wie (actorRole, zie codes.actorRole). Namen van docenten staan er niet in. action beschrijft wat er gebeurde.",
    holds:
      "Gegevens die voorlopig niet automatisch worden verwijderd (een bewaarblokkade), bijvoorbeeld omdat er bezwaar is gemaakt tegen een cijfer. kind is de reden (zie codes.holdKind), appliesTo zegt of het om jouw gegevens of om een hele toets gaat, until is tot wanneer.",
    targetedAssignments:
      "Toetsen die alleen voor jou (en eventueel een paar anderen) zijn klaargezet, zoals een inhaaltoets of een herkansing.",
    retention:
      "Hoe lang Pensuma je gegevens bewaart: het logboek tijdens toetsen attemptEventsDays dagen, je pogingen attemptsMonths maanden, je account na je laatste gebruik inactiveStudentMonths maanden, het logboek van docenten auditLogMonths maanden en back-ups backupDays dagen. autoDeleteAttempts zegt of oude pogingen automatisch worden verwijderd.",
  },
  codes: {
    audience: {
      student: "je hebt dit bestand zelf gedownload in Pensuma",
      admin:
        "je school heeft dit bestand voor je gemaakt, bijvoorbeeld omdat je om inzage hebt gevraagd",
    },
    mode: { exam: "toets", practice: "oefentoets" },
    status: { submitted: "ingeleverd", in_progress: "nog bezig" },
    answerType: {
      code: "programmeervraag",
      multiple_choice: "meerkeuzevraag",
      open: "open vraag",
    },
    resultStatus: {
      ok: "je programma is uitgevoerd en getest",
      syntax_error:
        "je code bevat een fout waardoor hij niet kon starten (syntaxfout)",
      timeout: "je programma deed er te lang over en is gestopt",
      runtime_error: "je programma stopte met een foutmelding",
      internal_error:
        "er ging iets mis bij het nakijken (niet jouw fout); je docent kijkt het antwoord zelf na",
    },
    eventType: {
      started: "je bent aan de poging begonnen",
      resumed:
        "je bent verdergegaan met de poging, bijvoorbeeld na het herladen van de pagina",
      submitted:
        "de poging is ingeleverd: door jou, automatisch toen de tijd om was, of toen de toets werd gesloten",
      focus_lost: "je hebt het venster met de toets verlaten",
      focus_gained: "je bent teruggekomen in het venster met de toets",
      visibility_hidden: "het tabblad met de toets was niet meer te zien",
      visibility_visible: "het tabblad met de toets was weer te zien",
      fullscreen_enter: "volledig scherm is aangezet",
      fullscreen_exit: "je hebt volledig scherm verlaten",
      paste: "je probeerde iets te plakken",
      copy: "je hebt iets gekopieerd (wordt niet meer bijgehouden; staat alleen nog in oudere logboeken)",
      code_run: "je hebt je code uitgevoerd",
      self_test: "je hebt je code zelf getest",
      time_extended: "je docent heeft je extra tijd gegeven",
      reopened: "je docent heeft de poging weer opengezet",
      hint_revealed: "je hebt een hint bekeken",
    },
    actorRole: {
      admin: "een docent",
      student: "jij",
      system: "Pensuma zelf (automatisch)",
    },
    holdKind: HOLD_KIND_LABELS,
    holdAppliesTo: {
      student: "het gaat om jouw gegevens",
      afname: "het gaat om een hele toets waar jij aan hebt meegedaan",
    },
  },
  eventDetails: {
    durationMs:
      "hoe lang het duurde, in milliseconden (1000 milliseconden = 1 seconde)",
    afterEscapeKey: "of het gebeurde doordat je op de Esc-toets drukte",
    length: "hoeveel tekens het waren (de tekst zelf wordt nooit bewaard)",
    blocked: "of Pensuma het heeft tegengehouden",
    auto: "of het automatisch gebeurde (bijvoorbeeld omdat de tijd om was)",
    questionId: "bij welke vraag het gebeurde (een interne code van de vraag)",
    minutes: "hoeveel minuten",
    totalExtraMinutes: "hoeveel minuten extra tijd je in totaal kreeg",
    penalty: "welk deel van de punten de hint kost (0,25 = een kwart)",
    attemptNumber:
      "het nummer dat de poging kreeg toen je begon (zie onderdelen.attempts)",
    accommodationMinutes: "hoeveel minuten verlengde tijd je kreeg",
  },
};

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
    return resultsVisible(assignment, now, assignment.othersWorking ?? false);
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

/** Revealed hints with their number and penalty (never the hint text). */
function exportHints(
  row: ExportAnswerRow,
): Pick<StudentExportAnswer, "hintsUsed" | "hintPenalty"> {
  const hints = row.hints ?? [];
  const used = (row.hintsUsed ?? []).filter(
    (h): h is { id: string; at?: string | null } =>
      !!h && typeof h.id === "string",
  );
  const seen = new Set<string>();
  const hintsUsed: StudentExportAnswer["hintsUsed"] = [];
  for (const h of used) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const index = hints.findIndex((x) => x.id === h.id);
    const at =
      typeof h.at === "string" && !Number.isNaN(Date.parse(h.at))
        ? new Date(h.at).toISOString()
        : null;
    hintsUsed.push({
      hintNumber: index >= 0 ? index + 1 : null,
      at,
      penalty: index >= 0 ? Math.min(1, Math.max(0, hints[index].penalty)) : 0,
    });
  }
  return {
    hintsUsed,
    hintPenalty: hintPenaltyFraction(
      hints,
      used.map((h) => ({ id: h.id })),
    ),
  };
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
          ...exportHints(ans),
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

  const titleOf = (title: string | null, testTitle: string) =>
    title?.trim() || testTitle;

  return {
    schemaVersion: 3,
    generatedAt: iso(now),
    audience: options.audience,
    uitleg: EXPORT_GUIDE,
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
    holds: [
      ...(rows.holds ?? []).map((h) => ({
        appliesTo: "student" as const,
        kind: h.kind,
        reason: h.reason,
        afname: null,
        until: isoOrNull(h.until),
        createdAt: iso(h.createdAt),
      })),
      ...(rows.assignmentHolds ?? []).map((h) => ({
        appliesTo: "afname" as const,
        kind: h.kind,
        reason: null,
        afname: titleOf(h.assignmentTitle, h.testTitle),
        until: isoOrNull(h.until),
        createdAt: iso(h.createdAt),
      })),
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    targetedAssignments: (rows.targetedAssignments ?? []).map((t) => ({
      title: titleOf(t.assignmentTitle, t.testTitle),
      testTitle: t.testTitle,
      mode: t.mode,
      opensAt: isoOrNull(t.opensAt),
      closesAt: isoOrNull(t.closesAt),
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

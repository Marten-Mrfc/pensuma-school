/**
 * Domain tables. Naming (English in code, Dutch in the UI):
 *  - class        → "klas"
 *  - test         → "toets"           (a reusable set of questions)
 *  - question     → "vraag"
 *  - assignment   → "afname"          (a test given to a class, with a time window)
 *  - attempt      → "poging"          (one student's run through an assignment)
 *  - answer       → "antwoord"        (one response to one question in an attempt)
 *  - attemptEvent → "logboek"         (anti-cheat / activity log)
 */
import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AnswerResponse,
  AssignmentSettings,
  AttemptEventType,
  GradingResult,
} from "@/lib/questions/schema";
import { account, session, user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/* --------------------------------- Classes -------------------------------- */

export const classes = pgTable("class", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** e.g. "4H2" */
  name: text("name").notNull(),
  /** e.g. "2026-2027" */
  schoolYear: text("school_year"),
  description: text("description"),
  archived: boolean("archived").default(false).notNull(),
  ...timestamps,
});

export const classMembers = pgTable(
  "class_member",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    index("class_member_user_idx").on(t.userId),
  ],
);

/* ---------------------------------- Tests --------------------------------- */

export const testStatus = pgEnum("test_status", [
  "draft",
  "published",
  "archived",
]);

export const tests = pgTable("test", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  /** Markdown, shown to students before starting. */
  description: text("description").default("").notNull(),
  status: testStatus("status").default("draft").notNull(),
  /** Optional subject tag, e.g. "Python – lussen". */
  topic: text("topic"),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  ...timestamps,
});

export const questionType = pgEnum("question_type", [
  "code",
  "multiple_choice",
  "open",
]);

export const questions = pgTable(
  "question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    type: questionType("type").notNull(),
    title: text("title").notNull(),
    /** Markdown assignment text shown to the student. */
    prompt: text("prompt").default("").notNull(),
    points: doublePrecision("points").default(1).notNull(),
    /**
     * Type-specific data; validate with `parseQuestionData(type, data)` from
     * `@/lib/questions/schema` (CodeQuestionData / MultipleChoiceData / OpenQuestionData).
     */
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    /**
     * Code questions: the last check of the model solution against all tests
     * (written by the test builder, see `src/lib/questions/validate.ts`).
     * `hash` fingerprints solution/tests/checks; when it no longer matches the
     * current data, the solution has not been checked since the last edit.
     */
    solutionCheck: jsonb("solution_check").$type<{
      hash: string;
      passed: boolean;
      passedTests: number;
      totalTests: number;
      checkedAt: string;
      source: "server" | "browser";
    }>(),
    ...timestamps,
  },
  (t) => [index("question_test_idx").on(t.testId, t.position)],
);

/* ------------------------------- Assignments ------------------------------ */

export const assignmentMode = pgEnum("assignment_mode", ["exam", "practice"]);
export const assignmentStatus = pgEnum("assignment_status", [
  /** Visible to the teacher only / waiting for opensAt. */
  "planned",
  "open",
  "closed",
]);

export const assignments = pgTable(
  "assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    /** Optional override of the test title, e.g. "Toets H3 – herkansing". */
    title: text("title"),
    mode: assignmentMode("mode").default("exam").notNull(),
    status: assignmentStatus("status").default("planned").notNull(),
    /** Optional automatic window. A "planned" assignment opens at opensAt. */
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    /** Code students must type to start (shown on the board). Null = none. */
    accessCode: text("access_code"),
    /** Per-attempt time limit. Null = unlimited (until closesAt). */
    timeLimitMinutes: integer("time_limit_minutes"),
    settings: jsonb("settings")
      .$type<AssignmentSettings>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    /** For showResults = "manual". */
    resultsReleased: boolean("results_released").default(false).notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("assignment_class_idx").on(t.classId),
    index("assignment_test_idx").on(t.testId),
  ],
);

/* -------------------------------- Attempts -------------------------------- */

export const attemptStatus = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
]);
export const gradingStatus = pgEnum("grading_status", [
  "pending",
  "graded",
  /** At least one answer (open question) waits for the teacher. */
  "needs_review",
]);

export const attempts = pgTable(
  "attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    status: attemptStatus("status").default("in_progress").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Hard deadline (start + time limit + extra, capped by closesAt). */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    extraMinutes: integer("extra_minutes").default(0).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** True when the server auto-submitted at the deadline. */
    autoSubmitted: boolean("auto_submitted").default(false).notNull(),
    /** Question ids in the order shown to this student. */
    questionOrder: jsonb("question_order")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    score: doublePrecision("score"),
    maxScore: doublePrecision("max_score"),
    gradingStatus: gradingStatus("grading_status")
      .default("pending")
      .notNull(),
    /** Denormalised counter of focus/visibility losses for quick overview. */
    focusLossCount: integer("focus_loss_count").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("attempt_unique_number").on(
      t.assignmentId,
      t.userId,
      t.attemptNumber,
    ),
    index("attempt_user_idx").on(t.userId),
  ],
);

/* --------------------------------- Answers -------------------------------- */

export const answerStatus = pgEnum("answer_status", [
  "empty",
  "saved",
  "graded",
  "needs_review",
]);

export const answers = pgTable(
  "answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** CodeResponse | MultipleChoiceResponse | OpenResponse */
    response: jsonb("response").$type<AnswerResponse>(),
    status: answerStatus("status").default("empty").notNull(),
    /** Points from automatic grading. */
    autoScore: doublePrecision("auto_score"),
    /** Teacher override; wins over autoScore when not null. */
    manualScore: doublePrecision("manual_score"),
    maxScore: doublePrecision("max_score").notNull(),
    /** Teacher feedback (markdown). */
    feedback: text("feedback"),
    result: jsonb("result").$type<GradingResult>(),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    reviewedById: text("reviewed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique("answer_unique_question").on(t.attemptId, t.questionId)],
);

/* ------------------------------ Attempt events ---------------------------- */

export const attemptEvents = pgTable(
  "attempt_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: text("type").$type<AttemptEventType>().notNull(),
    /** Optional details, e.g. { questionId, durationMs }. */
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("attempt_event_attempt_idx").on(t.attemptId, t.createdAt)],
);

/* -------------------------------- Relations ------------------------------- */

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  classMemberships: many(classMembers),
  attempts: many(attempts),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  members: many(classMembers),
  assignments: many(assignments),
}));

export const classMembersRelations = relations(classMembers, ({ one }) => ({
  class: one(classes, {
    fields: [classMembers.classId],
    references: [classes.id],
  }),
  user: one(user, { fields: [classMembers.userId], references: [user.id] }),
}));

export const testsRelations = relations(tests, ({ one, many }) => ({
  createdBy: one(user, { fields: [tests.createdById], references: [user.id] }),
  questions: many(questions),
  assignments: many(assignments),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  test: one(tests, { fields: [questions.testId], references: [tests.id] }),
  answers: many(answers),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  test: one(tests, { fields: [assignments.testId], references: [tests.id] }),
  class: one(classes, {
    fields: [assignments.classId],
    references: [classes.id],
  }),
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  assignment: one(assignments, {
    fields: [attempts.assignmentId],
    references: [assignments.id],
  }),
  user: one(user, { fields: [attempts.userId], references: [user.id] }),
  answers: many(answers),
  events: many(attemptEvents),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, {
    fields: [answers.attemptId],
    references: [attempts.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));

export const attemptEventsRelations = relations(attemptEvents, ({ one }) => ({
  attempt: one(attempts, {
    fields: [attemptEvents.attemptId],
    references: [attempts.id],
  }),
}));

/* ------------------------------- Student PINs ----------------------------- */

/**
 * The student's current PIN, encrypted (AES-256-GCM, key derived from
 * BETTER_AUTH_SECRET) so teachers can re-print login cards at any time.
 * The authoritative credential is still the hashed password in `account`.
 */
export const studentPins = pgTable("student_pin", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  pinEncrypted: text("pin_encrypted").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

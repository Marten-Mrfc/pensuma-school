/**
 * Feature tables: accommodations (faciliteiten), display preferences,
 * targeted assignments, feedback snippets and neutralised questions.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assignments, questions } from "./app";
import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/**
 * Facilities only (faciliteitenpas). Never store a reason or diagnosis
 * (AVG art. 5 and 9).
 */
export const studentAccommodations = pgTable(
  "student_accommodation",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Verlengde tijd in percent of the base time (0–100). */
    extraTimePercent: integer("extra_time_percent").default(0).notNull(),
    allowPaste: boolean("allow_paste").default(false).notNull(),
    ignoreFocusEvents: boolean("ignore_focus_events").default(false).notNull(),
    updatedById: text("updated_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    check(
      "student_accommodation_extra_time_range",
      sql`${t.extraTimePercent} >= 0 and ${t.extraTimePercent} <= 100`,
    ),
  ],
);

/** Display preferences per user (theme, font size, …), validated in the app. */
export const userPreferences = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  prefs: jsonb("prefs")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * When an assignment has rows here, only these students see it
 * (inhaaltoets/herkansing).
 */
export const assignmentStudents = pgTable(
  "assignment_student",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.assignmentId, t.userId] }),
    index("assignment_student_user_idx").on(t.userId),
  ],
);

/** Reusable teacher comments while grading (per question, or general). */
export const feedbackSnippets = pgTable(
  "feedback_snippet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null = general comment. */
    questionId: uuid("question_id").references(() => questions.id, {
      onDelete: "cascade",
    }),
    text: text("text").notNull(),
    useCount: integer("use_count").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("feedback_snippet_owner_idx").on(t.ownerId, t.questionId)],
);

/**
 * A question that "vervalt" for one assignment: everybody gets full points,
 * or the question is dropped from the maximum.
 */
export const questionNeutralizations = pgTable(
  "question_neutralization",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    mode: text("mode").$type<"full_points" | "drop">().notNull(),
    /**
     * answerId → previous manualScore, so "Ongedaan maken" restores the
     * teacher's work.
     */
    previous: jsonb("previous")
      .$type<Record<string, number | null>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.questionId] })],
);

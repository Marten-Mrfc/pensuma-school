/**
 * Test data factories. Synthetic data only (AVG): never copy real names.
 *
 * - insertTeacher / insertStudent: direct inserts (fast, no password, cannot
 *   sign in). Use with `callerFor(user)`.
 * - createTeacherAccount / createStudentLogin: through
 *   src/server/services/accounts.ts, so better-auth sign-in really works
 *   (scrypt makes these slower).
 * - createClass, createTest (with the q.* builders), createAssignment.
 * - CANARY: strings that must never reach a student (see tests/security).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";
import {
  type AssignmentSettings,
  assignmentSettingsSchema,
  codeQuestionDataSchema,
  multipleChoiceDataSchema,
  openQuestionDataSchema,
  type QuestionType,
} from "@/lib/questions/schema";
import { db } from "@/server/db";
import {
  assignments,
  classes,
  classMembers,
  questions,
  tests,
  user,
} from "@/server/db/schema";
import {
  createAdminAccount,
  createStudentAccount,
} from "@/server/services/accounts";
import type { TestUser } from "./caller";

/** Strings that must never appear in anything a student receives. */
export const CANARY = {
  solution: "CANARY_SOLUTION_7f3a",
  hidden: "CANARY_HIDDEN_7f3a",
  model: "CANARY_MODEL_7f3a",
  rubric: "CANARY_RUBRIC_7f3a",
  rubricItem: "CANARY_RUBRIC_ITEM_7f3a",
  hint: "CANARY_HINT_7f3a",
  accessCode: "CNRY77",
} as const;

let seq = 0;
/** Short unique suffix for names and numbers within one test run. */
export function uniq(): string {
  seq += 1;
  return `${Date.now().toString(36).slice(-4)}${seq}`;
}

let studentSeq = Math.floor(Math.random() * 5_000_000);
/** Unique 8-digit leerlingnummer (valid for STUDENT_NUMBER_REGEX). */
export function nextStudentNumber(): string {
  studentSeq = (studentSeq + 1) % 9_999_999;
  return String(90_000_000 + studentSeq);
}

function toTestUser(row: typeof user.$inferSelect): TestUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === "admin" ? "admin" : "student",
    username: row.username ?? null,
  };
}

/* ---------------------------------- Users --------------------------------- */

export async function insertTeacher(
  opts: { name?: string; email?: string } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: opts.name ?? "Test Docent",
      email: (
        opts.email ?? `docent-${uniq()}@test.pensuma.local`
      ).toLowerCase(),
      emailVerified: true,
      role: "admin",
    })
    .returning();
  return toTestUser(row);
}

export async function insertStudent(
  opts: { number?: string; name?: string } = {},
): Promise<TestUser> {
  const number = opts.number ?? nextStudentNumber();
  const [row] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: opts.name ?? `Leerling ${number}`,
      email: `${number}@${STUDENT_EMAIL_DOMAIN}`,
      emailVerified: true,
      role: "student",
      username: number,
      displayUsername: number,
    })
    .returning();
  return toTestUser(row);
}

/** A teacher that can sign in with e-mail + password. */
export async function createTeacherAccount(
  opts: { name?: string; email?: string; password?: string } = {},
): Promise<TestUser & { password: string }> {
  const password = opts.password ?? "test-wachtwoord-123";
  const created = await createAdminAccount({
    name: opts.name ?? "Test Docent",
    email: opts.email ?? `docent-${uniq()}@test.pensuma.local`,
    password,
  });
  const [row] = await db.select().from(user).where(eq(user.id, created.id));
  return { ...toTestUser(row), password };
}

/** A student that can sign in with leerlingnummer + PIN. */
export async function createStudentLogin(
  opts: { number?: string; pin?: string; name?: string } = {},
): Promise<TestUser & { number: string; pin: string }> {
  const number = opts.number ?? nextStudentNumber();
  const created = await createStudentAccount({
    studentNumber: number,
    name: opts.name ?? `Leerling ${number}`,
    pin: opts.pin,
  });
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.id, created.user.id));
  return { ...toTestUser(row), number, pin: created.pin };
}

/* --------------------------------- Classes -------------------------------- */

export async function createClass(
  name = `Klas ${uniq()}`,
  memberIds: string[] = [],
): Promise<typeof classes.$inferSelect> {
  const [klas] = await db
    .insert(classes)
    .values({ name, schoolYear: "2026-2027" })
    .returning();
  if (memberIds.length > 0) {
    await db
      .insert(classMembers)
      .values(memberIds.map((userId) => ({ classId: klas.id, userId })));
  }
  return klas;
}

export async function addToClass(classId: string, userId: string) {
  await db
    .insert(classMembers)
    .values({ classId, userId })
    .onConflictDoNothing();
}

/* -------------------------------- Questions ------------------------------- */

export type QuestionSpec = {
  type: QuestionType;
  title: string;
  prompt: string;
  points: number;
  data: Record<string, unknown>;
};

type Base = { title?: string; prompt?: string; points?: number };

/** Question builders; data goes through the contract's zod schemas. */
export const q = {
  code(
    data: Partial<Parameters<typeof codeQuestionDataSchema.parse>[0]> = {},
    base: Base = {},
  ): QuestionSpec {
    return {
      type: "code",
      title: base.title ?? "Programmeervraag",
      prompt: base.prompt ?? "Schrijf een programma.",
      points: base.points ?? 2,
      data: codeQuestionDataSchema.parse({
        starterCode: "# Schrijf hier je code\n",
        solution: 'print("Hallo")\n',
        tests: [
          {
            id: "t1",
            kind: "io",
            name: "Uitvoer",
            stdin: "",
            expectedOutput: "Hallo",
          },
        ],
        ...data,
      }),
    };
  },
  mc(
    data: Partial<Parameters<typeof multipleChoiceDataSchema.parse>[0]> = {},
    base: Base = {},
  ): QuestionSpec {
    return {
      type: "multiple_choice",
      title: base.title ?? "Meerkeuzevraag",
      prompt: base.prompt ?? "Kies het juiste antwoord.",
      points: base.points ?? 1,
      data: multipleChoiceDataSchema.parse({
        options: [
          { id: "a", text: "Goed", correct: true },
          { id: "b", text: "Fout", correct: false },
          { id: "c", text: "Ook fout", correct: false },
        ],
        multiple: false,
        shuffle: false,
        ...data,
      }),
    };
  },
  open(
    data: Partial<Parameters<typeof openQuestionDataSchema.parse>[0]> = {},
    base: Base = {},
  ): QuestionSpec {
    return {
      type: "open",
      title: base.title ?? "Open vraag",
      prompt: base.prompt ?? "Leg uit.",
      points: base.points ?? 2,
      data: openQuestionDataSchema.parse({
        modelAnswer: "Een goed antwoord.",
        rubric: "1 punt per goed argument.",
        ...data,
      }),
    };
  },
};

/* ---------------------------------- Tests --------------------------------- */

export async function createTest(
  opts: {
    title?: string;
    status?: "draft" | "published" | "archived";
    questions?: QuestionSpec[];
    createdById?: string | null;
    description?: string;
  } = {},
): Promise<{
  test: typeof tests.$inferSelect;
  questions: (typeof questions.$inferSelect)[];
}> {
  const [test] = await db
    .insert(tests)
    .values({
      title: opts.title ?? `Toets ${uniq()}`,
      status: opts.status ?? "published",
      description: opts.description ?? "",
      createdById: opts.createdById ?? null,
    })
    .returning();
  const specs = opts.questions ?? [q.mc()];
  const rows = specs.length
    ? await db
        .insert(questions)
        .values(
          specs.map((spec, position) => ({
            ...spec,
            testId: test.id,
            position,
          })),
        )
        .returning()
    : [];
  rows.sort((a, b) => a.position - b.position);
  return { test, questions: rows };
}

/* ------------------------------- Assignments ------------------------------ */

export async function createAssignment(opts: {
  testId: string;
  classId: string;
  title?: string | null;
  mode?: "exam" | "practice";
  status?: "planned" | "open" | "closed";
  settings?: Partial<AssignmentSettings> & Record<string, unknown>;
  accessCode?: string | null;
  opensAt?: Date | null;
  closesAt?: Date | null;
  timeLimitMinutes?: number | null;
  resultsReleased?: boolean;
  createdById?: string | null;
}): Promise<typeof assignments.$inferSelect> {
  const [row] = await db
    .insert(assignments)
    .values({
      testId: opts.testId,
      classId: opts.classId,
      title: opts.title ?? null,
      mode: opts.mode ?? "practice",
      status: opts.status ?? "open",
      settings: assignmentSettingsSchema.parse(opts.settings ?? {}),
      accessCode: opts.accessCode ?? null,
      opensAt: opts.opensAt ?? null,
      closesAt: opts.closesAt ?? null,
      timeLimitMinutes: opts.timeLimitMinutes ?? null,
      resultsReleased: opts.resultsReleased ?? false,
      createdById: opts.createdById ?? null,
    })
    .returning();
  return row;
}

/* --------------------------------- Worlds --------------------------------- */

/**
 * A small ready-made world: teacher, class with two students, a published
 * test (code + MC + open) and an open practice afname.
 */
export async function createBasicWorld(
  opts: {
    mode?: "exam" | "practice";
    settings?: Partial<AssignmentSettings> & Record<string, unknown>;
    accessCode?: string | null;
    timeLimitMinutes?: number | null;
  } = {},
) {
  const teacher = await insertTeacher();
  const s1 = await insertStudent();
  const s2 = await insertStudent();
  const klas = await createClass(undefined, [s1.id, s2.id]);
  const { test, questions: qs } = await createTest({
    createdById: teacher.id,
    questions: [q.code(), q.mc(), q.open()],
  });
  const assignment = await createAssignment({
    testId: test.id,
    classId: klas.id,
    mode: opts.mode ?? "practice",
    settings: opts.settings ?? { showResults: "immediately", maxAttempts: 3 },
    accessCode: opts.accessCode ?? null,
    timeLimitMinutes: opts.timeLimitMinutes ?? null,
    createdById: teacher.id,
  });
  const [code, mc, open] = qs;
  return {
    teacher,
    s1,
    s2,
    klas,
    test,
    questions: { code, mc, open },
    assignment,
  };
}

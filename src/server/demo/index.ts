/**
 * Demo data: a demo class with students (and PINs), the demo Python test and
 * an open practice assignment. Used by `bun run db:seed`, by the teacher's
 * "Demodata laden" action and by the E2E seed (with fixed PINs).
 * Idempotent: existing data is reused.
 */
import { eq } from "drizzle-orm";
import { STUDENT_NUMBER_REGEX, STUDENT_PIN_REGEX } from "@/lib/auth-shared";
import { db } from "@/server/db";
import { classes, classMembers } from "@/server/db/schema";
import {
  createStudentAccount,
  findStudentByNumber,
  getStudentPin,
  resetStudentPin,
} from "@/server/services/accounts";
import { DEMO_CLASS_NAME, DEMO_TEST_TITLE, seedDemoTest } from "./demo-test";

export { DEMO_CLASS_NAME, DEMO_TEST_TITLE };

export const DEMO_STUDENTS: ReadonlyArray<readonly [string, string]> = [
  ["17053", "Jan Jansen"],
  ["17023", "Fatima El Amrani"],
  ["17054", "Sem de Vries"],
  ["17061", "Lotte Bakker"],
  ["17072", "Noah Visser"],
  ["17088", "Emma Smit"],
];

export type DemoDataResult = {
  classId: string;
  classCreated: boolean;
  students: Array<{
    studentNumber: string;
    name: string;
    pin: string | null;
    created: boolean;
  }>;
  testId: string;
  testCreated: boolean;
  assignmentId: string | null;
  assignmentCreated: boolean;
};

export type DemoDataOptions = {
  /**
   * Fixed PINs per leerlingnummer (E2E runs). Students without an entry get
   * a random PIN; an existing student whose PIN differs gets the fixed one.
   */
  pins?: Readonly<Record<string, string>>;
  /** Extra students `[leerlingnummer, name]` for the demo class. */
  extraStudents?: ReadonlyArray<readonly [string, string]>;
};

function checkOptions(opts: DemoDataOptions) {
  for (const [nr, pin] of Object.entries(opts.pins ?? {})) {
    if (!STUDENT_NUMBER_REGEX.test(nr) || !STUDENT_PIN_REGEX.test(pin)) {
      throw new Error(`Ongeldige demo-pincode voor ${nr}`);
    }
  }
  for (const [nr] of opts.extraStudents ?? []) {
    if (!STUDENT_NUMBER_REGEX.test(nr)) {
      throw new Error(`Ongeldig leerlingnummer ${nr}`);
    }
  }
}

export async function loadDemoData(
  adminId: string,
  opts: DemoDataOptions = {},
): Promise<DemoDataResult> {
  checkOptions(opts);
  const roster = [...DEMO_STUDENTS];
  for (const extra of opts.extraStudents ?? []) {
    if (!roster.some(([nr]) => nr === extra[0])) roster.push(extra);
  }

  let classCreated = false;
  let [klas] = await db
    .select()
    .from(classes)
    .where(eq(classes.name, DEMO_CLASS_NAME));
  if (!klas) {
    [klas] = await db
      .insert(classes)
      .values({
        name: DEMO_CLASS_NAME,
        schoolYear: "2026-2027",
        description: "Demoklas om Pensuma uit te proberen.",
      })
      .returning();
    classCreated = true;
  }

  const students: DemoDataResult["students"] = [];
  for (const [studentNumber, name] of roster) {
    const fixedPin = opts.pins?.[studentNumber];
    const existing = await findStudentByNumber(studentNumber);
    let userId: string;
    let pin: string | null;
    let created = false;
    if (existing) {
      userId = existing.id;
      pin = await getStudentPin(existing.id);
      if (fixedPin && pin !== fixedPin) {
        pin = await resetStudentPin(existing.id, fixedPin);
      }
    } else {
      const result = await createStudentAccount({
        studentNumber,
        name,
        pin: fixedPin,
      });
      userId = result.user.id;
      pin = result.pin;
      created = true;
    }
    await db
      .insert(classMembers)
      .values({ classId: klas.id, userId })
      .onConflictDoNothing();
    students.push({ studentNumber, name, pin, created });
  }

  const test = await seedDemoTest(adminId);
  return { classId: klas.id, classCreated, students, ...test };
}

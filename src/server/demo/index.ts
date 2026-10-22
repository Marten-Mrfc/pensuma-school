/**
 * Demo data: a demo class with students (and PINs), the demo Python test and
 * an open practice assignment. Used by `bun run db:seed` and by the teacher's
 * "Demodata laden" action. Idempotent: existing data is reused.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { classes, classMembers } from "@/server/db/schema";
import {
  createStudentAccount,
  findStudentByNumber,
  getStudentPin,
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

export async function loadDemoData(adminId: string): Promise<DemoDataResult> {
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
  for (const [studentNumber, name] of DEMO_STUDENTS) {
    const existing = await findStudentByNumber(studentNumber);
    let userId: string;
    let pin: string | null;
    let created = false;
    if (existing) {
      userId = existing.id;
      pin = await getStudentPin(existing.id);
    } else {
      const result = await createStudentAccount({ studentNumber, name });
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

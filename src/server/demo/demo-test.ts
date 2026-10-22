/**
 * Demo content: a Python basics test with code, multiple-choice and open
 * questions, plus an open practice assignment for the demo class.
 */
import { and, eq } from "drizzle-orm";
import { assignmentSettingsSchema } from "@/lib/questions/schema";
import { db } from "@/server/db";
import { assignments, classes, questions, tests } from "@/server/db/schema";
import { DEMO_QUESTIONS } from "./questions";

const TEST_TITLE = "Python basis – oefentoets";

export const DEMO_CLASS_NAME = "4H2 (demo)";

/** Create the demo test (if missing) and an open practice assignment for the demo class. */
export async function seedDemoTest(adminId: string): Promise<{
  testId: string;
  testCreated: boolean;
  assignmentId: string | null;
  assignmentCreated: boolean;
}> {
  let testCreated = false;
  let [test] = await db.select().from(tests).where(eq(tests.title, TEST_TITLE));
  if (!test) {
    [test] = await db
      .insert(tests)
      .values({
        title: TEST_TITLE,
        topic: "Python – basis",
        status: "published",
        createdById: adminId,
        description:
          "Een oefentoets met de basis van Python: `print`, `input`, rekenen, `if`, lussen en functies.\n\nJe mag je code zo vaak uitvoeren en testen als je wilt.",
      })
      .returning();
    await db.insert(questions).values(
      DEMO_QUESTIONS.map((q, position) => ({
        ...q,
        testId: test.id,
        position,
      })),
    );
    testCreated = true;
  }

  const [klas] = await db
    .select()
    .from(classes)
    .where(eq(classes.name, DEMO_CLASS_NAME));
  if (!klas)
    return {
      testId: test.id,
      testCreated,
      assignmentId: null,
      assignmentCreated: false,
    };
  const [existing] = await db
    .select()
    .from(assignments)
    .where(
      and(eq(assignments.testId, test.id), eq(assignments.classId, klas.id)),
    );
  if (existing) {
    return {
      testId: test.id,
      testCreated,
      assignmentId: existing.id,
      assignmentCreated: false,
    };
  }
  const [created] = await db
    .insert(assignments)
    .values({
      testId: test.id,
      classId: klas.id,
      title: "Oefenen: Python basis",
      mode: "practice",
      status: "open",
      createdById: adminId,
      settings: assignmentSettingsSchema.parse({
        showResults: "immediately",
        maxAttempts: 5,
        logFocusEvents: false,
      }),
    })
    .returning({ id: assignments.id });
  return {
    testId: test.id,
    testCreated,
    assignmentId: created.id,
    assignmentCreated: true,
  };
}

export const DEMO_TEST_TITLE = TEST_TITLE;

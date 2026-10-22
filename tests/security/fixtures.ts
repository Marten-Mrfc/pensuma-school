/**
 * A world for the security suites: teacher T; classes A and B; students A1
 * and A2 (class A) and B1 (class B); a test whose teacher-only fields hold
 * canary strings; afnames A-open (access code), A-planned-hidden and B-open;
 * in-progress attempts for A1 and B1.
 *
 * `cleanup()` deletes every row the fixture created (cascades included), so
 * the fixture leaves nothing behind even on a database that is not reset.
 */
import { inArray, or } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog, classes, tests, user } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import {
  createAssignment,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
  uniq,
} from "../support/factories";

export type SecurityFixtures = Awaited<
  ReturnType<typeof createSecurityFixtures>
>;

export async function createSecurityFixtures() {
  const sfx = uniq();
  const canary = {
    solution: `CANARY_SOLUTION_${sfx}`,
    hidden: `CANARY_HIDDEN_${sfx}`,
    hiddenStdin: `CANARY_STDIN_${sfx}`,
    model: `CANARY_MODEL_${sfx}`,
    rubric: `CANARY_RUBRIC_${sfx}`,
    rubricItem: `CANARY_RUBRIC_ITEM_${sfx}`,
    hint: `CANARY_HINT_${sfx}`,
    accessCode: "CNRY77",
  };

  const teacher = await insertTeacher({ name: `Docent ${sfx}` });
  const a1 = await insertStudent({ name: `Leerling A1 ${sfx}` });
  const a2 = await insertStudent({ name: `Leerling A2 ${sfx}` });
  const b1 = await insertStudent({ name: `Leerling B1 ${sfx}` });
  const classA = await createClass(`Klas A ${sfx}`, [a1.id, a2.id]);
  const classB = await createClass(`Klas B ${sfx}`, [b1.id]);

  const { test, questions } = await createTest({
    title: `Beveiligingstoets ${sfx}`,
    createdById: teacher.id,
    questions: [
      q.mc(
        {
          options: [
            { id: "goed", text: "Het goede antwoord", correct: true },
            { id: "fout1", text: "Fout antwoord", correct: false },
            { id: "fout2", text: "Nog een fout antwoord", correct: false },
          ],
          shuffle: false,
        },
        { title: "Meerkeuze" },
      ),
      q.code(
        {
          solution: `print("${canary.solution}")\n`,
          tests: [
            {
              id: "zichtbaar",
              kind: "io",
              name: "Zichtbare test",
              stdin: "",
              expectedOutput: "Hallo",
            },
            {
              id: "verborgen",
              kind: "io",
              name: "Verborgen test",
              stdin: canary.hiddenStdin,
              expectedOutput: canary.hidden,
              hidden: true,
            },
          ],
          hints: [{ id: "h1", text: canary.hint, penalty: 0.25 }],
        },
        { title: "Code" },
      ),
      q.open(
        {
          modelAnswer: canary.model,
          rubric: canary.rubric,
          rubricItems: [{ id: "r1", label: canary.rubricItem, points: 1 }],
        },
        { title: "Open" },
      ),
    ],
  });
  const [mc, code, open] = questions;

  const aOpen = await createAssignment({
    testId: test.id,
    classId: classA.id,
    title: `A open ${sfx}`,
    mode: "practice",
    status: "open",
    accessCode: canary.accessCode,
    settings: { showResults: "immediately", maxAttempts: 3 },
    createdById: teacher.id,
  });
  const aPlannedHidden = await createAssignment({
    testId: test.id,
    classId: classA.id,
    title: `A gepland ${sfx}`,
    mode: "exam",
    status: "planned",
    opensAt: null,
    createdById: teacher.id,
  });
  const bOpen = await createAssignment({
    testId: test.id,
    classId: classB.id,
    title: `B open ${sfx}`,
    mode: "practice",
    status: "open",
    settings: { showResults: "immediately", maxAttempts: 3 },
    createdById: teacher.id,
  });

  const a1Start = await callerFor(a1).portal.startAttempt({
    assignmentId: aOpen.id,
    accessCode: canary.accessCode,
  });
  const b1Start = await callerFor(b1).portal.startAttempt({
    assignmentId: bOpen.id,
  });

  const userIds = [teacher.id, a1.id, a2.id, b1.id];
  async function cleanup() {
    // Users cascade to sessions, memberships, attempts, answers and events;
    // classes cascade to afnames; tests to questions.
    await db.delete(tests).where(inArray(tests.id, [test.id]));
    await db.delete(classes).where(inArray(classes.id, [classA.id, classB.id]));
    await db.delete(user).where(inArray(user.id, userIds));
    await db
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.actorId, userIds),
          inArray(auditLog.subjectUserId, userIds),
        ),
      );
  }

  return {
    sfx,
    canary,
    teacher,
    a1,
    a2,
    b1,
    classA,
    classB,
    test,
    questions: { mc, code, open },
    aOpen,
    aPlannedHidden,
    bOpen,
    a1AttemptId: a1Start.attemptId,
    b1AttemptId: b1Start.attemptId,
    cleanup,
  };
}

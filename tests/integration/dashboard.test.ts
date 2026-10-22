/** Teacher dashboard counts on a small known dataset. */
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createAssignment,
  createBasicWorld,
  createTest,
  insertStudent,
} from "../support/factories";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

test("dashboard.overview counts afnames, students, tests and the review queue", async () => {
  const w = await createBasicWorld();
  // One deactivated student: not counted.
  const inactive = await insertStudent();
  await db.update(user).set({ banned: true }).where(eq(user.id, inactive.id));
  // A planned afname with a future opening time and a draft test.
  await createAssignment({
    testId: w.test.id,
    classId: w.klas.id,
    status: "planned",
    opensAt: new Date(Date.now() + 86_400_000),
  });
  await createTest({ status: "draft" });

  // s1 submits an open answer → 1 answer needs review.
  const s1 = callerFor(w.s1);
  const { attemptId } = await s1.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await s1.portal.saveAnswer({
    attemptId,
    questionId: w.questions.open.id,
    response: { text: "Een antwoord" },
  });
  await s1.portal.submitAttempt({ attemptId });
  await waitForGrading(attemptId);

  const out = await callerFor(w.teacher).dashboard.overview();
  expect(out.counts).toEqual({
    openAssignments: 1,
    plannedAssignments: 1,
    students: 2,
    publishedTests: 1,
    answersNeedingReview: 1,
  });
  expect(out.recentSubmissions).toHaveLength(1);
});

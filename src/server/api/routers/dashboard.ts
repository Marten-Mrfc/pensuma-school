/**
 * Teacher dashboard: headline counts, running/upcoming afnames with live
 * progress, the review queue, recent submissions and the grade distribution
 * of the most recently closed afname.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ROLES } from "@/lib/auth-shared";
import {
  attemptCountsByAssignment,
  studentCountsByClass,
} from "@/server/api/routers/assignment";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import {
  answers,
  assignments,
  attempts,
  classes,
  tests,
  user,
} from "@/server/db/schema";
import {
  dutchGrade,
  effectiveAssignmentStatus,
} from "@/server/services/assignment-status";

export const dashboardRouter = createTRPCRouter({
  overview: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const [assignmentRows, [studentCount], [testCount], reviewRows, recent] =
      await Promise.all([
        ctx.db
          .select({
            assignment: assignments,
            testTitle: tests.title,
            className: classes.name,
          })
          .from(assignments)
          .innerJoin(tests, eq(tests.id, assignments.testId))
          .innerJoin(classes, eq(classes.id, assignments.classId))
          .orderBy(desc(assignments.createdAt)),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(user)
          .where(
            and(
              eq(user.role, ROLES.student),
              sql`coalesce(${user.banned}, false) = false`,
            ),
          ),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(tests)
          .where(eq(tests.status, "published")),
        ctx.db
          .select({
            assignmentId: attempts.assignmentId,
            count: sql<number>`count(*)::int`,
          })
          .from(answers)
          .innerJoin(attempts, eq(attempts.id, answers.attemptId))
          .where(
            and(
              eq(answers.status, "needs_review"),
              isNull(answers.manualScore),
              eq(attempts.status, "submitted"),
            ),
          )
          .groupBy(attempts.assignmentId),
        ctx.db
          .select({
            id: attempts.id,
            assignmentId: attempts.assignmentId,
            submittedAt: attempts.submittedAt,
            autoSubmitted: attempts.autoSubmitted,
            score: attempts.score,
            maxScore: attempts.maxScore,
            gradingStatus: attempts.gradingStatus,
            studentName: user.name,
            studentNumber: user.username,
          })
          .from(attempts)
          .innerJoin(user, eq(user.id, attempts.userId))
          .where(eq(attempts.status, "submitted"))
          .orderBy(desc(attempts.submittedAt))
          .limit(10),
      ]);

    const withStatus = assignmentRows.map((r) => ({
      ...r,
      effectiveStatus: effectiveAssignmentStatus(r.assignment, now),
      title: r.assignment.title?.trim() || r.testTitle,
    }));
    const byId = new Map(withStatus.map((r) => [r.assignment.id, r]));

    const active = withStatus
      .filter(
        (r) => r.effectiveStatus === "open" || r.effectiveStatus === "planned",
      )
      .sort((x, y) => {
        if (x.effectiveStatus !== y.effectiveStatus)
          return x.effectiveStatus === "open" ? -1 : 1;
        const tx =
          (x.effectiveStatus === "open"
            ? x.assignment.closesAt
            : x.assignment.opensAt
          )?.getTime() ?? Infinity;
        const ty =
          (y.effectiveStatus === "open"
            ? y.assignment.closesAt
            : y.assignment.opensAt
          )?.getTime() ?? Infinity;
        return tx - ty;
      })
      .slice(0, 12);

    const [students, counts] = await Promise.all([
      studentCountsByClass(ctx.db, [
        ...new Set(active.map((r) => r.assignment.classId)),
      ]),
      attemptCountsByAssignment(
        ctx.db,
        active.map((r) => r.assignment.id),
      ),
    ]);

    const activeAssignments = active.map((r) => ({
      id: r.assignment.id,
      title: r.title,
      testTitle: r.testTitle,
      className: r.className,
      mode: r.assignment.mode,
      effectiveStatus: r.effectiveStatus,
      opensAt: r.assignment.opensAt,
      closesAt: r.assignment.closesAt,
      timeLimitMinutes: r.assignment.timeLimitMinutes,
      accessCode: r.assignment.accessCode,
      counts: {
        students: students.get(r.assignment.classId) ?? 0,
        ...(counts.get(r.assignment.id) ?? {
          started: 0,
          inProgress: 0,
          submitted: 0,
        }),
      },
    }));

    const reviewQueue = reviewRows
      .map((r) => {
        const a = byId.get(r.assignmentId);
        return a
          ? {
              assignmentId: r.assignmentId,
              title: a.title,
              className: a.className,
              count: r.count,
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((x, y) => y.count - x.count);

    const recentSubmissions = recent.map((r) => {
      const a = byId.get(r.assignmentId);
      return {
        attemptId: r.id,
        assignmentId: r.assignmentId,
        assignmentTitle: a?.title ?? "",
        className: a?.className ?? "",
        studentName: r.studentName,
        studentNumber: r.studentNumber,
        submittedAt: r.submittedAt,
        autoSubmitted: r.autoSubmitted,
        score: r.score,
        maxScore: r.maxScore,
        gradingStatus: r.gradingStatus,
        grade:
          r.gradingStatus === "graded" && r.score != null && r.maxScore
            ? dutchGrade(r.score, r.maxScore)
            : null,
      };
    });

    // Grade distribution of the most recently closed assignment with submissions.
    const closed = withStatus
      .filter((r) => r.effectiveStatus === "closed")
      .sort(
        (x, y) =>
          (y.assignment.closesAt ?? y.assignment.updatedAt).getTime() -
          (x.assignment.closesAt ?? x.assignment.updatedAt).getTime(),
      );
    let lastClosed: {
      id: string;
      title: string;
      className: string;
      closedAt: Date | null;
      submitted: number;
      averageGrade: number | null;
      passed: number;
      distribution: {
        label: string;
        from: number;
        to: number;
        count: number;
      }[];
    } | null = null;
    if (closed.length) {
      const ids = closed.slice(0, 20).map((r) => r.assignment.id);
      const scored = await ctx.db
        .select({
          assignmentId: attempts.assignmentId,
          userId: attempts.userId,
          attemptNumber: attempts.attemptNumber,
          score: attempts.score,
          maxScore: attempts.maxScore,
        })
        .from(attempts)
        .where(
          and(
            inArray(attempts.assignmentId, ids),
            eq(attempts.status, "submitted"),
          ),
        );
      const target = closed.find((r) =>
        scored.some((s) => s.assignmentId === r.assignment.id),
      );
      if (target) {
        const latest = new Map<string, (typeof scored)[number]>();
        for (const s of scored) {
          if (s.assignmentId !== target.assignment.id) continue;
          const cur = latest.get(s.userId);
          if (!cur || s.attemptNumber > cur.attemptNumber)
            latest.set(s.userId, s);
        }
        const grades = [...latest.values()]
          .map((s) =>
            s.score != null && s.maxScore
              ? dutchGrade(s.score, s.maxScore)
              : null,
          )
          .filter((g): g is number => g != null);
        const distribution = Array.from({ length: 9 }, (_, i) => ({
          from: i + 1,
          to: i + 2,
          label: `${i + 1}–${i + 2}`,
          count: 0,
        }));
        for (const g of grades)
          distribution[Math.min(8, Math.max(0, Math.floor(g) - 1))].count++;
        lastClosed = {
          id: target.assignment.id,
          title: target.title,
          className: target.className,
          closedAt: target.assignment.closesAt,
          submitted: latest.size,
          averageGrade: grades.length
            ? Math.round(
                (grades.reduce((s, g) => s + g, 0) / grades.length) * 10,
              ) / 10
            : null,
          passed: grades.filter((g) => g >= 5.5).length,
          distribution,
        };
      }
    }

    return {
      counts: {
        openAssignments: withStatus.filter((r) => r.effectiveStatus === "open")
          .length,
        plannedAssignments: withStatus.filter(
          (r) => r.effectiveStatus === "planned",
        ).length,
        students: studentCount?.count ?? 0,
        publishedTests: testCount?.count ?? 0,
        answersNeedingReview: reviewRows.reduce((s, r) => s + r.count, 0),
      },
      activeAssignments,
      reviewQueue,
      recentSubmissions,
      lastClosed,
      serverTime: now,
    };
  }),
});

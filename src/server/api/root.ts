import { assignmentRouter } from "@/server/api/routers/assignment";
import { classRouter } from "@/server/api/routers/class";
import { codeRouter } from "@/server/api/routers/code";
import { dashboardRouter } from "@/server/api/routers/dashboard";
import { portalRouter } from "@/server/api/routers/portal";
import { questionRouter } from "@/server/api/routers/question";
import { reviewRouter } from "@/server/api/routers/review";
import { setupRouter } from "@/server/api/routers/setup";
import { staffRouter } from "@/server/api/routers/staff";
import { studentRouter } from "@/server/api/routers/student";
import { testRouter } from "@/server/api/routers/test";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * Root router. Each sub-router lives in `src/server/api/routers/<name>.ts`.
 *
 *  setup       first-run: create the first teacher account
 *  class       klassen (admin)
 *  student     leerlingen, PIN codes, import (admin)
 *  staff       docent accounts (admin)
 *  test        toetsen (admin)
 *  question    vragen within a toets (admin)
 *  code        run/grade Python on the server for teachers (admin)
 *  assignment  afnames: plan/open/close/monitor (admin)
 *  review      resultaten, nakijken, overrides, export (admin)
 *  dashboard   teacher dashboard statistics (admin)
 *  portal      everything a student does (student)
 */
export const appRouter = createTRPCRouter({
  setup: setupRouter,
  class: classRouter,
  student: studentRouter,
  staff: staffRouter,
  test: testRouter,
  question: questionRouter,
  code: codeRouter,
  assignment: assignmentRouter,
  review: reviewRouter,
  dashboard: dashboardRouter,
  portal: portalRouter,
});

export type AppRouter = typeof appRouter;

/** Server-side caller, e.g. for route handlers and scripts. */
export const createCaller = createCallerFactory(appRouter);

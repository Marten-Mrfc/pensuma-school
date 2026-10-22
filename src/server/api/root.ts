import { accommodationRouter } from "@/server/api/routers/accommodation";
import { analysisRouter } from "@/server/api/routers/analysis";
import { assignmentRouter } from "@/server/api/routers/assignment";
import { bankRouter } from "@/server/api/routers/bank";
import { classRouter } from "@/server/api/routers/class";
import { codeRouter } from "@/server/api/routers/code";
import { dashboardRouter } from "@/server/api/routers/dashboard";
import { feedbackRouter } from "@/server/api/routers/feedback";
import { helpRouter } from "@/server/api/routers/help";
import { portalRouter } from "@/server/api/routers/portal";
import { preferencesRouter } from "@/server/api/routers/preferences";
import { privacyRouter } from "@/server/api/routers/privacy";
import { questionRouter } from "@/server/api/routers/question";
import { reviewRouter } from "@/server/api/routers/review";
import { setupRouter } from "@/server/api/routers/setup";
import { similarityRouter } from "@/server/api/routers/similarity";
import { staffRouter } from "@/server/api/routers/staff";
import { studentRouter } from "@/server/api/routers/student";
import { testRouter } from "@/server/api/routers/test";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * Root router. Each sub-router lives in `src/server/api/routers/<name>.ts`.
 *
 *  setup          first-run: create the first teacher account
 *  class          klassen (admin)
 *  student        leerlingen, PIN codes, import (admin)
 *  staff          docent accounts (admin)
 *  test           toetsen (admin)
 *  question       vragen within a toets (admin)
 *  code           run/grade Python on the server for teachers (admin)
 *  assignment     afnames: plan/open/close/monitor (admin)
 *  review         resultaten, nakijken, overrides, export (admin)
 *  dashboard      teacher dashboard statistics (admin)
 *  portal         everything a student does (student)
 *  privacy        AVG: bewaartermijnen, inzage, verwijderen, logboek
 *  accommodation  faciliteiten (verlengde tijd)
 *  similarity     code vergelijken
 *  analysis       toetsanalyse
 *  preferences    weergave-instellingen per gebruiker
 *  bank           vragenbank en voorbeeldtoetsen
 *  feedback       snelle opmerkingen, criteria, gelijke antwoorden
 *  help           hints en modeloplossingen voor leerlingen
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
  privacy: privacyRouter,
  accommodation: accommodationRouter,
  similarity: similarityRouter,
  analysis: analysisRouter,
  preferences: preferencesRouter,
  bank: bankRouter,
  feedback: feedbackRouter,
  help: helpRouter,
});

export type AppRouter = typeof appRouter;

/** Server-side caller, e.g. for route handlers and scripts. */
export const createCaller = createCallerFactory(appRouter);

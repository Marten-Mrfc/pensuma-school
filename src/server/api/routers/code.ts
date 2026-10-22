/**
 * Teacher tools for code questions (adminProcedure only). Everything runs in
 * the sandboxed server grader.
 *
 * - run({ code, stdin?, timeLimitMs? }) → RunResult
 * - grade({ data: CodeQuestionData, code? }) → CodeGradingResult, with ALL
 *   tests (incl. hidden) on `code ?? data.solution`, to validate a question
 * - generateExpected({ solution, stdins, timeLimitMs? }) → [{ stdout, error }]
 *   (clean stdout of the model solution per stdin, to fill expected outputs)
 */
import { z } from "zod";
import {
  codeCheckSchema,
  codeQuestionDataSchema,
  codeTestSchema,
} from "@/lib/questions/schema";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { gradeCode, runCode, runCodeBatch } from "@/server/grader";

const MAX_CODE = 100_000;
const MAX_TESTS = 100;

const codeString = z
  .string()
  .max(MAX_CODE, "De code is te lang (maximaal 100.000 tekens).");
const timeLimit = z.number().int().min(500).max(30_000);

const limitedQuestionData = codeQuestionDataSchema.extend({
  starterCode: z.string().max(MAX_CODE).default(""),
  solution: z.string().max(MAX_CODE).default(""),
  tests: z
    .array(codeTestSchema)
    .max(MAX_TESTS, "Maximaal 100 tests.")
    .default([]),
  checks: z.array(codeCheckSchema).max(MAX_TESTS).default([]),
});

export const codeRouter = createTRPCRouter({
  run: adminProcedure
    .input(
      z.object({
        code: codeString,
        stdin: z.string().max(MAX_CODE).optional(),
        timeLimitMs: timeLimit.optional(),
      }),
    )
    .mutation(({ input }) => runCode(input)),

  grade: adminProcedure
    .input(z.object({ data: limitedQuestionData, code: codeString.optional() }))
    .mutation(({ input }) =>
      gradeCode({
        code: input.code ?? input.data.solution,
        tests: input.data.tests,
        checks: input.data.checks,
        timeLimitMs: input.data.timeLimitMs,
      }),
    ),

  generateExpected: adminProcedure
    .input(
      z.object({
        solution: codeString,
        stdins: z.array(z.string().max(MAX_CODE)).min(1).max(MAX_TESTS),
        timeLimitMs: timeLimit.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const results = await runCodeBatch(
        input.solution,
        input.stdins,
        input.timeLimitMs,
      );
      return results.map((r) => ({ stdout: r.stdout, error: r.error }));
    }),
});

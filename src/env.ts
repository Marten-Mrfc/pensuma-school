import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(32)
        : z.string().min(1).default("dev-secret-change-me-dev-secret-change-me"),
    /** Public base URL, e.g. https://toetsen.school.nl */
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    /** Number of pre-warmed Python sandboxes on the server. */
    GRADER_POOL_SIZE: z.coerce.number().int().min(1).max(32).default(2),
    /** Max concurrent grading jobs (queued beyond this). */
    GRADER_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GRADER_POOL_SIZE: process.env.GRADER_POOL_SIZE,
    GRADER_MAX_CONCURRENCY: process.env.GRADER_MAX_CONCURRENCY,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

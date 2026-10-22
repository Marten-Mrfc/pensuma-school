import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { isValidCidr, splitList } from "@/lib/security/cidr";

/**
 * Server environment, validated when the server starts (not at build
 * time: the Docker builder sets SKIP_ENV_VALIDATION). Messages are in
 * English because they are read by operators. See .env.example.
 */

const isProduction = process.env.NODE_ENV === "production";

/** Development fallback; refused in production. */
export const DEV_AUTH_SECRET = "dev-secret-change-me-dev-secret-change-me";
/** The value in .env.example; refused in production. */
export const ENV_EXAMPLE_AUTH_SECRET = "replace-me-with-openssl-rand-base64-32";

const insecureHttpAllowed = () => process.env.ALLOW_INSECURE_HTTP === "true";

const productionSecret = z
  .string()
  .min(
    32,
    "BETTER_AUTH_SECRET must be at least 32 characters (generate one with `openssl rand -base64 32`).",
  )
  .refine(
    (s) => new Set(s).size >= 12,
    "BETTER_AUTH_SECRET must contain at least 12 different characters.",
  )
  .refine(
    (s) => s !== DEV_AUTH_SECRET && s !== ENV_EXAMPLE_AUTH_SECRET,
    "BETTER_AUTH_SECRET must not be the development default or the .env.example placeholder.",
  );

const productionUrl = z
  .url(
    "BETTER_AUTH_URL must be the public URL of the app, e.g. https://toetsen.school.nl",
  )
  .refine(
    (u) => u.startsWith("https://") || insecureHttpAllowed(),
    "BETTER_AUTH_URL must start with https:// in production (ALLOW_INSECURE_HTTP=true allows http for a LAN pilot only).",
  );

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: isProduction
      ? productionSecret
      : z.string().min(1).default(DEV_AUTH_SECRET),
    /** Public base URL, e.g. https://toetsen.school.nl (no default in production). */
    BETTER_AUTH_URL: isProduction
      ? productionUrl
      : z.url().default("http://localhost:3000"),
    /** Reverse proxies in front of the app (Traefik), as IPs or CIDRs. */
    TRUSTED_PROXIES: z
      .string()
      .default("")
      .refine(
        (v) => splitList(v).every(isValidCidr),
        "TRUSTED_PROXIES must be a comma-separated list of IPv4/IPv6 addresses or CIDR ranges, e.g. 10.0.1.0/24.",
      )
      .transform(splitList),
    /** Unlocks /setup in production; required until the first teacher exists. */
    SETUP_TOKEN: z
      .string()
      .min(24, "SETUP_TOKEN must be at least 24 characters.")
      .optional(),
    /** Failed sign-ins from one IP within 10 minutes before it is paused. */
    LOGIN_IP_MAX_FAILURES: z.coerce
      .number()
      .int("LOGIN_IP_MAX_FAILURES must be a whole number.")
      .min(1)
      .max(100_000)
      .default(100),
    /** Integration tests only (honoured only when NODE_ENV=test). */
    RATE_LIMIT_DISABLED: z
      .string()
      .optional()
      .refine(
        (v) => !v || !isProduction,
        "RATE_LIMIT_DISABLED is not allowed in production.",
      ),
    /** "true" allows an http:// BETTER_AUTH_URL in production (LAN pilot). */
    ALLOW_INSECURE_HTTP: z
      .enum(["true", "false"], "ALLOW_INSECURE_HTTP must be 'true' or 'false'.")
      .default("false")
      .transform((v) => v === "true"),
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
    TRUSTED_PROXIES: process.env.TRUSTED_PROXIES,
    SETUP_TOKEN: process.env.SETUP_TOKEN,
    LOGIN_IP_MAX_FAILURES: process.env.LOGIN_IP_MAX_FAILURES,
    RATE_LIMIT_DISABLED: process.env.RATE_LIMIT_DISABLED,
    ALLOW_INSECURE_HTTP: process.env.ALLOW_INSECURE_HTTP,
    GRADER_POOL_SIZE: process.env.GRADER_POOL_SIZE,
    GRADER_MAX_CONCURRENCY: process.env.GRADER_MAX_CONCURRENCY,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

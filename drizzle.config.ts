import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://pensuma:pensuma@localhost:5432/pensuma",
  },
  strict: true,
} satisfies Config;

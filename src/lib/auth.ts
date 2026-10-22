import { betterAuth } from "better-auth";
import { Pool } from "pg";

const database = new Pool({
  connectionString: "postgresql://postgres:password@localhost:5432/database",
});

export const auth = betterAuth({
  database: database,
  baseURL: "http://localhost:3000/",
  emailAndPassword: { enabled: true },
  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    },
  },
});

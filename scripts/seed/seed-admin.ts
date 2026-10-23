/**
 * The first teacher account for `bun run db:seed` and the E2E seed.
 * Importable (no side effects); scripts/seed/index.ts is the CLI.
 */
import { eq } from "drizzle-orm";
import { validateTeacherPassword } from "@/lib/security/password-policy";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { createAdminAccount } from "@/server/services/accounts";

/** Development default (never accepted in production). */
export const DEV_ADMIN_PASSWORD = "welkom-docent";

/**
 * Throws (Dutch message) when the seed password is not acceptable. In
 * production the teacher password policy applies; development accepts the
 * well-known demo password.
 */
export async function checkSeedPassword(
  password: string,
  ctx: { email: string; name: string; production: boolean },
): Promise<void> {
  if (!ctx.production) {
    if (password.length < 10) {
      throw new Error(
        "Zet SEED_ADMIN_PASSWORD (minstens 10 tekens) om een docentaccount aan te maken.",
      );
    }
    return;
  }
  if (password === DEV_ADMIN_PASSWORD) {
    throw new Error(
      "Het demowachtwoord mag niet in productie. Zet een eigen SEED_ADMIN_PASSWORD.",
    );
  }
  const result = validateTeacherPassword(password, {
    email: ctx.email,
    name: ctx.name,
  });
  if (!result.ok) throw new Error(`SEED_ADMIN_PASSWORD: ${result.message}`);
}

export type SeedAdminOptions = {
  email?: string;
  password?: string;
  name?: string;
  production?: boolean;
  log?: (line: string) => void;
};

/** Create the first teacher (or reuse an existing one). Returns its id. */
export async function seedAdmin(opts: SeedAdminOptions = {}): Promise<string> {
  const production = opts.production ?? process.env.NODE_ENV === "production";
  const log = opts.log ?? console.log;
  const email = (
    opts.email ??
    process.env.SEED_ADMIN_EMAIL ??
    "docent@pensuma.local"
  ).toLowerCase();
  const name = opts.name ?? process.env.SEED_ADMIN_NAME ?? "Docent";
  const fromEnv = opts.password ?? process.env.SEED_ADMIN_PASSWORD;
  const password = fromEnv ?? (production ? "" : DEV_ADMIN_PASSWORD);

  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) {
    log(`✓ Docent ${email} bestaat al`);
    return existing.id;
  }
  await checkSeedPassword(password, { email, name, production });
  const created = await createAdminAccount({ name, email, password });
  log(
    `✓ Docent aangemaakt: ${email} / ${fromEnv ? "(wachtwoord uit SEED_ADMIN_PASSWORD)" : password}`,
  );
  return created.id;
}

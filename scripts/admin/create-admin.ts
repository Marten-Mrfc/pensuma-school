/**
 * Create a teacher (docent) account from the command line, or give an
 * existing teacher a new temporary password. For recovery when nobody can
 * sign in any more: /setup never reopens once the first teacher exists.
 *
 *   bun run admin:create -- --email docent@school.nl --name "Marieke de Vries"
 *
 * In the Docker container (Dokploy → Docker terminal) the source is not
 * there; run it from a checkout with DATABASE_URL and BETTER_AUTH_SECRET of
 * the production server, e.g. over an SSH tunnel to Postgres.
 *
 * Prints a temporary password once. The teacher must choose their own
 * password at the first sign-in (user.password_change_required).
 */
import { eq } from "drizzle-orm";
import { ROLES } from "@/lib/auth-shared";
import { sanitizeAuditDetails } from "@/lib/privacy/audit-sanitize";
import { db } from "@/server/db";
import { appSettings, auditLog, user } from "@/server/db/schema";
import { generateTemporaryPassword } from "@/server/security/temporary-password";
import {
  createAdminAccount,
  setAccountPassword,
} from "@/server/services/accounts";

const USAGE = `Gebruik:
  bun run admin:create -- --email <e-mailadres> --name "<naam>"

Maakt een docentaccount met een tijdelijk wachtwoord. Bestaat er al een
docent met dit e-mailadres, dan krijgt die een nieuw tijdelijk wachtwoord
(en wordt op alle apparaten uitgelogd).`;

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = "1";
    else if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=", 2);
      const value = inline ?? argv[i + 1];
      if (inline === undefined) i++;
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

async function audit(
  action: "staff.created" | "staff.password_reset",
  id: string,
  email: string,
) {
  await db.insert(auditLog).values({
    actorId: null,
    actorRole: "system",
    action,
    subjectType: "staff",
    subjectId: id,
    subjectLabel: email,
    details: sanitizeAuditDetails({
      passwordChangeRequired: true,
      source: "cli",
    }),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const email = (args.email ?? "").trim().toLowerCase();
  const name = (args.name ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    console.error("Geef een geldig e-mailadres op met --email.\n");
    console.error(USAGE);
    return 1;
  }
  if (name.length < 2 || name.length > 100) {
    console.error(
      'Geef de naam van de docent op met --name "Voornaam Achternaam".\n',
    );
    console.error(USAGE);
    return 1;
  }

  const password = generateTemporaryPassword();
  const [existing] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  let id: string;
  if (existing) {
    if (existing.role !== ROLES.admin) {
      console.error(
        "Dit e-mailadres hoort bij een leerlingaccount. Kies een ander adres.",
      );
      return 1;
    }
    id = existing.id;
    await setAccountPassword(id, password);
    await db
      .update(user)
      .set({ passwordChangeRequired: true })
      .where(eq(user.id, id));
    await audit("staff.password_reset", id, email);
    console.log(
      `✓ Nieuw tijdelijk wachtwoord voor de bestaande docent ${email}.`,
    );
  } else {
    const created = await createAdminAccount({ name, email, password });
    id = created.id;
    await db
      .update(user)
      .set({ passwordChangeRequired: true })
      .where(eq(user.id, id));
    await audit("staff.created", id, email);
    console.log(`✓ Docentaccount aangemaakt voor ${name} <${email}>.`);
  }

  // A teacher exists now, so /setup stays closed.
  await db
    .insert(appSettings)
    .values({
      key: "setup_completed_at",
      value: { completedAt: new Date().toISOString() },
      updatedById: id,
    })
    .onConflictDoNothing();

  console.log("");
  console.log(`  Tijdelijk wachtwoord: ${password}`);
  console.log("");
  console.log(
    "  Dit wachtwoord wordt maar één keer getoond. Bij de eerste keer",
  );
  console.log("  inloggen kiest de docent meteen een eigen wachtwoord.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

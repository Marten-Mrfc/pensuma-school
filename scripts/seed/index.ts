/**
 * Seed the database with a first teacher, a demo class with students and a
 * demo Python test.
 *
 *   bun run db:seed
 *
 * Environment (see .env.example):
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME  first teacher
 *   SEED_DEMO=false                                            skip demo class/test
 *
 * Idempotent: existing accounts / demo data are left alone.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { loadDemoData } from "@/server/demo";
import { createAdminAccount } from "@/server/services/accounts";

async function seedAdmin() {
  const email = (
    process.env.SEED_ADMIN_EMAIL ?? "docent@pensuma.local"
  ).toLowerCase();
  const password =
    process.env.SEED_ADMIN_PASSWORD ??
    (process.env.NODE_ENV === "production" ? "" : "welkom-docent");
  const name = process.env.SEED_ADMIN_NAME ?? "Docent";
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) {
    console.log(`✓ Docent ${email} bestaat al`);
    return existing.id;
  }
  if (password.length < 10) {
    throw new Error(
      "Zet SEED_ADMIN_PASSWORD (minstens 10 tekens) om een docentaccount aan te maken.",
    );
  }
  const created = await createAdminAccount({ name, email, password });
  console.log(
    `✓ Docent aangemaakt: ${email} / ${process.env.SEED_ADMIN_PASSWORD ? "(wachtwoord uit SEED_ADMIN_PASSWORD)" : password}`,
  );
  return created.id;
}

async function main() {
  const adminId = await seedAdmin();
  if (process.env.SEED_DEMO === "false") return;
  const demo = await loadDemoData(adminId);
  console.log(`✓ Demoklas ${demo.classCreated ? "aangemaakt" : "bestaat al"}`);
  console.log("  Leerlingen (leerlingnummer → pincode):");
  for (const s of demo.students)
    console.log(`    ${s.studentNumber}  ${s.pin ?? "??????"}  ${s.name}`);
  console.log(`✓ Demotoets ${demo.testCreated ? "aangemaakt" : "bestaat al"}`);
  if (demo.assignmentCreated)
    console.log("✓ Oefenafname voor de demoklas geopend");
  console.log("✓ Klaar.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

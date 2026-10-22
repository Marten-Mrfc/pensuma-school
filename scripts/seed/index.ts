/**
 * Seed the database with a first teacher, a demo class with students and a
 * demo Python test.
 *
 *   bun run db:seed
 *
 * Environment (see .env.example):
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME  first teacher
 *     (in production SEED_ADMIN_PASSWORD must meet the teacher password
 *     policy; development defaults to "welkom-docent")
 *   SEED_DEMO=false                                            skip demo class/test
 *
 * Idempotent: existing accounts / demo data are left alone.
 */
import { loadDemoData } from "@/server/demo";
import { seedAdmin } from "./seed-admin";

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
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

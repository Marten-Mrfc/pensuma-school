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
import { ROLES } from "@/lib/auth-shared";
import { db } from "@/server/db";
import { classes, classMembers, user } from "@/server/db/schema";
import {
  createAdminAccount,
  createStudentAccount,
  findStudentByNumber,
  getStudentPin,
} from "@/server/services/accounts";
import { seedDemoTest } from "./demo-test";

const DEMO_STUDENTS: Array<[string, string]> = [
  ["17053", "Jan Jansen"],
  ["17023", "Fatima El Amrani"],
  ["17054", "Sem de Vries"],
  ["17061", "Lotte Bakker"],
  ["17072", "Noah Visser"],
  ["17088", "Emma Smit"],
];

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "docent@pensuma.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "welkom-docent");
  const name = process.env.SEED_ADMIN_NAME ?? "Docent";
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) {
    console.log(`✓ Docent ${email} bestaat al`);
    return existing.id;
  }
  if (password.length < 10) {
    throw new Error("Zet SEED_ADMIN_PASSWORD (minstens 10 tekens) om een docentaccount aan te maken.");
  }
  const created = await createAdminAccount({ name, email, password });
  console.log(`✓ Docent aangemaakt: ${email} / ${process.env.SEED_ADMIN_PASSWORD ? "(wachtwoord uit SEED_ADMIN_PASSWORD)" : password}`);
  return created.id;
}

async function seedDemoClass() {
  let [klas] = await db.select().from(classes).where(eq(classes.name, "4H2 (demo)"));
  if (!klas) {
    [klas] = await db
      .insert(classes)
      .values({ name: "4H2 (demo)", schoolYear: "2026-2027", description: "Demoklas om Pensuma uit te proberen." })
      .returning();
    console.log("✓ Demoklas 4H2 (demo) aangemaakt");
  }
  console.log("  Leerlingen (leerlingnummer → pincode):");
  for (const [number, name] of DEMO_STUDENTS) {
    let student = await findStudentByNumber(number);
    let pin: string | null;
    if (!student) {
      const created = await createStudentAccount({ studentNumber: number, name });
      student = created.user as typeof student & {};
      pin = created.pin;
    } else {
      pin = await getStudentPin(student.id);
    }
    if (!student) continue;
    await db.insert(classMembers).values({ classId: klas.id, userId: student.id }).onConflictDoNothing();
    console.log(`    ${number}  ${pin ?? "??????"}  ${name}`);
  }
  return klas.id;
}

async function main() {
  const adminId = await seedAdmin();
  if (process.env.SEED_DEMO === "false") return;
  await seedDemoClass();
  await seedDemoTest(adminId);
  const [{ count }] = await db.$count(user, eq(user.role, ROLES.student)).then((c) => [{ count: c }]);
  console.log(`✓ Klaar. ${count} leerlingen in de database.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

/** Demo data loader (fixed PINs for E2E) and the seed's password rules. */
import { beforeEach, describe, expect, test } from "bun:test";
import { auth } from "@/server/auth";
import { DEMO_CLASS_NAME, DEMO_STUDENTS, loadDemoData } from "@/server/demo";
import { checkSeedPassword, seedAdmin } from "../../scripts/seed/seed-admin";
import { callerFor, testHeaders } from "../support/caller";
import { resetDatabase } from "../support/db";
import { insertTeacher } from "../support/factories";

beforeEach(resetDatabase);

async function signInStatus(username: string, password: string) {
  try {
    const res = await auth.api.signInUsername({
      body: { username, password },
      headers: testHeaders(),
      asResponse: true,
    });
    return res.status;
  } catch (err) {
    return (err as { statusCode?: number }).statusCode ?? 500;
  }
}

describe("loadDemoData", () => {
  test("default: random PINs, idempotent", async () => {
    const teacher = await insertTeacher();
    const first = await loadDemoData(teacher.id);
    expect(first.classCreated).toBe(true);
    expect(first.students).toHaveLength(DEMO_STUDENTS.length);
    for (const s of first.students) expect(s.pin).toMatch(/^\d{6}$/);
    expect(first.assignmentCreated).toBe(true);

    const again = await loadDemoData(teacher.id);
    expect(again.classCreated).toBe(false);
    expect(again.testCreated).toBe(false);
    expect(again.assignmentCreated).toBe(false);
    expect(again.students.map((s) => s.pin)).toEqual(
      first.students.map((s) => s.pin),
    );
  });

  test("fixed PINs and extra students (E2E)", async () => {
    const teacher = await insertTeacher();
    const out = await loadDemoData(teacher.id, {
      pins: { "17053": "739838", "17101": "246810" },
      extraStudents: [["17101", "Pim Praktijk"]],
    });
    const byNumber = new Map(out.students.map((s) => [s.studentNumber, s]));
    expect(byNumber.get("17053")?.pin).toBe("739838");
    expect(byNumber.get("17101")).toMatchObject({
      name: "Pim Praktijk",
      pin: "246810",
    });
    expect(await signInStatus("17053", "739838")).toBe(200);
    expect(await signInStatus("17101", "246810")).toBe(200);

    // A different fixed PIN for an existing student replaces the old one.
    await loadDemoData(teacher.id, { pins: { "17053": "135792" } });
    expect(await signInStatus("17053", "135792")).toBe(200);
    expect(await signInStatus("17053", "739838")).toBe(401);
  });

  test("invalid fixed PINs are refused before anything is created", async () => {
    const teacher = await insertTeacher();
    await expect(
      loadDemoData(teacher.id, { pins: { "17053": "12ab56" } }),
    ).rejects.toThrow("Ongeldige demo-pincode");
    const classes = await callerFor(teacher).class.list();
    expect(classes.map((c) => c.name)).not.toContain(DEMO_CLASS_NAME);
  });

  test("setup.loadDemoData still works for teachers", async () => {
    const teacher = await insertTeacher();
    const out = await callerFor(teacher).setup.loadDemoData();
    expect(out.students).toHaveLength(DEMO_STUDENTS.length);
  });
});

describe("seed admin", () => {
  test("development accepts the demo password", async () => {
    const id = await seedAdmin({
      email: "seed@test.pensuma.local",
      production: false,
      log: () => {},
    });
    expect(id).toBeTruthy();
    // Idempotent.
    expect(
      await seedAdmin({
        email: "seed@test.pensuma.local",
        production: false,
        log: () => {},
      }),
    ).toBe(id);
  });

  test("production refuses weak or missing passwords", async () => {
    const ctx = { email: "beheer@school.nl", name: "Beheer", production: true };
    await expect(checkSeedPassword("", ctx)).rejects.toThrow();
    await expect(checkSeedPassword("welkom-docent", ctx)).rejects.toThrow();
    await expect(checkSeedPassword("kort-1", ctx)).rejects.toThrow();
    await expect(
      checkSeedPassword("vier woorden achter elkaar 82", ctx),
    ).resolves.toBeUndefined();
  });
});

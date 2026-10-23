import { describe, expect, test } from "bun:test";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/server/db/schema";
import {
  DATA_CATEGORIES,
  FACILITY_LABELS,
  formatSubjects,
  registerAsMarkdown,
} from "./register";
import { privacySettingsSchema } from "./settings";

const tableNames = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table as PgTable));

describe("DATA_CATEGORIES", () => {
  test("the schema has tables", () => {
    expect(tableNames.length).toBeGreaterThan(20);
  });

  test("every table is classified in exactly one category", () => {
    for (const name of tableNames) {
      const owners = DATA_CATEGORIES.filter((c) => c.tables.includes(name));
      expect({ table: name, owners: owners.map((c) => c.id) }).toEqual({
        table: name,
        owners: [expect.any(String)],
      });
    }
  });

  test("no category lists a table that does not exist", () => {
    for (const c of DATA_CATEGORIES) {
      for (const t of [...c.tables, ...(c.sharedTables ?? [])]) {
        expect(tableNames).toContain(t);
      }
    }
  });

  test("ids are unique and every field is filled in", () => {
    const ids = DATA_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const settings = privacySettingsSchema.parse({});
    for (const c of DATA_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.examples.length).toBeGreaterThan(3);
      expect(c.purpose.length).toBeGreaterThan(3);
      expect(c.legalBasis).toMatch(/AVG art\. 6/);
      expect(c.retention(settings).length).toBeGreaterThan(3);
      expect(c.subjects.length).toBeGreaterThan(0);
    }
  });

  test("required categories exist", () => {
    const labels = DATA_CATEGORIES.map((c) => c.label);
    for (const label of [
      "Accountgegevens leerling",
      "Accountgegevens docent",
      "Antwoorden en resultaten",
      "Logboek tijdens toetsen",
      "Inlog- en beveiligingsgegevens",
      "Logboek docenthandelingen",
      "Faciliteiten bij toetsen",
      "Weergave-instellingen",
      "Lesmateriaal en planning",
    ]) {
      expect(labels).toContain(label);
    }
  });

  test("retention text follows the settings", () => {
    const results = DATA_CATEGORIES.find((c) => c.id === "results");
    const log = DATA_CATEGORIES.find((c) => c.id === "exam-log");
    const off = privacySettingsSchema.parse({});
    const on = privacySettingsSchema.parse({
      retention: {
        autoDeleteAttempts: true,
        confirmedAt: "2026-09-01T00:00:00.000Z",
        attemptsMonths: 18,
        attemptEventsDays: 30,
      },
    });
    expect(results?.retention(off)).toContain("staat nog uit");
    expect(results?.retention(on)).toContain("18 maanden");
    expect(log?.retention(on)).toContain("30 dagen");
  });
});

describe("texts match what Pensuma does", () => {
  const byId = (id: string) => {
    const c = DATA_CATEGORIES.find((x) => x.id === id);
    if (!c) throw new Error(id);
    return c;
  };

  test("confirmed with auto-delete off: 'staat uit', not 'until confirmation'", () => {
    const confirmedOff = privacySettingsSchema.parse({
      retention: {
        autoDeleteAttempts: false,
        confirmedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    const results = byId("results").retention(confirmedOff);
    expect(results).toContain("staat uit");
    expect(results).not.toContain("nog uit");
    expect(results).not.toContain("vaststelt");
    const account = byId("student-account").retention(confirmedOff);
    expect(account).toContain("staat uit");
    expect(account).not.toContain("nog uit");
    // Unconfirmed keeps the "until confirmation" wording.
    const unconfirmed = privacySettingsSchema.parse({});
    expect(byId("student-account").retention(unconfirmed)).toContain(
      "staat nog uit tot de school de bewaartermijnen vaststelt",
    );
  });

  test("exam log: runs and tests always, window/fullscreen/paste only when enabled, no copying", () => {
    const { examples } = byId("exam-log");
    const [always, optIn] = examples.split("Alleen als de docent dit aanzet");
    expect(always).toContain("Altijd");
    expect(always).toContain("code uitvoert of test");
    expect(optIn).toContain("toetsvenster of tabblad verlaat");
    expect(optIn).toContain("volledige scherm");
    expect(optIn).toContain("plakken");
    expect(optIn).not.toContain("code uitvoert");
    expect(examples).toContain("Kopiëren wordt niet bijgehouden");
  });

  test("facility label says what it switches off", () => {
    expect(FACILITY_LABELS.ignoreFocusEvents).toBe(
      "vensterwissels niet registreren",
    );
    const { examples } = byId("accommodations");
    expect(examples).toContain("vensterwissels niet registreren");
    expect(examples).not.toContain("geen logboek");
  });

  test("expired holds are removed automatically after a grace period", () => {
    const text = byId("privacy-admin").retention(
      privacySettingsSchema.parse({}),
    );
    expect(text).toContain("30 dagen na de einddatum");
  });

  test("audit log: views are named precisely; scores yes, answer content never", () => {
    const { examples } = byId("audit-log");
    expect(examples).toContain("een leerling, een poging of pincodes");
    expect(examples).toContain("oude en nieuwe score");
    expect(examples).toContain("Nooit de inhoud van antwoorden");
  });
});

describe("registerAsMarkdown", () => {
  test("Dutch Markdown with every category and placeholders", () => {
    const md = registerAsMarkdown(
      privacySettingsSchema.parse({}),
      new Date("2026-10-22T10:00:00Z"),
    );
    expect(md).toStartWith("# Verwerkingsregister Pensuma");
    expect(md).toContain("2026-10-22");
    expect(md).toContain("[[nog invullen]]");
    for (const c of DATA_CATEGORIES) expect(md).toContain(c.label);
  });

  test("uses configured contacts and escapes table pipes", () => {
    const md = registerAsMarkdown(
      privacySettingsSchema.parse({
        school: { name: "Het Lyceum", authority: "Stichting A | B" },
        dpo: { name: "F. G.", email: "fg@school.nl" },
      }),
    );
    expect(md).toContain("Stichting A | B (Het Lyceum)");
    expect(md).toContain("F. G. (fg@school.nl)");
    expect(md).not.toContain("| Stichting A | B |");
  });

  test("formatSubjects", () => {
    expect(formatSubjects(["leerlingen", "docenten"])).toBe(
      "Leerlingen, Docenten",
    );
  });
});

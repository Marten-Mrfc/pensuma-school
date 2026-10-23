/**
 * V08: teacher sentences with a count agree with it ("1 poging", "De afname
 * … wordt", "1 minuut extra"), never "1 pogingen" or "Alle 1 … worden".
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  deleteAssignmentDescription,
  minutesLabel,
} from "./assignments/format";
import { deleteClassDescription, resetPinsDescription } from "./classes/copy";
import { archiveInsteadDescription, testAttemptsNote } from "./tests/copy";

const read = (file: string) =>
  readFileSync(path.join(import.meta.dir, file), "utf8");

describe("counts in teacher copy (V08)", () => {
  test("test builder: attempts already made", () => {
    expect(testAttemptsNote(1)).toBe("Deze toets is al gemaakt (1 poging).");
    expect(testAttemptsNote(3)).toBe("Deze toets is al gemaakt (3 pogingen).");
    expect(archiveInsteadDescription(1)).toStartWith(
      "Deze toets is al 1 keer gemaakt door een leerling en kan daarom niet",
    );
    expect(archiveInsteadDescription(4)).toStartWith(
      "Deze toets is al 4 keer gemaakt door leerlingen en kan daarom niet",
    );
  });

  test("deleting an afname: the work of the students who started", () => {
    expect(deleteAssignmentDescription(0)).toBe(
      "De afname wordt verwijderd. De toets zelf blijft bestaan.",
    );
    expect(deleteAssignmentDescription(1)).toBe(
      "Het werk van 1 leerling (pogingen, antwoorden en scores) wordt ook verwijderd. Dit kun je niet ongedaan maken.",
    );
    expect(deleteAssignmentDescription(12)).toStartWith(
      "Het werk van 12 leerlingen (pogingen, antwoorden en scores) wordt ook verwijderd.",
    );
  });

  test("deleting a class", () => {
    expect(deleteClassDescription(0)).toBe(
      "De klas wordt verwijderd. De leerlingaccounts blijven bestaan. Dit kun je niet ongedaan maken.",
    );
    expect(deleteClassDescription(1)).toStartWith(
      "De afname van deze klas wordt verwijderd, inclusief alle pogingen",
    );
    expect(deleteClassDescription(3)).toStartWith(
      "Alle 3 afnames van deze klas worden verwijderd, inclusief alle pogingen",
    );
    for (const count of [1, 3])
      expect(deleteClassDescription(count)).toEndWith("Overweeg archiveren.");
  });

  test("resetting every pincode of a class", () => {
    expect(resetPinsDescription(1)).toBe(
      "De leerling in deze klas krijgt een nieuwe pincode en wordt uitgelogd. De oude inlogkaart werkt daarna niet meer.",
    );
    expect(resetPinsDescription(25)).toBe(
      "Alle 25 leerlingen krijgen een nieuwe pincode en worden uitgelogd. Hun oude inlogkaarten werken daarna niet meer.",
    );
  });

  test("extra time", () => {
    expect(minutesLabel(1)).toBe("1 minuut");
    expect(minutesLabel(10)).toBe("10 minuten");
  });

  test("the screens use these helpers instead of fixed plurals", () => {
    const builder = read("tests/test-builder.tsx");
    expect(builder).toContain("testAttemptsNote(test.attemptCount)");
    expect(builder).toContain("archiveInsteadDescription(test.attemptCount)");
    expect(builder).not.toContain("{test.attemptCount} pogingen");

    const monitor = read("assignments/assignment-monitor.tsx");
    expect(monitor).toContain("deleteAssignmentDescription(a.counts.started)");
    expect(monitor).not.toMatch(/Alle \$\{a\.counts\.started\} pogingen/);

    const klas = read("classes/class-detail-page.tsx");
    expect(klas).toContain("deleteClassDescription(klas.assignmentCount)");
    expect(klas).toContain("resetPinsDescription(members.length)");

    const table = read("assignments/monitor-table.tsx");
    expect(table).not.toMatch(/\$\{(vars|res)\.\w+\} minuten extra/);
    expect(table).not.toContain("accommodationMinutes} minuten");

    // Afname list ("1 leerling · 1 vraag") and the test picker of the form.
    const list = read("assignments/assignment-list.tsx");
    expect(list).toContain(
      'pluralize(row.counts.students, "leerling", "leerlingen")',
    );
    expect(list).not.toContain("{row.counts.students} leerlingen");
    const form = read("assignments/assignment-form.tsx");
    expect(form).toContain('pluralize(t.questionCount, "vraag", "vragen")');
    expect(form).not.toContain("{t.questionCount} vragen");
  });
});

import { describe, expect, test } from "bun:test";
import { AUDIT_ACTIONS } from "./audit-actions";
import {
  ACTOR_ROLE_LABELS,
  actionsByCategory,
  auditActionCategory,
  auditActionLabel,
  formatAuditDetails,
} from "./audit-format";

describe("formatAuditDetails", () => {
  test("labels, hides ids and zero counts", () => {
    expect(
      formatAuditDetails({
        attemptId: "1f0c…",
        attempts: 3,
        answers: 12,
        events: 0,
        via: "retention",
        retentionConfirmed: true,
        changedKeys: ["retention.attemptsMonths", "school.name"],
      }),
    ).toBe(
      "pogingen: 3 · antwoorden: 12 · via: automatische opschoning · vastgesteld: ja · gewijzigd: termijn pogingen, naam school",
    );
  });

  test("Dutch labels for enum values and generated keys", () => {
    expect(
      formatAuditDetails({
        holdId: "abc",
        kind: "exam_dossier",
        trigger: "schedule",
        classIdsCount: 2,
        skippedByHold: 4,
      }),
    ).toBe(
      "soort: examendossier · aanleiding: automatisch · klassen: 2 · overgeslagen (bewaarblokkade): 4",
    );
    expect(formatAuditDetails({ from: 2, to: 3.5 })).toBe("van: 2 · naar: 3,5");
    expect(formatAuditDetails({ from: "2026-10-01", to: "2026-10-22" })).toBe(
      "van: 2026-10-01 · tot en met: 2026-10-22",
    );
  });

  test("facility changes: which kind, never the values", () => {
    expect(
      formatAuditDetails({
        extraTimeChanged: true,
        focusLogChanged: true,
        facilityActive: true,
      }),
    ).toBe(
      "verlengde tijd gewijzigd: ja · vensterwissels registreren gewijzigd: ja · faciliteit actief: ja",
    );
    // Rows stored before the fix still render, with the corrected label.
    expect(formatAuditDetails({ ignoreFocusEvents: true })).toBe(
      "vensterwissels niet registreren: ja",
    );
    expect(formatAuditDetails({ restrictionOverridden: true })).toBe(
      "ondanks beperking (AVG art. 18): ja",
    );
  });

  test("similarity views and expired holds", () => {
    expect(
      formatAuditDetails({ via: "similarity", answerId: "x", scope: "test" }),
    ).toBe("via: code vergelijken · bereik: alle afnames van de toets");
    expect(formatAuditDetails({ expiredHolds: 2 })).toBe(
      "verlopen bewaarblokkades: 2",
    );
  });

  test("empty and unknown keys", () => {
    expect(formatAuditDetails(null)).toBe("");
    expect(formatAuditDetails({})).toBe("");
    expect(formatAuditDetails({ path: "student.update", extra: 1500 })).toBe(
      "functie: student.update · extra: 1.500",
    );
  });

  test("respects maxParts", () => {
    expect(formatAuditDetails({ a: 1, b: 2, c: 3 }, 2)).toBe("a: 1 · b: 2");
  });
});

describe("labels", () => {
  test("action label and category", () => {
    expect(auditActionLabel("student.deleted")).toBe("Leerling verwijderd");
    expect(auditActionLabel("onbekend.ding")).toBe("onbekend.ding");
    expect(auditActionCategory("security.access_denied")).toBe("security");
    expect(auditActionCategory("onbekend")).toBeNull();
    expect(ACTOR_ROLE_LABELS.system).toBe("Systeem");
  });

  test("actionsByCategory covers every action once", () => {
    const grouped = actionsByCategory();
    const all: string[] = Object.values(grouped).flat();
    expect([...all].sort()).toEqual(Object.keys(AUDIT_ACTIONS).sort());
  });
});

describe("specific actions instead of the generic 'Wijziging'", () => {
  test("extra time, reopening and deleting a question have their own label", () => {
    expect(auditActionLabel("attempt.time_extended")).toBe(
      "Extra tijd gegeven",
    );
    expect(auditActionLabel("attempt.reopened")).toBe("Poging heropend");
    expect(auditActionLabel("question.deleted")).toBe("Vraag verwijderd");
    for (const action of [
      "attempt.time_extended",
      "attempt.reopened",
      "question.deleted",
    ]) {
      expect(auditActionCategory(action)).toBe("change");
    }
  });

  test("the network is never blocked: the label says what really happens", () => {
    const label = auditActionLabel("auth.network_locked");
    expect(label).toBe(
      "Veel mislukte inlogpogingen vanaf één netwerk (strengere blokkade per leerling)",
    );
    expect(label).not.toContain("geblokkeerd");
  });

  test("their details read as Dutch, with a Dutch date and time", () => {
    expect(
      formatAuditDetails({
        attemptId: "x",
        minutes: 5,
        totalExtraMinutes: 15,
        deadlineAt: "2026-10-22T12:30:00.000Z",
      }),
    ).toBe(
      "minuten: 5 · extra tijd in totaal (minuten): 15 · eindtijd: 22-10-2026 14:30",
    );
    expect(
      formatAuditDetails({
        questionId: "q",
        answersCount: 3,
        attemptsAffected: 2,
        assignmentsAffected: 1,
        studentsCount: 2,
      }),
    ).toBe("antwoorden: 3 · pogingen: 2 · afnames: 1 · leerlingen: 2");
  });

  test("student import and AVG art. 18 details", () => {
    expect(formatAuditDetails({ fields: ["name"], via: "import" })).toBe(
      "velden: name · via: leerlingen importeren",
    );
    expect(
      formatAuditDetails({
        rowsCount: 4,
        createdCount: 2,
        existingCount: 1,
        renamedCount: 1,
        addedToClassCount: 3,
        errorsCount: 1,
      }),
    ).toBe(
      "regels: 4 · aangemaakt: 2 · bestonden al: 1 · naam gewijzigd: 1 · aan de klas toegevoegd: 3 · niet gelukt: 1",
    );
    expect(formatAuditDetails({ rows: 25, restrictedRows: 1 })).toBe(
      "regels: 25 · zonder resultaten (beperking AVG art. 18): 1",
    );
  });
});

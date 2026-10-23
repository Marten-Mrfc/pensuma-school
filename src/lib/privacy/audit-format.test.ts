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

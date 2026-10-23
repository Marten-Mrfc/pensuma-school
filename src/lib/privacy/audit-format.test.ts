import { describe, expect, test } from "bun:test";
import { AUDIT_ACTIONS } from "./audit-actions";
import {
  ACTOR_ROLE_LABELS,
  actionsByCategory,
  auditActionCategory,
  auditActionLabel,
  auditRowLabel,
  formatAuditDetails,
  PROCEDURE_LABELS,
  procedureLabel,
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
    expect(formatAuditDetails({ path: "onbekend.pad", extra: 1500 })).toBe(
      "functie: onbekend.pad · extra: 1.500",
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
      "velden: naam · via: leerlingen importeren",
    );
    expect(formatAuditDetails({ fields: ["name", "studentNumber"] })).toBe(
      "velden: naam, leerlingnummer",
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

describe("generic teacher changes ('trpc.mutation') read as Dutch", () => {
  // Rows exactly as /docent/privacy/logboek showed them before.
  const rows: [Record<string, unknown>, string, string][] = [
    [
      {
        path: "assignment.extendTime",
        attemptId: "a",
        minutes: 5,
        deadlineAt: "2026-10-23T05:04:47.614Z",
        totalExtraMinutes: 5,
      },
      "Extra tijd gegeven",
      "minuten: 5 · eindtijd: 23-10-2026 07:04 · extra tijd in totaal (minuten): 5",
    ],
    [
      {
        path: "assignment.reopenAttempt",
        attemptId: "a",
        minutes: 15,
        deadlineAt: "2026-10-23T05:15:56.076Z",
      },
      "Poging heropend",
      "minuten: 15 · eindtijd: 23-10-2026 07:15",
    ],
    [
      {
        path: "class.delete",
        id: "c",
        studentsCount: 1,
        deletedAttempts: 1,
        assignmentsCount: 1,
      },
      "Klas verwijderd",
      "leerlingen: 1 · pogingen verwijderd: 1 · afnames: 1",
    ],
    [
      {
        path: "question.delete",
        id: "q",
        answersCount: 1,
        studentsCount: 1,
        attemptsAffected: 1,
        assignmentsAffected: 1,
      },
      "Vraag verwijderd",
      "antwoorden: 1 · leerlingen: 1 · pogingen: 1 · afnames: 1",
    ],
    [{ path: "assignment.close", id: "x" }, "Afname gesloten", ""],
    [{ path: "test.setStatus", id: "t" }, "Status van een toets gewijzigd", ""],
    [{ path: "code.grade" }, "Code van een vraag uitgevoerd", ""],
    [
      { path: "review.regradeAssignment", assignmentId: "a" },
      "Afname opnieuw nagekeken",
      "",
    ],
    [{ path: "student.create", classId: "c" }, "Leerling aangemaakt", ""],
    [
      { path: "question.reorder", testId: "t", orderedIdsCount: 12 },
      "Volgorde van de vragen gewijzigd",
      "vragen: 12",
    ],
  ];

  test("the row label says what happened, the details hold no code names", () => {
    for (const [details, label, text] of rows) {
      expect(auditRowLabel("trpc.mutation", details)).toBe(label);
      const shown = formatAuditDetails(details, 8, "trpc.mutation");
      expect(shown).toBe(text);
      expect(shown).not.toMatch(/[a-z][A-Z]|\.[a-z]/);
      expect(shown).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    }
  });

  test("an unknown procedure keeps 'Wijziging' and shows its path", () => {
    expect(auditRowLabel("trpc.mutation", { path: "nieuw.ding" })).toBe(
      "Wijziging",
    );
    expect(formatAuditDetails({ path: "nieuw.ding" }, 8, "trpc.mutation")).toBe(
      "functie: nieuw.ding",
    );
    expect(auditRowLabel("trpc.mutation", null)).toBe("Wijziging");
  });

  test("other rows keep their own label; their path names the function", () => {
    expect(
      auditRowLabel("security.rate_limited", { path: "portal.saveAnswer" }),
    ).toBe("Te veel verzoeken (afgeremd)");
    expect(
      formatAuditDetails(
        { path: "privacy.eraseStudent" },
        8,
        "security.rate_limited",
      ),
    ).toBe("functie: leerling wissen");
    expect(
      formatAuditDetails(
        { path: "assignment.delete", attemptsCount: 1 },
        8,
        "attempt.reset",
      ),
    ).toBe("functie: afname verwijderen · pogingen: 1");
    expect(procedureLabel("portal.heartbeat")).toBe(
      "verbinding tijdens een toets controleren",
    );
  });

  test("a reset attempt: status and attempt number in Dutch", () => {
    expect(
      formatAuditDetails(
        { status: "submitted", attemptId: "a", attemptNumber: 4 },
        8,
        "attempt.reset",
      ),
    ).toBe("status: ingeleverd · pogingnummer: 4");
  });

  test("labels are Dutch phrases, not identifiers", () => {
    for (const [path, { fn, done }] of Object.entries(PROCEDURE_LABELS)) {
      expect(path).toMatch(/^[a-z]+\.[A-Za-z]+$/);
      expect(fn).not.toMatch(/[a-z][A-Z]|_|\.[a-z]/);
      expect(fn[0]).toBe(fn[0]?.toLowerCase());
      if (done) {
        expect(done).not.toMatch(/[a-z][A-Z]|_|\.[a-z]/);
        expect(done[0]).toBe(done[0]?.toUpperCase());
      }
    }
  });
});

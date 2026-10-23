import { describe, expect, test } from "bun:test";
import {
  buildStudentExport,
  type ExportAttemptRow,
  exportFileName,
  myExportFileName,
  type StudentExportRows,
} from "./export-format";
import { privacySettingsSchema } from "./settings";

const NOW = new Date("2026-10-22T12:00:00Z");
const SECRET_HASH = "$argon2id$v=19$secret-hash-value";
const SECRET_PIN = "739838";
const SOLUTION = "def geheime_oplossing(): return 42";
const HIDDEN_STDIN = "GEHEIME_INVOER_123";
const HIDDEN_EXPECTED = "GEHEIME_UITVOER_456";
const TOKEN = "session-token-abcdef";

const codeResult = {
  kind: "code",
  status: "ok",
  error: null,
  tests: [
    {
      testId: "t1",
      name: "Zichtbare test",
      kind: "io",
      hidden: false,
      weight: 1,
      passed: true,
      stdin: "5",
      expected: "25",
      actual: "25",
      timedOut: false,
      durationMs: 3,
    },
    {
      testId: "t2",
      name: "Randgeval met geheime invoer",
      kind: "io",
      hidden: true,
      weight: 1,
      passed: false,
      stdin: HIDDEN_STDIN,
      expected: HIDDEN_EXPECTED,
      actual: "iets anders",
      feedback: `Verwacht ${HIDDEN_EXPECTED}`,
      timedOut: false,
      durationMs: 4,
    },
  ],
  checks: [],
  passedWeight: 1,
  totalWeight: 2,
  fraction: 0.5,
  gradedAt: "2026-10-01T10:00:00.000Z",
};

function attempt(patch: Partial<ExportAttemptRow> = {}): ExportAttemptRow {
  return {
    attemptNumber: 1,
    status: "submitted",
    startedAt: new Date("2026-10-01T09:00:00Z"),
    submittedAt: new Date("2026-10-01T09:40:00Z"),
    score: 3,
    maxScore: 4,
    assignment: {
      title: "Toets H3",
      mode: "exam",
      status: "closed",
      opensAt: null,
      closesAt: new Date("2026-10-01T10:00:00Z"),
      settings: { showResults: "after_close" },
      resultsReleased: false,
    },
    testTitle: "Python basis",
    answers: [
      {
        questionTitle: "Kwadraat",
        questionType: "code",
        response: { code: "print(int(input()) ** 2)" },
        autoScore: 1,
        manualScore: null,
        maxScore: 2,
        feedback: "Goed gedaan",
        result: codeResult,
        // Extra junk a careless loader might pass along.
        ...({ solution: SOLUTION, data: { solution: SOLUTION } } as object),
      },
      {
        questionTitle: "Lussen",
        questionType: "multiple_choice",
        response: { selected: ["b"] },
        autoScore: 2,
        manualScore: null,
        maxScore: 2,
        feedback: null,
        result: {
          kind: "multiple_choice",
          correct: true,
          fraction: 1,
          gradedAt: "2026-10-01T10:00:00.000Z",
        },
        optionTexts: { a: "for", b: "while" },
      },
    ],
    events: [
      {
        type: "paste",
        createdAt: new Date("2026-10-01T09:10:00Z"),
        details: { length: 12, blocked: true, text: "geplakte tekst" },
      },
      {
        type: "started",
        createdAt: new Date("2026-10-01T09:00:00Z"),
        details: { note: "vrije tekst", auto: false },
      },
    ],
    ...patch,
  };
}

function rows(attempts: ExportAttemptRow[] = [attempt()]): StudentExportRows {
  return {
    settings: privacySettingsSchema.parse({
      school: { name: "Het Lyceum", privacyEmail: "privacy@lyceum.nl" },
      dpo: { name: "F. G.", email: "fg@lyceum.nl" },
    }),
    student: {
      name: "Sem de Vries",
      studentNumber: "17053",
      createdAt: new Date("2026-08-20T08:00:00Z"),
      banned: false,
      lastSignInAt: new Date("2026-10-20T08:00:00Z"),
      ...({
        password: SECRET_HASH,
        pin: SECRET_PIN,
        token: TOKEN,
      } as object),
    },
    classes: [
      {
        name: "4H2",
        schoolYear: "2026-2027",
        archived: false,
        joinedAt: new Date("2026-08-20T08:00:00Z"),
      },
    ],
    accommodation: {
      extraTimePercent: 25,
      allowPaste: false,
      ignoreFocusEvents: true,
    },
    preferences: { theme: "dark", fontScale: 1.1, nested: { pin: "x" } },
    attempts,
    accessLog: [
      {
        createdAt: new Date("2026-10-05T10:00:00Z"),
        action: "student.viewed",
        actorRole: "admin",
        ...({ actorName: "Docent Jansen" } as object),
      },
    ],
  };
}

/** Every key anywhere in a JSON value. */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe("buildStudentExport", () => {
  test("deep scan: no secrets, solutions or hidden test data", () => {
    for (const audience of ["admin", "student"] as const) {
      const out = buildStudentExport(rows(), { audience, now: NOW });
      const json = JSON.stringify(out);
      const keys = allKeys(out).map((k) => k.toLowerCase());
      for (const forbidden of ["password", "pin", "solution", "token"]) {
        expect(keys.filter((k) => k.includes(forbidden))).toEqual([]);
      }
      for (const secret of [
        SECRET_HASH,
        SECRET_PIN,
        SOLUTION,
        HIDDEN_STDIN,
        HIDDEN_EXPECTED,
        TOKEN,
        "Docent Jansen",
        "geplakte tekst",
        "vrije tekst",
      ]) {
        expect(json).not.toContain(secret);
      }
    }
  });

  test("admin export: full shape", () => {
    const out = buildStudentExport(rows(), { audience: "admin", now: NOW });
    expect(out.schemaVersion).toBe(2);
    expect(out.generatedAt).toBe(NOW.toISOString());
    expect(out.controller).toEqual({
      school: "Het Lyceum",
      authority: "",
      privacyEmail: "privacy@lyceum.nl",
      dpo: { name: "F. G.", email: "fg@lyceum.nl" },
    });
    expect(out.student).toEqual({
      name: "Sem de Vries",
      studentNumber: "17053",
      createdAt: "2026-08-20T08:00:00.000Z",
      active: true,
      lastSignInAt: "2026-10-20T08:00:00.000Z",
    });
    expect(out.classes[0]?.memberSince).toBe("2026-08-20T08:00:00.000Z");
    expect(out.accommodation?.extraTimePercent).toBe(25);
    expect(out.preferences).toEqual({ theme: "dark", fontScale: 1.1 });
    expect(out.accessLog).toEqual([
      {
        at: "2026-10-05T10:00:00.000Z",
        action: "Leerlinggegevens bekeken",
        actorRole: "admin",
      },
    ]);
    expect(out.retention.attemptEventsDays).toBe(90);
    expect(out.retention.backupDays).toBe(30);

    const a = out.attempts[0];
    expect(a?.assignmentTitle).toBe("Toets H3");
    expect(a?.grade).toBe(7.8); // 1 + 9 × 3/4 = 7.75 → 7.8
    expect(a?.answers[0]?.response).toEqual({
      code: "print(int(input()) ** 2)",
    });
    expect(a?.answers[1]?.response).toEqual({
      selected: ["b"],
      selectedOptions: ["while"],
    });
    const result = a?.answers[0]?.result as {
      tests: { name: string; stdin?: string; hidden: boolean }[];
    };
    expect(result.tests[0]?.stdin).toBe("5");
    expect(result.tests[1]).toMatchObject({
      name: "Verborgen test 2",
      hidden: true,
    });
    expect(result.tests[1]?.stdin).toBeUndefined();
    // Events sorted by time; details through the allowlists.
    expect(a?.events.map((e) => e.type)).toEqual(["started", "paste"]);
    expect(a?.events[0]?.details).toEqual({ auto: false });
    expect(a?.events[1]?.details).toEqual({ length: 12, blocked: true });
  });

  test("grade follows the assignment's grading scale", () => {
    const out = buildStudentExport(
      rows([
        attempt({
          score: 11,
          maxScore: 20,
          assignment: {
            ...attempt().assignment,
            settings: { grading: { method: "cesuur", passPercentage: 55 } },
          },
        }),
      ]),
      { audience: "admin", now: NOW },
    );
    expect(out.attempts[0]?.grade).toBe(5.5);
  });

  test("student export: only submitted attempts with visible results", () => {
    const open = attempt({
      testTitle: "Nog bezig",
      status: "in_progress",
      submittedAt: null,
      score: null,
      maxScore: null,
    });
    const hidden = attempt({
      testTitle: "Nog niet vrijgegeven",
      assignment: {
        ...attempt().assignment,
        title: null,
        status: "open",
        closesAt: null,
        settings: { showResults: "manual" },
      },
    });
    const visible = attempt({
      testTitle: "Vrijgegeven",
      assignment: { ...attempt().assignment, title: null },
    });
    const all = [open, hidden, visible];

    const admin = buildStudentExport(rows(all), {
      audience: "admin",
      now: NOW,
    });
    expect(admin.attempts).toHaveLength(3);
    expect(admin.attempts.find((a) => a.status === "in_progress")?.grade).toBe(
      null,
    );

    const student = buildStudentExport(rows(all), {
      audience: "student",
      now: NOW,
    });
    expect(student.audience).toBe("student");
    expect(student.attempts.map((a) => a.assignmentTitle)).toEqual([
      "Vrijgegeven",
    ]);
  });

  test("student export: after_close results wait while classmates are still working", () => {
    // Closed, but a classmate with verlengde tijd is still busy.
    const busy = attempt({
      assignment: { ...attempt().assignment, othersWorking: true },
    });
    const forStudent = (a: ExportAttemptRow) =>
      buildStudentExport(rows([a]), { audience: "student", now: NOW });
    expect(forStudent(busy).attempts).toHaveLength(0);
    // The teacher's export (inzageverzoek) always has everything.
    expect(
      buildStudentExport(rows([busy]), { audience: "admin", now: NOW })
        .attempts,
    ).toHaveLength(1);
    // Everyone done (or the flag left out): visible.
    expect(
      forStudent(
        attempt({
          assignment: { ...attempt().assignment, othersWorking: false },
        }),
      ).attempts,
    ).toHaveLength(1);
    expect(forStudent(attempt()).attempts).toHaveLength(1);
    // Released by the teacher, or shown immediately: nothing to wait for.
    expect(
      forStudent(
        attempt({
          assignment: {
            ...attempt().assignment,
            othersWorking: true,
            resultsReleased: true,
          },
        }),
      ).attempts,
    ).toHaveLength(1);
    expect(
      forStudent(
        attempt({
          assignment: {
            ...attempt().assignment,
            othersWorking: true,
            settings: { showResults: "immediately" },
          },
        }),
      ).attempts,
    ).toHaveLength(1);
  });

  test("banned student is not active; invalid results are dropped", () => {
    const r = rows([
      attempt({
        answers: [
          {
            questionTitle: "Kapot",
            questionType: "code",
            response: "geen object",
            autoScore: null,
            manualScore: null,
            maxScore: 1,
            feedback: null,
            result: { kind: "code", rommel: true },
          },
        ],
      }),
    ]);
    r.student.banned = true;
    const out = buildStudentExport(r, { audience: "admin", now: NOW });
    expect(out.student.active).toBe(false);
    expect(out.attempts[0]?.answers[0]?.response).toBeNull();
    expect(out.attempts[0]?.answers[0]?.result).toBeNull();
  });
});

describe("export completeness (schemaVersion 2)", () => {
  const HINT_TEXT = "Gebruik ** voor machtsverheffen";

  test("revealed hints explain a lowered score (number, time, penalty; no text)", () => {
    const base = attempt();
    const [code, mc] = base.answers;
    const out = buildStudentExport(
      rows([
        attempt({
          answers: [
            {
              ...code,
              hints: [
                { id: "h1", penalty: 0.25 },
                { id: "h2", penalty: 0.5 },
              ],
              hintsUsed: [
                { id: "h2", at: "2026-10-01T09:15:00.000Z" },
                { id: "h2", at: "2026-10-01T09:16:00.000Z" },
                { id: "weg", at: "2026-10-01T09:17:00.000Z" },
              ],
              // A careless loader passing the hint text along.
              ...({ hintTexts: [HINT_TEXT] } as object),
            },
            mc,
          ],
        }),
      ]),
      { audience: "student", now: NOW },
    );
    const [first, second] = out.attempts[0]?.answers ?? [];
    expect(first?.hintsUsed).toEqual([
      { hintNumber: 2, at: "2026-10-01T09:15:00.000Z", penalty: 0.5 },
      { hintNumber: null, at: "2026-10-01T09:17:00.000Z", penalty: 0 },
    ]);
    expect(first?.hintPenalty).toBe(0.5);
    expect(second?.hintsUsed).toEqual([]);
    expect(second?.hintPenalty).toBe(0);
    expect(JSON.stringify(out)).not.toContain(HINT_TEXT);
  });

  test("retention holds: the student's own with reason, afname holds without", () => {
    const r = rows();
    r.holds = [
      {
        kind: "dispute",
        reason: "Bezwaar ouders tegen cijfer H3",
        until: new Date("2026-12-31T22:59:59Z"),
        createdAt: new Date("2026-10-10T10:00:00Z"),
        ...({
          createdById: "teacher-1",
          createdByName: "Docent Jansen",
        } as object),
      },
    ];
    r.assignmentHolds = [
      {
        kind: "exam_dossier",
        until: null,
        createdAt: new Date("2026-10-02T10:00:00Z"),
        assignmentTitle: null,
        testTitle: "PTA H3",
        ...({ reason: "Bezwaar van een andere leerling" } as object),
      },
    ];
    for (const audience of ["admin", "student"] as const) {
      const out = buildStudentExport(r, { audience, now: NOW });
      expect(out.holds).toEqual([
        {
          appliesTo: "afname",
          kind: "exam_dossier",
          reason: null,
          afname: "PTA H3",
          until: null,
          createdAt: "2026-10-02T10:00:00.000Z",
        },
        {
          appliesTo: "student",
          kind: "dispute",
          reason: "Bezwaar ouders tegen cijfer H3",
          afname: null,
          until: "2026-12-31T22:59:59.000Z",
          createdAt: "2026-10-10T10:00:00.000Z",
        },
      ]);
      const json = JSON.stringify(out);
      expect(json).not.toContain("Docent Jansen");
      expect(json).not.toContain("teacher-1");
      expect(json).not.toContain("andere leerling");
    }
  });

  test("afnames set for this student only (inhaal, herkansing)", () => {
    const r = rows();
    r.targetedAssignments = [
      {
        assignmentTitle: "Inhaaltoets H3",
        testTitle: "Python H3",
        mode: "exam",
        opensAt: new Date("2026-10-15T08:00:00Z"),
        closesAt: null,
      },
    ];
    const out = buildStudentExport(r, { audience: "student", now: NOW });
    expect(out.targetedAssignments).toEqual([
      {
        title: "Inhaaltoets H3",
        testTitle: "Python H3",
        mode: "exam",
        opensAt: "2026-10-15T08:00:00.000Z",
        closesAt: null,
      },
    ]);
    // Missing inputs give empty lists, never undefined.
    const bare = buildStudentExport(rows(), { audience: "admin", now: NOW });
    expect(bare.holds).toEqual([]);
    expect(bare.targetedAssignments).toEqual([]);
  });
});

describe("file names", () => {
  test("local date stamp", () => {
    const d = new Date(2026, 9, 22, 15, 0);
    expect(exportFileName("17053", d)).toBe(
      "pensuma-gegevens-17053-2026-10-22.json",
    );
    expect(exportFileName("../x", d)).toBe(
      "pensuma-gegevens-x-2026-10-22.json",
    );
    expect(myExportFileName(d)).toBe("pensuma-mijn-gegevens-2026-10-22.json");
  });
});

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
    expect(out.schemaVersion).toBe(1);
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

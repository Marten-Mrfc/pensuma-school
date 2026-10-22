import { describe, expect, test } from "bun:test";
import {
  type AssignmentFormState,
  buildCreatePayload,
  classesSummary,
  createdToast,
  defaultRetakeTitle,
  effectiveStudentIds,
  parseIdList,
  presetDefaults,
  presetMode,
  studentsSummary,
  validateAssignmentForm,
} from "./assignment-form-payload";
import { defaultSettingsForMode } from "./defaults";
import { toDateTimeLocal } from "./format";

const now = new Date("2026-10-22T10:00:00");
const inMinutes = (m: number) =>
  toDateTimeLocal(new Date(now.getTime() + m * 60_000));

const base = (
  over: Partial<AssignmentFormState> = {},
): AssignmentFormState => ({
  testId: "t1",
  classIds: ["c1"],
  studentIds: null,
  retakeOfId: null,
  title: "",
  preset: "exam",
  settings: defaultSettingsForMode("exam"),
  startMode: "now",
  opensAt: "",
  closesEnabled: false,
  closesAt: "",
  timeLimit: "",
  codeMode: "generate",
  customCode: "",
  accessCodePerClass: false,
  ...over,
});

describe("presets", () => {
  test("Zelfstudie: practice, always open, 100 attempts, no code", () => {
    const d = presetDefaults("selfstudy");
    expect(presetMode("selfstudy")).toBe("practice");
    expect(d.settings.maxAttempts).toBe(100);
    expect(d.settings.showResults).toBe("immediately");
    expect(d.settings.allowHints).toBe(true);
    expect(d.settings.showSolutions).toBe("after_attempts");
    expect(d.codeMode).toBe("none");
    expect(d.startMode).toBe("now");
    expect(d.closesEnabled).toBe(false);
  });

  test("exam and practice", () => {
    expect(presetDefaults("exam").codeMode).toBe("generate");
    expect(presetDefaults("exam").settings.allowHints).toBe(false);
    expect(presetDefaults("practice").codeMode).toBe("none");
    expect(presetMode("exam")).toBe("exam");
  });
});

describe("validateAssignmentForm", () => {
  test("a minimal valid form", () => {
    expect(validateAssignmentForm(base(), now)).toEqual({});
  });

  test("test and class are required", () => {
    const errors = validateAssignmentForm(
      base({ testId: "", classIds: [] }),
      now,
    );
    expect(errors.test).toBe("Kies een toets.");
    expect(errors.class).toBe("Kies minstens één klas.");
  });

  test("selected students need at least one student", () => {
    expect(validateAssignmentForm(base({ studentIds: [] }), now).students).toBe(
      "Kies minstens één leerling.",
    );
    // With two classes the selection is ignored.
    expect(
      validateAssignmentForm(
        base({ classIds: ["c1", "c2"], studentIds: [] }),
        now,
      ).students,
    ).toBeUndefined();
  });

  test("window and time limit", () => {
    const errors = validateAssignmentForm(
      base({
        startMode: "scheduled",
        opensAt: inMinutes(-5),
        closesEnabled: true,
        closesAt: inMinutes(-1),
        timeLimit: "2000",
      }),
      now,
    );
    expect(errors.opensAt).toContain("verleden");
    expect(errors.closesAt).toBe("De eindtijd ligt in het verleden.");
    expect(errors.timeLimit).toBe(
      "Vul een aantal minuten in tussen 1 en 1440.",
    );
    expect(
      validateAssignmentForm(
        base({
          startMode: "scheduled",
          opensAt: inMinutes(60),
          closesEnabled: true,
          closesAt: inMinutes(30),
        }),
        now,
      ).closesAt,
    ).toBe("Het einde moet na de start liggen.");
  });

  test("custom access code format", () => {
    expect(
      validateAssignmentForm(base({ codeMode: "custom", customCode: "a" }), now)
        .code,
    ).toBeDefined();
    expect(
      validateAssignmentForm(
        base({ codeMode: "custom", customCode: "python 3" }),
        now,
      ).code,
    ).toBeUndefined();
  });
});

describe("buildCreatePayload", () => {
  test("several classes with a code per class", () => {
    const payload = buildCreatePayload(
      base({
        classIds: ["c1", "c2", "c1"],
        accessCodePerClass: true,
        timeLimit: "50",
        title: "  Toets H3  ",
      }),
    );
    expect(payload).toMatchObject({
      testId: "t1",
      classIds: ["c1", "c2"],
      accessCodePerClass: true,
      title: "Toets H3",
      mode: "exam",
      openNow: true,
      opensAt: null,
      closesAt: null,
      timeLimitMinutes: 50,
      generateAccessCode: true,
    });
    expect(payload.accessCode).toBeUndefined();
    expect(payload.studentIds).toBeUndefined();
  });

  test("a code per class only applies to generated codes and 2+ classes", () => {
    expect(
      buildCreatePayload(base({ accessCodePerClass: true })).accessCodePerClass,
    ).toBe(false);
    expect(
      buildCreatePayload(
        base({
          classIds: ["c1", "c2"],
          accessCodePerClass: true,
          codeMode: "custom",
          customCode: "abc",
        }),
      ),
    ).toMatchObject({ accessCodePerClass: false, accessCode: "ABC" });
  });

  test("a herkansing for selected students", () => {
    const payload = buildCreatePayload(
      base({ studentIds: ["s1", "s2"], retakeOfId: "a0" }),
    );
    expect(payload.studentIds).toEqual(["s1", "s2"]);
    expect(payload.retakeOfId).toBe("a0");
  });

  test("selected students are dropped with several classes", () => {
    expect(
      buildCreatePayload(base({ classIds: ["c1", "c2"], studentIds: ["s1"] }))
        .studentIds,
    ).toBeUndefined();
    expect(
      effectiveStudentIds({ classIds: ["c1", "c2"], studentIds: ["s1"] }),
    ).toBeNull();
  });

  test("Zelfstudie preset payload", () => {
    const d = presetDefaults("selfstudy");
    const payload = buildCreatePayload(
      base({
        preset: "selfstudy",
        settings: d.settings,
        codeMode: d.codeMode,
        startMode: "now",
        closesEnabled: false,
      }),
    );
    expect(payload).toMatchObject({
      mode: "practice",
      openNow: true,
      closesAt: null,
      accessCode: null,
      generateAccessCode: false,
    });
    expect(payload.settings.maxAttempts).toBe(100);
  });

  test("scheduled window", () => {
    const payload = buildCreatePayload(
      base({
        startMode: "scheduled",
        opensAt: "2026-10-23T09:00",
        closesEnabled: true,
        closesAt: "2026-10-23T10:00",
      }),
    );
    expect(payload.openNow).toBe(false);
    expect(payload.opensAt?.getHours()).toBe(9);
    expect(payload.closesAt?.getHours()).toBe(10);
  });
});

describe("helpers", () => {
  test("parseIdList", () => {
    expect(parseIdList("a, b,,b ,c")).toEqual(["a", "b", "c"]);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList("")).toEqual([]);
  });

  test("titles and summaries", () => {
    expect(defaultRetakeTitle("herkansing", "Toets H3")).toBe(
      "Herkansing – Toets H3",
    );
    expect(defaultRetakeTitle("inhaaltoets", "Toets H3")).toBe(
      "Inhaaltoets – Toets H3",
    );
    expect(
      classesSummary([
        { name: "4H1", studentCount: 29 },
        { name: "4H2", studentCount: 28 },
      ]),
    ).toBe("4H1, 4H2 · 57 leerlingen");
    expect(studentsSummary(3, 28)).toBe("3 van 28");
  });

  test("toast texts", () => {
    expect(createdToast(3, "planned")).toBe("3 afnames gepland");
    expect(createdToast(1, "open")).toBe("De afname is open");
    expect(createdToast(1, "planned")).toBe("De afname is gepland");
  });
});

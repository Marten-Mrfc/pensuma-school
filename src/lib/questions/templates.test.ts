import { describe, expect, test } from "bun:test";
import { parseQuestionData } from "@/lib/questions/schema";
import {
  buildQuestionDraft,
  createLocalId,
  DEFAULT_TEMPLATE_FOR_TYPE,
  getQuestionTemplate,
  QUESTION_TEMPLATES,
  refreshDataIds,
} from "@/lib/questions/templates";
import { validateQuestion } from "@/lib/questions/validate";

describe("question templates", () => {
  test("all eight presets exist with Dutch labels, descriptions and icons", () => {
    expect(QUESTION_TEMPLATES.map((t) => t.label)).toEqual([
      "Lege programmeervraag",
      "Print-opdracht",
      "Invoer & uitvoer",
      "Rekenen met getallen",
      "Functie schrijven",
      "Meerkeuze (één antwoord)",
      "Meerkeuze (meerdere antwoorden)",
      "Open vraag",
    ]);
    for (const t of QUESTION_TEMPLATES) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.icon).toMatch(/^[A-Z][A-Za-z]+$/);
    }
  });

  test("every template builds schema-valid data of its own type", () => {
    for (const t of QUESTION_TEMPLATES) {
      const draft = t.build();
      expect(draft.type).toBe(t.type);
      expect(() => parseQuestionData(draft.type, draft.data)).not.toThrow();
      expect(draft.points).toBeGreaterThan(0);
    }
  });

  test("templates have no blocking problems (except the empty one)", () => {
    for (const t of QUESTION_TEMPLATES) {
      const errors = validateQuestion(t.build()).filter(
        (i) => i.severity === "error",
      );
      if (t.id === "code-empty") {
        expect(errors.map((e) => e.code)).toEqual([
          "question.no_prompt",
          "code.io_no_expected",
        ]);
      } else {
        expect(errors).toEqual([]);
      }
    }
  });

  test("specific presets", () => {
    const print = buildQuestionDraft("code", "code-print");
    if (print.type !== "code") throw new Error();
    const printData = parseQuestionData("code", print.data);
    expect(printData.tests).toHaveLength(1);
    expect(printData.tests[0]).toMatchObject({ kind: "io", stdin: "" });

    const io = parseQuestionData(
      "code",
      buildQuestionDraft("code", "code-io").data,
    );
    expect(io.tests.every((t) => t.kind === "io" && t.stdin.length > 0)).toBe(
      true,
    );
    expect(io.solution).toContain("input(");

    const numbers = parseQuestionData(
      "code",
      buildQuestionDraft("code", "code-numbers").data,
    );
    expect(
      numbers.tests.every((t) => t.kind === "io" && t.match === "numbers"),
    ).toBe(true);

    const fn = parseQuestionData(
      "code",
      buildQuestionDraft("code", "code-function").data,
    );
    expect(fn.tests.every((t) => t.kind === "function")).toBe(true);
    expect(fn.checks[0]).toMatchObject({
      kind: "requires",
      construct: "function_def",
    });

    const multi = parseQuestionData(
      "multiple_choice",
      buildQuestionDraft("multiple_choice", "mc-multiple").data,
    );
    expect(multi.multiple).toBe(true);
    expect(multi.scoring).toBe("partial");
  });

  test("each build has fresh ids", () => {
    const a = parseQuestionData(
      "code",
      buildQuestionDraft("code", "code-io").data,
    );
    const b = parseQuestionData(
      "code",
      buildQuestionDraft("code", "code-io").data,
    );
    expect(a.tests[0].id).not.toBe(b.tests[0].id);
  });

  test("default template per type and type mismatch", () => {
    for (const [type, id] of Object.entries(DEFAULT_TEMPLATE_FOR_TYPE)) {
      expect(getQuestionTemplate(id)?.type).toBe(type as never);
    }
    expect(buildQuestionDraft("open").type).toBe("open");
    expect(() => buildQuestionDraft("open", "mc-single")).toThrow();
    expect(() => buildQuestionDraft("code", "nope")).toThrow();
  });

  test("createLocalId and refreshDataIds", () => {
    expect(createLocalId("t")).toMatch(/^t_[a-z0-9]{8}$/);
    const data = parseQuestionData(
      "multiple_choice",
      buildQuestionDraft("multiple_choice").data,
    );
    const fresh = refreshDataIds("multiple_choice", data);
    expect(fresh.options.map((o) => o.text)).toEqual(
      data.options.map((o) => o.text),
    );
    expect(fresh.options[0].id).not.toBe(data.options[0].id);
  });

  test("refreshDataIds also renews hint and rubric item ids", () => {
    const code = parseQuestionData("code", {
      tests: [{ id: "t1", kind: "io", expectedOutput: "x" }],
      checks: [{ id: "c1", kind: "requires", construct: "for_loop" }],
      hints: [{ id: "h1", text: "Gebruik een lus.", penalty: 0.1 }],
    });
    const freshCode = refreshDataIds("code", code);
    expect(freshCode.tests[0].id).not.toBe("t1");
    expect(freshCode.checks[0].id).not.toBe("c1");
    expect(freshCode.hints[0]).toMatchObject({
      text: "Gebruik een lus.",
      penalty: 0.1,
    });
    expect(freshCode.hints[0].id).not.toBe("h1");

    const open = parseQuestionData("open", {
      rubricItems: [{ id: "r1", label: "Juiste uitleg", points: 1 }],
    });
    const freshOpen = refreshDataIds("open", open);
    expect(freshOpen.rubricItems[0].label).toBe("Juiste uitleg");
    expect(freshOpen.rubricItems[0].id).not.toBe("r1");
  });
});

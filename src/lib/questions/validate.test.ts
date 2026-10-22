import { describe, expect, test } from "bun:test";
import {
  type CodeQuestionData,
  codeQuestionDataSchema,
  multipleChoiceDataSchema,
} from "@/lib/questions/schema";
import {
  newFunctionTest,
  newIoTest,
  QUESTION_TEMPLATES,
} from "@/lib/questions/templates";
import {
  calledFunctionName,
  describeDataIssues,
  looksBalanced,
  parsePortableTest,
  portableFileName,
  type SolutionCheck,
  safeParseQuestionData,
  solutionCheckState,
  solutionFingerprint,
  type ValidatableQuestion,
  validateQuestion,
  validateTest,
} from "@/lib/questions/validate";

function codeQuestion(
  data: Partial<CodeQuestionData>,
  extra: Partial<ValidatableQuestion> = {},
): ValidatableQuestion {
  return {
    id: "q1",
    type: "code",
    title: "Begroeting",
    prompt: "Vraag de naam en groet.",
    points: 2,
    data: codeQuestionDataSchema.parse(data),
    ...extra,
  };
}

function passedCheck(data: CodeQuestionData): SolutionCheck {
  return {
    hash: solutionFingerprint(data),
    passed: true,
    passedTests: data.tests.length,
    totalTests: data.tests.length,
    checkedAt: new Date().toISOString(),
    source: "server",
  };
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("validateQuestion: common fields", () => {
  test("missing title, prompt and points are errors", () => {
    const issues = validateQuestion({
      type: "open",
      title: " ",
      prompt: "",
      points: 0,
      data: { modelAnswer: "x" },
    });
    expect(codes(issues)).toEqual([
      "question.no_title",
      "question.no_prompt",
      "question.no_points",
    ]);
    expect(issues.every((i) => i.severity === "error")).toBe(true);
  });

  test("invalid data gives a Dutch error", () => {
    const issues = validateQuestion({
      type: "code",
      title: "x",
      prompt: "x",
      points: 1,
      data: {
        tests: [{ id: "t1", kind: "function", call: "", expected: "1" }],
      },
    });
    expect(issues[0].code).toBe("question.invalid_data");
    expect(issues[0].message).toContain("test 1, aanroep: mag niet leeg zijn");
  });
});

describe("validateQuestion: code", () => {
  test("no tests → error", () => {
    const issues = validateQuestion(codeQuestion({ solution: "print(1)" }));
    expect(issues[0]).toMatchObject({
      severity: "error",
      code: "code.no_tests",
      message: "voeg minstens één test toe",
    });
  });

  test("a complete, checked question has no issues", () => {
    const data = codeQuestionDataSchema.parse({
      solution: 'naam = input("Hoe heet je? ")\nprint("Hallo " + naam)\n',
      tests: [
        newIoTest({ stdin: "Mark", expectedOutput: "Hallo Mark" }),
        newIoTest({
          stdin: "Fatima",
          expectedOutput: "Hallo Fatima",
          hidden: true,
        }),
      ],
    });
    expect(
      validateQuestion(
        codeQuestion(data, { solutionCheck: passedCheck(data) }),
      ),
    ).toEqual([]);
  });

  test("solution never checked → warning; edit after check → stale warning", () => {
    const data = codeQuestionDataSchema.parse({
      solution: 'print("Hallo")',
      tests: [newIoTest({ expectedOutput: "Hallo" })],
    });
    expect(codes(validateQuestion(codeQuestion(data)))).toEqual([
      "code.solution_unchecked",
    ]);
    const check = passedCheck(data);
    const edited = { ...data, solution: 'print("Hoi")' };
    expect(
      codes(validateQuestion(codeQuestion(edited, { solutionCheck: check }))),
    ).toEqual(["code.solution_stale"]);
    // Renaming / hiding / re-weighting a test does not invalidate the check.
    const renamed = {
      ...data,
      tests: data.tests.map((t) => ({
        ...t,
        name: "Nieuw",
        weight: 3,
        hidden: false,
      })),
    };
    expect(solutionCheckState(renamed, check)).toBe("passed");
  });

  test("failed check → warning with counts", () => {
    const data = codeQuestionDataSchema.parse({
      solution: 'print("Hallo")',
      tests: [
        newIoTest({ expectedOutput: "Hallo" }),
        newIoTest({ expectedOutput: "Doei" }),
      ],
    });
    const check = { ...passedCheck(data), passed: false, passedTests: 1 };
    const issues = validateQuestion(
      codeQuestion(data, { solutionCheck: check }),
    );
    expect(issues.find((i) => i.code === "code.solution_failed")?.message).toBe(
      "de modeloplossing slaagt niet voor alle tests (1 van 2 geslaagd)",
    );
  });

  test("io test problems", () => {
    const data = codeQuestionDataSchema.parse({
      solution: 'print("x")',
      tests: [
        newIoTest({ expectedOutput: "" }),
        newIoTest({ expectedOutput: "([a-z]+", match: "regex" }),
        newIoTest({ expectedOutput: "geen getal", match: "numbers" }),
        newIoTest({ expectedOutput: "(?P<naam>\\w+)", match: "regex" }),
        newIoTest({ stdin: "5", expectedOutput: "x" }),
      ],
    });
    const issues = validateQuestion(
      codeQuestion(data, { solutionCheck: passedCheck(data) }),
    );
    expect(codes(issues)).toEqual([
      "code.io_no_expected",
      "code.io_bad_regex",
      "code.io_no_numbers",
      "code.io_bad_regex",
      "code.io_stdin_unused",
    ]);
    expect(issues[0].message).toBe("test 1: vul de verwachte uitvoer in");
    expect(issues[0].target).toEqual({
      field: "test",
      id: data.tests[0].id,
      index: 0,
    });
  });

  test("function test problems", () => {
    const data = codeQuestionDataSchema.parse({
      solution:
        "def gemiddelde(getallen):\n    return sum(getallen) / len(getallen)\n",
      tests: [
        newFunctionTest({ call: "gemiddelde([1, 2, 3]", expected: "2.0" }),
        newFunctionTest({ call: "som([1])", expected: "1" }),
        newFunctionTest({ call: "gemiddelde([1])", expected: "'abc" }),
        newFunctionTest({ call: "gemiddelde([2, 4])", expected: "3.0" }),
      ],
    });
    const issues = validateQuestion(
      codeQuestion(data, { solutionCheck: passedCheck(data) }),
    );
    expect(codes(issues)).toEqual([
      "code.fn_bad_call",
      "code.fn_bad_expected",
      "code.fn_not_in_solution",
    ]);
    expect(
      issues.find((i) => i.code === "code.fn_not_in_solution")?.message,
    ).toBe("test 2: de modeloplossing heeft geen functie som()");
  });

  test("all hidden, no solution, starter equals solution", () => {
    const hidden = codeQuestionDataSchema.parse({
      tests: [newIoTest({ expectedOutput: "1", hidden: true })],
    });
    expect(codes(validateQuestion(codeQuestion(hidden)))).toEqual([
      "code.all_hidden",
      "code.no_solution",
    ]);
    const same = codeQuestionDataSchema.parse({
      starterCode: "print(1)\n",
      solution: "print(1)",
      tests: [newIoTest({ expectedOutput: "1" })],
    });
    expect(
      codes(
        validateQuestion(
          codeQuestion(same, { solutionCheck: passedCheck(same) }),
        ),
      ),
    ).toEqual(["code.starter_is_solution"]);
  });
});

describe("validateQuestion: multiple choice", () => {
  const mc = (data: unknown): ValidatableQuestion => ({
    id: "m1",
    type: "multiple_choice",
    title: "Gehele deling",
    prompt: "Wat print `7 // 2`?",
    points: 1,
    data: multipleChoiceDataSchema.parse(data),
  });

  test("no correct answer", () => {
    const issues = validateQuestion(
      mc({
        options: [
          { id: "a", text: "3" },
          { id: "b", text: "4" },
        ],
      }),
    );
    expect(issues.map((i) => i.message)).toEqual([
      "kies minstens één goed antwoord",
    ]);
  });

  test("too few options, empty option, duplicates", () => {
    expect(
      codes(
        validateQuestion(
          mc({ options: [{ id: "a", text: "3", correct: true }] }),
        ),
      ),
    ).toEqual(["mc.too_few_options"]);
    const issues = validateQuestion(
      mc({
        options: [
          { id: "a", text: "3", correct: true },
          { id: "b", text: "" },
          { id: "c", text: " 3 " },
        ],
      }),
    );
    expect(issues.map((i) => i.message)).toEqual([
      "optie B is leeg",
      "optie A en C zijn hetzelfde",
    ]);
  });

  test("several correct answers in single mode → error; all correct → warning", () => {
    const opts = [
      { id: "a", text: "x", correct: true },
      { id: "b", text: "y", correct: true },
    ];
    expect(codes(validateQuestion(mc({ options: opts })))).toEqual([
      "mc.multiple_correct_single",
    ]);
    expect(
      codes(validateQuestion(mc({ options: opts, multiple: true }))),
    ).toEqual(["mc.all_correct"]);
  });
});

describe("validateTest", () => {
  test("prefixes problems with the question number", () => {
    const good = QUESTION_TEMPLATES.find((t) => t.id === "open")?.build();
    if (!good) throw new Error("template missing");
    const result = validateTest({
      title: "Toets",
      questions: [
        { id: "a", ...good },
        codeQuestion({ solution: "print(1)" }, { id: "b" }),
        {
          id: "c",
          type: "multiple_choice",
          title: "MC",
          prompt: "?",
          points: 1,
          data: {
            options: [
              { id: "a", text: "1" },
              { id: "b", text: "2" },
            ],
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.message)).toEqual([
      "Vraag 2: voeg minstens één test toe",
      "Vraag 3: kies minstens één goed antwoord",
    ]);
    expect(result.errors[0]).toMatchObject({
      questionId: "b",
      questionNumber: 2,
    });
    expect(result.warnings[0].code).toBe("test.few_questions");
    expect(result.byQuestion.a).toEqual([]);
  });

  test("empty test and title", () => {
    const result = validateTest({ title: "", questions: [] });
    expect(result.errors.map((e) => e.code)).toEqual([
      "test.no_title",
      "test.no_questions",
    ]);
  });

  test("more than 50 questions is an error", () => {
    const open = QUESTION_TEMPLATES.find((t) => t.id === "open");
    if (!open) throw new Error("template missing");
    const questions = Array.from({ length: 51 }, () => open.build());
    expect(validateTest({ title: "x", questions }).errors[0].code).toBe(
      "test.too_many_questions",
    );
  });
});

describe("helpers", () => {
  test("looksBalanced", () => {
    expect(looksBalanced("gemiddelde([1, 2, 3])")).toBe(true);
    expect(looksBalanced("f(')')")).toBe(true);
    expect(looksBalanced('{"a": [1, (2, 3)]}')).toBe(true);
    expect(looksBalanced("f([1, 2)")).toBe(false);
    expect(looksBalanced("'abc")).toBe(false);
  });

  test("calledFunctionName", () => {
    expect(calledFunctionName("gemiddelde([1])")).toBe("gemiddelde");
    expect(calledFunctionName("  grootste (1, 2, 3)")).toBe("grootste");
    expect(calledFunctionName("[1, 2]")).toBeNull();
  });

  test("fingerprint is stable and sensitive to relevant changes", () => {
    const data = codeQuestionDataSchema.parse({
      solution: "print(1)",
      tests: [newIoTest({ id: "t1", expectedOutput: "1" })],
    });
    expect(solutionFingerprint(data)).toBe(
      solutionFingerprint(structuredClone(data)),
    );
    expect(solutionFingerprint({ ...data, timeLimitMs: 1000 })).not.toBe(
      solutionFingerprint(data),
    );
  });

  test("describeDataIssues and safeParseQuestionData speak Dutch", () => {
    const r = safeParseQuestionData("code", {
      timeLimitMs: 100,
      tests: [{ id: "t1", kind: "io", weight: 0 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.messages).toContain("tijdslimiet: moet minstens 500 zijn");
      expect(r.messages).toContain("test 1, gewicht: moet groter dan 0 zijn");
    }
    expect(describeDataIssues([])).toEqual([]);
  });

  test("portable test parsing", () => {
    expect(parsePortableTest("{nope")).toEqual({
      success: false,
      messages: ["Dit is geen geldig JSON-bestand."],
    });
    expect(parsePortableTest({ foo: 1 }).success).toBe(false);
    const ok = parsePortableTest(
      JSON.stringify({
        format: "pensuma-toets",
        version: 1,
        test: { title: "Gedeelde toets" },
        questions: QUESTION_TEMPLATES.map((t) => t.build()),
      }),
    );
    expect(ok.success).toBe(true);
    if (ok.success)
      expect(ok.data.questions).toHaveLength(QUESTION_TEMPLATES.length);
    const bad = parsePortableTest({
      version: 1,
      test: { title: "x" },
      questions: [{ type: "code", title: "q", data: { timeLimitMs: 1 } }],
    });
    expect(bad.success).toBe(false);
    if (!bad.success)
      expect(bad.messages[0]).toBe(
        "vraag 1, tijdslimiet: moet minstens 500 zijn",
      );
  });

  test("portableFileName", () => {
    expect(portableFileName("Python basis – oefentoets")).toBe(
      "python-basis-oefentoets.pensuma.json",
    );
    expect(portableFileName("???")).toBe("toets.pensuma.json");
  });
});

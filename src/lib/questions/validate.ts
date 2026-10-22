/**
 * Publish validation for tests and questions, plus the portable JSON format
 * used to share tests between teachers.
 *
 * Pure (no server or browser imports): the test builder uses it to show
 * problem indicators while editing, `test.setStatus` uses it to decide
 * whether a test may be published.
 *
 * Messages are Dutch. Question-level messages start lowercase so they can be
 * prefixed: "Vraag 3: voeg minstens één test toe".
 */
import { z } from "zod";
import {
  type CodeQuestionData,
  codeQuestionDataSchema,
  functionTestSchema,
  ioTestSchema,
  type MultipleChoiceData,
  multipleChoiceDataSchema,
  type OpenQuestionData,
  OUTPUT_MATCH_MODE_LABELS,
  openQuestionDataSchema,
  type QuestionDataByType,
  type QuestionType,
  questionDataSchemas,
} from "@/lib/questions/schema";

/** Code data where function tests may still have an empty call/expected. */
const lenientCodeDataSchema = codeQuestionDataSchema.extend({
  tests: z
    .array(
      z.discriminatedUnion("kind", [
        ioTestSchema,
        functionTestSchema.extend({ call: z.string(), expected: z.string() }),
      ]),
    )
    .default([]),
});

/* -------------------------------------------------------------------------- */
/*                                  Limits                                    */
/* -------------------------------------------------------------------------- */

export const MAX_QUESTIONS_PER_TEST = 50;
/** Below this a (non-blocking) warning is shown when publishing. */
export const RECOMMENDED_MIN_QUESTIONS = 10;
export const MAX_POINTS_PER_QUESTION = 1000;

/** Shown when a test with attempts is edited (mutations return `hasAttempts`). */
export const EDIT_WITH_ATTEMPTS_WARNING =
  "Er zijn al pogingen; laat pogingen opnieuw nakijken via de afname.";

/* -------------------------------------------------------------------------- */
/*                         Model solution fingerprint                         */
/* -------------------------------------------------------------------------- */

/** Stored in `question.solution_check` after "Vraag controleren". */
export type SolutionCheck = {
  /** `solutionFingerprint(data)` at the moment of checking. */
  hash: string;
  passed: boolean;
  passedTests: number;
  totalTests: number;
  checkedAt: string;
  source: "server" | "browser";
};

/** cyrb53: small, fast, stable 53-bit string hash (hex). */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Fingerprint of everything that decides whether the model solution passes:
 * solution, test inputs/expectations/matching, checks and the time limit.
 * Names, weights and the hidden flag are left out on purpose (renaming a
 * test does not require a new check).
 */
export function solutionFingerprint(data: CodeQuestionData): string {
  const relevant = {
    s: data.solution,
    l: data.timeLimitMs,
    t: data.tests.map((t) =>
      t.kind === "io"
        ? ["io", t.stdin, t.expectedOutput, t.match, t.ignoreCase, t.tolerance]
        : ["fn", t.call, t.expected, t.tolerance],
    ),
    c: data.checks.map((c) => [c.kind, c.construct, c.value ?? ""]),
  };
  return cyrb53(JSON.stringify(relevant));
}

export type SolutionCheckState =
  | "none"
  | "unchecked"
  | "stale"
  | "passed"
  | "failed";

/**
 * - none: nothing to check (no solution or no tests)
 * - unchecked: never checked
 * - stale: checked, but solution/tests changed since
 * - passed / failed: result of the last check, still up to date
 */
export function solutionCheckState(
  data: CodeQuestionData,
  check: SolutionCheck | null | undefined,
): SolutionCheckState {
  if (!data.solution.trim() || data.tests.length === 0) return "none";
  if (!check) return "unchecked";
  if (check.hash !== solutionFingerprint(data)) return "stale";
  return check.passed ? "passed" : "failed";
}

/* -------------------------------------------------------------------------- */
/*                                   Issues                                   */
/* -------------------------------------------------------------------------- */

export type IssueSeverity = "error" | "warning";

/** Where in the question editor the problem is (for highlighting). */
export type IssueTarget =
  | {
      field:
        | "title"
        | "prompt"
        | "points"
        | "data"
        | "solution"
        | "starterCode"
        | "tests";
    }
  | { field: "test"; id: string; index: number }
  | { field: "option"; id: string; index: number }
  | { field: "options" | "modelAnswer" };

export type QuestionIssue = {
  severity: IssueSeverity;
  /** Stable machine code, e.g. "code.no_tests". */
  code: string;
  /** Dutch, lowercase start (prefix with "Vraag N: "). */
  message: string;
  target?: IssueTarget;
};

/** Capitalise the first letter, for showing an issue on its own. */
export function capitalize(message: string): string {
  return message ? message[0].toUpperCase() + message.slice(1) : message;
}

/** Option letter: 0 → A, 1 → B, … */
export function optionLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** Minimal shape of a question for validation. */
export type ValidatableQuestion = {
  id?: string;
  type: QuestionType;
  title: string;
  prompt: string;
  points: number;
  data: unknown;
  solutionCheck?: SolutionCheck | null;
};

const NUMBER_RE = /-?\d+(?:[.,]\d+)?/;

/** Brackets and quotes balanced (rough Python syntax sanity check). */
export function looksBalanced(src: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch in pairs) {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return quote === null && stack.length === 0;
}

/** Name of the called function in e.g. `gemiddelde([1, 2])`, if any. */
export function calledFunctionName(call: string): string | null {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(call);
  return m ? m[1] : null;
}

/** Same flags as the grader (`src/lib/grading/compare.ts`): JavaScript syntax. */
function isValidPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "mu");
    return true;
  } catch {
    return false;
  }
}

function testLabel(index: number): string {
  return `test ${index + 1}`;
}

function validateCode(
  data: CodeQuestionData,
  check: SolutionCheck | null | undefined,
): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const solution = data.solution.trim();

  if (data.tests.length === 0) {
    issues.push({
      severity: "error",
      code: "code.no_tests",
      message: "voeg minstens één test toe",
      target: { field: "tests" },
    });
  }

  const ids = new Set<string>();
  data.tests.forEach((t, index) => {
    const target: IssueTarget = { field: "test", id: t.id, index };
    const label = testLabel(index);
    if (ids.has(t.id)) {
      issues.push({
        severity: "error",
        code: "code.duplicate_test_id",
        message: `${label} heeft hetzelfde id als een andere test; dupliceer of verwijder hem opnieuw`,
        target,
      });
    }
    ids.add(t.id);

    if (t.kind === "io") {
      if (!t.expectedOutput.trim()) {
        issues.push({
          severity: "error",
          code: "code.io_no_expected",
          message:
            t.match === "regex"
              ? `${label}: vul de reguliere expressie in`
              : `${label}: vul de verwachte uitvoer in`,
          target,
        });
      } else if (t.match === "regex" && !isValidPattern(t.expectedOutput)) {
        issues.push({
          severity: "error",
          code: "code.io_bad_regex",
          message: `${label}: de reguliere expressie is ongeldig`,
          target,
        });
      } else if (t.match === "numbers" && !NUMBER_RE.test(t.expectedOutput)) {
        issues.push({
          severity: "error",
          code: "code.io_no_numbers",
          message: `${label}: de verwachte uitvoer bevat geen getallen (vergelijking "${OUTPUT_MATCH_MODE_LABELS.numbers}")`,
          target,
        });
      }
      if (solution && t.stdin.trim() && !/\binput\s*\(/.test(data.solution)) {
        issues.push({
          severity: "warning",
          code: "code.io_stdin_unused",
          message: `${label} geeft invoer, maar de modeloplossing gebruikt geen input()`,
          target,
        });
      }
    } else {
      if (!t.call.trim()) {
        issues.push({
          severity: "error",
          code: "code.fn_no_call",
          message: `${label}: vul de aanroep in, bijvoorbeeld gemiddelde([1, 2, 3])`,
          target,
        });
      } else if (!looksBalanced(t.call)) {
        issues.push({
          severity: "error",
          code: "code.fn_bad_call",
          message: `${label}: de aanroep klopt niet (controleer haakjes en aanhalingstekens)`,
          target,
        });
      } else {
        const name = calledFunctionName(t.call);
        if (
          solution &&
          name &&
          !new RegExp(`\\bdef\\s+${name}\\s*\\(`).test(data.solution)
        ) {
          issues.push({
            severity: "warning",
            code: "code.fn_not_in_solution",
            message: `${label}: de modeloplossing heeft geen functie ${name}()`,
            target,
          });
        }
      }
      if (!t.expected.trim()) {
        issues.push({
          severity: "error",
          code: "code.fn_no_expected",
          message: `${label}: vul de verwachte waarde in (een Python-waarde, bijvoorbeeld 2.0 of "tekst")`,
          target,
        });
      } else if (!looksBalanced(t.expected)) {
        issues.push({
          severity: "error",
          code: "code.fn_bad_expected",
          message: `${label}: de verwachte waarde is geen geldige Python-waarde (controleer haakjes en aanhalingstekens)`,
          target,
        });
      }
    }
  });

  if (data.tests.length > 0 && data.tests.every((t) => t.hidden)) {
    issues.push({
      severity: "warning",
      code: "code.all_hidden",
      message:
        "alle tests zijn verborgen, dus leerlingen kunnen hun code niet zelf testen",
      target: { field: "tests" },
    });
  }

  if (!solution) {
    issues.push({
      severity: "warning",
      code: "code.no_solution",
      message:
        "voeg een modeloplossing toe, dan kun je controleren of de tests kloppen",
      target: { field: "solution" },
    });
  } else if (data.starterCode.trim() === solution) {
    issues.push({
      severity: "warning",
      code: "code.starter_is_solution",
      message: "de startcode is gelijk aan de modeloplossing",
      target: { field: "starterCode" },
    });
  }

  switch (solutionCheckState(data, check)) {
    case "unchecked":
      issues.push({
        severity: "warning",
        code: "code.solution_unchecked",
        message:
          'de modeloplossing is nog niet gecontroleerd (gebruik "Vraag controleren")',
        target: { field: "solution" },
      });
      break;
    case "stale":
      issues.push({
        severity: "warning",
        code: "code.solution_stale",
        message:
          'de modeloplossing is sinds de laatste wijziging niet opnieuw gecontroleerd (gebruik "Vraag controleren")',
        target: { field: "solution" },
      });
      break;
    case "failed":
      issues.push({
        severity: "warning",
        code: "code.solution_failed",
        message: `de modeloplossing slaagt niet voor alle tests (${check?.passedTests ?? 0} van ${check?.totalTests ?? 0} geslaagd)`,
        target: { field: "solution" },
      });
      break;
    default:
      break;
  }

  return issues;
}

function validateMultipleChoice(data: MultipleChoiceData): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const { options } = data;

  if (options.length < 2) {
    issues.push({
      severity: "error",
      code: "mc.too_few_options",
      message: "voeg minstens twee antwoordopties toe",
      target: { field: "options" },
    });
  }

  const seen = new Map<string, number>();
  options.forEach((o, index) => {
    const text = o.text.trim();
    if (!text) {
      issues.push({
        severity: "error",
        code: "mc.empty_option",
        message: `optie ${optionLetter(index)} is leeg`,
        target: { field: "option", id: o.id, index },
      });
      return;
    }
    const key = text.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      issues.push({
        severity: "warning",
        code: "mc.duplicate_option",
        message: `optie ${optionLetter(first)} en ${optionLetter(index)} zijn hetzelfde`,
        target: { field: "option", id: o.id, index },
      });
    } else {
      seen.set(key, index);
    }
  });

  const correct = options.filter((o) => o.correct).length;
  if (options.length > 0 && correct === 0) {
    issues.push({
      severity: "error",
      code: "mc.no_correct",
      message: "kies minstens één goed antwoord",
      target: { field: "options" },
    });
  } else if (!data.multiple && correct > 1) {
    issues.push({
      severity: "error",
      code: "mc.multiple_correct_single",
      message:
        'er zijn meerdere goede antwoorden; zet "meerdere antwoorden toegestaan" aan of markeer er één als goed',
      target: { field: "options" },
    });
  } else if (options.length >= 2 && correct === options.length) {
    issues.push({
      severity: "warning",
      code: "mc.all_correct",
      message: "alle opties zijn goed; voeg ook een fout antwoord toe",
      target: { field: "options" },
    });
  }

  return issues;
}

function validateOpen(data: OpenQuestionData): QuestionIssue[] {
  if (!data.modelAnswer.trim() && !data.rubric.trim()) {
    return [
      {
        severity: "warning",
        code: "open.no_model_answer",
        message:
          "voeg een modelantwoord of beoordelingsrubric toe; dat helpt bij het nakijken",
        target: { field: "modelAnswer" },
      },
    ];
  }
  return [];
}

/** All problems of one question, errors first. */
export function validateQuestion(
  question: ValidatableQuestion,
): QuestionIssue[] {
  const issues: QuestionIssue[] = [];

  if (!question.title.trim()) {
    issues.push({
      severity: "error",
      code: "question.no_title",
      message: "geef de vraag een titel",
      target: { field: "title" },
    });
  }
  if (!question.prompt.trim()) {
    issues.push({
      severity: "error",
      code: "question.no_prompt",
      message: "schrijf een opdrachttekst",
      target: { field: "prompt" },
    });
  }
  if (!(question.points > 0)) {
    issues.push({
      severity: "error",
      code: "question.no_points",
      message: "geef de vraag meer dan 0 punten",
      target: { field: "points" },
    });
  }

  const parsed = questionDataSchemas[question.type].safeParse(
    question.data ?? {},
  );
  // While editing, function tests may have an empty call/expected value (the
  // strict schema rejects that). Validate leniently so the teacher gets the
  // specific message ("test 2: vul de aanroep in") instead of a generic one.
  const lenient =
    !parsed.success && question.type === "code"
      ? lenientCodeDataSchema.safeParse(question.data ?? {})
      : null;
  if (parsed.success || lenient?.success) {
    const data = parsed.success ? parsed.data : lenient?.data;
    const before = issues.length;
    if (question.type === "code") {
      issues.push(
        ...validateCode(data as CodeQuestionData, question.solutionCheck),
      );
    } else if (question.type === "multiple_choice") {
      issues.push(...validateMultipleChoice(data as MultipleChoiceData));
    } else {
      issues.push(...validateOpen(data as OpenQuestionData));
    }
    const added = issues.slice(before);
    if (!parsed.success && !added.some((i) => i.severity === "error")) {
      issues.push({
        severity: "error",
        code: "question.invalid_data",
        message: `de instellingen zijn ongeldig: ${describeDataIssues(parsed.error.issues)[0] ?? "onbekende fout"}`,
        target: { field: "data" },
      });
    }
  } else if (!parsed.success) {
    issues.push({
      severity: "error",
      code: "question.invalid_data",
      message: `de instellingen zijn ongeldig: ${describeDataIssues(parsed.error.issues)[0] ?? "onbekende fout"}`,
      target: { field: "data" },
    });
  }

  return [
    ...issues.filter((i) => i.severity === "error"),
    ...issues.filter((i) => i.severity === "warning"),
  ];
}

/* -------------------------------------------------------------------------- */
/*                               Test validation                              */
/* -------------------------------------------------------------------------- */

export type TestProblem = {
  severity: IssueSeverity;
  /** Ready to show, e.g. "Vraag 3: voeg minstens één test toe". */
  message: string;
  code: string;
  questionId?: string;
  /** 1-based question number. */
  questionNumber?: number;
};

export type TestValidation = {
  /** True when there are no errors (warnings may remain). */
  ok: boolean;
  errors: TestProblem[];
  warnings: TestProblem[];
  /** Issues per question id (questions without id are keyed by index). */
  byQuestion: Record<string, QuestionIssue[]>;
};

export function validateTest(test: {
  title: string;
  questions: ValidatableQuestion[];
}): TestValidation {
  const errors: TestProblem[] = [];
  const warnings: TestProblem[] = [];
  const byQuestion: Record<string, QuestionIssue[]> = {};
  const count = test.questions.length;

  if (!test.title.trim()) {
    errors.push({
      severity: "error",
      code: "test.no_title",
      message: "Geef de toets een titel.",
    });
  }
  if (count === 0) {
    errors.push({
      severity: "error",
      code: "test.no_questions",
      message: "Voeg minstens één vraag toe.",
    });
  } else if (count > MAX_QUESTIONS_PER_TEST) {
    errors.push({
      severity: "error",
      code: "test.too_many_questions",
      message: `Een toets kan maximaal ${MAX_QUESTIONS_PER_TEST} vragen hebben (nu ${count}).`,
    });
  } else if (count < RECOMMENDED_MIN_QUESTIONS) {
    warnings.push({
      severity: "warning",
      code: "test.few_questions",
      message: `De toets heeft ${count} ${count === 1 ? "vraag" : "vragen"}. Een toets heeft meestal ${RECOMMENDED_MIN_QUESTIONS} tot ${MAX_QUESTIONS_PER_TEST} vragen.`,
    });
  }

  test.questions.forEach((q, index) => {
    const issues = validateQuestion(q);
    byQuestion[q.id ?? String(index)] = issues;
    for (const issue of issues) {
      const problem: TestProblem = {
        severity: issue.severity,
        code: issue.code,
        message: `Vraag ${index + 1}: ${issue.message}`,
        questionId: q.id,
        questionNumber: index + 1,
      };
      (issue.severity === "error" ? errors : warnings).push(problem);
    }
  });

  return { ok: errors.length === 0, errors, warnings, byQuestion };
}

/* -------------------------------------------------------------------------- */
/*                          Dutch zod issue messages                          */
/* -------------------------------------------------------------------------- */

const FIELD_LABELS: Record<string, string> = {
  title: "titel",
  prompt: "opdrachttekst",
  points: "punten",
  starterCode: "startcode",
  solution: "modeloplossing",
  timeLimitMs: "tijdslimiet",
  name: "naam",
  stdin: "invoer",
  expectedOutput: "verwachte uitvoer",
  match: "vergelijking",
  ignoreCase: "hoofdletters negeren",
  tolerance: "tolerantie",
  hidden: "verborgen",
  weight: "gewicht",
  call: "aanroep",
  expected: "verwachte waarde",
  construct: "constructie",
  value: "waarde",
  message: "melding",
  text: "tekst",
  correct: "goed",
  multiple: "meerdere antwoorden",
  shuffle: "husselen",
  scoring: "puntentelling",
  modelAnswer: "modelantwoord",
  rubric: "rubric",
  maxLength: "max. aantal tekens",
  description: "beschrijving",
  topic: "onderwerp",
  questions: "vragen",
  test: "toets",
  data: "instellingen",
  type: "type",
  version: "versie",
};

function describePath(path: PropertyKey[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const next = path[i + 1];
    if (typeof next === "number") {
      if (seg === "tests") parts.push(`test ${next + 1}`);
      else if (seg === "checks") parts.push(`controle ${next + 1}`);
      else if (seg === "options") parts.push(`optie ${optionLetter(next)}`);
      else if (seg === "questions") parts.push(`vraag ${next + 1}`);
      else
        parts.push(`${FIELD_LABELS[String(seg)] ?? String(seg)} ${next + 1}`);
      i++;
    } else if (seg === "data") {
      // implicit
    } else {
      parts.push(FIELD_LABELS[String(seg)] ?? String(seg));
    }
  }
  return parts.join(", ");
}

/** Dutch, human-friendly messages for zod issues (question data / imports). */
export function describeDataIssues(
  issues: readonly z.core.$ZodIssue[],
): string[] {
  return issues.slice(0, 5).map((issue) => {
    const where = describePath(issue.path);
    let what: string;
    switch (issue.code) {
      case "too_small":
        what =
          issue.origin === "string" && Number(issue.minimum) <= 1
            ? "mag niet leeg zijn"
            : issue.origin === "array"
              ? `moet minstens ${issue.minimum} items hebben`
              : issue.inclusive
                ? `moet minstens ${issue.minimum} zijn`
                : `moet groter dan ${issue.minimum} zijn`;
        break;
      case "too_big":
        what =
          issue.origin === "array"
            ? `mag hoogstens ${issue.maximum} items hebben`
            : issue.origin === "string"
              ? `mag hoogstens ${issue.maximum} tekens lang zijn`
              : `mag hoogstens ${issue.maximum} zijn`;
        break;
      case "invalid_type":
        what =
          issue.input === undefined
            ? "ontbreekt"
            : "heeft een ongeldige waarde";
        break;
      case "invalid_value":
      case "invalid_union":
        what = "heeft een ongeldige keuze";
        break;
      case "not_multiple_of":
        what = "moet een geheel getal zijn";
        break;
      default:
        what = issue.message;
    }
    return where ? `${where}: ${what}` : capitalize(what);
  });
}

/** Parse question data with a Dutch error message on failure. */
export function safeParseQuestionData<T extends QuestionType>(
  type: T,
  data: unknown,
):
  | { success: true; data: QuestionDataByType[T] }
  | { success: false; messages: string[] } {
  const parsed = questionDataSchemas[type].safeParse(data ?? {});
  if (parsed.success)
    return { success: true, data: parsed.data as QuestionDataByType[T] };
  return { success: false, messages: describeDataIssues(parsed.error.issues) };
}

/* -------------------------------------------------------------------------- */
/*                            Portable JSON format                            */
/* -------------------------------------------------------------------------- */

export const PORTABLE_TEST_FORMAT = "pensuma-toets";
export const PORTABLE_TEST_VERSION = 1;

const portableCommon = {
  title: z.string().trim().min(1).max(300),
  prompt: z.string().max(50_000).default(""),
  points: z.number().min(0).max(MAX_POINTS_PER_QUESTION).default(1),
};

export const portableQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...portableCommon,
    type: z.literal("code"),
    data: codeQuestionDataSchema,
  }),
  z.object({
    ...portableCommon,
    type: z.literal("multiple_choice"),
    data: multipleChoiceDataSchema,
  }),
  z.object({
    ...portableCommon,
    type: z.literal("open"),
    data: openQuestionDataSchema,
  }),
]);
export type PortableQuestion = z.infer<typeof portableQuestionSchema>;

export const portableTestSchema = z.object({
  format: z.literal(PORTABLE_TEST_FORMAT).optional(),
  version: z
    .number()
    .int()
    .min(1)
    .max(PORTABLE_TEST_VERSION)
    .default(PORTABLE_TEST_VERSION),
  exportedAt: z.string().optional(),
  test: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).default(""),
    topic: z.string().max(200).nullish(),
  }),
  questions: z.array(portableQuestionSchema).max(MAX_QUESTIONS_PER_TEST),
});
export type PortableTest = z.infer<typeof portableTestSchema>;

/** Parse an exported test (string or object). Dutch messages on failure. */
export function parsePortableTest(
  input: unknown,
):
  | { success: true; data: PortableTest }
  | { success: false; messages: string[] } {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return { success: false, messages: ["Dit is geen geldig JSON-bestand."] };
    }
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("test" in value) ||
    !("questions" in value)
  ) {
    return {
      success: false,
      messages: [
        "Dit bestand is geen Pensuma-toets (verwacht: test en questions).",
      ],
    };
  }
  const parsed = portableTestSchema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, messages: describeDataIssues(parsed.error.issues) };
}

/** Safe file name for a download, e.g. "python-basis-oefentoets.pensuma.json". */
export function portableFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "toets"}.pensuma.json`;
}

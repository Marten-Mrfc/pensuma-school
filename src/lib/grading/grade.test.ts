import { describe, expect, test } from "bun:test";
import type { HarnessAnalysis, HarnessRunRequest, HarnessRunResult } from "@/lib/python/harness";
import { type CodeCheck, type CodeTest, codeCheckSchema, codeTestSchema } from "@/lib/questions/schema";
import {
  buildGradingResult,
  defaultCheckMessage,
  evaluateCheck,
  evaluateFunctionTest,
  evaluateIoTest,
  type GradingExecutor,
  runGrading,
  type TestOutcome,
} from "./grade";

const io = (over: Record<string, unknown>) =>
  codeTestSchema.parse({ id: "t1", kind: "io", ...over }) as Extract<CodeTest, { kind: "io" }>;
const fn = (over: Record<string, unknown>) =>
  codeTestSchema.parse({ id: "f1", kind: "function", ...over }) as Extract<CodeTest, { kind: "function" }>;
const check = (over: Record<string, unknown>) => codeCheckSchema.parse({ id: "c1", ...over }) as CodeCheck;

function run(over: Partial<HarnessRunResult> = {}): HarnessRunResult {
  return {
    stdout: "",
    stderr: "",
    transcript: "",
    segments: [],
    error: null,
    moduleError: null,
    value: null,
    truncated: false,
    ...over,
  };
}
const ok = (over: Partial<HarnessRunResult> = {}): TestOutcome => ({
  kind: "result",
  result: run(over),
  durationMs: 12,
});

const analysis: HarnessAnalysis = {
  ok: true,
  constructs: {
    for_loop: true,
    while_loop: false,
    if_statement: true,
    function_def: true,
    function_call: true,
    import: true,
    list_comprehension: false,
  },
  functionDefs: ["gemiddelde"],
  functionCalls: ["print", "sum", "math.sqrt", "sqrt"],
  imports: ["math", "os.path", "os"],
};

describe("io tests", () => {
  test("pass / fail with feedback", () => {
    const t = io({ stdin: "Mark", expectedOutput: "Hallo Mark" });
    expect(evaluateIoTest(t, ok({ stdout: "Hallo Mark\n" }), 5000).passed).toBe(true);
    const r = evaluateIoTest(t, ok({ stdout: "Hallo Mike\n" }), 5000);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain("Hallo Mike");
    expect(r.actual).toBe("Hallo Mike\n");
    expect(r.stdin).toBe("Mark");
    expect(r.expected).toBe("Hallo Mark");
  });

  test("runtime error fails, even if the output matched", () => {
    const t = io({ expectedOutput: "1" });
    const error = { type: "ValueError", message: "bad", line: 3, traceback: "" };
    const r = evaluateIoTest(t, ok({ stdout: "1\n", error }), 5000);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain("De uitvoer klopt");
    expect(r.feedback).toContain("regel 3");
  });

  test("EOFError feedback is the Dutch harness message", () => {
    const error = {
      type: "EOFError",
      message: "Je programma vraagt vaker om invoer (input) dan er invoer is gegeven.",
      line: 2,
      traceback: "",
    };
    const r = evaluateIoTest(io({ expectedOutput: "x" }), ok({ error }), 5000);
    expect(r.feedback).toContain("vaker om invoer");
  });

  test("timeout", () => {
    const r = evaluateIoTest(io({ expectedOutput: "x" }), { kind: "timeout", durationMs: 5000 }, 5000);
    expect(r.timedOut).toBe(true);
    expect(r.error?.type).toBe("TimeoutError");
    expect(r.feedback).toContain("oneindige lus");
    expect(r.feedback).toContain("5 seconden");
  });
});

describe("function tests", () => {
  const t = fn({ call: "gemiddelde([1, 2, 3])", expected: "2.0" });
  const value = (repr: string, v: unknown) => ({ value: v, repr }) as HarnessRunResult["value"];

  test("pass with int/float equivalence and tolerance", () => {
    const r = evaluateFunctionTest(t, ok({ value: value("2", { t: "int", v: "2" }) }), 5000);
    expect(r.passed).toBe(true);
    expect(r.call).toBe("gemiddelde([1, 2, 3])");
    expect(r.expected).toBe("2.0");
    expect(r.actual).toBe("2");
  });

  test("wrong value", () => {
    const r = evaluateFunctionTest(t, ok({ value: value("2.5", { t: "float", v: 2.5 }) }), 5000);
    expect(r.passed).toBe(false);
    expect(r.feedback).toBe("Je functie gaf `2.5` terug, maar verwacht werd `2.0`.");
  });

  test("print instead of return", () => {
    const r = evaluateFunctionTest(
      t,
      ok({ stdout: "2.0\n", value: value("None", { t: "none" }) }),
      5000,
    );
    expect(r.feedback).toContain("return in plaats van print");
  });

  test("forgot return", () => {
    const r = evaluateFunctionTest(t, ok({ value: value("None", { t: "none" }) }), 5000);
    expect(r.feedback).toContain("Vergeet je return");
  });

  test("type mismatch", () => {
    const r = evaluateFunctionTest(t, ok({ value: value("'2.0'", { t: "str", v: "2.0" }) }), 5000);
    expect(r.feedback).toContain("(str)");
    expect(r.feedback).toContain("(float)");
  });

  test("missing function", () => {
    const error = { type: "NameError", message: "name 'gemiddelde' is not defined", line: null, traceback: "" };
    const r = evaluateFunctionTest(t, ok({ error }), 5000);
    expect(r.feedback).toContain("bestaat niet");
  });

  test("module error before the def is reported", () => {
    const error = { type: "NameError", message: "name 'gemiddelde' is not defined", line: null, traceback: "" };
    const moduleError = { type: "ValueError", message: "x", line: 1, traceback: "" };
    const r = evaluateFunctionTest(t, ok({ error, moduleError }), 5000);
    expect(r.error?.type).toBe("ValueError");
    expect(r.feedback).toContain("voordat de functie");
  });

  test("module error after the def does not fail the test", () => {
    const moduleError = { type: "EOFError", message: "x", line: 5, traceback: "" };
    const r = evaluateFunctionTest(t, ok({ moduleError, value: value("2.0", { t: "float", v: 2 }) }), 5000);
    expect(r.passed).toBe(true);
    expect(r.feedback).toContain("buiten de functie");
  });

  test("invalid expected literal is reported, not crashed", () => {
    const bad = fn({ call: "f()", expected: "Hallo" });
    const r = evaluateFunctionTest(bad, ok({ value: value("1", { t: "int", v: "1" }) }), 5000);
    expect(r.passed).toBe(false);
    expect(r.error?.type).toBe("InternalError");
    expect(r.feedback).toContain("geen geldige Python-waarde");
  });

  test("nested difference", () => {
    const t2 = fn({ call: "f()", expected: "[1, 2, 3]" });
    const r = evaluateFunctionTest(
      t2,
      ok({
        value: value("[1, 2, 4]", {
          t: "list",
          v: [
            { t: "int", v: "1" },
            { t: "int", v: "2" },
            { t: "int", v: "4" },
          ],
        }),
      }),
      5000,
    );
    expect(r.feedback).toContain("[2]");
  });
});

describe("checks", () => {
  test("requires / forbids with values", () => {
    expect(evaluateCheck(check({ kind: "requires", construct: "for_loop" }), analysis).passed).toBe(true);
    expect(evaluateCheck(check({ kind: "requires", construct: "while_loop" }), analysis).passed).toBe(false);
    expect(evaluateCheck(check({ kind: "forbids", construct: "while_loop" }), analysis).passed).toBe(true);
    expect(evaluateCheck(check({ kind: "forbids", construct: "function_call", value: "sum" }), analysis).passed).toBe(false);
    expect(evaluateCheck(check({ kind: "forbids", construct: "function_call", value: "sum()" }), analysis).passed).toBe(false);
    expect(evaluateCheck(check({ kind: "requires", construct: "function_call", value: "sqrt" }), analysis).passed).toBe(true);
    expect(evaluateCheck(check({ kind: "requires", construct: "function_def", value: "gemiddelde" }), analysis).passed).toBe(true);
    expect(evaluateCheck(check({ kind: "requires", construct: "function_def", value: "som" }), analysis).passed).toBe(false);
    expect(evaluateCheck(check({ kind: "forbids", construct: "import", value: "os" }), analysis).passed).toBe(false);
    expect(evaluateCheck(check({ kind: "requires", construct: "import", value: "random" }), analysis).passed).toBe(false);
  });

  test("messages", () => {
    expect(defaultCheckMessage(check({ kind: "requires", construct: "for_loop" }))).toBe("Je moet een for-lus gebruiken.");
    expect(defaultCheckMessage(check({ kind: "forbids", construct: "for_loop" }))).toBe("Je mag geen for-lus gebruiken.");
    expect(defaultCheckMessage(check({ kind: "forbids", construct: "function_call", value: "sum" }))).toBe(
      "Je mag `sum()` niet gebruiken.",
    );
    expect(evaluateCheck(check({ kind: "requires", construct: "for_loop", message: "Gebruik for!" }), analysis).message).toBe(
      "Gebruik for!",
    );
  });

  test("syntax error fails every check", () => {
    const bad: HarnessAnalysis = { ok: false, error: { type: "SyntaxError", message: "x", line: 1, traceback: "" } };
    expect(evaluateCheck(check({ kind: "forbids", construct: "while_loop" }), bad).passed).toBe(false);
  });
});

describe("buildGradingResult", () => {
  const tests = [io({ id: "a", expectedOutput: "1", weight: 2 }), io({ id: "b", expectedOutput: "2", hidden: true })];
  const checks = [check({ id: "c", kind: "requires", construct: "for_loop" })];

  test("fraction over tests and checks", () => {
    const outcomes = new Map<string, TestOutcome>([
      ["a", ok({ stdout: "1" })],
      ["b", ok({ stdout: "3" })],
    ]);
    const r = buildGradingResult({ tests, checks, analysis, outcomes, timeLimitMs: 5000 });
    expect(r.passedWeight).toBe(3);
    expect(r.totalWeight).toBe(4);
    expect(r.fraction).toBe(0.75);
    expect(r.status).toBe("ok");
  });

  test("status priority", () => {
    const err = { type: "ValueError", message: "", line: 1, traceback: "" };
    const runtime = buildGradingResult({
      tests,
      checks,
      analysis,
      outcomes: new Map([
        ["a", ok({ error: err })],
        ["b", ok({ stdout: "2" })],
      ]),
      timeLimitMs: 5000,
    });
    expect(runtime.status).toBe("runtime_error");
    const timeout = buildGradingResult({
      tests,
      checks,
      analysis,
      outcomes: new Map<string, TestOutcome>([
        ["a", ok({ error: err })],
        ["b", { kind: "timeout", durationMs: 5000 }],
      ]),
      timeLimitMs: 5000,
    });
    expect(timeout.status).toBe("timeout");
  });

  test("syntax error", () => {
    const syntax = { type: "SyntaxError", message: "'(' was never closed", line: 1, traceback: "" };
    const r = buildGradingResult({
      tests,
      checks,
      analysis: { ok: false, error: syntax },
      outcomes: new Map(),
      timeLimitMs: 5000,
    });
    expect(r.status).toBe("syntax_error");
    expect(r.error).toEqual(syntax);
    expect(r.fraction).toBe(0);
    expect(r.tests.every((t) => !t.passed && t.feedback?.includes("syntaxfout"))).toBe(true);
  });

  test("no tests and no checks → fraction 0", () => {
    const r = buildGradingResult({ tests: [], checks: [], analysis, outcomes: new Map(), timeLimitMs: 5000 });
    expect(r.fraction).toBe(0);
    expect(r.totalWeight).toBe(0);
  });
});

describe("runGrading", () => {
  test("expected outputs and values never reach the executor", async () => {
    const SECRET_OUT = "GEHEIM-UITVOER-1234";
    const SECRET_VAL = "'GEHEIM-WAARDE-5678'";
    const seen: string[] = [];
    const executor: GradingExecutor = {
      async analyze(code) {
        seen.push(JSON.stringify({ analyze: code }));
        return analysis;
      },
      async run(request: HarnessRunRequest, limit: number) {
        seen.push(JSON.stringify({ request, limit }));
        return request.mode === "function"
          ? ok({ value: { value: { t: "str", v: "x" }, repr: "'x'" } })
          : ok({ stdout: "nope" });
      },
    };
    const r = await runGrading(
      {
        code: "print('hi')",
        tests: [
          io({ id: "a", stdin: "in", expectedOutput: SECRET_OUT, hidden: true }),
          fn({ id: "b", call: "f()", expected: SECRET_VAL, hidden: true }),
        ],
        checks: [],
        timeLimitMs: 2000,
      },
      executor,
    );
    expect(r.tests).toHaveLength(2);
    const all = seen.join("\n");
    expect(all).not.toContain("GEHEIM");
    expect(all).toContain('"call":"f()"');
    expect(all).toContain('"stdin":"in"');
  });

  test("analysis failure → internal_error; executor throw → internal error per test", async () => {
    const broken: GradingExecutor = {
      analyze: async () => {
        throw new Error("boom");
      },
      run: async () => ok(),
    };
    const r = await runGrading({ code: "", tests: [io({})], checks: [], timeLimitMs: 1000 }, broken);
    expect(r.status).toBe("internal_error");

    const flaky: GradingExecutor = {
      analyze: async () => analysis,
      run: async () => {
        throw new Error("spawn failed");
      },
    };
    const r2 = await runGrading({ code: "", tests: [io({})], checks: [], timeLimitMs: 1000 }, flaky);
    expect(r2.status).toBe("internal_error");
    expect(r2.tests[0].error?.type).toBe("InternalError");
  });

  test("total time limit stops starting new tests", async () => {
    const slow: GradingExecutor = {
      analyze: async () => analysis,
      run: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return ok({ stdout: "x" });
      },
    };
    const tests = [io({ id: "1" }), io({ id: "2" }), io({ id: "3" })];
    const r = await runGrading({ code: "", tests, checks: [], timeLimitMs: 1000 }, slow, {
      totalTimeLimitMs: 10,
    });
    expect(r.tests[0].timedOut).toBe(false);
    expect(r.tests[2].timedOut).toBe(true);
  });
});

/**
 * The sandbox (server child process or browser worker) is untrusted: its
 * messages are shape-checked, coerced and capped before the grader uses
 * them. These cases feed hostile messages through the sanitizers.
 */
import { describe, expect, test } from "bun:test";
import {
  sanitizeAnalysis,
  sanitizePythonError,
  sanitizeRunResult,
} from "./protocol";

const MB = 1024 * 1024;

describe("sanitizePythonError", () => {
  test("non-objects give null", () => {
    for (const bad of [null, undefined, "boom", 42, [], true]) {
      expect(sanitizePythonError(bad)).toBeNull();
    }
  });

  test("drops extra keys and coerces types", () => {
    const out = sanitizePythonError({
      type: 123,
      message: { evil: true },
      line: "7",
      traceback: ["a"],
      extra: "leak",
      __proto__: { polluted: true },
    });
    expect(out).toEqual({
      type: "Error",
      message: "",
      line: null,
      traceback: "",
    });
    expect(Object.keys(out ?? {}).sort()).toEqual([
      "line",
      "message",
      "traceback",
      "type",
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("line must be a positive integer", () => {
    expect(sanitizePythonError({ line: 3 })?.line).toBe(3);
    for (const line of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sanitizePythonError({ line })?.line).toBeNull();
    }
  });

  test("caps lengths", () => {
    const out = sanitizePythonError({
      type: "T".repeat(1000),
      message: "m".repeat(50_000),
      traceback: "t".repeat(50_000),
    });
    expect(out?.type.length).toBe(200);
    expect(out?.message.length).toBe(10_000);
    expect(out?.traceback.length).toBe(20_000);
  });
});

describe("sanitizeRunResult", () => {
  test("internal errors and non-objects give null", () => {
    expect(sanitizeRunResult(null)).toBeNull();
    expect(sanitizeRunResult([])).toBeNull();
    expect(sanitizeRunResult({ internalError: "x", stdout: "hoi" })).toBeNull();
  });

  test("keeps only known fields with the right types", () => {
    const out = sanitizeRunResult({
      stdout: "Hallo\n",
      stderr: 5,
      transcript: "Naam? Hallo\n",
      segments: [
        { kind: "prompt", text: "Naam? " },
        { kind: "evil", text: "x" },
        { kind: "stdout", text: 42 },
        "rubbish",
        null,
      ],
      error: "not an object",
      moduleError: { type: "NameError", message: "x", line: 1 },
      value: { value: { t: "int", v: "42" }, repr: "42", extra: 1 },
      truncated: "yes",
      secret: "CANARY",
      __proto__: { hacked: 1 },
    });
    expect(out).toEqual({
      stdout: "Hallo\n",
      stderr: "",
      transcript: "Naam? Hallo\n",
      segments: [
        { kind: "prompt", text: "Naam? " },
        { kind: "stdout", text: "" },
      ],
      error: null,
      moduleError: {
        type: "NameError",
        message: "x",
        line: 1,
        traceback: "",
      },
      value: { value: { t: "int", v: "42" }, repr: "42" },
      truncated: false,
    });
    expect(JSON.stringify(out)).not.toContain("CANARY");
  });

  test("caps output at 1 MB", () => {
    const out = sanitizeRunResult({
      stdout: "x".repeat(2 * MB),
      stderr: "",
      transcript: "",
    });
    expect(out?.stdout.length).toBe(MB);
  });

  test("hostile return values are coerced", () => {
    const value = (v: unknown) =>
      sanitizeRunResult({ value: { value: v, repr: "r" } })?.value?.value;
    expect(value({ t: "int", v: "12x" })).toEqual({
      t: "other",
      type: "int",
      repr: "12x",
    });
    expect(value({ t: "float", v: Number.NaN })).toEqual({
      t: "other",
      type: "float",
      repr: "?",
    });
    expect(value({ t: "float", v: "inf" })).toEqual({ t: "float", v: "inf" });
    expect(value({ t: "bool", v: "true" })).toEqual({ t: "bool", v: false });
    expect(value({ t: "list", v: "not a list" })).toEqual({ t: "list", v: [] });
    expect(
      value({ t: "dict", v: [[{ t: "str", v: "k" }], "x", [1, 2, 3]] }),
    ).toEqual({ t: "dict", v: [] });
    expect(value({ t: "weird", type: { x: 1 }, repr: 5 })).toEqual({
      t: "other",
      type: "object",
      repr: "",
    });
  });

  test("deeply nested values are cut off", () => {
    let nested: unknown = { t: "none" };
    for (let i = 0; i < 200; i++) nested = { t: "list", v: [nested] };
    const out = sanitizeRunResult({ value: { value: nested, repr: "" } });
    expect(JSON.stringify(out)).toContain('"repr":"..."');
  });
});

describe("sanitizeAnalysis", () => {
  test("internal errors and malformed messages give null", () => {
    expect(sanitizeAnalysis(null)).toBeNull();
    expect(sanitizeAnalysis({ internalError: "x" })).toBeNull();
    expect(sanitizeAnalysis({ ok: "yes", constructs: {} })).toBeNull();
    expect(sanitizeAnalysis({ ok: true })).toBeNull();
    expect(sanitizeAnalysis({ ok: false, error: "x" })).toBeNull();
  });

  test("a syntax error is passed on sanitised", () => {
    expect(
      sanitizeAnalysis({
        ok: false,
        error: { type: "SyntaxError", message: "invalid", line: 2, x: 1 },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: "SyntaxError",
        message: "invalid",
        line: 2,
        traceback: "",
      },
    });
  });

  test("constructs are strict booleans and lists are capped", () => {
    const out = sanitizeAnalysis({
      ok: true,
      constructs: {
        for_loop: true,
        while_loop: "true",
        import: 1,
        bogus: true,
      },
      functionDefs: ["f", 3, null, "g".repeat(1000)],
      functionCalls: "print",
      imports: Array.from({ length: 20_000 }, (_, i) => `m${i}`),
    });
    expect(out).not.toBeNull();
    if (!out || !out.ok) throw new Error("expected ok");
    expect(out.constructs).toEqual({
      for_loop: true,
      while_loop: false,
      if_statement: false,
      function_def: false,
      function_call: false,
      import: false,
      list_comprehension: false,
    });
    expect(out.functionDefs).toEqual(["f", "g".repeat(500)]);
    expect(out.functionCalls).toEqual([]);
    expect(out.imports).toHaveLength(10_000);
  });
});

/**
 * Validation of results coming back from an interpreter (server sandbox or
 * browser worker). The server treats the sandbox as untrusted: everything is
 * shape-checked, coerced and size-capped here before the grader uses it.
 * Isomorphic (no Node/browser APIs).
 */
import type { PyValue } from "@/lib/grading/pyvalue";
import type { PythonError } from "@/lib/questions/schema";
import type { HarnessAnalysis, HarnessRunResult, HarnessValue } from "./harness";
import type { TranscriptSegment } from "./types";

const MAX_TEXT = 1024 * 1024;
const MAX_SEGMENTS = 20_000;
const MAX_LIST = 10_000;

type Json = unknown;

function isObj(x: Json): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function str(x: Json, max = MAX_TEXT): string {
  return typeof x === "string" ? (x.length > max ? x.slice(0, max) : x) : "";
}

export function sanitizePythonError(x: Json): PythonError | null {
  if (!isObj(x)) return null;
  const line = typeof x.line === "number" && Number.isInteger(x.line) && x.line > 0 ? x.line : null;
  return {
    type: str(x.type, 200) || "Error",
    message: str(x.message, 10_000),
    line,
    traceback: str(x.traceback, 20_000),
  };
}

function sanitizePyValue(x: Json, depth = 0, budget = { n: MAX_LIST * 2 }): PyValue {
  budget.n--;
  if (!isObj(x) || depth > 60 || budget.n < 0) return { t: "other", type: "?", repr: "..." };
  switch (x.t) {
    case "none":
      return { t: "none" };
    case "bool":
      return { t: "bool", v: x.v === true };
    case "int":
      return typeof x.v === "string" && /^-?\d{1,5000}$/.test(x.v)
        ? { t: "int", v: x.v }
        : { t: "other", type: "int", repr: str(x.v, 100) };
    case "float":
      if (typeof x.v === "number" && Number.isFinite(x.v)) return { t: "float", v: x.v };
      if (x.v === "inf" || x.v === "-inf" || x.v === "nan") return { t: "float", v: x.v };
      return { t: "other", type: "float", repr: "?" };
    case "str":
      return { t: "str", v: str(x.v) };
    case "bytes":
      return { t: "bytes", v: str(x.v) };
    case "list":
    case "tuple":
    case "set":
    case "frozenset": {
      const items = Array.isArray(x.v) ? x.v.slice(0, MAX_LIST) : [];
      return { t: x.t, v: items.map((i) => sanitizePyValue(i, depth + 1, budget)) };
    }
    case "dict": {
      const items = Array.isArray(x.v) ? x.v.slice(0, MAX_LIST) : [];
      return {
        t: "dict",
        v: items
          .filter((p): p is unknown[] => Array.isArray(p) && p.length === 2)
          .map(
            (p) =>
              [sanitizePyValue(p[0], depth + 1, budget), sanitizePyValue(p[1], depth + 1, budget)] as [
                PyValue,
                PyValue,
              ],
          ),
      };
    }
    default:
      return { t: "other", type: str(x.type, 100) || "object", repr: str(x.repr, 2000) };
  }
}

function sanitizeValue(x: Json): HarnessValue | null {
  if (!isObj(x)) return null;
  return { value: sanitizePyValue(x.value), repr: str(x.repr, 4000) };
}

const SEGMENT_KINDS = new Set(["stdout", "stderr", "prompt", "input"]);

function sanitizeSegments(x: Json): TranscriptSegment[] {
  if (!Array.isArray(x)) return [];
  const out: TranscriptSegment[] = [];
  for (const s of x.slice(0, MAX_SEGMENTS)) {
    if (isObj(s) && typeof s.kind === "string" && SEGMENT_KINDS.has(s.kind)) {
      out.push({ kind: s.kind as TranscriptSegment["kind"], text: str(s.text) });
    }
  }
  return out;
}

/** Returns null when the result is unusable (e.g. a harness internal error). */
export function sanitizeRunResult(x: Json): HarnessRunResult | null {
  if (!isObj(x) || "internalError" in x) return null;
  return {
    stdout: str(x.stdout),
    stderr: str(x.stderr),
    transcript: str(x.transcript),
    segments: sanitizeSegments(x.segments),
    error: sanitizePythonError(x.error),
    moduleError: sanitizePythonError(x.moduleError),
    value: sanitizeValue(x.value),
    truncated: x.truncated === true,
  };
}

function strList(x: Json): string[] {
  return Array.isArray(x)
    ? x.filter((s): s is string => typeof s === "string").slice(0, MAX_LIST).map((s) => s.slice(0, 500))
    : [];
}

export function sanitizeAnalysis(x: Json): HarnessAnalysis | null {
  if (!isObj(x) || "internalError" in x) return null;
  if (x.ok === false) {
    const error = sanitizePythonError(x.error);
    return error ? { ok: false, error } : null;
  }
  if (x.ok !== true || !isObj(x.constructs)) return null;
  const c = x.constructs;
  return {
    ok: true,
    constructs: {
      for_loop: c.for_loop === true,
      while_loop: c.while_loop === true,
      if_statement: c.if_statement === true,
      function_def: c.function_def === true,
      function_call: c.function_call === true,
      import: c.import === true,
      list_comprehension: c.list_comprehension === true,
    },
    functionDefs: strList(x.functionDefs),
    functionCalls: strList(x.functionCalls),
    imports: strList(x.imports),
  };
}

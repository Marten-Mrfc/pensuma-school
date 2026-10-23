/**
 * Regular-expression tests with a time limit, for the "regex" match mode.
 *
 * The pattern comes from the teacher, the text is the student's output.
 * JavaScript's backtracking engine has no time limit, so a pattern with
 * nested quantifiers such as `^(\w+\s?)+$` can run for hours on 40
 * characters of crafted output, and grading runs inside the Next.js server
 * process: one such test would freeze every request.
 *
 * On the server (Node) the test therefore runs in a `node:vm` context with a
 * timeout. `process.getBuiltinModule` loads `node:vm` at run time, so this
 * module stays isomorphic: bundlers never see a Node import, and in the
 * browser (the student's own self-test on their own output) the regex runs
 * directly.
 */
import type { Context, Script } from "node:vm";

/** true / false, or "timeout" when the pattern took longer than the limit. */
export type RegexTester = (
  pattern: string,
  flags: string,
  text: string,
) => boolean | "timeout";

/** Time limit for one regex test on the server. */
export const REGEX_TIME_LIMIT_MS = 250;

type VmModule = typeof import("node:vm");
type GuardState = { context: Context; script: Script };

let state: GuardState | null | undefined;

function loadGuard(): GuardState | null {
  if (state !== undefined) return state;
  state = null;
  try {
    const proc = (
      globalThis as {
        process?: { getBuiltinModule?: (id: string) => unknown };
      }
    ).process;
    const vm = proc?.getBuiltinModule?.("node:vm") as VmModule | undefined;
    if (vm && typeof vm.createContext === "function") {
      state = {
        context: vm.createContext({}),
        script: new vm.Script("new RegExp(p, f).test(t)"),
      };
    }
  } catch {
    state = null;
  }
  return state;
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}

/**
 * Test `text` against `new RegExp(pattern, flags)`, stopping after
 * `timeoutMs` on the server. Throws for an invalid pattern (callers check
 * that first).
 */
export function guardedRegexTest(
  pattern: string,
  flags: string,
  text: string,
  timeoutMs: number = REGEX_TIME_LIMIT_MS,
): boolean | "timeout" {
  const guard = loadGuard();
  if (!guard) return new RegExp(pattern, flags).test(text);
  const scope = guard.context as Record<string, unknown>;
  scope.p = pattern;
  scope.f = flags;
  scope.t = text;
  try {
    return (
      guard.script.runInContext(guard.context, { timeout: timeoutMs }) === true
    );
  } catch (error) {
    if (isTimeout(error)) return "timeout";
    throw error;
  } finally {
    scope.p = undefined;
    scope.f = undefined;
    scope.t = undefined;
  }
}

/* -------------------------------------------------------------------------- */
/*                         Authoring hint: slow patterns                       */
/* -------------------------------------------------------------------------- */

type Quantifier = { many: boolean; length: number };

function quantifierAt(pattern: string, index: number): Quantifier | null {
  const c = pattern[index];
  if (c === "+" || c === "*") return { many: true, length: 1 };
  if (c === "{") {
    const m = /^\{(\d*)(,?)(\d*)\}/.exec(pattern.slice(index));
    if (m && (m[1] || m[3])) {
      const unbounded = m[2] === "," && m[3] === "";
      return {
        many: unbounded || Number(m[3] || m[1]) > 1,
        length: m[0].length,
      };
    }
  }
  return null;
}

const PLAIN = (ch: string | undefined) =>
  ch !== undefined && !/[\\[\](){}.*+?^$|]/.test(ch);

/**
 * Does the group body start or end with a fixed literal character, as in
 * `( \w+)*` or `(\d+,)*`? Then the repetitions can't overlap much and the
 * pattern is usually fast.
 */
function hasLiteralEdge(content: string): boolean {
  const body = content.replace(/^\?(?::|=|!|<=|<!|<[A-Za-z_]\w*>)/, "");
  if (body.includes("|") || body.length === 0) return false;
  const startsLiteral =
    (PLAIN(body[0]) && !/[*+?{]/.test(body[1] ?? "")) ||
    (body[0] === "\\" &&
      /[^A-Za-z0-9]/.test(body[1] ?? "a") &&
      !/[*+?{]/.test(body[2] ?? ""));
  const n = body.length;
  const endsLiteral =
    (PLAIN(body[n - 1]) && body[n - 2] !== "\\") ||
    (body[n - 2] === "\\" &&
      /[^A-Za-z0-9]/.test(body[n - 1]) &&
      body[n - 3] !== "\\");
  return startsLiteral || endsLiteral;
}

/**
 * Heuristic for the question editor: does the pattern repeat a group that
 * itself repeats something, like `(\w+)+` or `^(\d+\s*)*$`? Such patterns
 * can backtrack for a very long time on unlucky output (the grader then
 * stops them and fails the test). Not a proof either way.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  const stack: { start: number; repeats: boolean }[] = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") {
      i++;
      if (pattern[i] === "^") i++;
      if (pattern[i] === "]") i++;
      while (i < pattern.length && pattern[i] !== "]") {
        if (pattern[i] === "\\") i++;
        i++;
      }
      i++;
      const q = quantifierAt(pattern, i);
      if (q) {
        if (q.many && stack.length > 0) stack[stack.length - 1].repeats = true;
        i += q.length;
      }
      continue;
    }
    if (c === "(") {
      stack.push({ start: i, repeats: false });
      i++;
      continue;
    }
    if (c === ")") {
      const group = stack.pop();
      const content = group ? pattern.slice(group.start + 1, i) : "";
      i++;
      if (!group) continue;
      const q = quantifierAt(pattern, i);
      if (q?.many && group.repeats && !hasLiteralEdge(content)) return true;
      if ((group.repeats || q?.many) && stack.length > 0)
        stack[stack.length - 1].repeats = true;
      if (q) i += q.length;
      continue;
    }
    const q = quantifierAt(pattern, i);
    if (q) {
      if (q.many && stack.length > 0) stack[stack.length - 1].repeats = true;
      i += q.length;
      continue;
    }
    i++;
  }
  return false;
}

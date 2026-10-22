/**
 * Output and value comparison for code tests (isomorphic, pure).
 *
 * All modes compare the program's CLEAN stdout: `input()` prompts are never
 * part of it. Common normalization for every mode: "\r\n" → "\n", trailing
 * whitespace per line and trailing empty lines are ignored.
 *
 * - exact:    lines must match exactly (`ignoreCase` applies).
 * - flexible: compares words and numbers only, so case (when `ignoreCase`,
 *             the default), spacing and punctuation don't matter. Numbers
 *             compare by value ("108.50" = "108.5"). Each expected line must
 *             appear, in order, inside an output line, with token boundaries
 *             ("5" never matches inside "15"); extra text around it (labels
 *             such as "Antwoord:") is fine. Extra output lines are allowed
 *             only when they look like a prompt or heading (they end with
 *             ":" or "?", e.g. `print("Geef een getal:")`) or contain no
 *             words/numbers at all; any other extra line fails the test, so
 *             printing *all* numbers doesn't pass "print the even numbers".
 * - contains: every expected line must appear (as whole words/numbers)
 *             somewhere in the output, in any order.
 * - numbers:  only the numbers are compared, in order and count, with
 *             `tolerance`. Understands "108.50", "1e3", "-5" and Dutch
 *             decimal commas ("108,50").
 * - regex:    `expected` is a JavaScript regular expression, searched in
 *             the output (flags "m", plus "i" when `ignoreCase`).
 */
import type { OutputMatchMode } from "@/lib/questions/schema";
import { type PyValue, pyRepr, pyTypeName } from "./pyvalue";

export type OutputCompareOptions = {
  match: OutputMatchMode;
  ignoreCase: boolean;
  tolerance: number;
};

export type OutputCompareResult = {
  passed: boolean;
  /** Short Dutch explanation when the test failed. */
  feedback: string | null;
};

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** Split into lines: CRLF → LF, trailing whitespace and trailing empty lines removed. */
export function normalizeLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Shorten text for feedback messages; shows invisible differences. */
export function quote(text: string, max = 100): string {
  const t = text.length > max ? `${text.slice(0, max)}…` : text;
  return `\`${t.replace(/`/g, "'")}\``;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function fold(s: string, ignoreCase: boolean): string {
  return ignoreCase ? s.toLocaleLowerCase("nl") : s;
}

/* ------------------------------ Tokens (flexible) ------------------------- */

type Token = { num: number | null; text: string };

const TOKEN_RE =
  /(?<![\p{L}\p{N}_.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\p{L}\p{N}_])|[\p{L}\p{N}_]+/gu;

/** Words and numbers of a line (punctuation and spacing dropped). */
export function tokenize(line: string, ignoreCase: boolean): Token[] {
  const out: Token[] = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const text = m[0];
    const n = /^-?\d/.test(text) ? Number(text) : Number.NaN;
    out.push(
      Number.isFinite(n)
        ? { num: n, text }
        : { num: null, text: fold(text, ignoreCase) },
    );
  }
  return out;
}

function numbersEqual(a: number, b: number, tolerance: number): boolean {
  if (a === b) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= tolerance + 1e-9 * scale;
}

function tokenEqual(a: Token, b: Token): boolean {
  if (a.num !== null && b.num !== null) return numbersEqual(a.num, b.num, 0);
  return a.text === b.text;
}

/** Does `hay` contain `needle` as a contiguous token run? */
function containsTokens(hay: Token[], needle: Token[]): boolean {
  if (needle.length === 0) return true;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (!tokenEqual(hay[i + j], needle[j])) continue outer;
    }
    return true;
  }
  return false;
}

/** Extra lines that are fine in flexible mode: prompts/headings and decoration. */
function isTolerableExtraLine(raw: string, tokens: Token[]): boolean {
  if (tokens.length === 0) return true;
  return /[:?]\s*$/u.test(raw);
}

/* ----------------------------- Numbers (numbers) -------------------------- */

export type FoundNumber = { value: number; text: string };

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}
function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}_]/u.test(c);
}

/**
 * Find all numbers in a text: integers, decimals with "." or a Dutch ",",
 * exponents ("1e3") and signs ("-5"). "1,2,3" (no spaces) is three numbers.
 */
export function extractNumbers(text: string): FoundNumber[] {
  const out: FoundNumber[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    let start = -1;
    if (isDigit(c)) start = i;
    else if (
      (c === "-" || c === "+" || c === "−") &&
      (isDigit(text[i + 1]) ||
        ((text[i + 1] === "." || text[i + 1] === ",") &&
          isDigit(text[i + 2]))) &&
      !isWordChar(text[i - 1]) &&
      text[i - 1] !== ")"
    )
      start = i;
    else if (
      (c === "." || c === ",") &&
      isDigit(text[i + 1]) &&
      !isWordChar(text[i - 1])
    )
      start = i;
    if (start < 0) {
      i++;
      continue;
    }
    let j = start;
    let sign = "";
    if (text[j] === "-" || text[j] === "+" || text[j] === "−") {
      sign = text[j] === "+" ? "" : "-";
      j++;
    }
    let intPart = "";
    while (isDigit(text[j])) intPart += text[j++];
    let frac = "";
    if ((text[j] === "." || text[j] === ",") && isDigit(text[j + 1])) {
      // "1,2,3": a comma chain without spaces is a list, not a decimal.
      let k = j + 1;
      while (isDigit(text[k])) k++;
      const afterChainComma =
        text[start - 1] === "," && isDigit(text[start - 2]);
      const isChain =
        text[j] === "," &&
        (afterChainComma || (text[k] === "," && isDigit(text[k + 1])));
      if (!isChain) {
        j++;
        while (isDigit(text[j])) frac += text[j++];
      }
    }
    let exp = "";
    if ((text[j] === "e" || text[j] === "E") && (intPart || frac)) {
      let k = j + 1;
      let e = "e";
      if (text[k] === "+" || text[k] === "-") e += text[k++];
      if (isDigit(text[k])) {
        while (isDigit(text[k])) e += text[k++];
        if (!isWordChar(text[k])) {
          exp = e;
          j = k;
        }
      }
    }
    if (!intPart && !frac) {
      i = start + 1;
      continue;
    }
    const value = Number(
      `${sign}${intPart || "0"}${frac ? `.${frac}` : ""}${exp}`,
    );
    if (Number.isFinite(value)) out.push({ value, text: text.slice(start, j) });
    i = j;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                Output modes                                */
/* -------------------------------------------------------------------------- */

function compareExact(
  actual: string,
  expected: string,
  ignoreCase: boolean,
): OutputCompareResult {
  const a = normalizeLines(actual);
  const e = normalizeLines(expected);
  const same = (x: string, y: string) =>
    fold(x, ignoreCase) === fold(y, ignoreCase);
  if (a.length === e.length && a.every((l, i) => same(l, e[i]))) {
    return { passed: true, feedback: null };
  }
  if (a.length === 0) {
    return {
      passed: false,
      feedback: `Je programma printte niets. Verwacht: ${quote(e[0] ?? "")}${e.length > 1 ? " …" : ""}.`,
    };
  }
  const n = Math.min(a.length, e.length);
  for (let i = 0; i < n; i++) {
    if (!same(a[i], e[i])) {
      let hint = "";
      const squash = (s: string) => s.replace(/\s+/g, " ").trim();
      if (fold(squash(a[i]), ignoreCase) === fold(squash(e[i]), ignoreCase)) {
        hint = " Let op de spaties.";
      } else if (!ignoreCase && a[i].toLowerCase() === e[i].toLowerCase()) {
        hint = " Let op hoofdletters en kleine letters.";
      }
      return {
        passed: false,
        feedback: `Regel ${i + 1}: verwacht ${quote(e[i])}, maar je programma printte ${quote(a[i])}.${hint}`,
      };
    }
  }
  if (a.length < e.length) {
    return {
      passed: false,
      feedback: `Je programma printte ${plural(a.length, "regel", "regels")}, maar er werden er ${e.length} verwacht. Regel ${a.length + 1} ontbreekt: ${quote(e[a.length])}.`,
    };
  }
  return {
    passed: false,
    feedback: `Je programma printte meer regels dan verwacht (${a.length} in plaats van ${e.length}). Extra regel ${e.length + 1}: ${quote(a[e.length])}.`,
  };
}

function compareFlexible(
  actual: string,
  expected: string,
  ignoreCase: boolean,
): OutputCompareResult {
  const aRaw = normalizeLines(actual);
  const aTok = aRaw.map((l) => tokenize(l, ignoreCase));
  const eRaw: string[] = [];
  const eTok: Token[][] = [];
  for (const line of normalizeLines(expected)) {
    const t = tokenize(line, ignoreCase);
    if (t.length > 0) {
      eRaw.push(line.trim());
      eTok.push(t);
    }
  }
  const tolerable = aRaw.map((l, j) => isTolerableExtraLine(l, aTok[j]));
  const A = aRaw.length;
  const E = eTok.length;

  // can[i][j]: expected lines i.. can be matched in actual lines j.., with
  // every skipped actual line tolerable. Filled backwards.
  let passed: boolean;
  if ((E + 1) * (A + 1) <= 4_000_000) {
    const W = A + 1;
    const can = new Uint8Array((E + 1) * W);
    can[E * W + A] = 1;
    for (let j = A - 1; j >= 0; j--)
      can[E * W + j] = tolerable[j] && can[E * W + j + 1] ? 1 : 0;
    for (let i = E - 1; i >= 0; i--) {
      for (let j = A - 1; j >= 0; j--) {
        can[i * W + j] =
          (tolerable[j] && can[i * W + j + 1]) ||
          (can[(i + 1) * W + j + 1] && containsTokens(aTok[j], eTok[i]))
            ? 1
            : 0;
      }
    }
    passed = can[0] === 1;
  } else {
    passed = false; // fall through to the greedy check below
  }

  // Greedy assignment (earliest match): used for very large outputs and to
  // explain a failure.
  const matched = new Array<boolean>(A).fill(false);
  let j = 0;
  let missing = -1;
  for (let i = 0; i < E; i++) {
    let k = j;
    while (k < A && !containsTokens(aTok[k], eTok[i])) k++;
    if (k >= A) {
      missing = i;
      break;
    }
    matched[k] = true;
    j = k + 1;
  }
  if (
    !passed &&
    missing < 0 &&
    aRaw.every((_, idx) => matched[idx] || tolerable[idx])
  ) {
    passed = true;
  }
  if (passed) return { passed: true, feedback: null };

  if (aRaw.every((l) => l.trim() === "")) {
    return {
      passed: false,
      feedback: `Je programma printte niets. Verwacht: ${quote(eRaw[0] ?? "")}${E > 1 ? " …" : ""}.`,
    };
  }
  if (missing >= 0) {
    // Show the output line that was probably meant: the first unmatched,
    // non-prompt line after the last match.
    let candidate = -1;
    for (let k = j; k < A; k++) {
      if (!matched[k] && !tolerable[k]) {
        candidate = k;
        break;
      }
    }
    if (candidate >= 0) {
      return {
        passed: false,
        feedback: `Regel ${candidate + 1}: verwacht ${quote(eRaw[missing])}, maar je programma printte ${quote(aRaw[candidate].trim())}.`,
      };
    }
    return {
      passed: false,
      feedback:
        missing > 0
          ? `Na ${quote(eRaw[missing - 1])} werd nog ${quote(eRaw[missing])} verwacht, maar die regel kwam niet in de uitvoer voor.`
          : `Je programma printte geen regel met ${quote(eRaw[missing])}.`,
    };
  }
  const extra = aRaw.findIndex((_, idx) => !matched[idx] && !tolerable[idx]);
  return {
    passed: false,
    feedback: `Je programma printte een regel die niet verwacht werd (regel ${extra + 1}): ${quote(aRaw[extra].trim())}.`,
  };
}

function compareContains(
  actual: string,
  expected: string,
  ignoreCase: boolean,
): OutputCompareResult {
  const aTok = normalizeLines(actual).map((l) => tokenize(l, ignoreCase));
  for (const line of normalizeLines(expected)) {
    const t = tokenize(line, ignoreCase);
    if (t.length === 0) continue;
    if (!aTok.some((a) => containsTokens(a, t))) {
      return {
        passed: false,
        feedback: `De uitvoer van je programma bevat ${quote(line.trim())} niet.`,
      };
    }
  }
  return { passed: true, feedback: null };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
}

function compareNumbers(
  actual: string,
  expected: string,
  tolerance: number,
): OutputCompareResult {
  const a = extractNumbers(actual);
  const e = extractNumbers(expected);
  for (let i = 0; i < Math.min(a.length, e.length); i++) {
    if (!numbersEqual(a[i].value, e[i].value, tolerance)) {
      const which = e.length > 1 ? `Getal ${i + 1}: verwacht` : "Verwacht";
      return {
        passed: false,
        feedback: `${which} ${formatNumber(e[i].value)}, maar je programma printte ${a[i].text}.${tolerance > 0 ? ` (Een verschil tot ${formatNumber(tolerance)} mag.)` : ""}`,
      };
    }
  }
  if (a.length === e.length) return { passed: true, feedback: null };
  if (a.length === 0) {
    return {
      passed: false,
      feedback: `Je programma printte geen getallen. Verwacht: ${e
        .map((x) => formatNumber(x.value))
        .slice(0, 5)
        .join(", ")}${e.length > 5 ? ", …" : ""}.`,
    };
  }
  if (a.length < e.length) {
    return {
      passed: false,
      feedback: `Je programma printte ${plural(a.length, "getal", "getallen")}, maar er werden er ${e.length} verwacht. Getal ${a.length + 1} ontbreekt: ${formatNumber(e[a.length].value)}.`,
    };
  }
  return {
    passed: false,
    feedback: `Je programma printte meer getallen dan verwacht (${a.length} in plaats van ${e.length}). Extra getal: ${a[e.length].text}.`,
  };
}

function compareRegex(
  actual: string,
  pattern: string,
  ignoreCase: boolean,
): OutputCompareResult {
  let re: RegExp;
  try {
    re = new RegExp(pattern, ignoreCase ? "imu" : "mu");
  } catch (e) {
    return {
      passed: false,
      feedback: `De test bevat een ongeldige reguliere expressie (${e instanceof Error ? e.message : String(e)}). Vraag je docent om dit te controleren.`,
    };
  }
  const text = normalizeLines(actual).join("\n");
  if (re.test(text)) return { passed: true, feedback: null };
  return {
    passed: false,
    feedback:
      text.trim() === ""
        ? "Je programma printte niets."
        : "De uitvoer van je programma heeft niet de verwachte vorm.",
  };
}

/** Compare a program's clean stdout with the expected output. */
export function compareOutput(
  actual: string,
  expected: string,
  options: OutputCompareOptions,
): OutputCompareResult {
  switch (options.match) {
    case "exact":
      return compareExact(actual, expected, options.ignoreCase);
    case "flexible":
      return compareFlexible(actual, expected, options.ignoreCase);
    case "contains":
      return compareContains(actual, expected, options.ignoreCase);
    case "numbers":
      return compareNumbers(actual, expected, options.tolerance);
    case "regex":
      return compareRegex(actual, expected, options.ignoreCase);
  }
}

/* -------------------------------------------------------------------------- */
/*                                Value compare                               */
/* -------------------------------------------------------------------------- */

export type ValueCompareResult = {
  equal: boolean;
  /** Dutch explanation of the first difference (when not equal). */
  reason: string | null;
};

type Mismatch = { path: string; reason: string };

function asNumber(v: PyValue): number | null {
  if (v.t === "int") return Number(v.v);
  if (v.t === "float") {
    if (v.v === "inf") return Number.POSITIVE_INFINITY;
    if (v.v === "-inf") return Number.NEGATIVE_INFINITY;
    if (v.v === "nan") return Number.NaN;
    return v.v;
  }
  return null;
}

const KIND_GROUP: Record<string, string> = {
  int: "number",
  float: "number",
  set: "set",
  frozenset: "set",
};

function describe(v: PyValue): string {
  return `${quote(pyRepr(v, 80), 80)} (${pyTypeName(v)})`;
}

function at(path: string): string {
  return path ? ` bij ${path}` : "";
}

function diff(
  actual: PyValue,
  expected: PyValue,
  tol: number,
  path: string,
): Mismatch | null {
  const ga = KIND_GROUP[actual.t] ?? actual.t;
  const ge = KIND_GROUP[expected.t] ?? expected.t;
  if (ga !== ge) {
    return {
      path,
      reason: `verwacht ${describe(expected)}, maar het was ${describe(actual)}`,
    };
  }
  switch (expected.t) {
    case "none":
      return null;
    case "bool":
    case "str":
    case "bytes":
      return (actual as typeof expected).v === expected.v
        ? null
        : {
            path,
            reason: `verwacht ${describe(expected)}, maar het was ${describe(actual)}`,
          };
    case "int":
    case "float": {
      if (actual.t === "int" && expected.t === "int") {
        return BigInt(actual.v) === BigInt(expected.v)
          ? null
          : {
              path,
              reason: `verwacht ${quote(expected.v)}, maar het was ${quote(actual.v)}`,
            };
      }
      const a = asNumber(actual) as number;
      const e = asNumber(expected) as number;
      if (Number.isNaN(a) && Number.isNaN(e)) return null;
      if (a === e || numbersEqual(a, e, tol)) return null;
      return {
        path,
        reason: `verwacht ${quote(pyRepr(expected))}, maar het was ${quote(pyRepr(actual))}`,
      };
    }
    case "list":
    case "tuple": {
      const av = (actual as typeof expected).v;
      const ev = expected.v;
      if (av.length !== ev.length) {
        const what = expected.t === "list" ? "De lijst" : "De tuple";
        return {
          path,
          reason: `${what}${at(path)} heeft ${plural(av.length, "element", "elementen")}, maar er werden er ${ev.length} verwacht`,
        };
      }
      for (let i = 0; i < ev.length; i++) {
        const m = diff(av[i], ev[i], tol, `${path}[${i}]`);
        if (m) return m;
      }
      return null;
    }
    case "set":
    case "frozenset": {
      const av = (actual as typeof expected).v;
      const ev = expected.v;
      const used = new Array<boolean>(av.length).fill(false);
      for (const e of ev) {
        const idx = av.findIndex(
          (a, k) => !used[k] && diff(a, e, tol, "") === null,
        );
        if (idx < 0) {
          return {
            path,
            reason: `de set${at(path)} mist ${quote(pyRepr(e, 80), 80)}`,
          };
        }
        used[idx] = true;
      }
      const extra = av.findIndex((_, k) => !used[k]);
      if (extra >= 0) {
        return {
          path,
          reason: `de set${at(path)} bevat ${quote(pyRepr(av[extra], 80), 80)}, maar dat werd niet verwacht`,
        };
      }
      return null;
    }
    case "dict": {
      const av = (actual as typeof expected).v;
      const ev = expected.v;
      for (const [ek, evv] of ev) {
        const entry = av.find(([ak]) => diff(ak, ek, 0, "") === null);
        const keyText = pyRepr(ek, 60);
        if (!entry) {
          return {
            path,
            reason: `de dictionary${at(path)} mist de sleutel ${quote(keyText, 60)}`,
          };
        }
        const m = diff(entry[1], evv, tol, `${path}[${keyText}]`);
        if (m) return m;
      }
      if (av.length > ev.length) {
        const extra = av.find(
          ([ak]) => !ev.some(([ek]) => diff(ak, ek, 0, "") === null),
        );
        if (extra) {
          return {
            path,
            reason: `de dictionary${at(path)} heeft een extra sleutel ${quote(pyRepr(extra[0], 60), 60)}`,
          };
        }
      }
      return null;
    }
    case "other":
      return actual.t === "other" &&
        actual.repr === expected.repr &&
        actual.type === expected.type
        ? null
        : {
            path,
            reason: `verwacht ${describe(expected)}, maar het was ${describe(actual)}`,
          };
  }
}

/**
 * Compare a returned value with the expected value. Floats (and int vs
 * float) compare with the absolute `tolerance`; containers recursively; sets
 * and dicts ignore order. bool only equals bool, list never equals tuple.
 */
export function compareValues(
  actual: PyValue,
  expected: PyValue,
  tolerance: number,
): ValueCompareResult {
  const m = diff(actual, expected, tolerance, "");
  if (!m) return { equal: true, reason: null };
  const where = m.path ? `Bij ${m.path}: ` : "";
  const reason = m.reason.charAt(0).toUpperCase() + m.reason.slice(1);
  return {
    equal: false,
    reason:
      m.path && !m.reason.includes(" bij ") ? `${where}${m.reason}` : reason,
  };
}

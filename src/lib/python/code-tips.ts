/**
 * Code tips: friendly static checks on a student's Python code before
 * handing in ("Misschien wil je dit nog nakijken"). Built on the tokenizer;
 * the code is never executed. Pure and isomorphic.
 *
 * The tips point at common beginner mistakes that make tests fail even
 * though the program "works": a misspelled function name, print instead of
 * return, an input() whose answer is thrown away, text from input() used
 * in a calculation, and so on.
 */
import { type Token, tokenizePython } from "./tokenize";

export type CodeTipId =
  | "unchanged"
  | "missing_function"
  | "print_instead_of_return"
  | "no_output"
  | "input_not_stored"
  | "input_text_math"
  | "while_true_no_break"
  | "def_not_called"
  | "mixed_indent";

export type CodeTip = {
  id: CodeTipId;
  severity: "warning" | "info";
  /** 1-based line the tip is about, when it is about one line. */
  line?: number;
  message: string;
};

export type CodeTipOptions = {
  starterCode?: string;
  /** Functions the tests call (from the student-safe question data). */
  functionNames?: readonly string[];
  /** Whether a test compares printed output. */
  hasIoTests?: boolean;
};

/* -------------------------------------------------------------------------- */
/*                                 Statements                                 */
/* -------------------------------------------------------------------------- */

type Statement = {
  tokens: Token[];
  /** Block depth (0 = module level). */
  depth: number;
  line: number;
};

const COMPOUND = new Set([
  "def",
  "class",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "with",
  "try",
  "except",
  "finally",
]);

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);

const isOp = (t: Token | undefined, value: string) =>
  t?.kind === "op" && t.value === value;
const isName = (t: Token | undefined, value?: string) =>
  t?.kind === "name" && (value === undefined || t.value === value);
const isKeyword = (t: Token | undefined, value: string) =>
  t?.kind === "keyword" && t.value === value;

/** Splits tokens at top-level occurrences of an operator. */
function splitTopLevel(tokens: Token[], op: string): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === "op" && OPEN.has(t.value)) depth++;
    else if (t.kind === "op" && CLOSE.has(t.value))
      depth = Math.max(0, depth - 1);
    if (depth === 0 && isOp(t, op)) parts.push([]);
    else parts[parts.length - 1].push(t);
  }
  return parts.filter((p) => p.length > 0);
}

/** Index of the first top-level ":" (block colon of a compound header). */
function headerColon(tokens: Token[]): number {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "op" && OPEN.has(t.value)) depth++;
    else if (t.kind === "op" && CLOSE.has(t.value))
      depth = Math.max(0, depth - 1);
    else if (depth === 0 && isOp(t, ":")) return i;
  }
  return -1;
}

function isCompoundHeader(tokens: Token[]): boolean {
  const first = tokens[0];
  if (!first) return false;
  if (first.kind === "keyword" && COMPOUND.has(first.value)) return true;
  // async def / async for / async with
  return (
    isKeyword(first, "async") &&
    tokens[1]?.kind === "keyword" &&
    COMPOUND.has(tokens[1].value)
  );
}

/**
 * Logical lines → statements with their block depth. A one-line compound
 * statement (`while True: break`) becomes a header plus body statements
 * one level deeper; `a = 1; b = 2` becomes two statements.
 */
function statementsOf(tokens: Token[]): Statement[] {
  const lines: { tokens: Token[]; depth: number }[] = [];
  let depth = 0;
  let current: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "comment") continue;
    if (t.kind === "indent") {
      depth++;
      continue;
    }
    if (t.kind === "dedent") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (t.kind === "newline") {
      if (current.length) lines.push({ tokens: current, depth });
      current = [];
      continue;
    }
    current.push(t);
  }
  if (current.length) lines.push({ tokens: current, depth });

  const out: Statement[] = [];
  const add = (toks: Token[], d: number) => {
    if (!toks.length) return;
    if (isCompoundHeader(toks)) {
      const colon = headerColon(toks);
      if (colon >= 0 && colon < toks.length - 1) {
        out.push({
          tokens: toks.slice(0, colon + 1),
          depth: d,
          line: toks[0].line,
        });
        for (const part of splitTopLevel(toks.slice(colon + 1), ";")) {
          add(part, d + 1);
        }
        return;
      }
      out.push({ tokens: toks, depth: d, line: toks[0].line });
      return;
    }
    for (const part of splitTopLevel(toks, ";")) {
      out.push({ tokens: part, depth: d, line: part[0].line });
    }
  };
  for (const l of lines) add(l.tokens, l.depth);
  return out;
}

/** Index range (exclusive end) of the statements inside block `i`. */
function blockEnd(statements: Statement[], i: number): number {
  const depth = statements[i].depth;
  let j = i + 1;
  while (j < statements.length && statements[j].depth > depth) j++;
  return j;
}

const headerKind = (s: Statement): string | null => {
  const [first, second] = s.tokens;
  if (isKeyword(first, "async") && second?.kind === "keyword")
    return second.value;
  return first?.kind === "keyword" ? first.value : null;
};

/**
 * The body statements of block `i`, skipping nested blocks for which
 * `skip(header)` is true (e.g. nested functions).
 */
function bodyOf(
  statements: Statement[],
  i: number,
  skip: (kind: string | null) => boolean,
): Statement[] {
  const end = blockEnd(statements, i);
  const out: Statement[] = [];
  for (let j = i + 1; j < end; j++) {
    const s = statements[j];
    out.push(s);
    if (isCompoundHeader(s.tokens) && skip(headerKind(s))) {
      j = blockEnd(statements, j) - 1;
    }
  }
  return out;
}

type FunctionDef = {
  name: string;
  index: number;
  line: number;
  /** Defined at module level (not inside another def or class). */
  moduleLevel: boolean;
};

function functionDefs(statements: Statement[]): FunctionDef[] {
  const defs: FunctionDef[] = [];
  /** Depths of the enclosing def/class headers. */
  const scopes: number[] = [];
  statements.forEach((s, index) => {
    while (scopes.length && scopes[scopes.length - 1] >= s.depth) scopes.pop();
    const kind = headerKind(s);
    if (kind === "def") {
      const nameToken = s.tokens.find(
        (t, k) =>
          k > 0 && t.kind === "name" && isKeyword(s.tokens[k - 1], "def"),
      );
      if (nameToken) {
        defs.push({
          name: nameToken.value,
          index,
          line: s.line,
          moduleLevel: scopes.length === 0,
        });
      }
    }
    if (kind === "def" || kind === "class") scopes.push(s.depth);
  });
  return defs;
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** Classic edit distance (small inputs only). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

const callsName = (tokens: Token[], name: string) =>
  tokens.some((t, k) => isName(t, name) && isOp(tokens[k + 1], "("));

/** Index just after the bracket that closes the one at `open`. */
function afterClosing(tokens: Token[], open: number): number {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === "op" && OPEN.has(t.value)) depth++;
    else if (t.kind === "op" && CLOSE.has(t.value)) {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return tokens.length;
}

const ASSIGN_OPS = new Set([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "//=",
  "%=",
  "**=",
  "&=",
  "|=",
  "^=",
  ">>=",
  "<<=",
  "@=",
  ":=",
]);

const hasTopLevelAssignment = (tokens: Token[]) => {
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === "op" && OPEN.has(t.value)) depth++;
    else if (t.kind === "op" && CLOSE.has(t.value))
      depth = Math.max(0, depth - 1);
    else if (depth === 0 && t.kind === "op" && ASSIGN_OPS.has(t.value))
      return true;
  }
  return false;
};

/** String methods that still return text. */
const TEXT_METHODS = new Set([
  "strip",
  "lstrip",
  "rstrip",
  "lower",
  "upper",
  "title",
  "capitalize",
  "casefold",
]);

/**
 * `naam = input(...)` (optionally `.strip()` etc.): the variable holds
 * text. Returns the variable name, or null.
 */
function rawInputTarget(tokens: Token[]): string | null {
  if (!isName(tokens[0]) || !isOp(tokens[1], "=")) return null;
  if (!isName(tokens[2], "input") || !isOp(tokens[3], "(")) return null;
  let k = afterClosing(tokens, 3);
  while (k < tokens.length) {
    if (
      isOp(tokens[k], ".") &&
      tokens[k + 1]?.kind === "name" &&
      TEXT_METHODS.has(tokens[k + 1].value) &&
      isOp(tokens[k + 2], "(")
    ) {
      k = afterClosing(tokens, k + 2);
      continue;
    }
    return null;
  }
  return tokens[0].value;
}

/** Operators that calculate with or compare a value. */
const MATH_OPS = new Set([
  "+",
  "-",
  "*",
  "/",
  "//",
  "%",
  "**",
  "<",
  ">",
  "<=",
  ">=",
  "==",
  "!=",
  "+=",
  "-=",
  "*=",
  "/=",
  "//=",
  "%=",
]);

const isMathOp = (t: Token | undefined) =>
  t?.kind === "op" && MATH_OPS.has(t.value);

/** `x + 1`, `1 + x`, `x >= 18`, `x += 1` … with a number on the other side. */
function usedWithNumber(tokens: Token[], k: number): boolean {
  const before = tokens[k - 1];
  const after = tokens[k + 1];
  if (isMathOp(after) && tokens[k + 2]?.kind === "number") return true;
  if (isMathOp(before) && tokens[k - 2]?.kind === "number") return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/*                                    Tips                                    */
/* -------------------------------------------------------------------------- */

const code = (s: string) => `\`${s}\``;

/** Code tips for a student's answer (empty for blank code). */
export function getCodeTips(
  source: string,
  options: CodeTipOptions = {},
): CodeTip[] {
  if (!source.trim()) return [];
  const starter = options.starterCode ?? "";
  if (starter.trim() && source.trim() === starter.trim()) {
    return [
      {
        id: "unchanged",
        severity: "warning",
        message: "Je hebt de startcode nog niet aangepast.",
      },
    ];
  }

  const { tokens, mixedIndent } = tokenizePython(source);
  const statements = statementsOf(tokens);
  const required = [...new Set(options.functionNames ?? [])];
  const hasIoTests = options.hasIoTests ?? false;
  const defs = functionDefs(statements);
  const moduleDefs = defs.filter((d) => d.moduleLevel);
  const tips: CodeTip[] = [];

  // Names assigned at module level (`gemiddelde = lambda …` defines it too).
  const assigned = new Set(
    statements
      .filter(
        (s) => s.depth === 0 && isName(s.tokens[0]) && isOp(s.tokens[1], "="),
      )
      .map((s) => s.tokens[0].value),
  );

  // 2. missing_function
  for (const name of required) {
    if (moduleDefs.some((d) => d.name === name) || assigned.has(name)) continue;
    let best: { def: FunctionDef; distance: number } | null = null;
    for (const def of moduleDefs) {
      if (required.includes(def.name)) continue;
      const distance =
        def.name.toLowerCase() === name.toLowerCase()
          ? 0
          : levenshtein(def.name.toLowerCase(), name.toLowerCase());
      if (distance <= 2 && (!best || distance < best.distance)) {
        best = { def, distance };
      }
    }
    tips.push(
      best
        ? {
            id: "missing_function",
            severity: "warning",
            line: best.def.line,
            message: `De opdracht vraagt om een functie ${code(name)}, maar jouw functie heet ${code(best.def.name)}. Let op hoofdletters en spelling.`,
          }
        : {
            id: "missing_function",
            severity: "warning",
            message: `De opdracht vraagt om een functie ${code(name)}, maar die staat niet in je code.`,
          },
    );
  }

  const skipNested = (kind: string | null) =>
    kind === "def" || kind === "class";

  // 3. print_instead_of_return
  for (const def of moduleDefs) {
    if (!required.includes(def.name)) continue;
    const body = bodyOf(statements, def.index, skipNested);
    const prints = body.some((s) => callsName(s.tokens, "print"));
    const returnsValue = body.some(
      (s) =>
        (isKeyword(s.tokens[0], "return") && s.tokens.length > 1) ||
        s.tokens.some((t) => isKeyword(t, "yield")),
    );
    if (prints && !returnsValue) {
      tips.push({
        id: "print_instead_of_return",
        severity: "warning",
        line: def.line,
        message: `Je functie ${code(def.name)} print het antwoord, maar geeft het niet terug met ${code("return")}. De test kijkt naar wat de functie teruggeeft.`,
      });
    }
  }

  // 4. no_output
  if (hasIoTests && !tokens.some((t) => isName(t, "print"))) {
    const writes = tokens.some(
      (t, k) =>
        isName(t, "stdout") &&
        isOp(tokens[k - 1], ".") &&
        isName(tokens[k - 2], "sys"),
    );
    if (!writes) {
      tips.push({
        id: "no_output",
        severity: "warning",
        message:
          "Je programma print niets. De tests kijken naar wat je programma print.",
      });
    }
  }

  // 5. input_not_stored
  for (const s of statements) {
    if (
      isName(s.tokens[0], "input") &&
      isOp(s.tokens[1], "(") &&
      !hasTopLevelAssignment(s.tokens)
    ) {
      tips.push({
        id: "input_not_stored",
        severity: "warning",
        line: s.line,
        message: `Op regel ${s.line} vraag je om invoer, maar je bewaart het antwoord niet in een variabele.`,
      });
    }
  }

  // 6. input_text_math (info)
  const textVars = new Set<string>();
  const reported = new Set<string>();
  for (const s of statements) {
    const toks = s.tokens;
    const target = rawInputTarget(toks);
    if (target) {
      textVars.add(target);
      continue;
    }
    toks.forEach((t, k) => {
      if (
        t.kind !== "name" ||
        !textVars.has(t.value) ||
        reported.has(t.value) ||
        isOp(toks[k - 1], ".")
      ) {
        return;
      }
      if (usedWithNumber(toks, k)) {
        reported.add(t.value);
        tips.push({
          id: "input_text_math",
          severity: "info",
          line: t.line,
          message: `Op regel ${t.line} reken of vergelijk je met ${code(t.value)}, maar ${code("input()")} geeft altijd tekst. Gebruik ${code("int(input(...))")} of ${code("float(input(...))")}.`,
        });
      }
    });
    // `x = int(x)` (or any other value): x no longer holds raw text.
    if (isName(toks[0]) && isOp(toks[1], "=")) textVars.delete(toks[0].value);
  }

  // 7. while_true_no_break
  statements.forEach((s, index) => {
    const [kw, cond, colon] = s.tokens;
    if (
      !isKeyword(kw, "while") ||
      !(
        isKeyword(cond, "True") ||
        (cond?.kind === "number" && cond.value === "1")
      ) ||
      !isOp(colon, ":")
    ) {
      return;
    }
    // A break in a nested loop only ends that loop; return/raise/exit()
    // end this one too. Nested functions don't count at all.
    const inLoopBody = bodyOf(statements, index, skipNested);
    const ownBody = bodyOf(
      statements,
      index,
      (kind) => skipNested(kind) || kind === "for" || kind === "while",
    );
    const breaks = ownBody.some((b) =>
      b.tokens.some((t) => isKeyword(t, "break")),
    );
    const exits = inLoopBody.some((b) =>
      b.tokens.some(
        (t, k) =>
          isKeyword(t, "return") ||
          isKeyword(t, "raise") ||
          ((isName(t, "exit") || isName(t, "quit")) &&
            isOp(b.tokens[k + 1], "(")),
      ),
    );
    if (!breaks && !exits) {
      tips.push({
        id: "while_true_no_break",
        severity: "warning",
        line: s.line,
        message: `Je ${code("while True")}-lus heeft geen ${code("break")}. Stopt je programma wel?`,
      });
    }
  });

  // 8. def_not_called (programs checked on their output)
  if (hasIoTests) {
    for (const def of moduleDefs) {
      if (required.includes(def.name)) continue;
      const end = blockEnd(statements, def.index);
      const used = statements.some(
        (s, index) =>
          (index < def.index || index >= end) &&
          s.tokens.some((t) => isName(t, def.name)),
      );
      if (!used) {
        tips.push({
          id: "def_not_called",
          severity: "warning",
          line: def.line,
          message: `Je maakt de functie ${code(def.name)}, maar roept hem nergens aan. Dan wordt hij niet uitgevoerd.`,
        });
      }
    }
  }

  // 9. mixed_indent
  if (mixedIndent) {
    tips.push({
      id: "mixed_indent",
      severity: "warning",
      message:
        "Je springt in met tabs én spaties door elkaar. Dat geeft in Python vaak fouten.",
    });
  }

  // Tips without a line first, then by line.
  return tips
    .map((tip, order) => ({ tip, order }))
    .sort((a, b) => (a.tip.line ?? 0) - (b.tip.line ?? 0) || a.order - b.order)
    .map(({ tip }) => tip);
}

/** Number of warnings (info tips don't count). */
export function countWarnings(tips: readonly CodeTip[]): number {
  return tips.filter((t) => t.severity === "warning").length;
}

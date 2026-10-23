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
 *             compare by value ("108.50" = "108.5"); "1x3=3" reads as
 *             "1 x 3 = 3". Each expected line must appear, in order, inside
 *             its own output line, with token boundaries ("5" never matches
 *             inside "15"). Text around it is fine when it is a label or a
 *             sentence ("Antwoord: 15", "Het getal 4 is even", "3 + 4 = 7"),
 *             but NOT when it changes or doubles the answer:
 *               - a negation right before/after a word answer ("Niet
 *                 geslaagd" is not "Geslaagd", "even: nee" is not "even");
 *               - another number glued to a numeric answer ("7 8 9" is not
 *                 "8"). A number before it needs a label such as ":" or
 *                 "="; after it, only after some words, and then besides
 *                 units and echoed input at most one number that is not
 *                 another test's answer ("De som is 51, uit 3 getallen");
 *               - the expected line of ANOTHER test of the same question
 *                 (`siblings`) next to the answer ("even oneven", "Je mag
 *                 stemmen / Je mag nog niet stemmen");
 *               - when the answer is itself one of the inputs ("which number
 *                 is the largest?"): other inputs after it ("3 en 9 en 5"
 *                 for 9), or a prompt-like line ending in ":" or "?" ("9:"),
 *                 because then the line lists the inputs instead of
 *                 choosing one.
 *             Extra output lines are allowed when they contain no
 *             words/numbers, or when they look like a prompt or heading:
 *             they end with ":" or "?", contain a word, don't carry another
 *             test's answer, and there are at most (stdin lines + 2) of
 *             them. So printing *all* numbers or every candidate answer
 *             doesn't pass "print the even numbers" or "even/oneven".
 * - contains: every expected line must appear (as whole words/numbers)
 *             somewhere in the output, in any order.
 * - numbers:  only the numbers count: the expected numbers must appear in
 *             order (as a subsequence) among the printed numbers, each
 *             within `tolerance`; other numbers (e.g. the echoed input
 *             in "100.0 euro is 108.0 dollar") may appear in between.
 *             Understands "108.50", "1e3", "-5" and Dutch decimal
 *             commas ("108,50").
 * - regex:    `expected` is a JavaScript regular expression, searched in
 *             the output (flags "m", plus "i" when `ignoreCase`). It runs
 *             with a time limit (see regex-guard.ts): a pattern that
 *             backtracks too long fails the test instead of hanging.
 */
import type { OutputMatchMode } from "@/lib/questions/schema";
import { type PyValue, pyRepr, pyTypeName } from "./pyvalue";
import { guardedRegexTest, type RegexTester } from "./regex-guard";

export type OutputCompareOptions = {
  match: OutputMatchMode;
  ignoreCase: boolean;
  tolerance: number;
  /**
   * flexible: the stdin of this test. Echoed input never counts as "another
   * answer", and it sets how many prompt/heading lines are tolerated.
   */
  stdin?: string;
  /**
   * flexible: the expected outputs of the question's OTHER io tests that use
   * a different stdin (the alternative answers). An output line that carries
   * one of them next to the answer fails.
   */
  siblings?: readonly string[];
  /** regex: evaluates the pattern with a time limit (default: guardedRegexTest). */
  regexTest?: RegexTester;
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

type Token = {
  num: number | null;
  text: string;
  /** Position in the (raw) line: [start, end). */
  start: number;
  end: number;
  /** Contains a letter (a word, not a number or a symbol such as "²"). */
  word: boolean;
  /** Lookup key, filled in on first use (see tokenKey). */
  key?: string;
};

/**
 * Numbers and words. Numbers and letters split where they touch ("1x3=3" →
 * 1, x, 3, 3; "180cm" → 180, cm), but a number never starts inside a longer
 * run of digits ("15" never yields "5"). A "-" is a minus sign only when no
 * letter or digit comes before it ("10-3" → 10, 3; "Antwoord: -5" → -5). An
 * exponent counts only when no letter follows ("1e3" = 1000, "1e3x" → 1, e,
 * 3, x).
 */
const TOKEN_RE =
  /(?:(?<![\p{L}\p{N}_.])-)?(?<![\p{N}_.])\d+(?:\.\d+)?(?:[eE][+-]?\d+(?![\p{L}_]))?(?![\p{N}_])|[\p{L}_]+|\p{N}+/gu;

/** Words and numbers of a line (punctuation and spacing dropped). */
export function tokenize(line: string, ignoreCase: boolean): Token[] {
  const out: Token[] = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const text = m[0];
    const start = m.index ?? 0;
    const end = start + text.length;
    const n = /^-?\d/.test(text) ? Number(text) : Number.NaN;
    out.push(
      Number.isFinite(n)
        ? { num: n, text, start, end, word: false }
        : {
            num: null,
            text: fold(text, ignoreCase),
            start,
            end,
            word: /\p{L}/u.test(text),
          },
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

/** Start positions where `needle` occurs in `hay` as a contiguous token run. */
function occurrences(hay: Token[], needle: Token[]): number[] {
  const out: number[] = [];
  if (needle.length === 0) return out;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (!tokenEqual(hay[i + j], needle[j])) continue outer;
    }
    out.push(i);
  }
  return out;
}

/** Does `hay` contain `needle` as a contiguous token run? */
function containsTokens(hay: Token[], needle: Token[]): boolean {
  return needle.length === 0 || occurrences(hay, needle).length > 0;
}

const isWordToken = (t: Token) => t.word;

/** Lookup key of a line's tokens: equal keys mean equal lines. */
const lineKeys = new WeakMap<Token[], string>();
function lineKey(tokens: Token[]): string {
  let key = lineKeys.get(tokens);
  if (key === undefined) {
    key = tokens.map((t) => tokenKey(t)).join(" ");
    lineKeys.set(tokens, key);
  }
  return key;
}

/** Lookup key of a token (numbers rounded like `numbersEqual` compares them). */
function tokenKey(t: Token): string {
  if (t.key === undefined) {
    t.key =
      t.num === null
        ? `w${t.text}`
        : Number.isInteger(t.num) && Math.abs(t.num) < 1e9
          ? `n${t.num}`
          : `n${Number(t.num.toPrecision(9))}`;
  }
  return t.key;
}
const isNumberToken = (t: Token) => t.num !== null;

/** Words that turn an answer around ("niet geslaagd", "even: nee"). */
const NEGATIONS: ReadonlySet<string> = new Set([
  "niet",
  "geen",
  "nee",
  "nooit",
  "not",
  "no",
  "never",
]);
const isNegation = (t: Token) => t.word && NEGATIONS.has(t.text.toLowerCase());

/** Text between two tokens that makes the part before it a label: "3 + 4 = 7", "Stap 2: 8". */
const LABEL_SEPARATOR = /[:=?>→⇒]/u;

/** A line that looks like a prompt or heading ("Geef een getal:", "Even of oneven?"). */
const PROMPT_END = /[:?]\s*$/u;

/* -------------------------- Flexible: line matching ------------------------ */

type ExpectedLines = { raw: string[]; tokens: Token[][] };
const expectedCache = new Map<string, ExpectedLines>();

/**
 * Tokenized non-empty lines of an expected output. Cached: the same
 * expected outputs come back for every test of a question and every
 * student (small and bounded; teacher data only).
 */
function expectedLineTokens(text: string, ignoreCase: boolean): ExpectedLines {
  const key = `${ignoreCase ? 1 : 0}${text}`;
  const cached = expectedCache.get(key);
  if (cached) return cached;
  const lines: ExpectedLines = { raw: [], tokens: [] };
  for (const line of normalizeLines(text)) {
    const t = tokenize(line, ignoreCase);
    if (t.length > 0) {
      lines.raw.push(line.trim());
      lines.tokens.push(t);
    }
  }
  if (text.length <= 20_000) {
    if (expectedCache.size >= 500) expectedCache.clear();
    expectedCache.set(key, lines);
  }
  return lines;
}

type Line = { raw: string; tokens: Token[] };

/** An expected line of another test (see FlexibleContext.foreign). */
type ForeignLine = {
  keys: string[];
  sibling: number;
  /** Contains a word (not only numbers). */
  wordy: boolean;
};

/** An occurrence of another test's expected line inside an output line. */
type ForeignHit = {
  start: number;
  end: number;
  /** Index of the sibling test it belongs to. */
  sibling: number;
  /** The sibling line contains a word (not only numbers). */
  wordy: boolean;
};

/** Per output line, see FlexibleContext.lineInfo (index: token position). */
type LineInfo = {
  /** First word token at or after the index (token count when none). */
  nextWord: Int32Array;
  /** First number at or after the index, not glued to a letter. */
  nextNumber: Int32Array;
  /** 1 when another test's numeric answer (not echoed input) follows. */
  siblingNumberAfter: Uint8Array;
  /** Other numbers (not input, not another test's answer) from here, at most 2. */
  otherNumbersAfter: Uint8Array;
  /** Last position of each input value (by token key) on the line. */
  lastInput: Map<string, number>;
  /** Span covering every worded answer of another test on the line. */
  wordyStart: number;
  wordyEnd: number;
};

/**
 * Everything the flexible comparison of ONE test needs to know besides the
 * output: its expected lines, the other tests' expected lines and the input.
 */
class FlexibleContext {
  readonly expected: Token[][];
  /** Per expected line: it contains a negation itself ("Niet geslaagd"). */
  private readonly negated: boolean[];
  /**
   * Per expected line: it consists of input values only (the answer is one
   * of the inputs, e.g. the largest number or the longest word), with the
   * keys of its tokens. Null for other lines.
   */
  private readonly select: (Set<string> | null)[];
  /** Per expected line: it ends like a prompt itself ("Uitslag:"). */
  private readonly promptLike: boolean[];
  /** Keys of the tokens of this test's stdin. */
  private readonly inputKeys: Set<string>;
  /**
   * The sibling tests' expected lines that this test does not also expect,
   * indexed by their first token and then their second.
   */
  private readonly foreign = new Map<
    string,
    { single: ForeignLine[]; bySecond: Map<string, ForeignLine[]> }
  >();
  /** Per sibling test: the keys of all its expected lines. */
  private readonly siblingKeys: Set<string>[];
  /** Keys of the sibling tests' answers that are a single number ("350"). */
  private readonly siblingNumbers = new Set<string>();
  private readonly echo: Token[];
  private readonly stdinLines: number;
  /** At most this many prompt/heading lines (with words) may be skipped. */
  readonly maxPromptLines: number;
  /** Per raw output line (outputs often repeat lines). */
  private readonly hitCache = new Map<string, ForeignHit[]>();
  private readonly infoCache = new Map<string, LineInfo>();
  private readonly skipCache = new Map<string, number>();

  constructor(
    { raw, tokens: expected }: ExpectedLines,
    options: {
      ignoreCase: boolean;
      stdin?: string;
      siblings?: readonly string[];
    },
  ) {
    this.expected = expected;
    this.negated = expected.map((e) => e.some(isNegation));
    const stdin = options.stdin ?? "";
    this.stdinLines = normalizeLines(stdin).length;
    this.echo = tokenize(stdin, options.ignoreCase);
    this.maxPromptLines = this.stdinLines + 2;
    this.inputKeys = new Set(this.echo.map((t) => tokenKey(t)));
    this.select = expected.map((e) =>
      e.every((t) => this.inputKeys.has(tokenKey(t)))
        ? new Set(e.map((t) => tokenKey(t)))
        : null,
    );
    this.promptLike = raw.map((r) => PROMPT_END.test(r));
    const siblingLines = (options.siblings ?? []).map(
      (text) => expectedLineTokens(text, options.ignoreCase).tokens,
    );
    this.siblingKeys = siblingLines.map(
      (lines) => new Set(lines.map((l) => lineKey(l))),
    );
    const own = new Set(expected.map((e) => lineKey(e)));
    siblingLines.forEach((lines, sibling) => {
      for (const tokens of lines) {
        if (own.has(lineKey(tokens))) continue;
        // Indexed by the first two tokens (one for a one-token line).
        const keys = tokens.map((t) => tokenKey(t));
        if (keys.length === 1 && isNumberToken(tokens[0]))
          this.siblingNumbers.add(keys[0]);
        const entry = { keys, sibling, wordy: tokens.some(isWordToken) };
        let bucket = this.foreign.get(keys[0]);
        if (!bucket) {
          bucket = { single: [], bySecond: new Map() };
          this.foreign.set(keys[0], bucket);
        }
        if (keys.length === 1) bucket.single.push(entry);
        else {
          const list = bucket.bySecond.get(keys[1]) ?? [];
          list.push(entry);
          bucket.bySecond.set(keys[1], list);
        }
      }
    });
  }

  /**
   * Echoed input never counts as another test's answer: tokens from this
   * test's stdin, and small integers that number the inputs ("Getal 3:").
   */
  private isEcho(t: Token): boolean {
    if (this.echo.some((e) => tokenEqual(e, t))) return true;
    return (
      t.num !== null &&
      Number.isInteger(t.num) &&
      t.num >= 1 &&
      t.num <= this.stdinLines
    );
  }

  /**
   * What `matches` needs to know about an output line, computed once per
   * line so that checking every occurrence of the answer stays linear (a
   * crafted output can repeat the answer thousands of times).
   */
  private lineInfo(line: Line): LineInfo {
    const cached = this.infoCache.get(line.raw);
    if (cached) return cached;
    const L = line.tokens;
    const n = L.length;
    const nextWord = new Int32Array(n + 1).fill(n);
    const nextNumber = new Int32Array(n + 1).fill(n);
    const siblingNumberAfter = new Uint8Array(n + 1);
    const otherNumbersAfter = new Uint8Array(n + 1);
    for (let k = n - 1; k >= 0; k--) {
      const t = L[k];
      nextWord[k] = isWordToken(t) ? k : nextWord[k + 1];
      nextNumber[k] = nextNumber[k + 1];
      siblingNumberAfter[k] = siblingNumberAfter[k + 1];
      otherNumbersAfter[k] = otherNumbersAfter[k + 1];
      // Digits glued to a letter are part of a unit or name ("12 m2").
      if (
        !isNumberToken(t) ||
        (t.start > 0 && /[\p{L}_]/u.test(line.raw[t.start - 1]))
      )
        continue;
      nextNumber[k] = k;
      if (this.echo.some((e) => tokenEqual(e, t))) continue;
      if (this.siblingNumbers.has(tokenKey(t))) siblingNumberAfter[k] = 1;
      else otherNumbersAfter[k] = Math.min(2, otherNumbersAfter[k] + 1);
    }
    const lastInput = new Map<string, number>();
    L.forEach((t, k) => {
      const key = tokenKey(t);
      if (this.inputKeys.has(key)) lastInput.set(key, k);
    });
    let wordyStart = Number.POSITIVE_INFINITY;
    let wordyEnd = Number.NEGATIVE_INFINITY;
    for (const h of this.foreignHits(line)) {
      if (!h.wordy) continue;
      wordyStart = Math.min(wordyStart, h.start);
      wordyEnd = Math.max(wordyEnd, h.end);
    }
    const info: LineInfo = {
      nextWord,
      nextNumber,
      siblingNumberAfter,
      otherNumbersAfter,
      lastInput,
      wordyStart,
      wordyEnd,
    };
    this.infoCache.set(line.raw, info);
    return info;
  }

  /**
   * Numbers after a numeric answer (from token `from` on) are allowed? Never
   * right after it ("8 9", "8,5" for 8). After some words: digits glued to a
   * letter (a unit or name: "12 m2"), the echoed input ("25 is het kwadraat
   * van 5") and at most ONE other number that is not another test's answer
   * ("De som is 51 (3 getallen)"); more would let a list of candidates
   * ("x 7 x 8 x 9") pass.
   */
  private cleanNumericTail(info: LineInfo, from: number): boolean {
    const word = info.nextWord[from];
    if (info.nextNumber[from] < word) return false;
    return (
      info.siblingNumberAfter[word] === 0 && info.otherNumbersAfter[word] <= 1
    );
  }

  /** Where other tests' expected lines occur in this output line. */
  foreignHits(line: Line): ForeignHit[] {
    const cached = this.hitCache.get(line.raw);
    if (cached) return cached;
    const hits: ForeignHit[] = [];
    const L = line.tokens;
    if (this.foreign.size > 0) {
      const keys = L.map((t) => tokenKey(t));
      const check = (start: number, list: ForeignLine[] | undefined) => {
        for (const s of list ?? []) {
          const end = start + s.keys.length;
          if (end > keys.length) continue;
          let same = true;
          for (let k = 2; k < s.keys.length && same; k++)
            same = keys[start + k] === s.keys[k];
          if (!same) continue;
          if (L.slice(start, end).every((t) => this.isEcho(t))) continue;
          hits.push({ start, end, sibling: s.sibling, wordy: s.wordy });
        }
      };
      for (let start = 0; start < keys.length; start++) {
        const bucket = this.foreign.get(keys[start]);
        if (!bucket) continue;
        check(start, bucket.single);
        if (start + 1 < keys.length)
          check(start, bucket.bySecond.get(keys[start + 1]));
      }
    }
    this.hitCache.set(line.raw, hits);
    return hits;
  }

  /**
   * Can expected line `e` be matched by this output line? Some occurrence
   * of it must leave only label text around it (see the file header).
   */
  matches(i: number, line: Line): boolean {
    const e = this.expected[i];
    const L = line.tokens;
    if (e.length > L.length) return false;
    const select = this.select[i];
    // The answer is one of the inputs: a prompt-like line ("9:", "olifant?")
    // doesn't give it as THE answer (else printing every input as a "prompt"
    // would pass).
    if (select && !this.promptLike[i] && PROMPT_END.test(line.raw))
      return false;
    const first = e[0];
    const last = e[e.length - 1];
    const negatedAnswer = this.negated[i];
    const info = this.lineInfo(line);
    // Last position of an input on this line that is not part of the answer.
    let lastOtherInput = -1;
    if (select) {
      for (const [key, k] of info.lastInput)
        if (!select.has(key)) lastOtherInput = Math.max(lastOtherInput, k);
    }
    return occurrences(L, e).some((s) => {
      const end = s + e.length;
      const before = s > 0 ? L[s - 1] : null;
      // Numeric start: no other number directly in front ("7 8"), unless a
      // label separates them ("3 + 4 = 7", "Stap 2: 8").
      if (
        isNumberToken(first) &&
        before &&
        isNumberToken(before) &&
        !LABEL_SEPARATOR.test(line.raw.slice(before.end, L[s].start))
      )
        return false;
      // Numeric end: no number right after it ("8 9", "8,5" for 8); after
      // some words only units, echoed input and one other number (see
      // cleanNumericTail).
      if (isNumberToken(last) && !this.cleanNumericTail(info, end))
        return false;
      // The answer is one of the inputs: other inputs after it mean the line
      // lists the inputs instead of choosing one ("3 en 9 en 5" for 9).
      if (lastOtherInput >= end) return false;
      // Word answers: no negation right before or after it.
      if (!negatedAnswer) {
        if (
          !isNumberToken(first) &&
          L.slice(Math.max(0, s - 2), s).some(isNegation)
        )
          return false;
        if (!isNumberToken(last) && L.slice(end, end + 2).some(isNegation))
          return false;
      }
      // No other test's (worded) answer next to it ("even oneven").
      return info.wordyStart >= s && info.wordyEnd <= end;
    });
  }

  /**
   * Cost of leaving this output line unmatched: 0 for decoration (no words
   * or numbers), 1 for a prompt/heading line, Infinity when not allowed.
   */
  skipCost(line: Line): number {
    const L = line.tokens;
    if (L.length === 0) return 0;
    if (!PROMPT_END.test(line.raw) || !L.some(isWordToken))
      return Number.POSITIVE_INFINITY;
    let cost = this.skipCache.get(line.raw);
    if (cost === undefined) {
      cost = this.carriesForeignAnswer(line) ? Number.POSITIVE_INFINITY : 1;
      this.skipCache.set(line.raw, cost);
    }
    return cost;
  }

  /**
   * A prompt-like line that carries another test's answer, but not this
   * test's own (distinct) answer next to it: "oneven:" in the test that
   * expects "even". A heading that lists every option ("Is het getal even
   * of oneven?") stays allowed.
   */
  private carriesForeignAnswer(line: Line): boolean {
    const hits = this.foreignHits(line);
    if (hits.length === 0) return false;
    const L = line.tokens;
    const ownHits = this.expected.map((e) =>
      occurrences(L, e).map((start) => ({ start, end: start + e.length })),
    );
    return hits.some((h) => {
      const covered = ownHits.some((hits) =>
        hits.some((o) => o.start <= h.start && o.end >= h.end),
      );
      if (covered) return false;
      const rescued = this.expected.some(
        (e, idx) =>
          !this.siblingKeys[h.sibling].has(lineKey(e)) &&
          ownHits[idx].some((o) => o.end <= h.start || o.start >= h.end),
      );
      return !rescued;
    });
  }
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
  options: OutputCompareOptions,
): OutputCompareResult {
  const { ignoreCase } = options;
  const out: Line[] = normalizeLines(actual).map((raw) => ({
    raw,
    tokens: tokenize(raw, ignoreCase),
  }));
  const expectedLines = expectedLineTokens(expected, ignoreCase);
  const { raw: eRaw, tokens: eTok } = expectedLines;
  const ctx = new FlexibleContext(expectedLines, options);
  const A = out.length;
  const E = eTok.length;
  const skip = out.map((l) => ctx.skipCost(l));
  const limit = ctx.maxPromptLines;

  // cost[i][j]: the fewest prompt/heading lines that must be skipped to
  // match expected lines i.. in output lines j.. (Infinity: impossible).
  // Filled backwards, one row at a time.
  let passed = false;
  if ((E + 1) * (A + 1) <= 4_000_000) {
    let next = new Float64Array(A + 1);
    for (let j = A - 1; j >= 0; j--) next[j] = skip[j] + next[j + 1];
    for (let i = E - 1; i >= 0; i--) {
      const cur = new Float64Array(A + 1);
      cur[A] = Number.POSITIVE_INFINITY;
      for (let j = A - 1; j >= 0; j--) {
        let best = skip[j] + cur[j + 1];
        if (next[j + 1] < best && ctx.matches(i, out[j])) best = next[j + 1];
        cur[j] = best;
      }
      next = cur;
    }
    passed = next[0] <= limit;
  }

  // Greedy assignment (earliest match): used for very large outputs and to
  // explain a failure.
  const matched = new Array<boolean>(A).fill(false);
  let j = 0;
  let missing = -1;
  for (let i = 0; i < E; i++) {
    let k = j;
    while (k < A && !ctx.matches(i, out[k])) k++;
    if (k >= A) {
      missing = i;
      break;
    }
    matched[k] = true;
    j = k + 1;
  }
  const skipped = out.map((_, idx) => idx).filter((idx) => !matched[idx]);
  const skippedCost = skipped.reduce((sum, idx) => sum + skip[idx], 0);
  if (!passed && missing < 0 && skippedCost <= limit) passed = true;
  if (passed) return { passed: true, feedback: null };

  if (out.every((l) => l.raw.trim() === "")) {
    return {
      passed: false,
      feedback: `Je programma printte niets. Verwacht: ${quote(eRaw[0] ?? "")}${E > 1 ? " …" : ""}.`,
    };
  }
  if (missing >= 0) {
    // Show the output line that was probably meant: the unmatched line after
    // the last match that contains the expected text, or else shares the
    // most words with it (prompts and headings only when nothing else fits).
    const wanted = eTok[missing];
    let candidate = -1;
    let best = -1;
    for (let k = j; k < A; k++) {
      if (matched[k]) continue;
      const contains = containsTokens(out[k].tokens, wanted);
      if (skip[k] !== Number.POSITIVE_INFINITY && !contains) continue;
      const overlap =
        (contains ? wanted.length + 1 : 0) +
        wanted.filter((t) => out[k].tokens.some((a) => tokenEqual(a, t)))
          .length;
      if (overlap > best) {
        best = overlap;
        candidate = k;
      }
    }
    if (candidate >= 0) {
      const extra = containsTokens(out[candidate].tokens, wanted)
        ? " Het antwoord staat er wel in, maar met iets erbij dat niet mag (zoals ‘niet’, een tweede antwoord of een extra getal)."
        : "";
      return {
        passed: false,
        feedback: `Regel ${candidate + 1}: verwacht ${quote(eRaw[missing])}, maar je programma printte ${quote(out[candidate].raw.trim())}.${extra}`,
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
  const extra = skipped.find((idx) => skip[idx] === Number.POSITIVE_INFINITY);
  if (extra !== undefined) {
    return {
      passed: false,
      feedback: `Je programma printte een regel die niet verwacht werd (regel ${extra + 1}): ${quote(out[extra].raw.trim())}.`,
    };
  }
  const prompts = skipped.filter((idx) => skip[idx] > 0);
  const example = prompts[prompts.length - 1] ?? skipped[0];
  return {
    passed: false,
    feedback: `Je programma printte meer extra regels dan verwacht, zoals regel ${example + 1}: ${quote(out[example].raw.trim())}. Print alleen wat er gevraagd wordt.`,
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
  const list = (xs: FoundNumber[]) =>
    `${xs
      .slice(0, 8)
      .map((x) => formatNumber(x.value))
      .join(", ")}${xs.length > 8 ? ", …" : ""}`;
  if (e.length === 0) return { passed: true, feedback: null };
  if (a.length === 0) {
    return {
      passed: false,
      feedback: `Je programma printte geen getallen. Verwacht: ${list(e)}.`,
    };
  }
  // Expected numbers must appear in order as a subsequence of the printed
  // numbers (other numbers, such as the echoed input, may come in between).
  // Earliest-match greedy is optimal for subsequence matching.
  let j = 0;
  for (let i = 0; i < e.length; i++) {
    while (j < a.length && !numbersEqual(a[j].value, e[i].value, tolerance))
      j++;
    if (j >= a.length) {
      const found = list(a);
      const tol =
        tolerance > 0
          ? ` Een verschil tot ${formatNumber(tolerance)} mag.`
          : "";
      const after = i > 0 ? ` na ${formatNumber(e[i - 1].value)}` : "";
      return {
        passed: false,
        feedback: `Het getal ${formatNumber(e[i].value)} ontbreekt${after} in je uitvoer (gevonden: ${found}).${tol}`,
      };
    }
    j++;
  }
  return { passed: true, feedback: null };
}

function compareRegex(
  actual: string,
  pattern: string,
  ignoreCase: boolean,
  regexTest: RegexTester,
): OutputCompareResult {
  const flags = ignoreCase ? "imu" : "mu";
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    return {
      passed: false,
      feedback: `De test bevat een ongeldige reguliere expressie (${e instanceof Error ? e.message : String(e)}). Vraag je docent om dit te controleren.`,
    };
  }
  const text = normalizeLines(actual).join("\n");
  const result = regexTest(pattern, flags, text);
  if (result === "timeout") {
    return {
      passed: false,
      feedback:
        "De reguliere expressie van deze test is te traag; vraag je docent om dit te controleren.",
    };
  }
  if (result) return { passed: true, feedback: null };
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
      return compareFlexible(actual, expected, options);
    case "contains":
      return compareContains(actual, expected, options.ignoreCase);
    case "numbers":
      return compareNumbers(actual, expected, options.tolerance);
    case "regex":
      return compareRegex(
        actual,
        expected,
        options.ignoreCase,
        options.regexTest ?? guardedRegexTest,
      );
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

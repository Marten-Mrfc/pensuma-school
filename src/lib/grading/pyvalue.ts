/**
 * Type-tagged representation of Python values, shared by the harness (which
 * serializes return values of student functions) and the grader (which
 * parses the teacher's `expected` literal in TypeScript).
 *
 * Parsing `expected` here, instead of in Python, means expected values never
 * enter the interpreter that runs student code, so student code can't read
 * them, and the pass/fail decision is made outside the sandbox.
 *
 * Isomorphic: no Node or browser APIs.
 */

export type PyValue =
  | { t: "none" }
  | { t: "bool"; v: boolean }
  /** Arbitrary-precision int as a decimal string. */
  | { t: "int"; v: string }
  | { t: "float"; v: number | "inf" | "-inf" | "nan" }
  | { t: "str"; v: string }
  /** bytes, decoded as latin-1 (one char per byte). */
  | { t: "bytes"; v: string }
  | { t: "list" | "tuple" | "set" | "frozenset"; v: PyValue[] }
  | { t: "dict"; v: [PyValue, PyValue][] }
  /** Anything else (objects, complex numbers, ...): only a repr. */
  | { t: "other"; type: string; repr: string };

export class PyLiteralError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = "PyLiteralError";
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Parsing                                  */
/* -------------------------------------------------------------------------- */

type Token =
  | { k: "num"; text: string; pos: number }
  | { k: "str"; value: string; bytes: boolean; pos: number }
  | { k: "name"; text: string; pos: number }
  | { k: "op"; text: string; pos: number }
  | { k: "end"; pos: number };

const NUMBER_RE =
  /^(?:0[xX](?:_?[0-9a-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+|(?:(?:[0-9](?:_?[0-9])*)?\.[0-9](?:_?[0-9])*|[0-9](?:_?[0-9])*\.?)(?:[eE][+-]?[0-9](?:_?[0-9])*)?[jJ]?)/;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const STRING_PREFIX_RE = /^(?:[rRuUbB]|[rR][bB]|[bB][rR])?(?='|")/;

function decodeEscapes(body: string, pos: number): string {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[++i];
    switch (n) {
      case undefined:
        throw new PyLiteralError("Ongeldige escape aan het eind van een string", pos);
      case "\n":
        break;
      case "\\":
        out += "\\";
        break;
      case "'":
        out += "'";
        break;
      case '"':
        out += '"';
        break;
      case "n":
        out += "\n";
        break;
      case "t":
        out += "\t";
        break;
      case "r":
        out += "\r";
        break;
      case "a":
        out += "\x07";
        break;
      case "b":
        out += "\b";
        break;
      case "f":
        out += "\f";
        break;
      case "v":
        out += "\v";
        break;
      case "x": {
        const hex = body.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex))
          throw new PyLiteralError("Ongeldige \\x-escape", pos);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2;
        break;
      }
      case "u":
      case "U": {
        const len = n === "u" ? 4 : 8;
        const hex = body.slice(i + 1, i + 1 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex))
          throw new PyLiteralError(`Ongeldige \\${n}-escape`, pos);
        out += String.fromCodePoint(Number.parseInt(hex, 16));
        i += len;
        break;
      }
      default:
        if (n >= "0" && n <= "7") {
          let oct = n;
          while (oct.length < 3 && body[i + 1] >= "0" && body[i + 1] <= "7") {
            oct += body[++i];
          }
          out += String.fromCharCode(Number.parseInt(oct, 8));
        } else {
          // Unknown escapes keep the backslash, like Python.
          out += `\\${n}`;
        }
    }
  }
  return out;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f") {
      i++;
      continue;
    }
    if (c === "\\" && (src[i + 1] === "\n" || src[i + 1] === "\r")) {
      i += 2;
      continue;
    }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    const rest = src.slice(i);
    const prefix = STRING_PREFIX_RE.exec(rest);
    if (prefix) {
      const p = prefix[0].toLowerCase();
      const raw = p.includes("r");
      const bytes = p.includes("b");
      let j = i + prefix[0].length;
      const quote = src[j];
      const triple = src.slice(j, j + 3) === quote.repeat(3);
      const delim = triple ? quote.repeat(3) : quote;
      j += delim.length;
      const start = j;
      while (true) {
        if (j >= src.length)
          throw new PyLiteralError("String is niet afgesloten", i);
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (!triple && src[j] === "\n")
          throw new PyLiteralError("String is niet afgesloten", i);
        if (src.startsWith(delim, j)) break;
        j++;
      }
      const body = src.slice(start, j);
      tokens.push({
        k: "str",
        value: raw ? body : decodeEscapes(body, i),
        bytes,
        pos: i,
      });
      i = j + delim.length;
      continue;
    }
    if ((c >= "0" && c <= "9") || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = NUMBER_RE.exec(rest);
      if (!m) throw new PyLiteralError("Ongeldig getal", i);
      tokens.push({ k: "num", text: m[0], pos: i });
      i += m[0].length;
      if (/^[A-Za-z0-9_]/.test(src.slice(i)))
        throw new PyLiteralError("Ongeldig getal", i);
      continue;
    }
    const name = NAME_RE.exec(rest);
    if (name) {
      tokens.push({ k: "name", text: name[0], pos: i });
      i += name[0].length;
      continue;
    }
    if ("()[]{},:+-".includes(c)) {
      tokens.push({ k: "op", text: c, pos: i });
      i++;
      continue;
    }
    throw new PyLiteralError(`Onverwacht teken '${c}'`, i);
  }
  tokens.push({ k: "end", pos: src.length });
  return tokens;
}

function parseNumber(text: string, pos: number): PyValue {
  const clean = text.replace(/_/g, "");
  if (/[jJ]$/.test(clean)) {
    return { t: "other", type: "complex", repr: text };
  }
  if (/^0[xXoObB]/.test(clean)) {
    return { t: "int", v: BigInt(clean.toLowerCase()).toString() };
  }
  if (/[.eE]/.test(clean)) {
    const n = Number(clean);
    if (Number.isNaN(n)) throw new PyLiteralError("Ongeldig getal", pos);
    return { t: "float", v: Number.isFinite(n) ? n : "inf" };
  }
  if (/^0+[1-9]/.test(clean)) {
    throw new PyLiteralError("Getallen mogen niet met een 0 beginnen", pos);
  }
  return { t: "int", v: BigInt(clean).toString() };
}

function negate(v: PyValue, pos: number): PyValue {
  if (v.t === "int") {
    return { t: "int", v: (-BigInt(v.v)).toString() };
  }
  if (v.t === "float") {
    if (v.v === "inf") return { t: "float", v: "-inf" };
    if (v.v === "-inf") return { t: "float", v: "inf" };
    if (v.v === "nan") return v;
    return { t: "float", v: -v.v };
  }
  throw new PyLiteralError("Een minteken kan alleen voor een getal staan", pos);
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i];
  }
  private next(): Token {
    return this.tokens[this.i++];
  }
  private isOp(text: string): boolean {
    const t = this.peek();
    return t.k === "op" && t.text === text;
  }
  private expectOp(text: string): void {
    const t = this.next();
    if (t.k !== "op" || t.text !== text) {
      throw new PyLiteralError(`'${text}' verwacht`, t.pos);
    }
  }

  parseTop(): PyValue {
    const first = this.parseValue();
    if (this.isOp(",")) {
      const items = [first];
      while (this.isOp(",")) {
        this.next();
        if (this.peek().k === "end") break;
        items.push(this.parseValue());
      }
      this.expectEnd();
      return { t: "tuple", v: items };
    }
    this.expectEnd();
    return first;
  }

  private expectEnd(): void {
    const t = this.peek();
    if (t.k !== "end") throw new PyLiteralError("Onverwachte tekst na de waarde", t.pos);
  }

  parseValue(): PyValue {
    const t = this.next();
    if (t.k === "op" && (t.text === "-" || t.text === "+")) {
      const operand = this.parseValue();
      if (operand.t !== "int" && operand.t !== "float") {
        throw new PyLiteralError("Een plus- of minteken kan alleen voor een getal staan", t.pos);
      }
      return t.text === "-" ? negate(operand, t.pos) : operand;
    }
    switch (t.k) {
      case "num":
        return parseNumber(t.text, t.pos);
      case "str": {
        let value = t.value;
        const bytes = t.bytes;
        while (this.peek().k === "str") {
          const s = this.next() as Extract<Token, { k: "str" }>;
          if (s.bytes !== bytes)
            throw new PyLiteralError("Je kunt bytes en strings niet aan elkaar plakken", s.pos);
          value += s.value;
        }
        return bytes ? { t: "bytes", v: value } : { t: "str", v: value };
      }
      case "name":
        switch (t.text) {
          case "True":
            return { t: "bool", v: true };
          case "False":
            return { t: "bool", v: false };
          case "None":
            return { t: "none" };
          case "inf":
          case "nan":
            // Not valid Python, but convenient: `inf` / `nan` for floats.
            return { t: "float", v: t.text };
          case "set":
          case "frozenset": {
            this.expectOp("(");
            if (this.isOp(")")) {
              this.next();
              return { t: t.text, v: [] };
            }
            const inner = this.parseValue();
            this.expectOp(")");
            if (
              inner.t === "list" ||
              inner.t === "tuple" ||
              inner.t === "set" ||
              inner.t === "frozenset"
            ) {
              return { t: t.text, v: dedupe(inner.v) };
            }
            throw new PyLiteralError(`${t.text}() verwacht een lijst, tuple of set`, t.pos);
          }
          case "float": {
            // float('inf') / float('nan') / float('-inf') / float(1)
            this.expectOp("(");
            const arg = this.parseValue();
            this.expectOp(")");
            if (arg.t === "str") {
              const s = arg.v.trim().toLowerCase();
              if (s === "inf" || s === "+inf" || s === "infinity") return { t: "float", v: "inf" };
              if (s === "-inf" || s === "-infinity") return { t: "float", v: "-inf" };
              if (s === "nan") return { t: "float", v: "nan" };
              const n = Number(s);
              if (!Number.isNaN(n) && s !== "") return { t: "float", v: n };
            }
            if (arg.t === "int") return { t: "float", v: Number(arg.v) };
            if (arg.t === "float") return arg;
            throw new PyLiteralError("Ongeldige float(...)", t.pos);
          }
          default:
            throw new PyLiteralError(
              `'${t.text}' is geen Python-waarde (bedoel je een string, dan zet je er aanhalingstekens omheen)`,
              t.pos,
            );
        }
      case "op":
        if (t.text === "[") return { t: "list", v: this.parseItems("]") };
        if (t.text === "(") {
          if (this.isOp(")")) {
            this.next();
            return { t: "tuple", v: [] };
          }
          const first = this.parseValue();
          if (this.isOp(")")) {
            this.next();
            return first; // parenthesized value
          }
          this.expectOp(",");
          const rest = this.isOp(")") ? [] : this.parseItems(")", true);
          if (rest.length === 0) this.expectOp(")");
          return { t: "tuple", v: [first, ...rest] };
        }
        if (t.text === "{") return this.parseBrace();
        throw new PyLiteralError(`Onverwacht '${t.text}'`, t.pos);
      case "end":
        throw new PyLiteralError("Waarde verwacht", t.pos);
    }
  }

  /** Comma-separated values up to `close` (consumed). */
  private parseItems(close: string, alreadyStarted = false): PyValue[] {
    const items: PyValue[] = [];
    if (!alreadyStarted && this.isOp(close)) {
      this.next();
      return items;
    }
    while (true) {
      items.push(this.parseValue());
      if (this.isOp(",")) {
        this.next();
        if (this.isOp(close)) {
          this.next();
          return items;
        }
        continue;
      }
      this.expectOp(close);
      return items;
    }
  }

  private parseBrace(): PyValue {
    if (this.isOp("}")) {
      this.next();
      return { t: "dict", v: [] };
    }
    const first = this.parseValue();
    if (this.isOp(":")) {
      this.next();
      const entries: [PyValue, PyValue][] = [[first, this.parseValue()]];
      while (this.isOp(",")) {
        this.next();
        if (this.isOp("}")) break;
        const k = this.parseValue();
        this.expectOp(":");
        entries.push([k, this.parseValue()]);
      }
      this.expectOp("}");
      // Later keys win, like Python.
      const out: [PyValue, PyValue][] = [];
      for (const [k, v] of entries) {
        const idx = out.findIndex(([ok]) => strictEqual(ok, k));
        if (idx >= 0) out[idx] = [out[idx][0], v];
        else out.push([k, v]);
      }
      return { t: "dict", v: out };
    }
    const items = [first];
    while (this.isOp(",")) {
      this.next();
      if (this.isOp("}")) break;
      items.push(this.parseValue());
    }
    this.expectOp("}");
    return { t: "set", v: dedupe(items) };
  }
}

/** Structural equality without tolerance (for set/dict keys). */
function strictEqual(a: PyValue, b: PyValue): boolean {
  return pyRepr(a) === pyRepr(b) && a.t === b.t;
}

function dedupe(items: PyValue[]): PyValue[] {
  const out: PyValue[] = [];
  for (const it of items) if (!out.some((o) => strictEqual(o, it))) out.push(it);
  return out;
}

/**
 * Parse a Python literal (like `ast.literal_eval`): numbers, strings, bytes,
 * True/False/None, lists, tuples, dicts, sets, `set()`, plus the extras
 * `float('inf')`, `float('nan')`, `inf` and `nan`. Throws PyLiteralError.
 */
export function parsePythonLiteral(source: string): PyValue {
  return new Parser(tokenize(source)).parseTop();
}

export function tryParsePythonLiteral(
  source: string,
): { ok: true; value: PyValue } | { ok: false; error: string } {
  try {
    return { ok: true, value: parsePythonLiteral(source) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                                    repr                                    */
/* -------------------------------------------------------------------------- */

/** Python `repr()` of a float. */
export function floatRepr(v: number | "inf" | "-inf" | "nan"): string {
  if (v === "inf" || v === "-inf" || v === "nan") return v;
  if (Object.is(v, -0)) return "-0.0";
  if (v === 0) return "0.0";
  const [mant, expStr] = v.toExponential().split("e");
  const exp = Number(expStr);
  const neg = mant.startsWith("-");
  const digits = mant.replace("-", "").replace(".", "");
  if (exp >= -4 && exp < 16) {
    let s: string;
    if (exp >= 0) {
      const intLen = exp + 1;
      s =
        digits.length <= intLen
          ? `${digits.padEnd(intLen, "0")}.0`
          : `${digits.slice(0, intLen)}.${digits.slice(intLen)}`;
    } else {
      s = `0.${"0".repeat(-exp - 1)}${digits}`;
    }
    return (neg ? "-" : "") + s;
  }
  const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  const e = Math.abs(exp).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${m}e${exp < 0 ? "-" : "+"}${e}`;
}

/** Python `repr()` of a str. */
export function strRepr(s: string, prefix = ""): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
    else out += ch;
  }
  return `${prefix}${quote}${out}${quote}`;
}

/** Python-like `repr()` of a PyValue. */
export function pyRepr(v: PyValue, maxLength = 2000): string {
  const s = reprInner(v);
  return s.length > maxLength ? `${s.slice(0, maxLength)}...` : s;
}

function reprInner(v: PyValue): string {
  switch (v.t) {
    case "none":
      return "None";
    case "bool":
      return v.v ? "True" : "False";
    case "int":
      return v.v;
    case "float":
      return floatRepr(v.v);
    case "str":
      return strRepr(v.v);
    case "bytes":
      return strRepr(v.v, "b");
    case "list":
      return `[${v.v.map(reprInner).join(", ")}]`;
    case "tuple":
      return v.v.length === 1
        ? `(${reprInner(v.v[0])},)`
        : `(${v.v.map(reprInner).join(", ")})`;
    case "set":
      return v.v.length ? `{${v.v.map(reprInner).join(", ")}}` : "set()";
    case "frozenset":
      return v.v.length ? `frozenset({${v.v.map(reprInner).join(", ")}})` : "frozenset()";
    case "dict":
      return `{${v.v.map(([k, x]) => `${reprInner(k)}: ${reprInner(x)}`).join(", ")}}`;
    case "other":
      return v.repr;
  }
}

/** Python type name of a value, e.g. "int", "list". */
export function pyTypeName(v: PyValue): string {
  switch (v.t) {
    case "none":
      return "NoneType";
    case "other":
      return v.type;
    default:
      return v.t;
  }
}

/**
 * A small, forgiving Python tokenizer (isomorphic, no dependencies).
 *
 * Good enough for static hints such as code tips and code similarity: it
 * understands strings (all prefixes, triple quotes, f-strings with nested
 * quotes), comments, numbers, operators, line continuation, implicit line
 * joining inside brackets and indentation. It never throws: an unterminated
 * string runs to the end of its line (or of the file for triple quotes),
 * and unknown characters become single-character "op" tokens.
 */

export type TokenKind =
  | "name"
  | "keyword"
  | "number"
  | "string"
  | "op"
  | "newline"
  | "indent"
  | "dedent"
  | "comment";

export type Token = {
  kind: TokenKind;
  value: string;
  /** 1-based line where the token starts. */
  line: number;
};

export type TokenizeResult = {
  tokens: Token[];
  /** Indentation uses both tabs and spaces somewhere in the file. */
  mixedIndent: boolean;
};

/** Hard keywords (soft keywords such as match/case/type are names). */
export const KEYWORDS: ReadonlySet<string> = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

/** Names that are always defined: built-in functions, types and exceptions. */
export const BUILTINS: ReadonlySet<string> = new Set([
  // functions and types
  "abs",
  "aiter",
  "all",
  "anext",
  "any",
  "ascii",
  "bin",
  "bool",
  "breakpoint",
  "bytearray",
  "bytes",
  "callable",
  "chr",
  "classmethod",
  "compile",
  "complex",
  "delattr",
  "dict",
  "dir",
  "divmod",
  "enumerate",
  "eval",
  "exec",
  "exit",
  "filter",
  "float",
  "format",
  "frozenset",
  "getattr",
  "globals",
  "hasattr",
  "hash",
  "help",
  "hex",
  "id",
  "input",
  "int",
  "isinstance",
  "issubclass",
  "iter",
  "len",
  "list",
  "locals",
  "map",
  "max",
  "memoryview",
  "min",
  "next",
  "object",
  "oct",
  "open",
  "ord",
  "pow",
  "print",
  "property",
  "quit",
  "range",
  "repr",
  "reversed",
  "round",
  "set",
  "setattr",
  "slice",
  "sorted",
  "staticmethod",
  "str",
  "sum",
  "super",
  "tuple",
  "type",
  "vars",
  "zip",
  "__import__",
  // constants
  "Ellipsis",
  "NotImplemented",
  // module globals that always exist
  "__name__",
  "__file__",
  "__doc__",
  // exceptions
  "ArithmeticError",
  "AssertionError",
  "AttributeError",
  "BaseException",
  "BaseExceptionGroup",
  "EOFError",
  "Exception",
  "ExceptionGroup",
  "FileExistsError",
  "FileNotFoundError",
  "FloatingPointError",
  "ImportError",
  "IndentationError",
  "IndexError",
  "KeyError",
  "KeyboardInterrupt",
  "LookupError",
  "MemoryError",
  "ModuleNotFoundError",
  "NameError",
  "NotImplementedError",
  "OSError",
  "OverflowError",
  "PermissionError",
  "RecursionError",
  "RuntimeError",
  "StopIteration",
  "SyntaxError",
  "SystemExit",
  "TabError",
  "TimeoutError",
  "TypeError",
  "UnboundLocalError",
  "UnicodeDecodeError",
  "UnicodeEncodeError",
  "UnicodeError",
  "ValueError",
  "Warning",
  "ZeroDivisionError",
]);

/** String prefixes, lower-cased (t-strings exist since Python 3.14). */
const STRING_PREFIXES = new Set([
  "r",
  "u",
  "b",
  "f",
  "t",
  "br",
  "rb",
  "fr",
  "rf",
  "tr",
  "rt",
]);

const OPS3 = new Set(["**=", "//=", ">>=", "<<=", "..."]);
const OPS2 = new Set([
  "->",
  ":=",
  "**",
  "//",
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "@=",
]);

const NAME_RE = /[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/uy;
const NUMBER_RE =
  /(?:0[xX](?:_?[0-9a-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+|(?:\d(?:_?\d)*\.?(?:\d(?:_?\d)*)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?)/y;

const isLineBreak = (ch: string | undefined) => ch === "\n" || ch === "\r";
const isBlank = (ch: string | undefined) =>
  ch === " " || ch === "\t" || ch === "\f";

function countLineBreaks(text: string): number {
  let count = 0;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === "\n") count++;
    else if (ch === "\r" && text[k + 1] !== "\n") count++;
  }
  return count;
}

/**
 * Scans a string body starting after the opening quote(s). Returns the
 * index just after the closing quote(s), or the end of the line (single
 * quotes) / file (triple quotes) when the string is unterminated.
 */
function scanString(
  src: string,
  start: number,
  quote: string,
  triple: boolean,
  isFormat: boolean,
): number {
  const n = src.length;
  let j = start;
  /** Depth of `{…}` replacement fields in an f-string. */
  let field = 0;
  while (j < n) {
    const ch = src[j];
    if (ch === "\\") {
      // Escapes (also in raw strings) never end the string; a backslash
      // before a line break continues a single-quoted string.
      j += src[j + 1] === "\r" && src[j + 2] === "\n" ? 3 : 2;
      continue;
    }
    if (!triple && isLineBreak(ch)) return j;
    if (isFormat && field > 0) {
      if (ch === "{") field++;
      else if (ch === "}") field--;
      else if (ch === '"' || ch === "'") {
        // Nested string inside the expression (allowed since Python 3.12).
        const nestedTriple = src.startsWith(ch.repeat(3), j);
        const end = scanString(
          src,
          j + (nestedTriple ? 3 : 1),
          ch,
          nestedTriple,
          false,
        );
        if (!triple && isLineBreak(src[end])) return end;
        j = end;
        continue;
      }
      j++;
      continue;
    }
    if (isFormat && ch === "{") {
      if (src[j + 1] === "{") j += 2;
      else {
        field = 1;
        j++;
      }
      continue;
    }
    if (ch === quote) {
      if (!triple) return j + 1;
      if (src.startsWith(quote.repeat(3), j)) return j + 3;
    }
    j++;
  }
  return n;
}

export function tokenizePython(src: string): TokenizeResult {
  const tokens: Token[] = [];
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  /** Bracket depth: line breaks inside brackets don't end the line. */
  let depth = 0;
  const indents = [0];
  let atLineStart = true;
  let lineHasTokens = false;
  let sawTabIndent = false;
  let sawSpaceIndent = false;

  const push = (kind: TokenKind, value: string, at = line) => {
    tokens.push({ kind, value, line: at });
    if (kind !== "comment" && kind !== "newline") lineHasTokens = true;
  };

  while (i < n) {
    if (atLineStart) {
      atLineStart = false;
      let j = i;
      let width = 0;
      while (j < n && isBlank(src[j])) {
        const ch = src[j];
        if (ch === " ") width++;
        else if (ch === "\t") width = (Math.floor(width / 8) + 1) * 8;
        else width = 0;
        j++;
      }
      const next = src[j];
      // Blank and comment-only lines don't change the indentation.
      if (j < n && !isLineBreak(next) && next !== "#") {
        const ws = src.slice(i, j);
        if (ws.includes("\t")) sawTabIndent = true;
        if (ws.includes(" ")) sawSpaceIndent = true;
        const top = indents[indents.length - 1];
        if (width > top) {
          indents.push(width);
          push("indent", ws);
        } else if (width < top) {
          while (indents.length > 1 && width < indents[indents.length - 1]) {
            indents.pop();
            push("dedent", "");
          }
          // Inconsistent dedent: continue at this width without failing.
          if (width > indents[indents.length - 1]) indents.push(width);
        }
      }
      i = j;
      continue;
    }

    const ch = src[i];

    if (isBlank(ch)) {
      i++;
      continue;
    }

    if (isLineBreak(ch)) {
      if (depth === 0) {
        if (lineHasTokens) push("newline", "\n");
        atLineStart = true;
        lineHasTokens = false;
      }
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
      line++;
      continue;
    }

    if (ch === "#") {
      let j = i;
      while (j < n && !isLineBreak(src[j])) j++;
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "\\") {
      const next = src[i + 1];
      if (isLineBreak(next)) {
        // Explicit line continuation: the logical line goes on.
        i += next === "\r" && src[i + 2] === "\n" ? 3 : 2;
        line++;
        continue;
      }
      push("op", ch);
      i++;
      continue;
    }

    // Names, keywords and string prefixes.
    NAME_RE.lastIndex = i;
    const name = NAME_RE.exec(src);
    if (name) {
      const word = name[0];
      const after = src[i + word.length];
      if (
        (after === '"' || after === "'") &&
        STRING_PREFIXES.has(word.toLowerCase())
      ) {
        i = readString(i, word.length);
        continue;
      }
      push(KEYWORDS.has(word) ? "keyword" : "name", word);
      i += word.length;
      continue;
    }

    if (ch === '"' || ch === "'") {
      i = readString(i, 0);
      continue;
    }

    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." && /\d/.test(src[i + 1] ?? ""))
    ) {
      NUMBER_RE.lastIndex = i;
      const num = NUMBER_RE.exec(src);
      const value = num ? num[0] : ch;
      push("number", value);
      i += value.length;
      continue;
    }

    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    const op = OPS3.has(three) ? three : OPS2.has(two) ? two : ch;
    if (op === "(" || op === "[" || op === "{") depth++;
    else if (op === ")" || op === "]" || op === "}")
      depth = Math.max(0, depth - 1);
    push("op", op);
    i += op.length;
  }

  if (lineHasTokens) push("newline", "");
  while (indents.length > 1) {
    indents.pop();
    push("dedent", "");
  }

  return { tokens, mixedIndent: sawTabIndent && sawSpaceIndent };

  /** Reads a string token at `start` (prefix length `prefixLength`). */
  function readString(start: number, prefixLength: number): number {
    const prefix = src.slice(start, start + prefixLength).toLowerCase();
    const isFormat = prefix.includes("f") || prefix.includes("t");
    const quoteAt = start + prefixLength;
    const quote = src[quoteAt];
    const triple = src.startsWith(quote.repeat(3), quoteAt);
    const end = scanString(
      src,
      quoteAt + (triple ? 3 : 1),
      quote,
      triple,
      isFormat,
    );
    const value = src.slice(start, end);
    push("string", value);
    line += countLineBreaks(value);
    return end;
  }
}

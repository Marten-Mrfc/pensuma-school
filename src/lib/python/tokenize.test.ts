import { describe, expect, test } from "bun:test";
import { BUILTINS, KEYWORDS, type Token, tokenizePython } from "./tokenize";

const kinds = (tokens: Token[]) => tokens.map((t) => t.kind);
const compact = (tokens: Token[]) =>
  tokens.map((t) => `${t.kind}:${t.value}@${t.line}`);

describe("tokenizePython", () => {
  test("a simple program", () => {
    const { tokens, mixedIndent } = tokenizePython(
      'naam = input("Wat is je naam? ")\nprint("Hallo", naam)\n',
    );
    expect(mixedIndent).toBe(false);
    expect(compact(tokens)).toEqual([
      "name:naam@1",
      "op:=@1",
      "name:input@1",
      "op:(@1",
      'string:"Wat is je naam? "@1',
      "op:)@1",
      "newline:\n@1",
      "name:print@2",
      "op:(@2",
      'string:"Hallo"@2',
      "op:,@2",
      "name:naam@2",
      "op:)@2",
      "newline:\n@2",
    ]);
  });

  test("keywords, names, numbers and operators", () => {
    const { tokens } = tokenizePython(
      "if x >= 10 and y != 0x1F:\n    z **= 1_000.5e-3j\n",
    );
    expect(compact(tokens)).toEqual([
      "keyword:if@1",
      "name:x@1",
      "op:>=@1",
      "number:10@1",
      "keyword:and@1",
      "name:y@1",
      "op:!=@1",
      "number:0x1F@1",
      "op::@1",
      "newline:\n@1",
      "indent:    @2",
      "name:z@2",
      "op:**=@2",
      "number:1_000.5e-3j@2",
      "newline:\n@2",
      "dedent:@3",
    ]);
    // Soft keywords are names.
    const soft = tokenizePython("match = case = type = 1").tokens;
    expect(soft.filter((t) => t.kind === "keyword")).toEqual([]);
    expect(tokenizePython(".5 + 1.").tokens.slice(0, 3)).toEqual([
      { kind: "number", value: ".5", line: 1 },
      { kind: "op", value: "+", line: 1 },
      { kind: "number", value: "1.", line: 1 },
    ]);
  });

  test("f-strings are one token, also with nested quotes and braces", () => {
    const cases = [
      'f"Hallo {naam}!"',
      "F'{x:>{breedte}} {{letterlijk}}'",
      'f"{d["sleutel"]} en {d[\'ander\']}"',
      'rf"\\d{n}"',
      'f"{waarde!r:>10}"',
    ];
    for (const source of cases) {
      const { tokens } = tokenizePython(`print(${source})`);
      expect(compact(tokens)).toEqual([
        "name:print@1",
        "op:(@1",
        `string:${source}@1`,
        "op:)@1",
        "newline:@1",
      ]);
    }
  });

  test("string prefixes in any case", () => {
    for (const prefix of [
      "r",
      "u",
      "b",
      "f",
      "rb",
      "Rb",
      "BR",
      "bR",
      "fr",
      "RF",
      "t",
    ]) {
      const { tokens } = tokenizePython(`x = ${prefix}'abc'`);
      expect(tokens[2]).toEqual({
        kind: "string",
        value: `${prefix}'abc'`,
        line: 1,
      });
    }
    // Not a prefix: a name followed by a string.
    const { tokens } = tokenizePython("print 'x'");
    expect(kinds(tokens)).toEqual(["name", "string", "newline"]);
    // A raw string may contain an escaped quote.
    expect(tokenizePython('r"a\\"b"').tokens[0].value).toBe('r"a\\"b"');
  });

  test("triple quotes across lines", () => {
    const src = 's = """regel 1\nregel \'2\'\n"regel" 3"""\nprint(s)\n';
    const { tokens } = tokenizePython(src);
    expect(compact(tokens)).toEqual([
      "name:s@1",
      "op:=@1",
      'string:"""regel 1\nregel \'2\'\n"regel" 3"""@1',
      "newline:\n@3",
      "name:print@4",
      "op:(@4",
      "name:s@4",
      "op:)@4",
      "newline:\n@4",
    ]);
  });

  test("brackets across lines join the line", () => {
    const src = "getallen = [\n    1,\n    2,\n]\ntotaal = sum(\n  getallen)\n";
    const { tokens } = tokenizePython(src);
    expect(tokens.filter((t) => t.kind === "indent")).toEqual([]);
    expect(
      tokens.filter((t) => t.kind === "newline").map((t) => t.line),
    ).toEqual([4, 6]);
    expect(tokens.find((t) => t.value === "totaal")?.line).toBe(5);
    expect(tokens.find((t) => t.value === "2")?.line).toBe(3);
  });

  test("backslash continuation", () => {
    const src = "totaal = 1 + \\\n    2\nprint(totaal)\n";
    const { tokens } = tokenizePython(src);
    expect(kinds(tokens)).toEqual([
      "name",
      "op",
      "number",
      "op",
      "number",
      "newline",
      "name",
      "op",
      "name",
      "op",
      "newline",
    ]);
    expect(tokens[4]).toEqual({ kind: "number", value: "2", line: 2 });
    expect(tokens[6].line).toBe(3);
  });

  test("comments", () => {
    const { tokens } = tokenizePython(
      "# uitleg\nx = 1  # een getal\n\n    # ingesprongen commentaar\ny = 2",
    );
    expect(compact(tokens)).toEqual([
      "comment:# uitleg@1",
      "name:x@2",
      "op:=@2",
      "number:1@2",
      "comment:# een getal@2",
      "newline:\n@2",
      "comment:# ingesprongen commentaar@4",
      "name:y@5",
      "op:=@5",
      "number:2@5",
      "newline:@5",
    ]);
  });

  test("indent and dedent", () => {
    const src =
      "def f(x):\n    if x:\n        return 1\n    return 2\n\nprint(f(1))\n";
    const { tokens } = tokenizePython(src);
    expect(
      tokens
        .filter((t) => t.kind === "indent" || t.kind === "dedent")
        .map((t) => `${t.kind}@${t.line}`),
    ).toEqual(["indent@2", "indent@3", "dedent@4", "dedent@6"]);
    // Dedents at the end of the file.
    const open = tokenizePython("while True:\n    pass").tokens;
    expect(kinds(open).slice(-3)).toEqual(["keyword", "newline", "dedent"]);
  });

  test("the mixedIndent flag", () => {
    expect(tokenizePython("if x:\n    a = 1\n").mixedIndent).toBe(false);
    expect(tokenizePython("if x:\n\ta = 1\n").mixedIndent).toBe(false);
    expect(
      tokenizePython("if x:\n\ta = 1\nif y:\n    b = 2\n").mixedIndent,
    ).toBe(true);
    expect(tokenizePython("if x:\n \ta = 1\n").mixedIndent).toBe(true);
    // Whitespace inside strings, brackets or blank lines doesn't count.
    expect(
      tokenizePython('s = """\n\tx"""\nif x:\n    a = [\n\t1]\n  \t\n')
        .mixedIndent,
    ).toBe(false);
  });

  test("an unterminated string runs to the end of the line", () => {
    const { tokens } = tokenizePython('print("hallo)\nprint(1)\n');
    expect(compact(tokens)).toEqual([
      "name:print@1",
      "op:(@1",
      'string:"hallo)@1',
      "name:print@2",
      "op:(@2",
      "number:1@2",
      "op:)@2",
      // The "(" of line 1 is still open, so the lines are joined and the
      // logical line only ends at the end of the file.
      "newline:@3",
    ]);
  });

  test("an unterminated triple-quoted string runs to the end of the file", () => {
    const { tokens } = tokenizePython('x = 1\ns = """abc\nprint(1)\n');
    expect(compact(tokens)).toEqual([
      "name:x@1",
      "op:=@1",
      "number:1@1",
      "newline:\n@1",
      "name:s@2",
      "op:=@2",
      'string:"""abc\nprint(1)\n@2',
      "newline:@4",
    ]);
  });

  test("CRLF line endings", () => {
    const { tokens } = tokenizePython("if x:\r\n    y = 1\r\nz = 2\r\n");
    expect(tokens.find((t) => t.value === "y")?.line).toBe(2);
    expect(tokens.find((t) => t.value === "z")?.line).toBe(3);
    expect(kinds(tokens).filter((k) => k === "dedent")).toHaveLength(1);
  });

  test("never throws", () => {
    const inputs = [
      "",
      "\\",
      '"""',
      "'",
      "f'{",
      'f"{x[\'a"',
      'f"""{x"""',
      "\t \t",
      "  x\n y\nz",
      "a = (((",
      ")))]]]}}}",
      "€ $ ? ` \u00a0",
      "\ufeffprint(1)",
      "x = 0x",
      "\\\n\\\n",
      "\r\r\n\n",
      "def f(:\n\treturn\n  pass\n",
      "😀 = 1",
    ];
    for (const input of inputs) {
      expect(() => tokenizePython(input)).not.toThrow();
    }
    expect(tokenizePython("\ufeffprint(1)").tokens[0]).toEqual({
      kind: "name",
      value: "print",
      line: 1,
    });
  });

  test("KEYWORDS and BUILTINS", () => {
    expect(KEYWORDS.has("def")).toBe(true);
    expect(KEYWORDS.has("print")).toBe(false);
    expect(KEYWORDS.has("match")).toBe(false);
    expect(BUILTINS.has("print")).toBe(true);
    expect(BUILTINS.has("input")).toBe(true);
    expect(BUILTINS.has("ValueError")).toBe(true);
    expect(BUILTINS.has("def")).toBe(false);
  });
});

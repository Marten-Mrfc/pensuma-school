import { describe, expect, test } from "bun:test";
import {
  floatRepr,
  type PyValue,
  parsePythonLiteral,
  pyRepr,
  strRepr,
  tryParsePythonLiteral,
} from "./pyvalue";

const p = parsePythonLiteral;

describe("parsePythonLiteral", () => {
  test("numbers", () => {
    expect(p("2")).toEqual({ t: "int", v: "2" });
    expect(p("-3")).toEqual({ t: "int", v: "-3" });
    expect(p("+3")).toEqual({ t: "int", v: "3" });
    expect(p("1_000")).toEqual({ t: "int", v: "1000" });
    expect(p("0x1f")).toEqual({ t: "int", v: "31" });
    expect(p("0b101")).toEqual({ t: "int", v: "5" });
    expect(p("0o17")).toEqual({ t: "int", v: "15" });
    expect(p("123456789012345678901234567890")).toEqual({
      t: "int",
      v: "123456789012345678901234567890",
    });
    expect(p("2.0")).toEqual({ t: "float", v: 2 });
    expect(p("-2.5")).toEqual({ t: "float", v: -2.5 });
    expect(p(".5")).toEqual({ t: "float", v: 0.5 });
    expect(p("5.")).toEqual({ t: "float", v: 5 });
    expect(p("1e3")).toEqual({ t: "float", v: 1000 });
    expect(p("1.5E-3")).toEqual({ t: "float", v: 0.0015 });
    expect(p("float('inf')")).toEqual({ t: "float", v: "inf" });
    expect(p("-float('inf')")).toEqual({ t: "float", v: "-inf" });
    expect(p('float("nan")')).toEqual({ t: "float", v: "nan" });
  });

  test("strings", () => {
    expect(p("'abc'")).toEqual({ t: "str", v: "abc" });
    expect(p('"it\'s"')).toEqual({ t: "str", v: "it's" });
    expect(p("'a\\nb'")).toEqual({ t: "str", v: "a\nb" });
    expect(p("'\\x41\\u00e9\\t'")).toEqual({ t: "str", v: "Aé\t" });
    expect(p("r'\\d+'")).toEqual({ t: "str", v: "\\d+" });
    expect(p("'''multi\nline'''")).toEqual({ t: "str", v: "multi\nline" });
    expect(p("'ab' 'cd'")).toEqual({ t: "str", v: "abcd" });
    expect(p("b'hi'")).toEqual({ t: "bytes", v: "hi" });
    expect(p("''")).toEqual({ t: "str", v: "" });
  });

  test("constants", () => {
    expect(p("True")).toEqual({ t: "bool", v: true });
    expect(p("False")).toEqual({ t: "bool", v: false });
    expect(p("None")).toEqual({ t: "none" });
  });

  test("containers", () => {
    expect(p("[1, 'a', None]")).toEqual({
      t: "list",
      v: [{ t: "int", v: "1" }, { t: "str", v: "a" }, { t: "none" }],
    });
    expect(p("[]")).toEqual({ t: "list", v: [] });
    expect(p("[1, 2,]")).toEqual({
      t: "list",
      v: [
        { t: "int", v: "1" },
        { t: "int", v: "2" },
      ],
    });
    expect(p("()")).toEqual({ t: "tuple", v: [] });
    expect(p("(1,)")).toEqual({ t: "tuple", v: [{ t: "int", v: "1" }] });
    expect(p("(1)")).toEqual({ t: "int", v: "1" });
    expect(p("1, 2")).toEqual({
      t: "tuple",
      v: [
        { t: "int", v: "1" },
        { t: "int", v: "2" },
      ],
    });
    expect(p("{}")).toEqual({ t: "dict", v: [] });
    expect(p("{'a': 1, 'b': [2.5]}")).toEqual({
      t: "dict",
      v: [
        [
          { t: "str", v: "a" },
          { t: "int", v: "1" },
        ],
        [
          { t: "str", v: "b" },
          { t: "list", v: [{ t: "float", v: 2.5 }] },
        ],
      ],
    });
    expect(p("{'a': 1, 'a': 2}")).toEqual({
      t: "dict",
      v: [
        [
          { t: "str", v: "a" },
          { t: "int", v: "2" },
        ],
      ],
    });
    expect(p("{1, 2, 2}")).toEqual({
      t: "set",
      v: [
        { t: "int", v: "1" },
        { t: "int", v: "2" },
      ],
    });
    expect(p("set()")).toEqual({ t: "set", v: [] });
    expect(p("frozenset([1])")).toEqual({
      t: "frozenset",
      v: [{ t: "int", v: "1" }],
    });
    expect(p("  [\n  1,\n  2  # comment\n]  ")).toEqual({
      t: "list",
      v: [
        { t: "int", v: "1" },
        { t: "int", v: "2" },
      ],
    });
  });

  test("rejects non-literals with a Dutch message", () => {
    for (const bad of [
      "abc",
      "[1, 2",
      "1 +",
      "print(1)",
      "{'a' 1}",
      "'open",
      "-'a'",
      "007",
      "1 2",
    ]) {
      const r = tryParsePythonLiteral(bad);
      expect(r.ok).toBe(false);
    }
    const r = tryParsePythonLiteral("Hallo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("aanhalingstekens");
  });
});

describe("repr", () => {
  test("floatRepr matches Python", () => {
    const cases: [number, string][] = [
      [2, "2.0"],
      [0.1, "0.1"],
      [-2.5, "-2.5"],
      [1e16, "1e+16"],
      [1e22, "1e+22"],
      [123456789.123, "123456789.123"],
      [0.0001, "0.0001"],
      [0.00001, "1e-05"],
      [1.5e-7, "1.5e-07"],
      [1234567890123456.0, "1234567890123456.0"],
      [0.30000000000000004, "0.30000000000000004"],
      [100, "100.0"],
    ];
    for (const [n, s] of cases) expect(floatRepr(n)).toBe(s);
    expect(floatRepr("inf")).toBe("inf");
  });

  test("strRepr matches Python quoting", () => {
    expect(strRepr("abc")).toBe("'abc'");
    expect(strRepr("it's")).toBe(`"it's"`);
    expect(strRepr(`it's "x"`)).toBe(`'it\\'s "x"'`);
    expect(strRepr("a\nb\\")).toBe("'a\\nb\\\\'");
  });

  test("pyRepr of containers", () => {
    const v: PyValue = p("{'a': (1,), 'b': [2.0, None, True], 'c': set()}");
    expect(pyRepr(v)).toBe("{'a': (1,), 'b': [2.0, None, True], 'c': set()}");
    expect(pyRepr(p("(1, 2)"))).toBe("(1, 2)");
    expect(pyRepr(p("{3}"))).toBe("{3}");
    expect(pyRepr(p("b'x'"))).toBe("b'x'");
  });
});

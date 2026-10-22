import { describe, expect, test } from "bun:test";
import {
  cellToText,
  escapeCsvField,
  formatDateTimeNl,
  formatDecimalNl,
  formatFixedNl,
  slugifyFilename,
  toCsv,
  UTF8_BOM,
} from "./csv";

describe("formatDecimalNl", () => {
  test("uses a decimal comma and trims trailing zeros", () => {
    expect(formatDecimalNl(7.5)).toBe("7,5");
    expect(formatDecimalNl(3)).toBe("3");
    expect(formatDecimalNl(2.345)).toBe("2,35");
    expect(formatDecimalNl(2.3, 0)).toBe("2");
    expect(formatDecimalNl(1234.5)).toBe("1234,5");
  });

  test("handles negative zero, null and non-finite values", () => {
    expect(formatDecimalNl(-0.001)).toBe("0");
    expect(formatDecimalNl(null)).toBe("");
    expect(formatDecimalNl(undefined)).toBe("");
    expect(formatDecimalNl(Number.NaN)).toBe("");
    expect(formatDecimalNl(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("formatFixedNl", () => {
  test("keeps a fixed number of decimals", () => {
    expect(formatFixedNl(7, 1)).toBe("7,0");
    expect(formatFixedNl(5.55, 1)).toMatch(/^5,[56]$/);
    expect(formatFixedNl(10, 1)).toBe("10,0");
    expect(formatFixedNl(null)).toBe("");
  });
});

describe("formatDateTimeNl", () => {
  test("formats in Amsterdam time as dd-mm-jjjj uu:mm", () => {
    // 2026-10-22 13:05 UTC = 15:05 in Amsterdam (CEST, UTC+2)
    expect(formatDateTimeNl(new Date("2026-10-22T13:05:00Z"))).toBe(
      "22-10-2026 15:05",
    );
    // Winter time (CET, UTC+1)
    expect(formatDateTimeNl("2026-12-01T08:00:00Z")).toBe("01-12-2026 09:00");
  });

  test("returns an empty string for missing or invalid dates", () => {
    expect(formatDateTimeNl(null)).toBe("");
    expect(formatDateTimeNl("geen datum")).toBe("");
  });
});

describe("escapeCsvField", () => {
  test("leaves simple values alone", () => {
    expect(escapeCsvField("Jan Jansen")).toBe("Jan Jansen");
    expect(escapeCsvField("7,5")).toBe("7,5");
  });

  test("quotes values containing the delimiter, quotes or line breaks", () => {
    expect(escapeCsvField("Jansen; Jan")).toBe('"Jansen; Jan"');
    expect(escapeCsvField('Zeg "hallo"')).toBe('"Zeg ""hallo"""');
    expect(escapeCsvField("regel 1\nregel 2")).toBe('"regel 1\nregel 2"');
    expect(escapeCsvField("a\r\nb")).toBe('"a\r\nb"');
    expect(escapeCsvField(" spatie ")).toBe('" spatie "');
  });

  test("only quotes commas when the delimiter is a comma", () => {
    expect(escapeCsvField("a,b", ";")).toBe("a,b");
    expect(escapeCsvField("a,b", ",")).toBe('"a,b"');
  });

  test("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(escapeCsvField("=SUM(A1:A3)")).toBe("'=SUM(A1:A3)");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
    expect(escapeCsvField("+31 6 1234")).toBe("'+31 6 1234");
    expect(escapeCsvField("-2,5")).toBe("-2,5");
    expect(escapeCsvField("-3")).toBe("-3");
  });
});

describe("cellToText", () => {
  test("converts every cell type", () => {
    expect(cellToText(null)).toBe("");
    expect(cellToText(undefined)).toBe("");
    expect(cellToText(2.5)).toBe("2,5");
    expect(cellToText(true)).toBe("ja");
    expect(cellToText(false)).toBe("nee");
    expect(cellToText("tekst")).toBe("tekst");
    expect(cellToText(new Date("2026-10-22T13:05:00Z"))).toBe(
      "22-10-2026 15:05",
    );
  });
});

describe("toCsv", () => {
  test("starts with a UTF-8 BOM and uses semicolons and CRLF", () => {
    const csv = toCsv([
      ["Leerlingnummer", "Naam", "Cijfer"],
      ["17053", "Jan Jansen", 7.5],
      ["17023", "Fatima El Amrani", null],
    ]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      "Leerlingnummer;Naam;Cijfer\r\n17053;Jan Jansen;7,5\r\n17023;Fatima El Amrani;\r\n",
    );
  });

  test("encodes the BOM as EF BB BF in UTF-8", () => {
    const bytes = new TextEncoder().encode(toCsv([["é"]]));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  test("escapes fields and supports options", () => {
    const csv = toCsv([["V1 Begroeting; deel 2 (2)", 'Zeg "hoi"', 1.25]], {
      bom: false,
      newline: "\n",
      maxDecimals: 1,
    });
    expect(csv).toBe('"V1 Begroeting; deel 2 (2)";"Zeg ""hoi""";1,3\n');
  });

  test("returns only the BOM for no rows", () => {
    expect(toCsv([])).toBe(UTF8_BOM);
    expect(toCsv([], { bom: false })).toBe("");
  });

  test("keeps Dutch characters intact", () => {
    expect(toCsv([["Zoë", "Daniël"]], { bom: false })).toBe("Zoë;Daniël\r\n");
  });
});

describe("slugifyFilename", () => {
  test("creates safe file names", () => {
    expect(slugifyFilename("Python basis – oefentoets")).toBe(
      "python-basis-oefentoets",
    );
    expect(slugifyFilename("4H2 (demo)")).toBe("4h2-demo");
    expect(slugifyFilename("Zoë's toets")).toBe("zoe-s-toets");
    expect(slugifyFilename("———", "afname")).toBe("afname");
  });
});

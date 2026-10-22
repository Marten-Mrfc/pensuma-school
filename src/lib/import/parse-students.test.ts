import { describe, expect, test } from "bun:test";
import {
  combineName,
  MAX_IMPORT_ROWS,
  normalizeCell,
  normalizeStudentNumber,
  parseStudentList,
} from "./parse-students";

const simple = (text: string) =>
  parseStudentList(text).rows.map(({ studentNumber, name }) => [
    studentNumber,
    name,
  ]);

describe("normalisation helpers", () => {
  test("normalizeCell collapses whitespace and strips quotes", () => {
    expect(normalizeCell('  "Jan   Jansen"  ')).toBe("Jan Jansen");
    expect(normalizeCell("﻿Sem​ de  Vries")).toBe("Sem de Vries");
  });

  test("combineName skips empty parts", () => {
    expect(combineName("Sem", "", "de", " Vries ")).toBe("Sem de Vries");
    expect(combineName("Lotte", undefined, "Bakker")).toBe("Lotte Bakker");
  });

  test("normalizeStudentNumber fixes spreadsheet artefacts", () => {
    expect(normalizeStudentNumber("17053")).toBe("17053");
    expect(normalizeStudentNumber("17053.0")).toBe("17053");
    expect(normalizeStudentNumber("17.053")).toBe("17053");
    expect(normalizeStudentNumber(" 17 053 ")).toBe("17053");
  });
});

describe("parseStudentList", () => {
  test("empty input", () => {
    const r = parseStudentList("   \n\n  ");
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  test("plain lines: number first or last", () => {
    const r = parseStudentList(
      "17053 Jan Jansen\n  17054   Sem de Vries \nFatima El Amrani 17023",
    );
    expect(r.separator).toBe("space");
    expect(r.headerDetected).toBe(false);
    expect(r.rows).toEqual([
      { line: 1, studentNumber: "17053", name: "Jan Jansen" },
      { line: 2, studentNumber: "17054", name: "Sem de Vries" },
      { line: 3, studentNumber: "17023", name: "Fatima El Amrani" },
    ]);
  });

  test("tab separated paste from Excel with Dutch header", () => {
    const text =
      "Leerlingnummer\tNaam\n17053\tJan Jansen\n17054\tSem de Vries\n";
    const r = parseStudentList(text);
    expect(r.separator).toBe("tab");
    expect(r.headerDetected).toBe(true);
    expect(r.rows).toEqual([
      { line: 2, studentNumber: "17053", name: "Jan Jansen" },
      { line: 3, studentNumber: "17054", name: "Sem de Vries" },
    ]);
  });

  test("Magister export: Stamnr;Roepnaam;Tussenv;Achternaam;Klas", () => {
    const text = [
      "Stamnr;Roepnaam;Tussenv;Achternaam;Klas",
      "17053;Jan;;Jansen;4H2",
      "17054;Sem;de;Vries;4H2",
    ].join("\r\n");
    const r = parseStudentList(text);
    expect(r.separator).toBe("semicolon");
    expect(r.headerDetected).toBe(true);
    expect(simple(text)).toEqual([
      ["17053", "Jan Jansen"],
      ["17054", "Sem de Vries"],
    ]);
  });

  test("SOMtoday export with columns in a different order and quotes", () => {
    const text = [
      '"Achternaam","Voorvoegsel","Roepnaam","Leerlingnummer"',
      '"Vries","de","Sem","17054"',
      '"Amrani","El","Fatima","17023"',
    ].join("\n");
    expect(simple(text)).toEqual([
      ["17054", "Sem de Vries"],
      ["17023", "Fatima El Amrani"],
    ]);
  });

  test("English header: id,name", () => {
    expect(simple("id,name\n17053,Jan Jansen\n17061,Lotte Bakker")).toEqual([
      ["17053", "Jan Jansen"],
      ["17061", "Lotte Bakker"],
    ]);
  });

  test("CSV without header, name first", () => {
    expect(simple("Jan Jansen;17053\nSem de Vries;17054")).toEqual([
      ["17053", "Jan Jansen"],
      ["17054", "Sem de Vries"],
    ]);
  });

  test("CSV without header, name split over several columns", () => {
    expect(simple("17054,Sem,de,Vries\n17053,Jan,,Jansen")).toEqual([
      ["17054", "Sem de Vries"],
      ["17053", "Jan Jansen"],
    ]);
  });

  test("quoted names containing the separator", () => {
    expect(simple('17053,"Jansen, Jan"\n17054,"Vries, Sem de"')).toEqual([
      ["17053", "Jansen, Jan"],
      ["17054", "Vries, Sem de"],
    ]);
  });

  test("space separated lines whose names contain a comma", () => {
    expect(simple("17053 Jansen, Jan\n17054 Vries, Sem de")).toEqual([
      ["17053", "Jansen, Jan"],
      ["17054", "Vries, Sem de"],
    ]);
  });

  test("space separated header line is skipped", () => {
    const r = parseStudentList("leerlingnummer naam\n17053 Jan Jansen");
    expect(r.headerDetected).toBe(true);
    expect(r.rows).toEqual([
      { line: 2, studentNumber: "17053", name: "Jan Jansen" },
    ]);
  });

  test("invalid rows get Dutch messages with line numbers", () => {
    const text = [
      "leerlingnummer;naam",
      "17053;Jan Jansen",
      "12;Te Kort",
      "17054;",
      "abc;Geen Nummer",
      "17055;Lotte Bakker",
    ].join("\n");
    const r = parseStudentList(text);
    expect(r.rows.map((x) => x.studentNumber)).toEqual(["17053", "17055"]);
    expect(r.errors).toEqual([
      {
        line: 3,
        message:
          'Leerlingnummer "12" is ongeldig: gebruik alleen cijfers (3 tot 12).',
        raw: "12;Te Kort",
      },
      { line: 4, message: "Naam ontbreekt.", raw: "17054;" },
      {
        line: 5,
        message:
          'Leerlingnummer "abc" is ongeldig: gebruik alleen cijfers (3 tot 12).',
        raw: "abc;Geen Nummer",
      },
    ]);
  });

  test("plain line without a number", () => {
    const r = parseStudentList("17053 Jan Jansen\nJan zonder nummer");
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0].line).toBe(2);
    expect(r.errors[0].message).toContain("Geen leerlingnummer gevonden");
  });

  test("duplicates within the list are flagged", () => {
    const r = parseStudentList(
      "17053 Jan Jansen\n17054 Sem de Vries\n17053 Jan J.",
    );
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toEqual([
      {
        line: 3,
        message:
          "Leerlingnummer 17053 staat dubbel in de lijst (ook op regel 1).",
        raw: "17053 Jan J.",
      },
    ]);
  });

  test("blank lines keep original line numbers", () => {
    const r = parseStudentList("\n17053 Jan Jansen\n\n\n17054 Sem de Vries\n");
    expect(r.rows.map((x) => x.line)).toEqual([2, 5]);
  });

  test("lines with only separators are ignored", () => {
    const r = parseStudentList("17053;Jan Jansen\n;;\n17054;Sem de Vries\n;");
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });

  test("normalises whitespace inside names", () => {
    expect(simple("17053\t  Jan    Jansen ")).toEqual([
      ["17053", "Jan Jansen"],
    ]);
  });

  test("too long names are rejected", () => {
    const r = parseStudentList(`17053 ${"a".repeat(101)}`);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].message).toContain("te lang");
  });

  test("row limit", () => {
    const lines = Array.from(
      { length: MAX_IMPORT_ROWS + 3 },
      (_, i) => `${10000 + i} Leerling ${i}`,
    );
    const r = parseStudentList(lines.join("\n"));
    expect(r.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain("maximaal");
  });
});

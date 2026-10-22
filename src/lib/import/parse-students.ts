/**
 * Parse a list of students pasted from Excel / Magister / SOMtoday, or read
 * from a CSV/TSV file, into `{ studentNumber, name }` rows.
 *
 * Accepted input:
 *  - separated by tab (Excel paste), `;` or `,` (CSV), with optional quotes
 *  - an optional header row with Dutch/English column names:
 *      leerlingnummer / nummer / id / studentnummer / stamnummer …
 *      naam / name, or voornaam (roepnaam) + tussenvoegsel + achternaam
 *  - plain lines like "17053 Jan Jansen" or "Jan Jansen 17053"
 *
 * Pure (no server/browser APIs), so it runs in both and in `bun test`.
 */
import Papa from "papaparse";
import { STUDENT_NUMBER_REGEX } from "@/lib/auth-shared";

export type ImportSeparator = "tab" | "semicolon" | "comma" | "space";

export interface ParsedStudentRow {
  /** 1-based line number in the original text. */
  line: number;
  studentNumber: string;
  name: string;
}

export interface ParseStudentError {
  /** 1-based line number in the original text. */
  line: number;
  message: string;
  /** The original line (trimmed), for display. */
  raw: string;
}

export interface ParseStudentsResult {
  rows: ParsedStudentRow[];
  errors: ParseStudentError[];
  /** True when the first non-empty line was recognised as a header. */
  headerDetected: boolean;
  separator: ImportSeparator;
}

/** Maximum length of a student's display name. */
export const MAX_STUDENT_NAME_LENGTH = 100;
/** Maximum number of rows in one import. */
export const MAX_IMPORT_ROWS = 500;

/* ----------------------------- Normalisation ------------------------------ */

const INVISIBLE = /[​-‍⁠﻿]/g;
const ODD_SPACES = /[   -   　]/g;

/** Collapse whitespace, drop invisible characters and surrounding quotes. */
export function normalizeCell(value: string): string {
  return value
    .replace(INVISIBLE, "")
    .replace(ODD_SPACES, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
}

/** Combine name parts ("Sem", "de", "Vries") into one display name. */
export function combineName(...parts: (string | undefined | null)[]): string {
  return normalizeCell(
    parts
      .map((p) => normalizeCell(p ?? ""))
      .filter(Boolean)
      .join(" "),
  );
}

/** Student numbers copied from spreadsheets sometimes contain spaces/dots. */
export function normalizeStudentNumber(value: string): string {
  const v = normalizeCell(value);
  // "17 053" or "17.053" (thousands separators) → "17053"; "17053.0" → "17053"
  const noSpaces = v.replace(/\s/g, "");
  if (/^\d+\.0+$/.test(noSpaces)) return noSpaces.replace(/\.0+$/, "");
  if (/^\d{1,3}([.\s]\d{3})+$/.test(v)) return v.replace(/[.\s]/g, "");
  return noSpaces;
}

/* -------------------------------- Headers --------------------------------- */

type Column = "number" | "name" | "first" | "infix" | "last" | "ignore";

const HEADER_ALIASES: Record<Exclude<Column, "ignore">, string[]> = {
  number: [
    "leerlingnummer",
    "leerlingnr",
    "llnr",
    "llnnr",
    "lln",
    "nummer",
    "nr",
    "no",
    "id",
    "studentnummer",
    "studentnr",
    "studentnumber",
    "studentid",
    "stamnummer",
    "stamnr",
    "number",
    "username",
    "gebruikersnaam",
  ],
  name: [
    "naam",
    "name",
    "volledigenaam",
    "fullname",
    "leerling",
    "leerlingnaam",
    "student",
    "studentname",
    "displayname",
  ],
  first: [
    "voornaam",
    "roepnaam",
    "voornamen",
    "firstname",
    "givenname",
    "first",
  ],
  infix: [
    "tussenvoegsel",
    "tussenvoegsels",
    "tussenv",
    "tv",
    "voorvoegsel",
    "voorvoegsels",
    "infix",
    "prefix",
    "middlename",
  ],
  last: [
    "achternaam",
    "familienaam",
    "lastname",
    "surname",
    "last",
    "achternm",
  ],
};

const ALIAS_LOOKUP = new Map<string, Column>(
  Object.entries(HEADER_ALIASES).flatMap(([col, names]) =>
    names.map((n) => [n, col as Column] as const),
  ),
);

function headerKey(cell: string): string {
  return normalizeCell(cell)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

interface HeaderMap {
  number: number;
  name?: number;
  first?: number;
  infix?: number;
  last?: number;
}

/** Recognise a header row; returns column indexes or null. */
function detectHeader(cells: string[]): HeaderMap | null {
  const found: Partial<Record<Column, number>> = {};
  let recognised = 0;
  cells.forEach((cell, i) => {
    const col = ALIAS_LOOKUP.get(headerKey(cell));
    if (col && found[col] === undefined) {
      found[col] = i;
      recognised++;
    }
  });
  // A header must not contain a student number itself.
  if (cells.some((c) => STUDENT_NUMBER_REGEX.test(normalizeStudentNumber(c))))
    return null;
  if (recognised === 0 || found.number === undefined) return null;
  if (
    found.name === undefined &&
    found.first === undefined &&
    found.last === undefined
  ) {
    return null;
  }
  return {
    number: found.number,
    name: found.name,
    first: found.first,
    infix: found.infix,
    last: found.last,
  };
}

/* ------------------------------ Separators -------------------------------- */

const SEPARATOR_CHARS: Record<Exclude<ImportSeparator, "space">, string> = {
  tab: "\t",
  semicolon: ";",
  comma: ",",
};

/** Count separator characters outside double quotes. */
function countOutsideQuotes(line: string, ch: string): number {
  let inQuotes = false;
  let count = 0;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ch && !inQuotes) count++;
  }
  return count;
}

function detectSeparator(lines: string[]): ImportSeparator {
  const sample = lines.slice(0, 50);
  const order: Exclude<ImportSeparator, "space">[] = [
    "tab",
    "semicolon",
    "comma",
  ];
  for (const sep of order) {
    const ch = SEPARATOR_CHARS[sep];
    const withSep = sample.filter((l) => countOutsideQuotes(l, ch) > 0).length;
    // Most lines must contain it (allow a few odd lines, e.g. a title).
    if (withSep > 0 && withSep >= Math.ceil(sample.length * 0.6)) return sep;
  }
  return "space";
}

function splitLine(line: string, separator: ImportSeparator): string[] {
  if (separator === "space") return [line];
  const parsed = Papa.parse<string[]>(line, {
    delimiter: SEPARATOR_CHARS[separator],
    quoteChar: '"',
    skipEmptyLines: false,
  });
  return (parsed.data[0] ?? [line]).map((c) => normalizeCell(String(c ?? "")));
}

/* --------------------------------- Rows ----------------------------------- */

type RowCandidate = { studentNumber: string; name: string } | { error: string };

function fromSpaceLine(line: string): RowCandidate {
  const tokens = normalizeCell(line).split(" ").filter(Boolean);
  if (tokens.length === 0) return { error: "Lege regel." };
  const first = normalizeStudentNumber(tokens[0]);
  const last = normalizeStudentNumber(tokens[tokens.length - 1]);
  if (/^\d+$/.test(first)) {
    return { studentNumber: first, name: combineName(...tokens.slice(1)) };
  }
  if (tokens.length > 1 && /^\d+$/.test(last)) {
    return { studentNumber: last, name: combineName(...tokens.slice(0, -1)) };
  }
  return {
    error:
      "Geen leerlingnummer gevonden. Zet het nummer vóór de naam, bijvoorbeeld: 17053 Jan Jansen.",
  };
}

function fromCellsWithoutHeader(cells: string[]): RowCandidate {
  const filled = cells
    .map((c, i) => ({ c: normalizeCell(c), i }))
    .filter((x) => x.c);
  if (filled.length === 0) return { error: "Lege regel." };
  if (filled.length === 1) return fromSpaceLine(filled[0].c);
  const numberCell = filled.find((x) =>
    /^\d+$/.test(normalizeStudentNumber(x.c)),
  );
  if (!numberCell) {
    return { error: "Geen leerlingnummer gevonden in deze regel." };
  }
  const name = combineName(
    ...filled.filter((x) => x.i !== numberCell.i).map((x) => x.c),
  );
  return { studentNumber: normalizeStudentNumber(numberCell.c), name };
}

function fromCellsWithHeader(cells: string[], h: HeaderMap): RowCandidate {
  const at = (i: number | undefined) =>
    i === undefined ? "" : normalizeCell(cells[i] ?? "");
  const studentNumber = normalizeStudentNumber(at(h.number));
  let name = at(h.name);
  if (!name) name = combineName(at(h.first), at(h.infix), at(h.last));
  return { studentNumber, name };
}

function validate(candidate: {
  studentNumber: string;
  name: string;
}): string | null {
  const { studentNumber, name } = candidate;
  if (!studentNumber) return "Leerlingnummer ontbreekt.";
  if (!STUDENT_NUMBER_REGEX.test(studentNumber)) {
    return `Leerlingnummer "${studentNumber}" is ongeldig: gebruik alleen cijfers (3 tot 12).`;
  }
  if (!name) return "Naam ontbreekt.";
  if (name.length > MAX_STUDENT_NAME_LENGTH) {
    return `Naam is te lang (maximaal ${MAX_STUDENT_NAME_LENGTH} tekens).`;
  }
  return null;
}

/* --------------------------------- Main ----------------------------------- */

/**
 * Parse pasted text or file contents.
 *
 *   const { rows, errors } = parseStudentList("17053;Jan Jansen\n17054;Sem de Vries");
 */
export function parseStudentList(text: string): ParseStudentsResult {
  const allLines = text.replace(INVISIBLE, "").split(/\r\n|\r|\n/);
  const lines = allLines
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter((l) => normalizeCell(l.raw.replace(/[;,\t]/g, " ")) !== "");

  const result: ParseStudentsResult = {
    rows: [],
    errors: [],
    headerDetected: false,
    separator: "space",
  };
  if (lines.length === 0) return result;

  const separator = detectSeparator(lines.map((l) => l.raw));
  result.separator = separator;

  let header: HeaderMap | null = null;
  let start = 0;
  if (separator !== "space") {
    header = detectHeader(splitLine(lines[0].raw, separator));
  } else {
    // "leerlingnummer naam" as a space-separated header.
    const tokens = normalizeCell(lines[0].raw).split(" ").map(headerKey);
    if (tokens.length >= 2 && tokens.every((t) => ALIAS_LOOKUP.has(t)))
      start = 1;
  }
  if (header) {
    result.headerDetected = true;
    start = 1;
  } else if (start === 1) {
    result.headerDetected = true;
  }

  const firstLineFor = new Map<string, number>();
  for (const { raw, line } of lines.slice(start)) {
    const display = normalizeCell(raw.replace(/\t/g, " "));
    if (result.rows.length >= MAX_IMPORT_ROWS) {
      result.errors.push({
        line,
        message: `Je kunt maximaal ${MAX_IMPORT_ROWS} leerlingen tegelijk importeren.`,
        raw: display,
      });
      break;
    }

    let candidate: RowCandidate;
    if (separator === "space") candidate = fromSpaceLine(raw);
    else {
      const cells = splitLine(raw, separator);
      candidate = header
        ? fromCellsWithHeader(cells, header)
        : fromCellsWithoutHeader(cells);
      // "17053 Jansen, Jan" mis-detected as CSV: retry as a plain line.
      if (!header && "error" in candidate) {
        const plain = fromSpaceLine(raw.replace(/\t/g, " "));
        if (!("error" in plain)) candidate = plain;
      }
    }

    if ("error" in candidate) {
      result.errors.push({ line, message: candidate.error, raw: display });
      continue;
    }
    const problem = validate(candidate);
    if (problem) {
      result.errors.push({ line, message: problem, raw: display });
      continue;
    }
    const earlier = firstLineFor.get(candidate.studentNumber);
    if (earlier !== undefined) {
      result.errors.push({
        line,
        message: `Leerlingnummer ${candidate.studentNumber} staat dubbel in de lijst (ook op regel ${earlier}).`,
        raw: display,
      });
      continue;
    }
    firstLineFor.set(candidate.studentNumber, line);
    result.rows.push({ line, ...candidate });
  }

  return result;
}

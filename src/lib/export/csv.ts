/**
 * CSV helpers tuned for Dutch Excel:
 *  - semicolon separator (Excel with a Dutch locale expects ";")
 *  - decimal comma for numbers ("7,5")
 *  - UTF-8 byte order mark so Excel detects the encoding (é, ë, …)
 *  - CRLF line endings
 *
 * Pure functions without browser or server imports, so they work everywhere
 * (and are unit tested with `bun test src/lib/export`).
 */

export type CsvCell = string | number | boolean | Date | null | undefined;

export type CsvOptions = {
  /** Field separator. Default ";". */
  delimiter?: string;
  /** Prefix the output with a UTF-8 byte order mark. Default true. */
  bom?: boolean;
  /** Line separator. Default "\r\n". */
  newline?: string;
  /** Decimals for numbers that are not integers. Default 2 (trailing zeros trimmed). */
  maxDecimals?: number;
};

export const UTF8_BOM = "﻿";

/**
 * Format a number with a decimal comma, without thousands separators:
 * 7.5 → "7,5", 3 → "3", 2.345 → "2,35" (maxDecimals 2).
 */
export function formatDecimalNl(
  value: number | null | undefined,
  maxDecimals = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  // Avoid "-0".
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  let text = normalized.toFixed(maxDecimals);
  if (text.includes(".")) text = text.replace(/\.?0+$/, "");
  return text.replace(".", ",");
}

/** Format a number with a fixed number of decimals and a comma: 7 → "7,0". */
export function formatFixedNl(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const text = (Object.is(value, -0) ? 0 : value).toFixed(decimals);
  return text.replace(".", ",");
}

/**
 * Local date-time as "dd-mm-jjjj uu:mm" (Dutch notation, Excel friendly).
 * Uses Europe/Amsterdam unless another IANA time zone is given.
 */
export function formatDateTimeNl(
  value: Date | string | null | undefined,
  timeZone = "Europe/Amsterdam",
): string {
  if (value == null) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}`;
}

/** Convert one cell to text (numbers get a decimal comma). */
export function cellToText(cell: CsvCell, maxDecimals = 2): string {
  if (cell == null) return "";
  if (typeof cell === "number") return formatDecimalNl(cell, maxDecimals);
  if (typeof cell === "boolean") return cell ? "ja" : "nee";
  if (cell instanceof Date) return formatDateTimeNl(cell);
  return cell;
}

/**
 * Quote a field when needed (it contains the delimiter, a quote, a line
 * break or leading/trailing spaces). Quotes are doubled.
 * Text that Excel would evaluate as a formula (starting with =, +, -, @)
 * gets a leading single quote, unless it is a plain number such as "-2,5".
 */
export function escapeCsvField(value: string, delimiter = ";"): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+([.,]\d+)?$/.test(text)) {
    // Neutralise CSV/formula injection ("=HYPERLINK(...)").
    text = `'${text}`;
  }
  const needsQuotes =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    /^\s|\s$/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV document from rows of cells (the first row is usually the header). */
export function toCsv(rows: CsvCell[][], options: CsvOptions = {}): string {
  const {
    delimiter = ";",
    bom = true,
    newline = "\r\n",
    maxDecimals = 2,
  } = options;
  const body = rows
    .map((row) =>
      row
        .map((cell) => escapeCsvField(cellToText(cell, maxDecimals), delimiter))
        .join(delimiter),
    )
    .join(newline);
  return `${bom ? UTF8_BOM : ""}${body}${rows.length ? newline : ""}`;
}

/** Make a string safe as (part of) a file name: "Toets H3 – 4H2" → "toets-h3-4h2". */
export function slugifyFilename(value: string, fallback = "export"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

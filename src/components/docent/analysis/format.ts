/** Number formatting for the toetsanalyse (decimal comma). */

/** 0.734 → "0,73"; null → "–". */
export function formatStat(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 0.256 → "26%". */
export function formatShare(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return `${Math.round(value * 100)}%`;
}

/** "1 leerling" / "3 leerlingen". */
export function students(n: number): string {
  return `${n} ${n === 1 ? "leerling" : "leerlingen"}`;
}

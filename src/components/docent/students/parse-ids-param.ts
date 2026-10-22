/** `?ids=a,b,c` (or repeated `?ids=`) → unique, non-empty ids (max 1000). */
export function parseIdsParam(
  value: string | string[] | undefined,
): string[] | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value.join(",") : value;
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 1000);
  return ids.length > 0 ? ids : undefined;
}

/** Small Dutch formatting helpers for the teacher's student/class pages. */

const dateFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type DateLike = Date | string | number | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "22 okt. 2026" (or "—"). */
export function formatDate(value: DateLike, empty = "—"): string {
  const d = toDate(value);
  return d ? dateFormat.format(d) : empty;
}

/** "22 okt. 2026 14:05" (or "—"). */
export function formatDateTime(value: DateLike, empty = "—"): string {
  const d = toDate(value);
  return d ? dateTimeFormat.format(d) : empty;
}

/** "739 838": a 6-digit PIN in two readable groups. */
export function formatPin(pin: string): string {
  return /^\d{6}$/.test(pin) ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

/** "18,5 / 25" with Dutch decimals. */
export function formatScore(
  score: number | null | undefined,
  max: number | null | undefined,
): string {
  if (score == null || max == null) return "—";
  const fmt = (n: number) =>
    n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
  return `${fmt(score)} / ${fmt(max)}`;
}

/** "1 leerling" / "3 leerlingen". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("nl-NL")} ${count === 1 ? one : many}`;
}

/** Initials for an avatar: "Sem de Vries" → "SV". */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p && p[0] === p[0]?.toUpperCase());
  const source = parts.length > 0 ? parts : name.trim().split(/\s+/);
  const first = source[0]?.[0] ?? "";
  const last = source.length > 1 ? (source[source.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * "2 leerlingen overgeslagen: …": students a bulk action skipped because
 * their processing is restricted (AVG art. 18). Empty when none.
 */
export function restrictedSkipNote(skipped: number): string {
  if (skipped <= 0) return "";
  return `${plural(skipped, "leerling", "leerlingen")} overgeslagen: voor ${skipped === 1 ? "deze leerling" : "hen"} is de verwerking beperkt (AVG art. 18).`;
}

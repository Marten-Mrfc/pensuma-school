/** Dutch formatting helpers for the student pages (client-side only). */

const dateTime = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeOnly = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});
const longDate = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "vandaag 14:30", "morgen 09:00" or "vr 24 okt 15:30". */
export function formatMoment(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return `vandaag ${timeOnly.format(d)}`;
  if (isSameDay(d, tomorrow)) return `morgen ${timeOnly.format(d)}`;
  if (isSameDay(d, yesterday)) return `gisteren ${timeOnly.format(d)}`;
  return dateTime.format(d).replace(",", "");
}

export function formatDay(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? dateOnly.format(d) : "";
}

export function formatLongDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? longDate.format(d) : "";
}

export function formatTime(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? timeOnly.format(d) : "";
}

/** "nog 2 dagen", "nog 3 uur", "nog 12 minuten". */
export function formatTimeLeft(value: Date | string | null | undefined, nowMs = Date.now()): string {
  const d = toDate(value);
  if (!d) return "";
  const diff = d.getTime() - nowMs;
  if (diff <= 0) return "verlopen";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return minutes <= 1 ? "nog 1 minuut" : `nog ${minutes} minuten`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "nog 1 uur" : `nog ${hours} uur`;
  const days = Math.round(hours / 24);
  return days === 1 ? "nog 1 dag" : `nog ${days} dagen`;
}

/** 2 → "2", 1.5 → "1,5", 0.67 → "0,67". */
export function formatNumber(n: number | null | undefined, maxDecimals = 2): string {
  if (n == null || Number.isNaN(n)) return "–";
  return n.toLocaleString("nl-NL", { maximumFractionDigits: maxDecimals });
}

export function formatPoints(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${formatNumber(n)} ${n === 1 ? "punt" : "punten"}`;
}

export function formatGrade(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "Geen tijdslimiet";
  if (minutes < 60) return `${minutes} minuten`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} uur en ${m} minuten` : `${h} uur`;
}

export function pluralize(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Dutch formatting helpers for the afnames (assignments) screens. */

const dateTimeFormat = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "vandaag 14:05", "morgen 09:00" or "wo 22 okt 14:05". */
export function formatMoment(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `vandaag ${timeFormat.format(d)}`;
  if (sameDay(d, tomorrow)) return `morgen ${timeFormat.format(d)}`;
  if (sameDay(d, yesterday)) return `gisteren ${timeFormat.format(d)}`;
  return dateTimeFormat.format(d).replace(",", "");
}

export function formatDateShort(value: Date | string): string {
  return dateFormat.format(toDate(value));
}

export function formatTime(value: Date | string): string {
  return timeFormat.format(toDate(value));
}

/** Human description of the window, e.g. "vandaag 14:05 – 15:00". */
export function formatWindow(
  opensAt: Date | string | null | undefined,
  closesAt: Date | string | null | undefined,
): string {
  if (!opensAt && !closesAt) return "Geen vast tijdvak";
  if (opensAt && closesAt) {
    const o = toDate(opensAt);
    const c = toDate(closesAt);
    return sameDay(o, c)
      ? `${formatMoment(o)} – ${formatTime(c)}`
      : `${formatMoment(o)} – ${formatMoment(c)}`;
  }
  if (opensAt) return `Vanaf ${formatMoment(opensAt)}`;
  return `Tot ${formatMoment(closesAt)}`;
}

/** "45 min", "1 u 30 min". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "Geen limiet";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} u ${m} min` : `${h} uur`;
}

/** Countdown text: "12:05", "1:02:09"; negative → "0:00". */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Number with a decimal comma: 7.5 → "7,5", 3 → "3". */
export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return value.toLocaleString("nl-NL", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  });
}

/** Grade with exactly one decimal: 7 → "7,0". */
export function formatGrade(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return "–";
  return `${Math.round(fraction * 100)}%`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeLocal(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Goedemorgen" / "Goedemiddag" / "Goedenavond". */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 6) return "Goedenacht";
  if (h < 12) return "Goedemorgen";
  if (h < 18) return "Goedemiddag";
  return "Goedenavond";
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

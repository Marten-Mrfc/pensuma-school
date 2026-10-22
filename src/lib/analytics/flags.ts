/**
 * Dutch signals for the toetsanalyse. Thresholds follow common practice in
 * Dutch secondary education (Cito/CvTE guides): they are hints for the
 * teacher, not verdicts.
 */

export type FlagTone = "info" | "warning" | "destructive" | "success";

export type ItemFlag = {
  key: "hard" | "easy" | "negative" | "low_discrimination";
  label: string;
  tone: FlagTone;
};

export const SMALL_SAMPLE_THRESHOLD = 10;
export const SMALL_SAMPLE_MESSAGE =
  "Minder dan 10 leerlingen: lees deze cijfers als indicatie.";

/** Signals for one item, from its p-value and Rir. */
export function itemFlags(item: {
  p: number | null;
  rir: number | null;
}): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (item.p != null) {
    if (item.p < 0.3)
      flags.push({ key: "hard", label: "Moeilijk", tone: "warning" });
    else if (item.p > 0.9)
      flags.push({ key: "easy", label: "Erg makkelijk", tone: "info" });
  }
  if (item.rir != null) {
    if (item.rir < 0)
      flags.push({
        key: "negative",
        label: "Negatief: controleer de vraag en het antwoordmodel",
        tone: "destructive",
      });
    else if (item.rir < 0.2)
      flags.push({
        key: "low_discrimination",
        label: "Onderscheidt weinig",
        tone: "warning",
      });
  }
  return flags;
}

export type AlphaLevel = { label: string; tone: FlagTone };

/** Reliability label for Cronbach's alpha. */
export function alphaLevel(alpha: number | null): AlphaLevel | null {
  if (alpha == null) return null;
  if (alpha >= 0.8) return { label: "Betrouwbaar", tone: "success" };
  if (alpha >= 0.6) return { label: "Redelijk", tone: "info" };
  return { label: "Laag (bij korte toetsen gebruikelijk)", tone: "warning" };
}

/** True when the group is too small for firm conclusions. */
export function isSmallSample(n: number): boolean {
  return n < SMALL_SAMPLE_THRESHOLD;
}

import { z } from "zod";

/**
 * Display preferences, stored per account (table user_preference), so they
 * follow a student across shared school computers. WCAG 1.4.4 (resize text),
 * 1.4.12 (text spacing), 1.4.6-ish extra contrast and 2.3.3 (motion).
 */

export const TEXT_SIZES = ["100", "112", "125"] as const;
export const CODE_FONT_SIZES = ["s", "m", "l", "xl"] as const;
export const REDUCE_MOTION_OPTIONS = ["system", "on"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];
export type CodeFontSize = (typeof CODE_FONT_SIZES)[number];
export type ReduceMotion = (typeof REDUCE_MOTION_OPTIONS)[number];

/** Code editor font size in px per option. */
export const CODE_FONT_SIZE_PX: Record<CodeFontSize, number> = {
  s: 13,
  m: 14,
  l: 17,
  xl: 20,
};

/** Root font scale per text size. */
export const TEXT_SCALE: Record<TextSize, number> = {
  "100": 1,
  "112": 1.125,
  "125": 1.25,
};

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  "100": "Normaal",
  "112": "Groter",
  "125": "Grootst",
};

export const CODE_FONT_SIZE_LABELS: Record<CodeFontSize, string> = {
  s: "Klein",
  m: "Normaal",
  l: "Groot",
  xl: "Extra groot",
};

export const REDUCE_MOTION_LABELS: Record<ReduceMotion, string> = {
  system: "Volg mijn apparaat",
  on: "Altijd minder beweging",
};

const fields = {
  textSize: z.enum(TEXT_SIZES),
  codeFontSize: z.enum(CODE_FONT_SIZES),
  readableFont: z.boolean(),
  wideSpacing: z.boolean(),
  moreContrast: z.boolean(),
  reduceMotion: z.enum(REDUCE_MOTION_OPTIONS),
  showTimer: z.boolean(),
};

export const DEFAULT_PREFERENCES = {
  textSize: "100",
  codeFontSize: "m",
  readableFont: false,
  wideSpacing: false,
  moreContrast: false,
  reduceMotion: "system",
  showTimer: true,
} as const satisfies {
  [K in keyof typeof fields]: z.infer<(typeof fields)[K]>;
};

/**
 * Lenient schema: every field falls back to its default on its own, so one
 * bad or outdated value never resets the other preferences.
 */
export const userPreferencesSchema = z.object({
  textSize: fields.textSize.catch(DEFAULT_PREFERENCES.textSize),
  codeFontSize: fields.codeFontSize.catch(DEFAULT_PREFERENCES.codeFontSize),
  readableFont: fields.readableFont.catch(DEFAULT_PREFERENCES.readableFont),
  wideSpacing: fields.wideSpacing.catch(DEFAULT_PREFERENCES.wideSpacing),
  moreContrast: fields.moreContrast.catch(DEFAULT_PREFERENCES.moreContrast),
  reduceMotion: fields.reduceMotion.catch(DEFAULT_PREFERENCES.reduceMotion),
  showTimer: fields.showTimer.catch(DEFAULT_PREFERENCES.showTimer),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/** Strict input for `preferences.update`: known keys, valid values, all optional. */
export const preferencesPatchSchema = z.strictObject(fields).partial();

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

/** Stored/unknown value → complete preferences (defaults for anything invalid). */
export function parsePreferences(value: unknown): UserPreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return userPreferencesSchema.parse(input);
}

/** Apply a partial update and re-parse. */
export function mergePreferences(
  base: unknown,
  patch: Partial<UserPreferences>,
): UserPreferences {
  return parsePreferences({ ...parsePreferences(base), ...patch });
}

export function isDefaultPreferences(p: UserPreferences): boolean {
  return (Object.keys(DEFAULT_PREFERENCES) as (keyof UserPreferences)[]).every(
    (key) => p[key] === DEFAULT_PREFERENCES[key],
  );
}

/** localStorage mirror per account (cleared on sign-out by clearLocalUserData). */
export function preferencesStorageKey(userId: string): string {
  return `pensuma:prefs:${userId}`;
}

export interface PreferenceAttributes {
  /** data-* attributes for <html>; undefined means "remove". */
  dataset: {
    font: "readable" | undefined;
    spacing: "wide" | undefined;
    contrast: "more" | undefined;
    motion: "reduce" | undefined;
  };
  /** CSS custom properties for <html>. */
  style: {
    "--code-font-size": string;
    "--app-font-scale": string;
  };
}

/** Preferences → what PreferencesSync puts on <html> (see globals.css). */
export function preferenceAttributes(p: UserPreferences): PreferenceAttributes {
  return {
    dataset: {
      font: p.readableFont ? "readable" : undefined,
      spacing: p.wideSpacing ? "wide" : undefined,
      contrast: p.moreContrast ? "more" : undefined,
      motion: p.reduceMotion === "on" ? "reduce" : undefined,
    },
    style: {
      "--code-font-size": `${CODE_FONT_SIZE_PX[p.codeFontSize]}px`,
      "--app-font-scale": String(TEXT_SCALE[p.textSize]),
    },
  };
}

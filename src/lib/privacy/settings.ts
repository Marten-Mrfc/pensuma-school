/**
 * Privacy settings (stored in `app_setting` under key "privacy"): contacts
 * for the privacy statement, retention periods and export defaults.
 * Pure module, shared by server and UI.
 *
 * zod v4: `.default({})` returns `{}` without parsing, so nested defaults
 * would never apply. Nested objects use `.prefault({})` instead.
 */
import { z } from "zod";

export const PRIVACY_SETTINGS_KEY = "privacy";

const optionalEmail = z
  .union([z.email("Vul een geldig e-mailadres in."), z.literal("")])
  .default("");

const name = z.string().trim().max(200).default("");

export const privacySettingsSchema = z.object({
  school: z
    .object({
      name,
      authority: name,
      privacyEmail: optionalEmail,
      /** Only http(s) links: the URL is rendered as a link on /privacy. */
      policyUrl: z
        .union([
          z.url({
            protocol: /^https?$/,
            error: "Vul een geldige link in (https://…).",
          }),
          z.literal(""),
        ])
        .default(""),
    })
    .prefault({}),
  dpo: z
    .object({
      name,
      email: optionalEmail,
    })
    .prefault({}),
  processor: z
    .object({
      name,
      email: optionalEmail,
      hostingLocation: z.string().trim().max(200).default("Nederland (EU)"),
      backupDays: z.number().int().min(0).max(365).default(30),
    })
    .prefault({}),
  retention: z
    .object({
      attemptEventsDays: z.number().int().min(7).max(730).default(90),
      attemptsMonths: z.number().int().min(6).max(120).default(24),
      inactiveStudentMonths: z.number().int().min(3).max(60).default(12),
      auditLogMonths: z.number().int().min(6).max(84).default(24),
      /**
       * Attempts and inactive accounts are only deleted automatically once
       * the school has confirmed the periods (confirmedAt set).
       */
      autoDeleteAttempts: z.boolean().default(false),
      confirmedAt: z.iso.datetime().nullable().default(null),
      confirmedById: z.string().nullable().default(null),
    })
    .prefault({}),
  exports: z
    .object({
      includeFocusByDefault: z.boolean().default(false),
    })
    .prefault({}),
  accessibility: z
    .object({
      contactEmail: optionalEmail,
      statementDate: z.iso.date().nullable().default(null),
    })
    .prefault({}),
});

export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

/** Stored value → settings; invalid or missing data gives the defaults. */
export function parsePrivacySettings(value: unknown): PrivacySettings {
  const parsed = privacySettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : privacySettingsSchema.parse({});
}

/** What anyone may see on /privacy and /toegankelijkheid (no ids). */
export type PublicPrivacyInfo = {
  school: PrivacySettings["school"];
  dpo: PrivacySettings["dpo"];
  processor: PrivacySettings["processor"];
  retention: {
    attemptEventsDays: number;
    attemptsMonths: number;
    inactiveStudentMonths: number;
    auditLogMonths: number;
    autoDeleteAttempts: boolean;
    /** The school has confirmed the retention periods. */
    confirmed: boolean;
  };
  accessibility: PrivacySettings["accessibility"];
  /** ISO time of the last change, null when never saved. */
  updatedAt: string | null;
};

export function toPublicPrivacyInfo(
  settings: PrivacySettings,
  updatedAt: Date | null,
): PublicPrivacyInfo {
  const { school, dpo, processor, retention, accessibility } = settings;
  return {
    school: {
      name: school.name,
      authority: school.authority,
      privacyEmail: school.privacyEmail,
      policyUrl: school.policyUrl,
    },
    dpo: { name: dpo.name, email: dpo.email },
    processor: {
      name: processor.name,
      email: processor.email,
      hostingLocation: processor.hostingLocation,
      backupDays: processor.backupDays,
    },
    retention: {
      attemptEventsDays: retention.attemptEventsDays,
      attemptsMonths: retention.attemptsMonths,
      inactiveStudentMonths: retention.inactiveStudentMonths,
      auditLogMonths: retention.auditLogMonths,
      autoDeleteAttempts: retention.autoDeleteAttempts,
      confirmed: retention.confirmedAt != null,
    },
    accessibility: {
      contactEmail: accessibility.contactEmail,
      statementDate: accessibility.statementDate,
    },
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
  };
}

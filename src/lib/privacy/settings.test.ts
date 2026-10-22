import { describe, expect, test } from "bun:test";
import {
  PRIVACY_SETTINGS_KEY,
  parsePrivacySettings,
  privacySettingsSchema,
  toPublicPrivacyInfo,
} from "./settings";

describe("privacySettingsSchema", () => {
  test("defaults from {}", () => {
    const s = privacySettingsSchema.parse({});
    expect(PRIVACY_SETTINGS_KEY).toBe("privacy");
    expect(s.school).toEqual({
      name: "",
      authority: "",
      privacyEmail: "",
      policyUrl: "",
    });
    expect(s.dpo).toEqual({ name: "", email: "" });
    expect(s.processor).toEqual({
      name: "",
      email: "",
      hostingLocation: "Nederland (EU)",
      backupDays: 30,
    });
    expect(s.retention).toEqual({
      attemptEventsDays: 90,
      attemptsMonths: 24,
      inactiveStudentMonths: 12,
      auditLogMonths: 24,
      autoDeleteAttempts: false,
      confirmedAt: null,
      confirmedById: null,
    });
    expect(s.exports).toEqual({ includeFocusByDefault: false });
    expect(s.accessibility).toEqual({ contactEmail: "", statementDate: null });
  });

  test("nested partial input keeps the other defaults", () => {
    const s = privacySettingsSchema.parse({
      school: { name: "  Het Lyceum  " },
      retention: { attemptsMonths: 36 },
    });
    expect(s.school.name).toBe("Het Lyceum");
    expect(s.school.privacyEmail).toBe("");
    expect(s.retention.attemptsMonths).toBe(36);
    expect(s.retention.attemptEventsDays).toBe(90);
    expect(s.processor.hostingLocation).toBe("Nederland (EU)");
  });

  test("emails and links are validated", () => {
    expect(
      privacySettingsSchema.safeParse({ dpo: { email: "fg@school.nl" } })
        .success,
    ).toBe(true);
    expect(
      privacySettingsSchema.safeParse({ dpo: { email: "geen-mail" } }).success,
    ).toBe(false);
    expect(
      privacySettingsSchema.safeParse({
        school: { policyUrl: "https://school.nl/privacy" },
      }).success,
    ).toBe(true);
    expect(
      privacySettingsSchema.safeParse({
        school: { policyUrl: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });
});

describe("parsePrivacySettings", () => {
  const defaults = privacySettingsSchema.parse({});

  test("missing or junk input gives the defaults", () => {
    expect(parsePrivacySettings(undefined)).toEqual(defaults);
    expect(parsePrivacySettings(null)).toEqual(defaults);
    expect(parsePrivacySettings("x")).toEqual(defaults);
  });

  test("out-of-range values fall back to the defaults", () => {
    expect(
      parsePrivacySettings({
        school: { name: "Het Lyceum" },
        retention: { attemptEventsDays: 1 },
      }),
    ).toEqual(defaults);
    expect(parsePrivacySettings({ processor: { backupDays: 9999 } })).toEqual(
      defaults,
    );
  });

  test("valid stored values are kept", () => {
    const s = parsePrivacySettings({ retention: { auditLogMonths: 12 } });
    expect(s.retention.auditLogMonths).toBe(12);
  });
});

describe("toPublicPrivacyInfo", () => {
  test("no ids, confirmed flag and ISO updatedAt", () => {
    const settings = privacySettingsSchema.parse({
      school: { name: "Het Lyceum" },
      retention: {
        confirmedAt: "2026-09-01T10:00:00.000Z",
        confirmedById: "user-secret-id",
      },
    });
    const info = toPublicPrivacyInfo(
      settings,
      new Date("2026-09-01T10:00:00Z"),
    );
    expect(info.school.name).toBe("Het Lyceum");
    expect(info.retention.confirmed).toBe(true);
    expect(info.updatedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(JSON.stringify(info)).not.toContain("user-secret-id");
    expect(info.retention).not.toHaveProperty("confirmedAt");

    const empty = toPublicPrivacyInfo(privacySettingsSchema.parse({}), null);
    expect(empty.retention.confirmed).toBe(false);
    expect(empty.updatedAt).toBeNull();
  });
});

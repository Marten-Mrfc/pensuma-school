/**
 * Read and write the privacy settings (app_setting, key "privacy").
 * Takes the database as a parameter, so tRPC, scripts and the retention
 * engine can all use it.
 */
import { eq } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { z } from "zod";
import {
  PRIVACY_SETTINGS_KEY,
  type PrivacySettings,
  parsePrivacySettings,
  privacySettingsSchema,
} from "@/lib/privacy/settings";
import type * as schema from "@/server/db/schema";
import { appSettings } from "@/server/db/schema";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export type StoredPrivacySettings = {
  settings: PrivacySettings;
  /** Null when the settings were never saved (defaults apply). */
  updatedAt: Date | null;
  updatedById: string | null;
};

export async function getPrivacySettings(
  db: Db,
): Promise<StoredPrivacySettings> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, PRIVACY_SETTINGS_KEY))
    .limit(1);
  return {
    settings: parsePrivacySettings(row?.value),
    updatedAt: row?.updatedAt ?? null,
    updatedById: row?.updatedById ?? null,
  };
}

/** Validates (throws a ZodError on invalid input) and upserts. */
export async function savePrivacySettings(
  db: Db,
  value: z.input<typeof privacySettingsSchema>,
  userId: string | null,
): Promise<StoredPrivacySettings> {
  const settings = privacySettingsSchema.parse(value);
  const now = new Date();
  const [row] = await db
    .insert(appSettings)
    .values({
      key: PRIVACY_SETTINGS_KEY,
      value: settings,
      updatedById: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: settings, updatedById: userId, updatedAt: now },
    })
    .returning();
  return {
    settings,
    updatedAt: row?.updatedAt ?? now,
    updatedById: row?.updatedById ?? userId,
  };
}

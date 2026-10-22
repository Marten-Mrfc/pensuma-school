import { toPublicPrivacyInfo } from "@/lib/privacy/settings";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getPrivacySettings } from "@/server/privacy/settings-store";

/**
 * AVG/GDPR: retention periods, access requests, erasure, audit log.
 * Only `publicInfo` exists so far; the privacy package adds the rest.
 */
export const privacyRouter = createTRPCRouter({
  /** Contacts and retention periods for /privacy (no ids, no teacher names). */
  publicInfo: publicProcedure.query(async ({ ctx }) => {
    const { settings, updatedAt } = await getPrivacySettings(ctx.db);
    return toPublicPrivacyInfo(settings, updatedAt);
  }),
});

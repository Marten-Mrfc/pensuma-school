import { eq, sql } from "drizzle-orm";
import { parsePreferences, preferencesPatchSchema } from "@/lib/preferences";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { userPreferences } from "@/server/db/schema";

/**
 * Display preferences of the signed-in user (teachers and students). There is
 * deliberately no id input: everyone reads and writes only their own row.
 */
export const preferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ prefs: userPreferences.prefs })
      .from(userPreferences)
      .where(eq(userPreferences.userId, ctx.user.id))
      .limit(1);
    return parsePreferences(row?.prefs);
  }),

  /** Partial update; the merge happens in one statement (no lost updates). */
  update: protectedProcedure
    .input(preferencesPatchSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(userPreferences)
        .values({ userId: ctx.user.id, prefs: input })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            prefs: sql`${userPreferences.prefs} || ${JSON.stringify(input)}::jsonb`,
            updatedAt: new Date(),
          },
        })
        .returning({ prefs: userPreferences.prefs });
      return parsePreferences(row?.prefs);
    }),
});
